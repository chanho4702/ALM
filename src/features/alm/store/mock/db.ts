// localStorage 목업 스토어 — db (jiraMock.ts에서 분할, 동작 불변)
import { resetMockProjectStream } from "./realtime";
import { type JiraData, type IssueFieldId, type IssueFieldConfig, ISSUE_FIELD_IDS, type SettingsBody, type WorkflowTransition, type TypeWorkflow, ISSUE_FIELD_NAMES, type StatusCategory, type StatusKind, type WorkflowStatus, type SettingsScheme, type BoardType, type Board, type User } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { createSeedData } from "../../../../mock/seed";
import { BUILTIN_LINK_TYPES, BUILTIN_PRIORITIES, priorityDefOf, BUILTIN_ISSUE_TYPES, typeDefOf, statusKindOf } from "./rules";
import { resetAgentMockState, resetMockOfficeStream } from "./officeRuns";
import { resetTeamMockState } from "./aiTeam";
import { resetAutomationMockState } from "./automation";

const STORAGE_KEY = "alm.jira.v1";

let cache: JiraData | null = null;

/**
 * 필수로 지정할 수 없는 필드와 그 사유 — 서버 400 문구와 한 글자까지 같아야 한다.
 * 해결은 완료 상태에서만 입력하고, 상위 항목은 최상위 이슈에 존재할 수 없다.
 */
export const NEVER_REQUIRED_FIELDS: Partial<Record<IssueFieldId, string>> = {
  resolution: "해결은 완료 상태에서만 입력하므로 필수로 지정할 수 없습니다",
  parent: "상위 항목은 최상위 이슈가 있어야 하므로 필수로 지정할 수 없습니다",
};

/** 기본 필드 구성 — 15종 전부 보이고 필수는 없다 */
function defaultFieldConfigs(): IssueFieldConfig[] {
  return ISSUE_FIELD_IDS.map((id) => ({ id, visible: true, required: false }));
}

/**
 * 이슈 생성 시 필수 필드 검사 — 값을 준 필드만 본다(우선순위는 기본값이 늘 있으므로 대상이 아니고,
 * 해결·첨부·링크는 만들기 경로에 값 자체가 없다). 구성은 **요청의 타입으로 해석**한다.
 */
export function assertRequiredFields(
  body: SettingsBody,
  typeId: string | null,
  values: Partial<Record<IssueFieldId, unknown>>,
): void {
  for (const field of fieldConfigsFor(body, typeId)) {
    if (!field.required) continue;
    if (!(field.id in values)) continue;
    const value = values[field.id];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (missing) throw new Error(`${withJosa(ISSUE_FIELD_NAMES[field.id])} 필수입니다`);
  }
}

/** 받침 유무로 은/는을 고른다 — "담당자는 필수입니다" / "설명은 필수입니다" */
function withJosa(name: string): string {
  const last = name.trim().at(-1) ?? "";
  const code = last.charCodeAt(0);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const hasFinal = hangul && (code - 0xac00) % 28 !== 0;
  return `${name}${hasFinal ? "은" : "는"}`;
}

/** 저장/응답용 정규화 — 빠진 id는 기본값으로 채우고 순서를 고정한다(구버전 호환) */
function normalizeFieldConfigs(fields?: IssueFieldConfig[] | null): IssueFieldConfig[] {
  const byId = new Map((fields ?? []).map((f) => [f.id, f]));
  return ISSUE_FIELD_IDS.map((id) => {
    const found = byId.get(id);
    return { id, visible: found?.visible ?? true, required: found?.required ?? false };
  });
}

/**
 * 타입별 덮어쓰기 정규화 — 덮어쓰기가 있는 타입만 키로 남기고 각 목록을 15종으로 채운다.
 * 빠진 id는 **기본 구성**으로 채운다(해석과 같은 규칙이라 정규화가 뜻을 바꾸지 않는다).
 *
 * 서버와 같은 두 가지 규칙(2026-09-05 백엔드와 확정):
 * - 빈 목록(`"bug": []`)은 오류가 아니라 **"기본 구성 따름"** 이라 키째 버린다.
 * - 덮어쓰기가 하나도 없어도 맵 자체는 남는다 — 응답에는 `{}`가 실린다(키 생략 아님).
 */
function normalizeFieldsByType(body: FieldConfigBody): Record<string, IssueFieldConfig[]> {
  const entries = Object.entries(body.fieldsByType ?? {})
    .filter(([, fields]) => (fields?.length ?? 0) > 0)
    .map(([typeId]) => [typeId, fieldConfigsFor(body, typeId)] as const);
  return Object.fromEntries(entries);
}

/** 필드 구성이 실린 본문 조각 — 기본 구성 + 타입별 덮어쓰기 */
type FieldConfigBody = Pick<SettingsBody, "fields" | "fieldsByType">;

/**
 * 한 이슈 타입의 최종 필드 구성 — 기본 구성(`fields`) 위에 `fieldsByType[typeId]`를
 * **필드 단위로** 얹는다. 덮어쓰기에 없는 id는 기본 구성을 그대로 따른다(화면 `resolveFields`와 같은 규칙).
 */
function fieldConfigsFor(body: FieldConfigBody, typeId?: string | null): IssueFieldConfig[] {
  const base = normalizeFieldConfigs(body.fields);
  const override = typeId ? body.fieldsByType?.[typeId] : undefined;
  if (!override) return base;
  const byId = new Map(override.map((f) => [f.id, f]));
  return base.map((field) => {
    const found = byId.get(field.id);
    return found ? { id: field.id, visible: found.visible, required: found.required } : field;
  });
}

/** 디폴트 스킴 본문 — 상태 id를 기존 status 값과 동일하게 두어 저장 데이터와 100% 호환 */
export function defaultSettingsBody(): SettingsBody {
  return {
    statuses: [
      { id: "todo", name: "할 일", category: "todo", order: 1 },
      { id: "inprogress", name: "진행 중", category: "inprogress", order: 2 },
      { id: "done", name: "완료", category: "done", order: 3 },
    ],
    enabledTypes: ["task", "story", "bug", "epic", "subtask"],
    enabledPriorities: ["highest", "high", "medium", "low", "lowest"],
    defaultPriority: "medium",
    fields: defaultFieldConfigs(),
  };
}

/** 기본 카테고리 — 의미(kind)는 고정, 이름·색은 바꿀 수 있다 */
export const BUILTIN_CATEGORIES: StatusCategory[] = [
  { id: "todo", name: "할 일", kind: "new", color: "neutral", order: 1, builtIn: true },
  { id: "inprogress", name: "진행 중", kind: "active", color: "info", order: 2, builtIn: true },
  { id: "done", name: "완료", kind: "complete", color: "success", order: 3, builtIn: true },
];

export const STATUS_KIND_LIST: StatusKind[] = ["new", "active", "complete"];

/**
 * 기본 3상태의 시드 아이콘(lucide 키) — 서버 V20 시드와 같은 값이다.
 * 그 밖의 상태는 빈 문자열이고, 화면이 카테고리 의미(kind)의 기본 아이콘으로 폴백한다.
 */
const BUILTIN_STATUS_ICONS: Record<string, string> = {
  todo: "circle",
  inprogress: "loader-circle",
  done: "circle-check",
};

/**
 * 미지정(`icon === ""`) 상태의 카테고리 의미(kind)별 기본 아이콘 — 서버 폴백 표와 같다.
 * `components/labels.ts`의 `KIND_DEFAULT_STATUS_ICON`과 값이 같지만, 스토어가 화면 모듈을
 * import 하지 않으려고 여기 둔다(labels는 lucide를 모르는 순수 로직 모듈이다).
 */
const KIND_STATUS_ICON: Record<StatusKind, string> = {
  new: "circle",
  active: "refresh-cw",
  complete: "circle-check",
};

export function categoryById(data: JiraData, id: string): StatusCategory {
  return (
    data.statusCategories.find((c) => c.id === id) ??
    BUILTIN_CATEGORIES.find((c) => c.id === id) ??
    BUILTIN_CATEGORIES[0]
  );
}

/**
 * 저장된 워크플로 상태(참조 + 캐시)를 레지스트리로 해석한다 — 이름·카테고리는 레지스트리가 진실이고,
 * 레지스트리에 없는 옛 id만 캐시로 버틴다. kind/color는 카테고리에서 파생한다.
 */
export function enrichStatuses(data: JiraData, statuses: WorkflowStatus[]): WorkflowStatus[] {
  return statuses.map((s) => {
    const def = data.statusDefs.find((d) => d.id === s.id);
    const categoryId = def?.categoryId ?? s.category;
    const category = categoryById(data, categoryId);
    return {
      id: s.id,
      name: def?.name ?? s.name,
      category: categoryId,
      order: s.order,
      kind: category.kind,
      color: category.color,
      /*
       * 아이콘도 읽을 때만 채우는 파생이고, **워크플로 본문에서는 해석까지 끝낸 값**이다 —
       * 미지정이면 여기서 kind 기본으로 채운다(서버 `SchemeQueries.enrich`와 같은 계약).
       * 그래서 본문의 `icon`에는 빈 문자열이 오지 않는다. 레지스트리 조회(`listStatusDefs`)는
       * 반대로 저장 원본을 그대로 주므로 `""`가 온다 — 편집기가 "미지정"을 보여야 하기 때문.
       */
      icon: def?.icon?.trim() || KIND_STATUS_ICON[category.kind],
    };
  });
}

export function enrichBody(data: JiraData, body: SettingsBody): SettingsBody {
  // 필드 구성은 읽을 때 15종을 다 채운다 — 화면이 없는 id를 만나지 않게(구버전 호환)
  // 덮어쓰기가 없어도 `{}`를 싣는다 — 서버 응답 shape과 같게(키 생략 아님)
  return {
    ...body,
    statuses: enrichStatuses(data, body.statuses),
    fields: normalizeFieldConfigs(body.fields),
    fieldsByType: normalizeFieldsByType(body),
    workflowsByType: cloneWorkflowsByType(body.workflowsByType),
  };
}

export function enrichScheme(data: JiraData, scheme: SettingsScheme): SettingsScheme {
  return { ...scheme, body: enrichBody(data, scheme.body) };
}

/** 워크플로 본문의 이름·카테고리를 레지스트리로 관통 저장한다 (검증 뒤에 호출) */
export function applyBodyToRegistry(data: JiraData, body: SettingsBody): void {
  for (const status of body.statuses) {
    const def = data.statusDefs.find((d) => d.id === status.id);
    if (!def) {
      data.statusDefs.push({
        id: status.id,
        name: status.name.trim(),
        categoryId: status.category,
        description: "",
        icon: BUILTIN_STATUS_ICONS[status.id] ?? "",
      });
      continue;
    }
    def.name = status.name.trim();
    def.categoryId = status.category;
  }
}

/** 스킴·커스텀 본문 전부 — 레지스트리 사용처 판단용 */
export function allBodies(data: JiraData): SettingsBody[] {
  return [
    ...data.schemes.map((s) => s.body),
    ...data.projectSettings.flatMap((e) => (e.custom ? [e.custom] : [])),
  ];
}

/** 본문이 의미(할 일/진행 중/완료)마다 상태를 갖는지 — 카테고리 변경이 워크플로를 비우지 않게 */
export function bodyCoversAllKinds(data: JiraData, body: SettingsBody): boolean {
  const kinds = new Set(enrichStatuses(data, body.statuses).map((s) => s.kind));
  return STATUS_KIND_LIST.every((kind) => kinds.has(kind));
}

/** 전환 깊은 복사 — 조건·검증·화면·후처리(C1~C3)까지 왕복한다(빠지면 저장할 때 규칙이 사라진다) */
export function cloneTransition(t: WorkflowTransition): WorkflowTransition {
  return {
    ...t,
    from: [...t.from],
    ...(t.conditions ? { conditions: t.conditions.map((c) => ({ ...c })) } : {}),
    ...(t.validators ? { validators: [...t.validators] } : {}),
    ...(t.screenFields ? { screenFields: [...t.screenFields] } : {}),
    ...(t.postFunctions ? { postFunctions: t.postFunctions.map((f) => ({ ...f })) } : {}),
  };
}

/** 타입별 워크플로(C5) 깊은 복사 — 없으면 `{}` */
export function cloneWorkflowsByType(map: SettingsBody["workflowsByType"]): Record<string, TypeWorkflow> {
  return Object.fromEntries(
    Object.entries(map ?? {}).map(([typeId, flow]) => [
      typeId,
      {
        statuses: [...(flow?.statuses ?? [])],
        transitions: flow?.transitions == null ? null : flow.transitions.map(cloneTransition),
      },
    ]),
  );
}

export function cloneBody(body: SettingsBody): SettingsBody {
  return {
    // 해석 필드(kind/color)는 저장하지 않는다 — 레지스트리에서 매번 파생한다
    statuses: body.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, order: s.order })),
    enabledTypes: [...body.enabledTypes],
    enabledPriorities: [...(body.enabledPriorities ?? defaultSettingsBody().enabledPriorities)],
    defaultPriority: body.defaultPriority ?? "medium",
    fields: normalizeFieldConfigs(body.fields),
    fieldsByType: normalizeFieldsByType(body),
    workflowsByType: cloneWorkflowsByType(body.workflowsByType),
    ...(body.transitions ? { transitions: body.transitions.map(cloneTransition) } : {}),
    ...(body.layout
      ? {
          layout: Object.fromEntries(
            Object.entries(body.layout).map(([id, pos]) => [id, { x: pos.x, y: pos.y }]),
          ),
        }
      : {}),
  };
}

/** 기본 3컬럼(할 일/진행 중/완료, WIP 없음)의 보드를 만든다 */
export function defaultBoard(
  projectId: string,
  name = "메인 보드",
  type: BoardType = "scrum",
): Board {
  return {
    id: nextId(),
    projectId,
    name,
    type,
    filter: { assigneeIds: [], types: [], labels: [] },
    columns: [
      { status: "todo", name: "할 일", wipLimit: null },
      { status: "inprogress", name: "진행 중", wipLimit: null },
      { status: "done", name: "완료", wipLimit: null },
    ],
    swimlane: "none",
    isDefault: true,
    createdAt: new Date().toISOString(),
    // 읽을 때(`resolveBoard`) 워크플로에서 다시 계산한다 — 저장 값은 의미가 없다
    columnMode: "status",
    resolvedColumns: [],
    unmappedStatuses: [],
  };
}

/** 필드가 추가되기 전 저장된 v1 데이터를 현재 스키마로 승격한다 (스토리지 키는 유지) */
function normalize(data: JiraData): JiraData {
  for (const project of data.projects) {
    project.description ??= "";
    project.category ??= "";
    // 구버전 데이터: 리더가 없으면 첫 관리자 멤버를 리더로 (서버는 생성자를 리더로 둔다)
    project.leadId ??=
      (data.members ?? []).find((m) => m.projectId === project.id && m.role === "admin")?.userId ?? null;
    project.defaultAssignee ??= "unassigned";
    project.icon ??= "";
    project.color ??= "";
    project.url ??= "";
    project.version ??= 1;
  }
  // 버전 이전 데이터 — 서버처럼 1부터 센다
  for (const sprint of data.sprints ?? []) sprint.version ??= 1;
  for (const project of data.trashedProjects ?? []) project.version ??= 1;
  data.shortcuts ??= [];
  data.preferences ??= {};
  data.avatars ??= {};
  data.banner ??= { enabled: false, level: "info", message: "" };
  for (const issue of data.issues) {
    issue.dueDate ??= null;
    issue.labels ??= [];
    issue.type ??= "task";
    issue.parentId ??= null;
    issue.estimateHours ??= null;
    issue.resolution ??= null;
    issue.resolvedAt ??= null;
    issue.fixVersionId ??= null;
    // 버전 이전 데이터 — 서버처럼 1부터 센다
    issue.version ??= 1;
    // V30·V35 이전 데이터
    issue.startDate ??= null;
    issue.storyPoints ??= null;
    issue.flagged ??= false;
    issue.triageState ??= null;
  }
  data.views ??= [];
  data.triageProjects ??= [];
  data.triageEntries ??= [];
  data.automationRules ??= [];
  data.automationRuns ??= [];
  data.planningSettings ??= {};
  data.notifications ??= [];
  data.boards ??= [];
  data.links ??= [];
  data.webLinks ??= [];
  data.worklogs ??= [];
  data.changes ??= [];
  data.members ??= [];
  data.versions ??= [];
  data.attachments ??= [];
  data.watchers ??= [];
  // 멤버가 없는 프로젝트에는 현재 사용자를 관리자로 넣는다 — 관리자 없는 프로젝트를 만들지 않는다
  for (const project of data.projects) {
    if (!data.members.some((m) => m.projectId === project.id)) {
      data.members.push({ projectId: project.id, userId: CURRENT_USER_ID, role: "admin" });
    }
  }
  data.issueCounters ??= {};
  // 보드가 없는 프로젝트에는 기본 스크럼 보드를 만들어 기존 데이터/URL과 호환한다
  for (const project of data.projects) {
    if (!data.boards.some((b) => b.projectId === project.id)) {
      data.boards.push(defaultBoard(project.id));
    }
  }
  // 설정 스킴: 디폴트 스킴 1개 + 모든 프로젝트를 디폴트에 배정 (지라의 Default Scheme)
  data.schemes ??= [];
  if (!data.schemes.some((s) => s.isDefault)) {
    data.schemes.unshift({
      id: "scheme-default",
      name: "기본 스킴",
      isDefault: true,
      body: defaultSettingsBody(),
    });
  }
  data.projectSettings ??= [];
  // 전역 상태 카테고리·상태 레지스트리 — 없던 데이터는 스킴/커스텀에 적힌 상태로 채운다
  data.statusCategories ??= BUILTIN_CATEGORIES.map((c) => ({ ...c }));
  for (const builtin of BUILTIN_CATEGORIES) {
    if (!data.statusCategories.some((c) => c.id === builtin.id)) {
      data.statusCategories.push({ ...builtin });
    }
  }
  data.statusDefs ??= [];
  // 전역 이슈 타입 레지스트리 — 기본 5종은 항상 있다
  data.archivedIssues ??= [];
  // 보관 이슈도 AQL `resolved`를 탄다 — 해결 시각 도입 전 데이터는 마지막 수정 시각으로 본다
  for (const issue of data.archivedIssues) {
    issue.startDate ??= null;
    issue.storyPoints ??= null;
    issue.flagged ??= false;
    issue.triageState ??= null;
    issue.resolvedAt ??= issue.resolution ? issue.updatedAt : null;
    // 버전 이전에 보관된 이슈 — 복원 뒤 편집이 NaN 비교로 영원히 409가 되지 않게 1부터 센다
    issue.version ??= 1;
  }
  data.components ??= [];
  data.dashboards ??= [];
  data.trashedProjects ??= [];
  data.linkTypes ??= BUILTIN_LINK_TYPES.map((t) => ({ ...t }));
  for (const builtin of BUILTIN_LINK_TYPES) {
    if (!data.linkTypes.some((t) => t.id === builtin.id)) data.linkTypes.push({ ...builtin });
  }
  data.priorities ??= BUILTIN_PRIORITIES.map((p) => ({ ...p }));
  for (const builtin of BUILTIN_PRIORITIES) {
    if (!data.priorities.some((p) => p.id === builtin.id)) data.priorities.push({ ...builtin });
  }
  for (const scheme of data.schemes ?? []) {
    scheme.body.enabledPriorities ??= defaultSettingsBody().enabledPriorities;
    scheme.body.defaultPriority ??= "medium";
    scheme.body.fields = normalizeFieldConfigs(scheme.body.fields);
  }
  for (const entry of data.projectSettings ?? []) {
    if (entry.custom) {
      entry.custom.enabledPriorities ??= defaultSettingsBody().enabledPriorities;
      entry.custom.defaultPriority ??= "medium";
      entry.custom.fields = normalizeFieldConfigs(entry.custom.fields);
    }
  }
  for (const issue of data.issues) {
    const lowered = String(issue.priority ?? "medium").toLowerCase();
    issue.priority = priorityDefOf(data, lowered) ? lowered : "medium";
  }
  data.issueTypes ??= BUILTIN_ISSUE_TYPES.map((t) => ({ ...t }));
  for (const builtin of BUILTIN_ISSUE_TYPES) {
    if (!data.issueTypes.some((t) => t.id === builtin.id)) data.issueTypes.push({ ...builtin });
  }
  // 타입별 필드 덮어쓰기 — 레지스트리에 없는 타입의 키는 버린다(타입 레지스트리 초기화 뒤에 해야 한다)
  for (const body of allBodies(data)) {
    if (!body.fieldsByType) continue;
    for (const typeId of Object.keys(body.fieldsByType)) {
      if (!typeDefOf(data, typeId)) delete body.fieldsByType[typeId];
    }
    body.fieldsByType = normalizeFieldsByType(body);
  }
  for (const body of allBodies(data)) {
    for (const status of body.statuses) {
      if (!data.statusDefs.some((d) => d.id === status.id)) {
        data.statusDefs.push({
          id: status.id,
          name: status.name,
          categoryId: status.category,
          description: "",
          icon: BUILTIN_STATUS_ICONS[status.id] ?? "",
        });
      }
    }
  }
  // 아이콘 도입 전 데이터: 기본 3상태는 시드 아이콘, 나머지는 빈 문자열(= kind 기본 아이콘 폴백)
  for (const def of data.statusDefs) {
    def.icon ??= BUILTIN_STATUS_ICONS[def.id] ?? "";
  }
  const defaultScheme = data.schemes.find((s) => s.isDefault)!;
  for (const project of data.projects) {
    if (!data.projectSettings.some((e) => e.projectId === project.id)) {
      data.projectSettings.push({ projectId: project.id, schemeId: defaultScheme.id, custom: null });
    }
  }
  // 해결 도입 전 데이터: 이미 완료 카테고리인 이슈는 "완료됨"으로 백필한다(설정 정규화 뒤에 판정)
  for (const issue of data.issues) {
    if (issue.resolution === null && statusKindOf(data, issue.projectId, issue.status) === "complete") {
      issue.resolution = "done";
    }
    // 해결 시각 도입 전 데이터: 이미 해결된 이슈는 마지막 수정 시각을 해결 시각으로 본다(서버 V23 백필과 같다)
    if (issue.resolution !== null && !issue.resolvedAt) issue.resolvedAt = issue.updatedAt;
  }
  return data;
}

export function load(): JiraData {
  if (cache) return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      cache = normalize(JSON.parse(raw) as JiraData);
    } catch {
      // 손상된 JSON — 시드로 재생성
    }
  }
  if (!cache) {
    // dev 서버만 확장 시드(프로젝트 2·이슈 25) — 테스트는 종전 8건을 그대로 본다
    cache = normalize(createSeedData({ rich: import.meta.env.MODE === "development" }));
    persist();
  }
  return cache;
}

export function persist(): void {
  if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/** 내부 상태 유출 방지 — 반환값은 항상 깊은 복사본 */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function nextId(): string {
  return crypto.randomUUID();
}

/** 테스트 전용: 메모리 캐시를 초기화한다 (localStorage는 건드리지 않음). */
export function __resetForTest(): void {
  cache = null;
  resetAgentMockState();
  resetTeamMockState();
  resetMockOfficeStream();
  resetAutomationMockState();
  resetMockProjectStream();
}

/**
 * 자동화 실행 실패 때 되돌리기 — 규칙 하나의 액션 묶음은 원자적이다(서버의 한 트랜잭션과 같다).
 * 캐시를 실행 직전 사본으로 바꿔 끼운다. 호출자는 이 뒤에 `load()`로 다시 읽어야 한다.
 */
export function replaceDataForRollback(snapshot: JiraData): void {
  cache = snapshot;
  persist();
}

/** 저장된 아바타(dataURL)를 붙여 돌려준다 — 없으면 null(화면은 이니셜 아바타로 떨어진다) */
export function withAvatar(data: JiraData, user: User): User {
  return { ...user, avatarUrl: data.avatars[user.id] ?? null };
}

/** 이 모듈이 파사드 구현일 때의 데이터 출처 — `jiraStore.USE_REST`가 읽는다 */
export const STORE_MODE = "mock" as "mock" | "rest";
