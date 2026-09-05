import type {
  PriorityDef,
  Dashboard,
  DashboardGadget,
  ProjectWorklogRow,
  Component,
  ComponentDefaultAssignee,
  LinkTypeDef,
  ProjectShortcut,
  UserPreferences,
  UserPreferencesPatch,
  AnnouncementBanner,
  ProjectDefaultAssignee,
  Activity,
  Attachment,
  Board,
  BoardType,
  ChangeField,
  Comment,
  Issue,
  IssueChange,
  IssueLink,
  IssueLinkType,
  IssuePriority,
  IssueResolution,
  IssueFieldConfig,
  IssueFieldId,
  StatusCategory,
  StatusColor,
  StatusDef,
  StatusKind,
  WorkflowStatus,
  AuditEntry,
  SystemStats,
  IssueTypeDef,
  IssueTypeLevel,
  WorkflowLayout,
  IssueType,
  JiraData,
  Notification,
  OrgProfile,
  Project,
  ProjectMember,
  ProjectRole,
  ProjectVersion,
  ProjectSettingsEntry,
  SettingsBody,
  SettingsScheme,
  Sprint,
  User,
  WorkflowTransition,
  Worklog,
} from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";
import { ISSUE_FIELD_IDS, ISSUE_FIELD_NAMES, WORKFLOW_ANY_NODE } from "./types";
import type { IssueQuery } from "./searchQuery";
import { getTemplate } from "./projectTemplates";
import type { ProjectTemplateId } from "./projectTemplates";
import { extractMentionIds, htmlToText, newMentionIds } from "./richText";
import { seedDemoProject, type SampleDataApi } from "./sampleData";

const STORAGE_KEY = "alm.jira.v1";

let cache: JiraData | null = null;

/**
 * 필수로 지정할 수 없는 필드와 그 사유 — 서버 400 문구와 한 글자까지 같아야 한다.
 * 해결은 완료 상태에서만 입력하고, 상위 항목은 최상위 이슈에 존재할 수 없다.
 */
const NEVER_REQUIRED_FIELDS: Partial<Record<IssueFieldId, string>> = {
  resolution: "해결은 완료 상태에서만 입력하므로 필수로 지정할 수 없습니다",
  parent: "상위 항목은 최상위 이슈가 있어야 하므로 필수로 지정할 수 없습니다",
};

/** 기본 필드 구성 — 13종 전부 보이고 필수는 없다 */
function defaultFieldConfigs(): IssueFieldConfig[] {
  return ISSUE_FIELD_IDS.map((id) => ({ id, visible: true, required: false }));
}

/**
 * 이슈 생성 시 필수 필드 검사 — 값을 준 필드만 본다(우선순위는 기본값이 늘 있으므로 대상이 아니고,
 * 해결·첨부·링크는 만들기 경로에 값 자체가 없다). 구성은 **요청의 타입으로 해석**한다.
 */
function assertRequiredFields(
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
 * 타입별 덮어쓰기 정규화 — 덮어쓰기가 있는 타입만 키로 남기고 각 목록을 13종으로 채운다.
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
function defaultSettingsBody(): SettingsBody {
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
const BUILTIN_CATEGORIES: StatusCategory[] = [
  { id: "todo", name: "할 일", kind: "new", color: "neutral", order: 1, builtIn: true },
  { id: "inprogress", name: "진행 중", kind: "active", color: "info", order: 2, builtIn: true },
  { id: "done", name: "완료", kind: "complete", color: "success", order: 3, builtIn: true },
];
const STATUS_KIND_LIST: StatusKind[] = ["new", "active", "complete"];

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

function categoryById(data: JiraData, id: string): StatusCategory {
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
function enrichStatuses(data: JiraData, statuses: WorkflowStatus[]): WorkflowStatus[] {
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

function enrichBody(data: JiraData, body: SettingsBody): SettingsBody {
  // 필드 구성은 읽을 때 13종을 다 채운다 — 화면이 없는 id를 만나지 않게(구버전 호환)
  // 덮어쓰기가 없어도 `{}`를 싣는다 — 서버 응답 shape과 같게(키 생략 아님)
  return {
    ...body,
    statuses: enrichStatuses(data, body.statuses),
    fields: normalizeFieldConfigs(body.fields),
    fieldsByType: normalizeFieldsByType(body),
  };
}

function enrichScheme(data: JiraData, scheme: SettingsScheme): SettingsScheme {
  return { ...scheme, body: enrichBody(data, scheme.body) };
}

/** 워크플로 본문의 이름·카테고리를 레지스트리로 관통 저장한다 (검증 뒤에 호출) */
function applyBodyToRegistry(data: JiraData, body: SettingsBody): void {
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
function allBodies(data: JiraData): SettingsBody[] {
  return [
    ...data.schemes.map((s) => s.body),
    ...data.projectSettings.flatMap((e) => (e.custom ? [e.custom] : [])),
  ];
}

/** 본문이 의미(할 일/진행 중/완료)마다 상태를 갖는지 — 카테고리 변경이 워크플로를 비우지 않게 */
function bodyCoversAllKinds(data: JiraData, body: SettingsBody): boolean {
  const kinds = new Set(enrichStatuses(data, body.statuses).map((s) => s.kind));
  return STATUS_KIND_LIST.every((kind) => kinds.has(kind));
}

function cloneBody(body: SettingsBody): SettingsBody {
  return {
    // 해석 필드(kind/color)는 저장하지 않는다 — 레지스트리에서 매번 파생한다
    statuses: body.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, order: s.order })),
    enabledTypes: [...body.enabledTypes],
    enabledPriorities: [...(body.enabledPriorities ?? defaultSettingsBody().enabledPriorities)],
    defaultPriority: body.defaultPriority ?? "medium",
    fields: normalizeFieldConfigs(body.fields),
    fieldsByType: normalizeFieldsByType(body),
    ...(body.transitions
      ? { transitions: body.transitions.map((t) => ({ ...t, from: [...t.from] })) }
      : {}),
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
  }
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
    issue.fixVersionId ??= null;
  }
  data.notifications ??= [];
  data.boards ??= [];
  data.links ??= [];
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
  }
  return data;
}

function load(): JiraData {
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

function persist(): void {
  if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/** 내부 상태 유출 방지 — 반환값은 항상 깊은 복사본 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function nextId(): string {
  return crypto.randomUUID();
}

/** 테스트 전용: 메모리 캐시를 초기화한다 (localStorage는 건드리지 않음). */
export function __resetForTest(): void {
  cache = null;
}

/** 저장된 아바타(dataURL)를 붙여 돌려준다 — 없으면 null(화면은 이니셜 아바타로 떨어진다) */
function withAvatar(data: JiraData, user: User): User {
  return { ...user, avatarUrl: data.avatars[user.id] ?? null };
}

export async function listUsers(query?: { q?: string }): Promise<User[]> {
  const data = load();
  // 서버(`GET /api/org/members?q=`)는 이름·이메일 부분일치다. 목업 사용자에는 이메일이 없어
  // 이름만 본다 — 대소문자 구분 없이, 공백만 넣으면 필터가 없는 것과 같다.
  const needle = query?.q?.trim().toLowerCase() ?? "";
  const rows = needle
    ? data.users.filter((u) => u.name.toLowerCase().includes(needle))
    : data.users;
  return clone(rows.map((u) => withAvatar(data, u)));
}

/**
 * 목업은 **항상 활성 전역 관리자**다 — 목업 개발자는 승인 대기 화면에 갇히면 안 되고
 * 관리자 메뉴도 전부 봐야 한다. 상태별 화면 검증은 유닛 테스트가 프로필을 주입해서 한다.
 */
export async function getMyOrgProfile(): Promise<OrgProfile> {
  const data = load();
  const me = data.users.find((u) => u.id === CURRENT_USER_ID);
  return {
    id: CURRENT_USER_ID,
    displayName: me?.name ?? "현재 사용자",
    email: null,
    status: "ACTIVE",
    kind: "HUMAN",
    globalRoles: ["ADMIN"],
    teams: [],
    joinedVia: "LEGACY",
  };
}

export async function getCurrentUser(): Promise<User> {
  const data = load();
  const user = data.users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(withAvatar(data, user));
}

export async function listProjects(): Promise<Project[]> {
  return clone(load().projects);
}

export async function createProject(input: {
  key: string;
  name: string;
  description?: string;
  /** 생성 템플릿 — 기본 blank(현행 기본 보드만) */
  templateId?: ProjectTemplateId;
}): Promise<Project> {
  const data = load();
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!key) throw new Error("프로젝트 키를 입력하세요");
  if (!name) throw new Error("프로젝트 이름을 입력하세요");
  if (data.projects.some((p) => p.key === key)) {
    throw new Error(`이미 존재하는 프로젝트 키입니다: ${key}`);
  }
  const project: Project = {
    id: nextId(),
    key,
    name,
    description: input.description?.trim() ?? "",
    category: "",
    leadId: CURRENT_USER_ID,
    defaultAssignee: "unassigned",
    icon: "",
    color: "",
    url: "",
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
  data.projects.push(project);
  data.members.push({ projectId: project.id, userId: CURRENT_USER_ID, role: "admin" });
  data.issueCounters[project.id] = 0;
  // 새 프로젝트는 디폴트 스킴에 배정된다 (지라 Default Scheme)
  const defaultScheme = data.schemes.find((s) => s.isDefault)!;
  data.projectSettings.push({ projectId: project.id, schemeId: defaultScheme.id, custom: null });

  // 프로젝트는 항상 기본 보드를 갖는다 — 템플릿이 있으면 그 구성으로 교체
  const template = getTemplate(input.templateId ?? "blank");
  const board = defaultBoard(project.id);
  if (template.board) {
    board.name = template.board.name;
    board.type = template.board.type;
    board.columns = template.board.columns.map((c) => ({ ...c }));
    board.filter = {
      assigneeIds: [...template.board.filter.assigneeIds],
      types: [...template.board.filter.types],
      labels: [...template.board.filter.labels],
    };
  }
  data.boards.push(board);
  if (template.withSprint) {
    data.sprints.push({ id: nextId(), projectId: project.id, name: "Sprint 1", state: "planned" });
  }
  persist();

  // 샘플 이슈는 createIssue 경유 — 키 시퀀스·활동로그가 정상 경로로 남는다
  for (const sample of template.samples) {
    await createIssue({
      projectId: project.id,
      title: sample.title,
      type: sample.type,
      status: sample.status,
      labels: sample.labels,
    });
  }
  // 데모 템플릿은 공용 시더(REST와 같은 코드)가 채운다
  if (template.richSeed) await seedDemoProject(project, sampleDataApi());
  return clone(project);
}

/** 공용 시더(`sampleData.ts`)에 넘길 목업 함수 묶음 — REST 어댑터와 시그니처가 같다 */
function sampleDataApi(): SampleDataApi {
  return {
    listUsers,
    createComponent,
    createVersion,
    releaseVersion,
    createSprint,
    updateSprint,
    startSprint,
    completeSprint,
    createIssue,
    addIssueLink,
    addComment,
    addWorklog,
    archiveIssue,
    createDashboard,
  };
}

/** 키는 이슈 키 접두어라 불변 — 이름/설명만 수정 가능 */
export interface ProjectPatch {
  name?: string;
  description?: string;
  category?: string;
  leadId?: string | null;
  defaultAssignee?: ProjectDefaultAssignee;
  icon?: string;
  color?: string;
  url?: string;
}

function assertHttpUrl(url: string, label: string): string {
  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//.test(trimmed)) {
    throw new Error(`${label}URL은 http:// 또는 https://로 시작해야 합니다`);
  }
  return trimmed;
}

/** 세부 필드 적용 — 이름/설명 검증은 호출자가 한다 */
function applyProjectDetails(data: JiraData, project: Project, patch: ProjectPatch): void {
  if (patch.category !== undefined) project.category = patch.category.trim().slice(0, 60);
  if (patch.leadId !== undefined) {
    if (patch.leadId !== null && !data.users.some((u) => u.id === patch.leadId)) {
      throw new Error("사용자를 찾을 수 없습니다");
    }
    project.leadId = patch.leadId;
  }
  if (patch.defaultAssignee !== undefined) {
    if (patch.defaultAssignee !== "unassigned" && patch.defaultAssignee !== "lead") {
      throw new Error("기본 담당자는 unassigned/lead 중 하나입니다");
    }
    project.defaultAssignee = patch.defaultAssignee;
  }
  if (patch.icon !== undefined) project.icon = patch.icon.trim();
  if (patch.color !== undefined) project.color = patch.color.trim();
  if (patch.url !== undefined) project.url = assertHttpUrl(patch.url, "");
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  const data = load();
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, id);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("프로젝트 이름을 입력하세요");
    project.name = name;
  }
  if (patch.description !== undefined) {
    project.description = patch.description.trim();
  }
  applyProjectDetails(data, project, patch);
  persist();
  return clone(project);
}

/** 프로젝트의 스프린트·이슈·댓글·활동·이슈 카운터까지 연쇄 삭제한다 */
/** 삭제 = 휴지통 이동(지라). 이슈는 archivedIssues로 옮겨 검색·홈에서 사라진다. 복원·영구 삭제는 휴지통에서 */
export async function deleteProject(id: string): Promise<void> {
  const data = load();
  const index = data.projects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("프로젝트를 찾을 수 없습니다");
  assertAdminIgnoringArchive(data, id);
  const [project] = data.projects.splice(index, 1);
  project.deletedAt = new Date().toISOString();
  data.trashedProjects.push(project);
  const moving = data.issues.filter((i) => i.projectId === id);
  data.issues = data.issues.filter((i) => i.projectId !== id);
  data.archivedIssues.push(...moving);
  persist();
}

export async function listTrashedProjects(): Promise<Project[]> {
  return clone([...load().trashedProjects].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")));
}

export async function restoreProject(id: string): Promise<Project> {
  const data = load();
  const index = data.trashedProjects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("휴지통에 없는 프로젝트입니다");
  const [project] = data.trashedProjects.splice(index, 1);
  project.deletedAt = null;
  data.projects.push(project);
  // 보관(archivedAt)됐던 이슈는 보관함에 남고, 나머지는 돌아온다
  const returning = data.archivedIssues.filter((i) => i.projectId === id && !i.archivedAt);
  data.archivedIssues = data.archivedIssues.filter((i) => !(i.projectId === id && !i.archivedAt));
  data.issues.push(...returning);
  persist();
  return clone(project);
}

/** 영구 삭제 — 휴지통에 있는 프로젝트만. 되돌릴 수 없다 */
export async function purgeProject(id: string): Promise<void> {
  const data = load();
  const index = data.trashedProjects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("휴지통에 없는 프로젝트입니다");
  const issueIds = new Set(
    [...data.issues, ...data.archivedIssues].filter((i) => i.projectId === id).map((i) => i.id),
  );
  data.trashedProjects.splice(index, 1);
  data.archivedIssues = data.archivedIssues.filter((i) => i.projectId !== id);
  data.components = data.components.filter((c) => c.projectId !== id);
  data.sprints = data.sprints.filter((s) => s.projectId !== id);
  data.issues = data.issues.filter((i) => i.projectId !== id);
  data.comments = data.comments.filter((c) => !issueIds.has(c.issueId));
  data.activities = data.activities.filter((a) => !issueIds.has(a.issueId));
  data.notifications = data.notifications.filter((n) => !issueIds.has(n.issueId));
  data.watchers = data.watchers.filter((w) => !issueIds.has(w.issueId));
  data.boards = data.boards.filter((b) => b.projectId !== id);
  data.links = data.links.filter((l) => !issueIds.has(l.sourceId) && !issueIds.has(l.targetId));
  data.worklogs = data.worklogs.filter((w) => !issueIds.has(w.issueId));
  data.changes = data.changes.filter((c) => c.projectId !== id);
  data.members = data.members.filter((m) => m.projectId !== id);
  data.versions = data.versions.filter((v) => v.projectId !== id);
  data.attachments = data.attachments.filter((a) => !issueIds.has(a.issueId));
  data.projectSettings = data.projectSettings.filter((e) => e.projectId !== id);
  delete data.issueCounters[id];
  persist();
}

// ── 라벨 매핑 (활동로그 detail용) ─────────────────────────────

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const RESOLUTION_LABELS: Record<IssueResolution, string> = {
  done: "완료됨",
  wont_do: "하지 않음",
  duplicate: "중복",
  cannot_reproduce: "재현 불가",
};

/** 기본 이슈 타입 — 계층은 고정, 이름·아이콘·색은 바꿀 수 있다 */
const BUILTIN_ISSUE_TYPES: IssueTypeDef[] = [
  { id: "task", name: "작업", icon: "check-square", color: "info", level: "standard", description: "", order: 1, builtIn: true },
  { id: "story", name: "스토리", icon: "bookmark", color: "success", level: "standard", description: "", order: 2, builtIn: true },
  { id: "bug", name: "버그", icon: "bug", color: "danger", level: "standard", description: "", order: 3, builtIn: true },
  { id: "epic", name: "에픽", icon: "zap", color: "warning", level: "epic", description: "", order: 4, builtIn: true },
  { id: "subtask", name: "하위 작업", icon: "list-tree", color: "neutral", level: "subtask", description: "", order: 5, builtIn: true },
];

/** 레지스트리 변경 알림 — 화면의 useIssueTypes가 듣는다 */
export const ISSUE_TYPES_CHANGED_EVENT = "alm:issue-types-changed";
function notifyIssueTypesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ISSUE_TYPES_CHANGED_EVENT));
}

function typeDefOf(data: JiraData, id: string): IssueTypeDef | undefined {
  return data.issueTypes.find((t) => t.id === id) ?? BUILTIN_ISSUE_TYPES.find((t) => t.id === id);
}

/** 타입 id → 계층. 모르는 id는 일반으로 본다 */
function typeLevelOf(data: JiraData, id: string): IssueTypeLevel {
  return typeDefOf(data, id)?.level ?? "standard";
}

/** 기본 우선순위 5단계(지라) — 순서 고정 삭제 불가, 이름·아이콘·색은 바꿀 수 있다 */
const BUILTIN_PRIORITIES: PriorityDef[] = [
  { id: "highest", name: "최상", icon: "chevrons-up", color: "danger", description: "지금 당장 처리해야 한다", order: 1, builtIn: true },
  { id: "high", name: "높음", icon: "chevron-up", color: "danger", description: "다른 일보다 먼저 처리한다", order: 2, builtIn: true },
  { id: "medium", name: "보통", icon: "equal", color: "warning", description: "순서대로 처리한다", order: 3, builtIn: true },
  { id: "low", name: "낮음", icon: "chevron-down", color: "info", description: "여유가 있을 때 처리한다", order: 4, builtIn: true },
  { id: "lowest", name: "최하", icon: "chevrons-down", color: "neutral", description: "미뤄도 된다", order: 5, builtIn: true },
];

/** 기본 링크 타입 5종(지라) — outward/inward가 같으면 대칭 */
const BUILTIN_LINK_TYPES: LinkTypeDef[] = [
  { id: "blocks", name: "차단", outward: "차단함", inward: "차단됨", order: 1, builtIn: true },
  { id: "relates", name: "관련", outward: "관련됨", inward: "관련됨", order: 2, builtIn: true },
  { id: "duplicates", name: "중복", outward: "중복함", inward: "중복됨", order: 3, builtIn: true },
  { id: "causes", name: "원인", outward: "원인임", inward: "결과임", order: 4, builtIn: true },
  { id: "clones", name: "복제", outward: "복제함", inward: "복제됨", order: 5, builtIn: true },
];

export const LINK_TYPES_CHANGED_EVENT = "alm:link-types-changed";
function notifyLinkTypesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LINK_TYPES_CHANGED_EVENT));
}

function linkTypeDefOf(data: JiraData, id: string): LinkTypeDef | undefined {
  return data.linkTypes.find((t) => t.id === id) ?? BUILTIN_LINK_TYPES.find((t) => t.id === id);
}

const isSymmetric = (def: LinkTypeDef) => def.outward === def.inward;

export const PRIORITIES_CHANGED_EVENT = "alm:priorities-changed";
function notifyPrioritiesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PRIORITIES_CHANGED_EVENT));
}

function priorityDefOf(data: JiraData, id: string): PriorityDef | undefined {
  return data.priorities.find((p) => p.id === id) ?? BUILTIN_PRIORITIES.find((p) => p.id === id);
}

/** 프로젝트에 적용되는 설정 본문(커스텀 → 스킴 → 기본) */
function settingsBodyOf(data: JiraData, projectId: string): SettingsBody {
  const entry = data.projectSettings.find((e) => e.projectId === projectId);
  return (
    entry?.custom ??
    data.schemes.find((s) => s.id === entry?.schemeId)?.body ??
    defaultSettingsBody()
  );
}

/** 요청 값(대소문자 무관) → 레지스트리 id. 없으면 프로젝트 기본값, 비활성이면 거부 — 서버와 같은 문구 */
function resolvePriority(data: JiraData, projectId: string, requested: string | null | undefined): string {
  const body = settingsBodyOf(data, projectId);
  const enabled = body.enabledPriorities ?? defaultSettingsBody().enabledPriorities;
  if (requested === undefined || requested === null || requested.trim() === "") {
    return body.defaultPriority ?? "medium";
  }
  const id = requested.trim().toLowerCase();
  const def = priorityDefOf(data, id);
  if (!def) throw new Error(`없는 우선순위입니다: ${requested}`);
  if (!enabled.includes(id)) throw new Error(`이 프로젝트에서 사용할 수 없는 우선순위입니다: ${def.name}`);
  return id;
}

function typeNameOf(data: JiraData, id: string): string {
  return typeDefOf(data, id)?.name ?? id;
}

/**
 * 2단계 계층 규칙 — 위반이면 throw.
 * 에픽: parent 불가 / 하위 작업: parent = 일반 이슈만 / 일반 이슈: parent = 에픽만.
 */
function assertParentAllowed(data: JiraData, issue: Issue, parentId: string | null): void {
  if (parentId === null) return;
  if (parentId === issue.id) throw new Error("자기 자신을 부모로 지정할 수 없습니다");
  const parent = data.issues.find((i) => i.id === parentId);
  if (!parent) throw new Error("부모 이슈를 찾을 수 없습니다");
  if (parent.projectId !== issue.projectId) {
    throw new Error("같은 프로젝트의 이슈만 상위 항목으로 지정할 수 있습니다");
  }
  // 계층 깊이 제한 없음(하위의 하위 허용) — 순환만 막는다: 자신의 자손을 상위로 올릴 수 없다
  const seen = new Set<string>();
  let cursor: Issue | undefined = parent;
  while (cursor && cursor.parentId && seen.add(cursor.id)) {
    if (cursor.parentId === issue.id) throw new Error("상위 항목이 순환합니다");
    cursor = data.issues.find((i) => i.id === cursor!.parentId);
  }
}

function userLabel(data: JiraData, userId: string | null): string {
  if (!userId) return "미지정";
  return data.users.find((u) => u.id === userId)?.name ?? "미지정";
}

function versionLabel(data: JiraData, versionId: string | null): string {
  if (!versionId) return "없음";
  return data.versions.find((v) => v.id === versionId)?.name ?? "없음";
}

/** 이슈에 달 수 있는 버전인지 — 같은 프로젝트이고 보관되지 않았어야 한다 */
function assertVersionAssignable(data: JiraData, versionId: string, projectId: string): void {
  const version = data.versions.find((v) => v.id === versionId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  if (version.projectId !== projectId) throw new Error("다른 프로젝트의 버전입니다");
  if (version.status === "archived") throw new Error("보관된 버전에는 이슈를 달 수 없습니다");
}

function sprintLabel(data: JiraData, sprintId: string | null): string {
  if (!sprintId) return "백로그";
  return data.sprints.find((s) => s.id === sprintId)?.name ?? "백로그";
}

/** 활동로그 부수효과: before/after를 비교해 변경 항목별 Activity를 쌓는다 */
/** 프로젝트의 해석된 설정 본문 (내부 동기 버전 — 커스텀 > 스킴 > 기본) */
function resolvedBody(data: JiraData, projectId: string): SettingsBody {
  const entry = data.projectSettings.find((e) => e.projectId === projectId);
  const scheme =
    data.schemes.find((s) => s.id === entry?.schemeId) ?? data.schemes.find((s) => s.isDefault);
  return entry?.custom ?? scheme?.body ?? defaultSettingsBody();
}

/** 프로젝트의 해석된 상태 목록 */
function resolvedStatuses(data: JiraData, projectId: string): SettingsBody["statuses"] {
  return enrichStatuses(data, resolvedBody(data, projectId).statuses);
}

function statusNameOf(data: JiraData, projectId: string, statusId: string): string {
  return resolvedStatuses(data, projectId).find((s) => s.id === statusId)?.name ?? statusId;
}

/** 상태 id가 프로젝트 워크플로에 존재하는지 검증 — create/update/moveIssue의 쓰기 가드 */
/**
 * 전이 검사 — 목록이 비면 모두 허용(호환 기본값), 정의돼 있으면 목록에 있는 이동만 허용한다.
 * 같은 상태로의 저장은 전이가 아니다.
 */
function assertTransitionAllowed(
  data: JiraData,
  projectId: string,
  from: string,
  to: string,
): void {
  if (from === to) return;
  const transitions = resolvedBody(data, projectId).transitions ?? [];
  if (transitions.length === 0) return;
  const allowed = transitions.some(
    (transition) =>
      transition.to === to && (transition.from.length === 0 || transition.from.includes(from)),
  );
  if (!allowed) {
    throw new Error(
      `${statusNameOf(data, projectId, from)}에서 ${statusNameOf(data, projectId, to)}로 옮길 수 없습니다`,
    );
  }
}

/**
 * 없는 상태를 가리키는 전이는 남기지 않는다 — 상태를 지우면 그 전이도 함께 사라진다.
 * 원래 전역 전이(from 비었음)는 그대로 두고, from을 전부 잃은 전이만 버린다.
 */
/** 빠진 상태의 노드 위치는 남기지 않는다 — 가상 "모든 상태" 노드는 유지 */
function pruneLayout(body: SettingsBody): WorkflowLayout | undefined {
  if (!body.layout) return undefined;
  const valid = new Set(body.statuses.map((status) => status.id));
  valid.add(WORKFLOW_ANY_NODE);
  return Object.fromEntries(Object.entries(body.layout).filter(([id]) => valid.has(id)));
}

function pruneTransitions(body: SettingsBody): WorkflowTransition[] | undefined {
  if (!body.transitions) return undefined;
  const valid = new Set(body.statuses.map((status) => status.id));
  return body.transitions.flatMap((transition) => {
    if (!valid.has(transition.to)) return [];
    const from = transition.from.filter((id) => valid.has(id));
    if (transition.from.length > 0 && from.length === 0) return [];
    return [{ ...transition, from }];
  });
}

/**
 * 해결 규칙(지라와 동일): 완료 카테고리로 **들어가면** "완료됨"이 기본값, 벗어나면 비운다.
 * 명시한 값은 기본값보다 우선하되 완료가 아닌 이슈에는 설정할 수 없다.
 * @param explicit undefined = 지정 안 함
 */
function applyResolutionRule(
  data: JiraData,
  issue: Issue,
  previousStatus: string,
  explicit: IssueResolution | null | undefined,
): void {
  const wasDone = statusKindOf(data, issue.projectId, previousStatus) === "complete";
  const isDone = statusKindOf(data, issue.projectId, issue.status) === "complete";
  if (!isDone) {
    if (explicit !== undefined && explicit !== null) {
      throw new Error("완료된 이슈에만 해결을 설정할 수 있습니다");
    }
    issue.resolution = null;
    return;
  }
  if (explicit !== undefined) {
    issue.resolution = explicit ?? "done";
  } else if (!wasDone || issue.resolution === null) {
    issue.resolution = "done";
  }
}

function assertValidStatus(data: JiraData, projectId: string, statusId: string): void {
  if (!resolvedStatuses(data, projectId).some((s) => s.id === statusId)) {
    throw new Error(`이 프로젝트에 없는 상태입니다: ${statusId}`);
  }
}

function statusKindOf(data: JiraData, projectId: string, statusId: string): StatusKind {
  const found = resolvedStatuses(data, projectId).find((s) => s.id === statusId);
  if (found) return found.kind ?? "new";
  return categoryById(data, statusId).kind; // 기본 id 폴백 (구버전 데이터)
}

/** 상태 id → 카테고리 id — 스마트 검색의 카테고리 필터용 */
function statusCategoryIdOf(data: JiraData, projectId: string, statusId: string): string {
  const found = resolvedStatuses(data, projectId).find((s) => s.id === statusId);
  return found?.category ?? categoryById(data, statusId).id;
}

/**
 * 구조화 변경 이력 — 사람이 읽는 활동로그(activities)와 별도로, 리포트가 집계하는 원천이다.
 * 서버 `issue_change_log`와 같은 모양이라 REST 전환 때 계약이 바뀌지 않는다.
 */
function logChange(
  data: JiraData,
  issue: Issue,
  field: ChangeField,
  fromValue: string | null,
  toValue: string | null,
  at: string,
): void {
  data.changes.push({
    id: nextId(),
    issueId: issue.id,
    projectId: issue.projectId,
    sprintId: issue.sprintId,
    field,
    fromValue,
    toValue,
    actorId: CURRENT_USER_ID,
    at,
  });
}

function recordChanges(data: JiraData, before: Issue, after: Issue, at: string): void {
  const push = (type: Activity["type"], detail: string) => {
    data.activities.push({
      id: nextId(),
      issueId: after.id,
      actorId: CURRENT_USER_ID,
      type,
      detail,
      at,
    });
  };
  if (before.status !== after.status) {
    push(
      "status",
      `${statusNameOf(data, after.projectId, before.status)} → ${statusNameOf(data, after.projectId, after.status)}`,
    );
    logChange(data, after, "status", before.status, after.status, at);
  }
  if (before.assigneeId !== after.assigneeId) {
    push("assignee", `${userLabel(data, before.assigneeId)} → ${userLabel(data, after.assigneeId)}`);
  }
  if (before.priority !== after.priority) {
    push("priority", `${PRIORITY_LABELS[before.priority]} → ${PRIORITY_LABELS[after.priority]}`);
  }
  if (before.sprintId !== after.sprintId) {
    push("sprint", `${sprintLabel(data, before.sprintId)} → ${sprintLabel(data, after.sprintId)}`);
    logChange(data, after, "sprint", before.sprintId, after.sprintId, at);
  }
  if (before.dueDate !== after.dueDate) {
    push("duedate", `${before.dueDate ?? "미지정"} → ${after.dueDate ?? "미지정"}`);
  }
  if (before.labels.join(" ") !== after.labels.join(" ")) {
    push("labels", after.labels.length > 0 ? after.labels.join(", ") : "라벨 없음");
  }
  if (before.type !== after.type) {
    push("issuetype", `${typeNameOf(data, before.type)} → ${typeNameOf(data, after.type)}`);
  }
  if (before.resolution !== after.resolution) {
    const label = (r: IssueResolution | null) => (r ? RESOLUTION_LABELS[r] : "없음");
    push("resolution", `${label(before.resolution)} → ${label(after.resolution)}`);
  }
  if (before.fixVersionId !== after.fixVersionId) {
    push("fixversion", `${versionLabel(data, before.fixVersionId)} → ${versionLabel(data, after.fixVersionId)}`);
  }
  notifyIssueChanges(data, before, after, at);
}

/**
 * 알림 부수효과 — 지라처럼 본인 액션은 본인에게 알리지 않는다.
 * 목업은 단일 사용자(u1)라 실제 생성은 드물고, 시드 알림이 주 데모 데이터다.
 */
/** 워처 추가 — 멱등 */
function addWatcher(data: JiraData, issueId: string, userId: string, at: string): void {
  if (!data.watchers.some((w) => w.issueId === issueId && w.userId === userId)) {
    data.watchers.push({ issueId, userId, createdAt: at });
  }
}

/** 알림 대상 = 워처 ∪ 담당자 − 행위자. 본인 행동은 본인에게 알리지 않는다 */
function notificationRecipients(data: JiraData, issue: Issue, actorId: string): string[] {
  const set = new Set(data.watchers.filter((w) => w.issueId === issue.id).map((w) => w.userId));
  if (issue.assigneeId) set.add(issue.assigneeId);
  set.delete(actorId);
  return [...set];
}

type NotificationKind = keyof UserPreferences["notifications"];

function pushNotification(
  data: JiraData,
  userId: string,
  issue: Issue,
  message: string,
  at: string,
  kind: NotificationKind = "statusChanged",
): void {
  if (!preferencesOf(data, userId).notifications[kind]) return;
  data.notifications.push({
    id: nextId(),
    userId,
    issueId: issue.id,
    issueKey: issue.key,
    actorId: CURRENT_USER_ID,
    message,
    at,
    read: false,
  });
}

/** 본문에서 @멘션된 사용자에게 — 워처 여부와 무관, 본인·모르는 id 제외 */
function notifyMentions(data: JiraData, issue: Issue, userIds: string[], where: string, at: string): void {
  const actorName = userLabel(data, CURRENT_USER_ID);
  for (const userId of userIds) {
    if (userId === CURRENT_USER_ID || !data.users.some((u) => u.id === userId)) continue;
    pushNotification(data, userId, issue, `${actorName} 님이 ${where}에서 나를 멘션했습니다`, at, "mentioned");
  }
}

function notifyIssueChanges(data: JiraData, before: Issue, after: Issue, at: string): void {
  const actorName = userLabel(data, CURRENT_USER_ID);
  notifyMentions(data, after, newMentionIds(before.description, after.description), `${after.key} 설명`, at);
  if (preferencesOf(data, CURRENT_USER_ID).autoWatch.edited) addWatcher(data, after.id, CURRENT_USER_ID, at);
  if (before.assigneeId !== after.assigneeId && after.assigneeId) {
    // 새 담당자는 자동 워처가 되고, 본인이 아니면 배정 알림을 받는다
    addWatcher(data, after.id, after.assigneeId, at);
    if (after.assigneeId !== CURRENT_USER_ID) {
      pushNotification(data, after.assigneeId, after, `${actorName} 님이 ${after.key}를 나에게 할당했습니다`, at, "assigned");
    }
  }
  if (before.status !== after.status) {
    const message = `${actorName} 님이 ${after.key}를 ${statusNameOf(data, after.projectId, after.status)}(으)로 옮겼습니다`;
    for (const userId of notificationRecipients(data, after, CURRENT_USER_ID)) {
      pushNotification(data, userId, after, message, at);
    }
  }
}

// ── 멤버·역할 ────────────────────────────────────────────────

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

export interface ProjectMemberView {
  user: User;
  role: ProjectRole;
}

/** 역할 높은 순 → 이름순. 디렉터리에서 사라진 사용자는 목록에서 뺀다 */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberView[]> {
  const data = load();
  return clone(
    data.members
      .filter((member) => member.projectId === projectId)
      .map((member) => {
        const user = data.users.find((u) => u.id === member.userId);
        return { user: user ? withAvatar(data, user) : undefined, role: member.role };
      })
      .filter((row): row is ProjectMemberView => row.user !== undefined)
      .sort(
        (a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.user.name.localeCompare(b.user.name),
      ),
  );
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  assertCanAdmin(data, projectId);
  if (!data.users.some((u) => u.id === userId)) throw new Error("사용자를 찾을 수 없습니다");
  if (data.members.some((m) => m.projectId === projectId && m.userId === userId)) {
    throw new Error("이미 프로젝트 멤버입니다");
  }
  data.members.push({ projectId, userId, role });
  persist();
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const member = requireMember(data, projectId, userId);
  if (member.role === "admin" && role !== "admin") assertNotLastAdmin(data, projectId, userId);
  member.role = role;
  persist();
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const member = requireMember(data, projectId, userId);
  if (member.role === "admin") assertNotLastAdmin(data, projectId, userId);
  data.members = data.members.filter(
    (m) => !(m.projectId === projectId && m.userId === userId),
  );
  persist();
}

/** 현재 사용자의 역할 — 화면이 편집 UI를 보일지 판단한다. 멤버가 아니면 null */
export async function getMyProjectRole(projectId: string): Promise<ProjectRole | null> {
  return myRole(load(), projectId);
}

/**
 * 어느 프로젝트든 관리자인가 — 설계 §3.2의 "리소스 ADMIN도 초대할 수 있다"를 화면이 판정하는 값.
 * 목업 프로필은 항상 전역 관리자라(`getMyOrgProfile`) 실사용에서는 늘 참이지만, 화면이 전역
 * 관리자 여부와 **별개로** 이 값을 묻기 때문에 목업도 진짜 멤버십으로 답한다.
 */
export async function hasAnyProjectAdmin(): Promise<boolean> {
  return load().members.some((m) => m.userId === CURRENT_USER_ID && m.role === "admin");
}

/**
 * 쓰기 권한 가드 — 역할 계층은 org-service와 같다(뷰어 ⊂ 편집자 ⊂ 관리자).
 * 목업이 백엔드 대역이므로 여기서 막지 않으면 "뷰어 = 읽기만"이 화면의 빈말이 된다.
 * 서버 전환 후에는 org-service gRPC 판정이 이 자리를 대신한다.
 */
function assertNotArchived(data: JiraData, projectId: string): void {
  if (data.projects.find((p) => p.id === projectId)?.archivedAt) {
    throw new Error("보관된 프로젝트는 읽기만 할 수 있습니다");
  }
}

function assertCanEdit(data: JiraData, projectId: string): void {
  const role = myRole(data, projectId);
  if (role === null || role === "viewer") {
    throw new Error("이 프로젝트를 편집할 권한이 없습니다");
  }
  assertNotArchived(data, projectId);
}

/** 보관 가드를 우회하는 관리자 확인 — 보관 해제·휴지통 이동에 쓴다 */
function assertAdminIgnoringArchive(data: JiraData, projectId: string): void {
  if (myRole(data, projectId) !== "admin") {
    throw new Error("프로젝트 관리자만 할 수 있습니다");
  }
}

function assertCanAdmin(data: JiraData, projectId: string): void {
  assertAdminIgnoringArchive(data, projectId);
  assertNotArchived(data, projectId);
}

function myRole(data: JiraData, projectId: string): ProjectRole | null {
  return (
    data.members.find((m) => m.projectId === projectId && m.userId === CURRENT_USER_ID)?.role ??
    null
  );
}

function requireMember(data: JiraData, projectId: string, userId: string): ProjectMember {
  const member = data.members.find((m) => m.projectId === projectId && m.userId === userId);
  if (!member) throw new Error("프로젝트 멤버가 아닙니다");
  return member;
}

/** 관리자가 0명인 프로젝트를 만들지 않는다 — 아무도 설정을 못 고치는 상태를 막는다 */
function assertNotLastAdmin(data: JiraData, projectId: string, userId: string): void {
  const otherAdmins = data.members.filter(
    (m) => m.projectId === projectId && m.role === "admin" && m.userId !== userId,
  );
  if (otherAdmins.length === 0) {
    throw new Error("프로젝트에는 관리자가 최소 한 명 필요합니다");
  }
}

// ── attachments ──────────────────────────────────────────────

/**
 * 목업의 첨부 바이트는 메모리에만 둔다 — localStorage는 5MB 한계와 base64 팽창 때문에 부적합하다.
 * 새로고침하면 바이트만 사라지고(메타는 남는다) 내려받기가 "저장소에 없음"으로 실패한다. 의도된 한계.
 */
const attachmentBlobs = new Map<string, Blob>();

export async function listAttachments(issueId: string): Promise<Attachment[]> {
  return clone(load().attachments.filter((a) => a.issueId === issueId));
}

export async function uploadAttachment(issueId: string, file: File): Promise<Attachment> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, issue.projectId);
  if (file.size === 0) throw new Error("빈 파일은 올릴 수 없습니다");
  const now = new Date().toISOString();
  const attachment: Attachment = {
    id: nextId(),
    issueId,
    filename: file.name || "unnamed",
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    uploadedBy: CURRENT_USER_ID,
    createdAt: now,
  };
  attachmentBlobs.set(attachment.id, file);
  data.attachments.push(attachment);
  data.activities.push({
    id: nextId(),
    issueId,
    actorId: CURRENT_USER_ID,
    type: "attachment",
    detail: `${attachment.filename} 첨부`,
    at: now,
  });
  issue.updatedAt = now;
  persist();
  return clone(attachment);
}

export async function downloadAttachment(id: string): Promise<Blob> {
  const data = load();
  const attachment = data.attachments.find((a) => a.id === id);
  if (!attachment) throw new Error("첨부를 찾을 수 없습니다");
  const blob = attachmentBlobs.get(id);
  if (!blob) throw new Error("첨부 본문이 저장소에 없습니다 (목업은 새로고침 후 바이트를 잃습니다)");
  return blob;
}

export async function deleteAttachment(id: string): Promise<void> {
  const data = load();
  const attachment = data.attachments.find((a) => a.id === id);
  if (!attachment) throw new Error("첨부를 찾을 수 없습니다");
  const issue = data.issues.find((i) => i.id === attachment.issueId);
  if (issue) assertCanEdit(data, issue.projectId);
  data.attachments = data.attachments.filter((a) => a.id !== id);
  attachmentBlobs.delete(id);
  if (issue) {
    const now = new Date().toISOString();
    data.activities.push({
      id: nextId(),
      issueId: issue.id,
      actorId: CURRENT_USER_ID,
      type: "attachment",
      detail: `${attachment.filename} 첨부 삭제`,
      at: now,
    });
    issue.updatedAt = now;
  }
  persist();
}

// ── versions (릴리스) ─────────────────────────────────────────

export interface VersionInput {
  name?: string;
  description?: string | null;
  startDate?: string | null;
  releaseDate?: string | null;
}

function dateValue(next: string | null | undefined, current: string | undefined) {
  if (next === undefined) return current;
  const trimmed = (next ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function assertVersionDates(startDate?: string, releaseDate?: string): void {
  if (startDate && releaseDate && startDate > releaseDate) {
    throw new Error("시작일은 릴리스일보다 늦을 수 없습니다");
  }
}

/** 만든 순서 — 릴리스 허브는 최신을 위에 보이려면 화면에서 뒤집는다 */
export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  return clone(load().versions.filter((v) => v.projectId === projectId));
}

export async function createVersion(
  projectId: string,
  input: VersionInput & { name: string },
): Promise<ProjectVersion> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanEdit(data, projectId);
  const name = input.name.trim();
  if (!name) throw new Error("버전 이름을 입력하세요");
  if (data.versions.some((v) => v.projectId === projectId && v.name === name)) {
    throw new Error(`이미 있는 버전 이름입니다: ${name}`);
  }
  const startDate = dateValue(input.startDate, undefined);
  const releaseDate = dateValue(input.releaseDate, undefined);
  assertVersionDates(startDate, releaseDate);
  const version: ProjectVersion = {
    id: nextId(),
    projectId,
    name,
    description: input.description?.trim() ?? "",
    status: "unreleased",
    createdAt: new Date().toISOString(),
  };
  if (startDate) version.startDate = startDate;
  if (releaseDate) version.releaseDate = releaseDate;
  data.versions.push(version);
  persist();
  return clone(version);
}

export async function updateVersion(id: string, patch: VersionInput): Promise<ProjectVersion> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  const name = patch.name === undefined ? version.name : patch.name.trim();
  if (!name) throw new Error("버전 이름을 입력하세요");
  if (
    name !== version.name &&
    data.versions.some((v) => v.projectId === version.projectId && v.name === name)
  ) {
    throw new Error(`이미 있는 버전 이름입니다: ${name}`);
  }
  const startDate = dateValue(patch.startDate, version.startDate);
  const releaseDate = dateValue(patch.releaseDate, version.releaseDate);
  assertVersionDates(startDate, releaseDate);
  version.name = name;
  if (patch.description !== undefined) version.description = patch.description?.trim() ?? "";
  if (startDate === undefined) delete version.startDate;
  else version.startDate = startDate;
  if (releaseDate === undefined) delete version.releaseDate;
  else version.releaseDate = releaseDate;
  persist();
  return clone(version);
}

/**
 * 릴리스. 미완료(카테고리 done 아님) 이슈는 `moveUnresolvedTo`로 옮기고, 지정이 없으면
 * 그 버전에 그대로 둔다(지라와 동일). 대상 검증이 실패하면 릴리스 자체가 일어나지 않는다.
 */
export async function releaseVersion(
  id: string,
  options: { moveUnresolvedTo?: string | null } = {},
): Promise<ProjectVersion> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  if (version.status === "released") throw new Error("이미 릴리스된 버전입니다");
  if (version.status === "archived") throw new Error("보관된 버전은 릴리스할 수 없습니다");
  const targetId = options.moveUnresolvedTo ?? null;
  if (targetId !== null) {
    if (targetId === id) throw new Error("릴리스하는 버전으로는 이관할 수 없습니다");
    const target = requireVersion(data, targetId);
    if (target.projectId !== version.projectId) throw new Error("다른 프로젝트의 버전입니다");
    if (target.status === "released") throw new Error("릴리스된 버전으로는 이관할 수 없습니다");
    if (target.status === "archived") throw new Error("보관된 버전으로는 이관할 수 없습니다");
    const now = new Date().toISOString();
    for (const issue of data.issues) {
      if (
        issue.fixVersionId === id &&
        statusKindOf(data, issue.projectId, issue.status) !== "complete"
      ) {
        issue.fixVersionId = targetId;
        issue.updatedAt = now;
      }
    }
  }
  version.status = "released";
  version.releasedAt = new Date().toISOString();
  persist();
  return clone(version);
}

export async function archiveVersion(id: string): Promise<ProjectVersion> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  if (version.status === "archived") throw new Error("이미 보관된 버전입니다");
  version.status = "archived";
  persist();
  return clone(version);
}

/** 지우면 달려 있던 이슈의 수정 버전이 비워진다(이슈는 남는다) */
export async function deleteVersion(id: string): Promise<void> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  for (const issue of data.issues) {
    if (issue.fixVersionId === id) issue.fixVersionId = null;
  }
  data.versions = data.versions.filter((v) => v.id !== id);
  persist();
}

/** 릴리스 허브의 진행률 — 완료 판정은 카테고리 */
export async function versionProgress(
  id: string,
): Promise<{ total: number; done: number; percent: number }> {
  const data = load();
  const version = requireVersion(data, id);
  const issues = data.issues.filter((i) => i.fixVersionId === version.id);
  const done = issues.filter(
    (i) => statusKindOf(data, i.projectId, i.status) === "complete",
  ).length;
  const total = issues.length;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function requireVersion(data: JiraData, id: string): ProjectVersion {
  const version = data.versions.find((v) => v.id === id);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  return version;
}

// ── sprints ──────────────────────────────────────────────────

export async function listSprints(projectId: string): Promise<Sprint[]> {
  return clone(load().sprints.filter((s) => s.projectId === projectId));
}

export async function createSprint(projectId: string): Promise<Sprint> {
  const data = load();
  assertCanEdit(data, projectId);
  if (!data.projects.some((p) => p.id === projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  const count = data.sprints.filter((s) => s.projectId === projectId).length;
  const sprint: Sprint = {
    id: nextId(),
    projectId,
    name: `Sprint ${count + 1}`,
    state: "planned",
  };
  data.sprints.push(sprint);
  persist();
  return clone(sprint);
}

/** 계획 메타 패치 — 빈 문자열·공백은 "지움"(undefined)으로 정규화한다 */
export interface SprintPlanPatch {
  name?: string;
  goal?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
}

function planValue(next: string | null | undefined, current: string | undefined) {
  if (next === undefined) return current;
  const trimmed = (next ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * 스프린트 계획 메타(이름·목표·예정 기간) 수정. 상태와 무관하게 허용한다 — 진행 중에도
 * 목표를 다시 쓰는 일이 실제로 일어난다. 기간 역전은 저장 전에 막는다.
 */
export async function updateSprint(id: string, patch: SprintPlanPatch): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  assertCanEdit(data, sprint.projectId);

  const name = patch.name === undefined ? sprint.name : patch.name.trim();
  if (!name) throw new Error("스프린트 이름을 입력하세요");
  const goal = planValue(patch.goal, sprint.goal);
  const plannedStart = planValue(patch.plannedStart, sprint.plannedStart);
  const plannedEnd = planValue(patch.plannedEnd, sprint.plannedEnd);
  if (plannedStart && plannedEnd && plannedStart > plannedEnd) {
    throw new Error("시작 예정일은 종료 예정일보다 늦을 수 없습니다");
  }

  sprint.name = name;
  assignOrDelete(sprint, "goal", goal);
  assignOrDelete(sprint, "plannedStart", plannedStart);
  assignOrDelete(sprint, "plannedEnd", plannedEnd);
  persist();
  return clone(sprint);
}

/** 값이 없으면 키 자체를 지운다 — 화면·테스트가 "없음"을 undefined 하나로 판단하게 한다 */
function assignOrDelete(sprint: Sprint, key: "goal" | "plannedStart" | "plannedEnd", value?: string) {
  if (value === undefined) {
    delete sprint[key];
  } else {
    sprint[key] = value;
  }
}

export async function startSprint(id: string): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  assertCanEdit(data, sprint.projectId);
  if (sprint.state !== "planned") throw new Error("계획 상태의 스프린트만 시작할 수 있습니다");
  if (data.sprints.some((s) => s.projectId === sprint.projectId && s.state === "active")) {
    throw new Error("이미 진행 중인 스프린트가 있습니다");
  }
  sprint.state = "active";
  sprint.startedAt = new Date().toISOString();
  persist();
  return clone(sprint);
}

/**
 * 스프린트 완료. 미완료 이슈는 `moveUnfinishedTo`가 가리키는 스프린트로, 지정이 없으면
 * 백로그로 옮긴다(지라와 같은 선택지). 대상 검증이 실패하면 완료 자체가 일어나지 않는다.
 */
export async function completeSprint(
  id: string,
  options: { moveUnfinishedTo?: string | null } = {},
): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  assertCanEdit(data, sprint.projectId);
  if (sprint.state !== "active") throw new Error("진행 중인 스프린트만 완료할 수 있습니다");

  const targetId = options.moveUnfinishedTo ?? null;
  if (targetId !== null) {
    if (targetId === id) throw new Error("완료하는 스프린트로는 이관할 수 없습니다");
    const target = data.sprints.find((s) => s.id === targetId);
    if (!target) throw new Error("스프린트를 찾을 수 없습니다");
    if (target.projectId !== sprint.projectId) throw new Error("다른 프로젝트의 스프린트입니다");
    if (target.state === "done") throw new Error("완료된 스프린트로는 이관할 수 없습니다");
  }

  const now = new Date().toISOString();
  for (const issue of data.issues) {
    if (issue.sprintId === id && statusKindOf(data, issue.projectId, issue.status) !== "complete") {
      issue.sprintId = targetId; // null = 백로그
      issue.updatedAt = now;
      logChange(data, issue, "sprint", id, targetId, now);
    }
  }
  sprint.state = "done";
  sprint.completedAt = now;
  persist();
  return clone(sprint);
}

// ── issues ───────────────────────────────────────────────────

export async function listIssues(
  projectId: string,
  filter?: {
    text?: string;
    status?: string; // WorkflowStatus.id
    priority?: IssuePriority;
    assigneeId?: string;
    label?: string;
    componentId?: string;
    type?: IssueType;
  },
): Promise<Issue[]> {
  let issues = load().issues.filter((i) => i.projectId === projectId);
  if (filter?.text) {
    const text = filter.text.toLowerCase();
    issues = issues.filter(
      (i) =>
        i.title.toLowerCase().includes(text) ||
        i.key.toLowerCase().includes(text) ||
        htmlToText(i.description).toLowerCase().includes(text),
    );
  }
  if (filter?.status) issues = issues.filter((i) => i.status === filter.status);
  if (filter?.priority) issues = issues.filter((i) => i.priority === filter.priority);
  if (filter?.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
  if (filter?.label) issues = issues.filter((i) => i.labels.includes(filter.label!));
  if (filter?.componentId) issues = issues.filter((i) => (i.componentIds ?? []).includes(filter.componentId!));
  if (filter?.type) issues = issues.filter((i) => i.type === filter.type);
  // order 동률(보드 컬럼별 재번호로 발생 가능)은 key로 결정적으로 정렬한다
  return clone([...issues].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)));
}

/**
 * 상세 검색 — IssueQuery 실행 (전 프로젝트, 다중 값 OR·필드 간 AND).
 * 추후 jira-service GraphQL 쿼리로 이 시그니처가 그대로 넘어간다.
 */
export async function queryIssues(query: IssueQuery): Promise<Issue[]> {
  const data = load();
  let issues = [...data.issues];
  const text = query.text.trim().toLowerCase();
  if (text) {
    issues = issues.filter(
      (i) =>
        i.title.toLowerCase().includes(text) ||
        i.key.toLowerCase().includes(text) ||
        htmlToText(i.description).toLowerCase().includes(text),
    );
  }
  if (query.projectIds.length > 0) {
    issues = issues.filter((i) => query.projectIds.includes(i.projectId));
  }
  if (query.statuses.length > 0) {
    // 카테고리 기준 매치 — 프로젝트별 커스텀 상태도 카테고리로 걸린다
    issues = issues.filter((i) =>
      (query.statuses as string[]).includes(statusCategoryIdOf(data, i.projectId, i.status)),
    );
  }
  if (query.statusIds.length > 0) {
    issues = issues.filter((i) => query.statusIds.includes(i.status));
  }
  if (query.priorities.length > 0) {
    issues = issues.filter((i) => query.priorities.includes(i.priority));
  }
  if (query.types.length > 0) issues = issues.filter((i) => query.types.includes(i.type));
  if (query.assigneeIds.length > 0) {
    issues = issues.filter((i) =>
      i.assigneeId === null
        ? query.assigneeIds.includes("unassigned")
        : query.assigneeIds.includes(i.assigneeId),
    );
  }
  if (query.labels.length > 0) {
    issues = issues.filter((i) => i.labels.some((l) => query.labels.includes(l)));
  }
  const priorityRank: Record<IssuePriority, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => {
    switch (query.sort) {
      case "created":
        return b.createdAt.localeCompare(a.createdAt);
      case "due":
        if (a.dueDate === null && b.dueDate === null) return a.key.localeCompare(b.key);
        if (a.dueDate === null) return 1; // 미지정 마감일은 뒤로
        if (b.dueDate === null) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      case "priority":
        return priorityRank[a.priority] - priorityRank[b.priority];
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });
  return clone(issues);
}

/** 전역 검색 — 전 프로젝트 이슈에서 키/제목/설명 매치, 최근 수정 순, 최대 limit건 */
export async function searchIssues(text: string, limit = 20): Promise<Issue[]> {
  const query = text.trim().toLowerCase();
  if (!query) return [];
  const matches = load()
    .issues.filter(
      (i) =>
        i.key.toLowerCase().includes(query) ||
        i.title.toLowerCase().includes(query) ||
        htmlToText(i.description).toLowerCase().includes(query),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return clone(matches.slice(0, limit));
}

export async function getIssueByKey(key: string): Promise<Issue | null> {
  const issue = load().issues.find((i) => i.key === key);
  return issue ? clone(issue) : null;
}

export async function createIssue(input: {
  projectId: string;
  title: string;
  description?: string;
  type?: IssueType;
  status?: string; // WorkflowStatus.id
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  labels?: string[];
  componentIds?: string[];
  estimateHours?: number | null;
  /** 수정 버전 — 서버도 생성 경로에서 받는다(다른 프로젝트·보관된 버전은 거부) */
  fixVersionId?: string | null;
  /** 보존할 키(이관·CSV) — `{프로젝트키}-{번호}` 형식, 유일해야 한다. 번호는 카운터를 앞당긴다 */
  key?: string;
}): Promise<Issue> {
  const data = load();
  const project = data.projects.find((p) => p.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  const title = input.title.trim();
  if (!title) throw new Error("이슈 제목을 입력하세요");
  let preservedSeq: number | null = null;
  if (input.key !== undefined) {
    const match = new RegExp(`^${project.key}-(\\d+)$`).exec(input.key.trim().toUpperCase());
    if (!match) throw new Error(`키는 ${project.key}-번호 형식이어야 합니다: ${input.key}`);
    if (data.issues.some((i) => i.key === match[0])) {
      throw new Error(`이미 있는 키입니다: ${match[0]}`);
    }
    preservedSeq = Number(match[1]);
  }
  if (input.estimateHours !== undefined && input.estimateHours !== null && !(input.estimateHours > 0)) {
    throw new Error("예상 시간은 0보다 커야 합니다");
  }
  // 프로젝트 설정 해석은 한 군데(resolvedBody)로 통일한다 — 커스텀 > 스킴 > 기본을 여기저기서 다시 풀지 않는다
  const bodyForCreate = resolvedBody(data, project.id);
  // 타입은 프로젝트 설정(enabledTypes)을 따른다 — 미지정이면 task, task가 꺼져 있으면 첫 활성 타입
  const enabledTypes = bodyForCreate.enabledTypes;
  const resolvedType =
    input.type ??
    (enabledTypes.includes("task")
      ? "task"
      : enabledTypes.find((t) => typeLevelOf(data, t) !== "subtask")!);
  if (!typeDefOf(data, resolvedType)) throw new Error(`없는 이슈 타입입니다: ${resolvedType}`);
  // 하위 작업 계층은 계층 기능이라 활성 목록과 무관하게 허용
  if (typeLevelOf(data, resolvedType) !== "subtask" && !enabledTypes.includes(resolvedType)) {
    throw new Error(`이 프로젝트에서 사용할 수 없는 타입입니다: ${typeNameOf(data, resolvedType)}`);
  }
  assertCanEdit(data, project.id);
  if (input.status !== undefined) assertValidStatus(data, project.id, input.status);
  const componentIdsForCreate = validateComponentIds(data, project.id, input.componentIds);
  if (input.fixVersionId) assertVersionAssignable(data, input.fixVersionId, project.id);
  // 필드 구성의 필수 검사 — 만들기에서만 한다(수정은 기존 이슈를 갑자기 막지 않으려고 검사하지 않는다).
  // 구성은 만들려는 타입으로 해석한다 — 타입별 덮어쓰기가 있으면 그쪽이 이긴다.
  assertRequiredFields(bodyForCreate, resolvedType, {
    description: input.description === undefined ? "" : htmlToText(input.description),
    assignee: input.assigneeId,
    labels: input.labels,
    components: componentIdsForCreate,
    // parent는 저장 단계에서 required 자체가 막히므로 생성 검사 대상이 아니다
    sprint: input.sprintId,
    dueDate: input.dueDate,
    fixVersion: input.fixVersionId,
    estimate: input.estimateHours,
  });
  const seq = preservedSeq ?? (data.issueCounters[project.id] ?? 0) + 1;
  // 삭제돼도 감소하지 않는다 → 키 미재사용. 보존 키는 카운터를 그 번호 이상으로 앞당긴다
  data.issueCounters[project.id] = Math.max(data.issueCounters[project.id] ?? 0, seq);
  const now = new Date().toISOString();
  const maxOrder = data.issues
    .filter((i) => i.projectId === project.id)
    .reduce((max, i) => Math.max(max, i.order), 0);
  const issue: Issue = {
    id: nextId(),
    key: `${project.key}-${seq}`,
    projectId: project.id,
    title,
    description: input.description ?? "",
    type: resolvedType,
    // 기본 상태 = 프로젝트 워크플로의 첫 todo 카테고리 상태
    status:
      input.status ??
      (resolvedStatuses(data, project.id)
        .sort((a, b) => a.order - b.order)
        .find((s) => s.kind === "new")?.id ?? "todo"),
    priority: resolvePriority(data, project.id, input.priority),
    assigneeId: input.assigneeId ?? resolveDefaultAssigneeFor(data, project, componentIdsForCreate),
    reporterId: CURRENT_USER_ID,
    sprintId: input.sprintId ?? null,
    parentId: null, // 계층 검증 후 아래에서 지정
    dueDate: input.dueDate ?? null,
    estimateHours: input.estimateHours ?? null,
    resolution: null,
    fixVersionId: input.fixVersionId ?? null,
    labels: input.labels ?? [],
    componentIds: componentIdsForCreate,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  if (input.parentId) {
    assertParentAllowed(data, issue, input.parentId);
    issue.parentId = input.parentId;
  }
  applyResolutionRule(data, issue, "todo", undefined);
  data.issues.push(issue);
  // 보고자(생성자)와 담당자는 자동 워처 — 지라 기본 동작
  if (preferencesOf(data, CURRENT_USER_ID).autoWatch.created) addWatcher(data, issue.id, CURRENT_USER_ID, now);
  if (issue.assigneeId) addWatcher(data, issue.id, issue.assigneeId, now);
  data.activities.push({
    id: nextId(),
    issueId: issue.id,
    actorId: CURRENT_USER_ID,
    type: "created",
    detail: "이슈 생성",
    at: now,
  });
  logChange(data, issue, "status", null, issue.status, now);
  if (issue.sprintId !== null) logChange(data, issue, "sprint", null, issue.sprintId, now);
  persist();
  return clone(issue);
}

export async function updateIssue(
  id: string,
  patch: Partial<
    Pick<
      Issue,
      | "title"
      | "description"
      | "type"
      | "status"
      | "priority"
      | "assigneeId"
      | "sprintId"
      | "dueDate"
      | "labels"
      | "componentIds"
      | "estimateHours"
      | "resolution"
      | "fixVersionId"
    >
  >,
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  if (patch.estimateHours !== undefined && patch.estimateHours !== null && !(patch.estimateHours > 0)) {
    throw new Error("예상 시간은 0보다 커야 합니다");
  }
  assertCanEdit(data, issue.projectId);
  if (patch.fixVersionId !== undefined && patch.fixVersionId !== null) {
    assertVersionAssignable(data, patch.fixVersionId, issue.projectId);
  }
  if (patch.status !== undefined) {
    assertValidStatus(data, issue.projectId, patch.status);
    assertTransitionAllowed(data, issue.projectId, issue.status, patch.status);
  }
  const before = { ...issue, labels: [...issue.labels] };
  // 타입 전환 — 프로젝트 설정(enabledTypes) 검증. 계층은 타입과 무관하므로 부모·자식은 그대로 둔다
  if (patch.type !== undefined && patch.type !== issue.type) {
    // 프로젝트 설정(enabledTypes) 검증 — subtask는 계층 기능이라 예외
    const entry = data.projectSettings.find((e) => e.projectId === issue.projectId);
    const enabled =
      entry?.custom?.enabledTypes ??
      data.schemes.find((s) => s.id === entry?.schemeId)?.body.enabledTypes ??
      defaultSettingsBody().enabledTypes;
    if (!typeDefOf(data, patch.type)) throw new Error(`없는 이슈 타입입니다: ${patch.type}`);
    const nextLevel = typeLevelOf(data, patch.type);
    if (nextLevel !== "subtask" && !enabled.includes(patch.type)) {
      throw new Error(`이 프로젝트에서 사용할 수 없는 타입입니다: ${typeNameOf(data, patch.type)}`);
    }
  }
  const { resolution: explicitResolution, ...rest } = patch;
  if (rest.priority !== undefined) rest.priority = resolvePriority(data, issue.projectId, rest.priority);
  if (rest.componentIds !== undefined) rest.componentIds = validateComponentIds(data, issue.projectId, rest.componentIds);
  Object.assign(issue, rest);
  applyResolutionRule(data, issue, before.status, explicitResolution);
  if (patch.type !== undefined && issue.parentId !== null) {
    try {
      assertParentAllowed(data, issue, issue.parentId);
    } catch {
      // 새 타입과 기존 부모가 양립 불가 → 부모 자동 해제 (활동로그)
      const parentKey = data.issues.find((i) => i.id === issue.parentId)?.key ?? "없음";
      issue.parentId = null;
      data.activities.push({
        id: nextId(),
        issueId: issue.id,
        actorId: CURRENT_USER_ID,
        type: "parent",
        detail: `${parentKey} → 없음`,
        at: new Date().toISOString(),
      });
    }
  }
  // 상태/스프린트가 바뀌면 대상 그룹(같은 프로젝트·스프린트·상태) 맨 뒤로 order 재부여
  // (moveIssue는 beforeId로 정밀 배치, updateIssue는 항상 맨 뒤 — W2 인계)
  if (before.status !== issue.status || before.sprintId !== issue.sprintId) {
    const maxOrder = data.issues
      .filter(
        (i) =>
          i.id !== id &&
          i.projectId === issue.projectId &&
          i.sprintId === issue.sprintId &&
          i.status === issue.status,
      )
      .reduce((max, i) => Math.max(max, i.order), 0);
    issue.order = maxOrder + 1;
  }
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  return clone(issue);
}

export async function moveIssue(
  id: string,
  to: { status: string; beforeId?: string },
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, issue.projectId);
  assertValidStatus(data, issue.projectId, to.status);
  assertTransitionAllowed(data, issue.projectId, issue.status, to.status);
  const before = { ...issue };
  issue.status = to.status;
  applyResolutionRule(data, issue, before.status, undefined);
  // 대상 컬럼: 같은 프로젝트·같은 스프린트·대상 상태 (이동 이슈 제외, order 순)
  const column = data.issues
    .filter(
      (i) =>
        i.id !== id &&
        i.projectId === issue.projectId &&
        i.sprintId === issue.sprintId &&
        i.status === to.status,
    )
    .sort((a, b) => a.order - b.order);
  const insertAt = to.beforeId ? column.findIndex((i) => i.id === to.beforeId) : -1;
  // beforeId가 대상 컬럼에 없으면(드래그 중 다른 곳에서 옮겨진 stale 참조 등) 조용히 맨 끝에
  // 추가한다 — 의도된 동작. 화면은 이동 후 항상 재조회하므로 최종 상태는 일관된다. (W1 리뷰 인계)
  if (insertAt === -1) column.push(issue);
  else column.splice(insertAt, 0, issue);
  column.forEach((entry, index) => {
    entry.order = index + 1; // 컬럼 전체 order 재계산 (1부터)
  });
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  return clone(issue);
}

// ── worklogs ─────────────────────────────────────────────────

/** 작업일 내림차순, 같은 날은 기록 시각 내림차순 */
export async function listWorklogs(issueId: string): Promise<Worklog[]> {
  return clone(
    load()
      .worklogs.filter((w) => w.issueId === issueId)
      .sort((a, b) => b.workedOn.localeCompare(a.workedOn) || b.at.localeCompare(a.at)),
  );
}

export async function addWorklog(
  issueId: string,
  input: { hours: number; comment?: string; workedOn: string },
): Promise<Worklog> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  if (!(input.hours > 0)) throw new Error("시간은 0보다 커야 합니다");
  if (!input.workedOn) throw new Error("작업일을 입력하세요");
  const worklog: Worklog = {
    id: nextId(),
    issueId,
    authorId: CURRENT_USER_ID,
    hours: input.hours,
    comment: input.comment?.trim() ?? "",
    workedOn: input.workedOn,
    at: new Date().toISOString(),
  };
  data.worklogs.push(worklog);
  data.activities.push({
    id: nextId(),
    issueId,
    actorId: CURRENT_USER_ID,
    type: "worklog",
    detail: `${input.hours}시간 기록`,
    at: worklog.at,
  });
  persist();
  return clone(worklog);
}

export async function deleteWorklog(id: string): Promise<void> {
  const data = load();
  const index = data.worklogs.findIndex((w) => w.id === id);
  if (index === -1) throw new Error("워크로그를 찾을 수 없습니다");
  if (data.worklogs[index].authorId !== CURRENT_USER_ID) {
    throw new Error("본인 워크로그만 삭제할 수 있습니다");
  }
  data.worklogs.splice(index, 1);
  persist();
}

// ── issue relations (parent / links) ─────────────────────────

/** 부모 지정/해제 — 계층 규칙은 assertParentAllowed가 단일 진실 */
export async function setIssueParent(id: string, parentId: string | null): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertParentAllowed(data, issue, parentId);
  if (issue.parentId === parentId) return clone(issue);
  const keyOf = (pid: string | null) =>
    pid === null ? "없음" : (data.issues.find((i) => i.id === pid)?.key ?? "없음");
  const detail = `${keyOf(issue.parentId)} → ${keyOf(parentId)}`;
  issue.parentId = parentId;
  issue.updatedAt = new Date().toISOString();
  data.activities.push({
    id: nextId(),
    issueId: issue.id,
    actorId: CURRENT_USER_ID,
    type: "parent",
    detail,
    at: issue.updatedAt,
  });
  persist();
  return clone(issue);
}

export async function listChildren(issueId: string): Promise<Issue[]> {
  return clone(
    load()
      .issues.filter((i) => i.parentId === issueId)
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
  );
}

export async function addIssueLink(input: {
  sourceId: string;
  targetId: string;
  type: IssueLinkType;
}): Promise<IssueLink> {
  const data = load();
  const source = data.issues.find((i) => i.id === input.sourceId);
  const target = data.issues.find((i) => i.id === input.targetId);
  if (!source || !target) throw new Error("이슈를 찾을 수 없습니다");
  if (source.id === target.id) throw new Error("자기 자신과는 연결할 수 없습니다");
  const def = linkTypeDefOf(data, input.type);
  if (!def) throw new Error(`없는 링크 타입입니다: ${input.type}`);
  const symmetric = isSymmetric(def);
  const duplicate = data.links.some((l) => {
    if (l.type !== input.type) return false;
    if (l.sourceId === input.sourceId && l.targetId === input.targetId) return true;
    // 대칭 타입은 양방향 — 무순서 중복도 막는다
    return symmetric && l.sourceId === input.targetId && l.targetId === input.sourceId;
  });
  if (duplicate) throw new Error("이미 연결돼 있습니다");
  const link: IssueLink = { id: nextId(), ...input };
  data.links.push(link);
  const at = new Date().toISOString();
  const label = def.name;
  for (const [issue, other] of [
    [source, target],
    [target, source],
  ] as const) {
    data.activities.push({
      id: nextId(),
      issueId: issue.id,
      actorId: CURRENT_USER_ID,
      type: "link",
      detail: `${label} 링크: ${other.key}`,
      at,
    });
  }
  persist();
  return clone(link);
}

export async function removeIssueLink(linkId: string): Promise<void> {
  const data = load();
  const index = data.links.findIndex((l) => l.id === linkId);
  if (index === -1) throw new Error("링크를 찾을 수 없습니다");
  data.links.splice(index, 1);
  persist();
}

export interface IssueLinkView {
  link: IssueLink;
  other: Issue;
  /** blocks: outward=차단함, inward=차단됨 / relates: 항상 outward(관련) */
  direction: "outward" | "inward";
}

export async function listIssueLinks(issueId: string): Promise<IssueLinkView[]> {
  const data = load();
  const views: IssueLinkView[] = [];
  for (const link of data.links) {
    if (link.sourceId !== issueId && link.targetId !== issueId) continue;
    const otherId = link.sourceId === issueId ? link.targetId : link.sourceId;
    const other = data.issues.find((i) => i.id === otherId);
    if (!other) continue;
    const def = linkTypeDefOf(data, link.type);
    const direction: IssueLinkView["direction"] =
      (def && isSymmetric(def)) || link.sourceId === issueId ? "outward" : "inward";
    views.push({ link: clone(link), other: clone(other), direction });
  }
  return views;
}

/**
 * 백로그/스프린트 랭크 이동 — 대상 그룹(프로젝트+sprintId, 상태 무관)에서
 * beforeId 앞(없으면 맨 뒤)에 놓고 그룹 전체 order를 1..n로 재부여한다.
 * beforeId가 그룹에 없으면(드래그 중 stale 참조) 조용히 맨 뒤 — 화면은 이후 재조회한다.
 */
export async function rankIssue(
  id: string,
  to: { sprintId: string | null; beforeId?: string },
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, issue.projectId);
  if (to.sprintId !== null && !data.sprints.some((s) => s.id === to.sprintId)) {
    throw new Error("스프린트를 찾을 수 없습니다");
  }
  const before = { ...issue, labels: [...issue.labels] };
  issue.sprintId = to.sprintId;
  const group = data.issues
    .filter((i) => i.id !== id && i.projectId === issue.projectId && i.sprintId === to.sprintId)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  const insertAt = to.beforeId ? group.findIndex((i) => i.id === to.beforeId) : -1;
  if (insertAt === -1) group.push(issue);
  else group.splice(insertAt, 0, issue);
  group.forEach((entry, index) => {
    entry.order = index + 1;
  });
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt); // sprint 변경 활동로그
  persist();
  return clone(issue);
}

// ── CSV/이관 가져오기 ────────────────────────────────────────

export interface ImportResult {
  created: number;
  failed: { row: number; title: string; reason: string }[];
}

/**
 * 여러 이슈를 순서대로 만든다 — 한 줄이 실패해도 나머지는 만들고 사유를 남긴다(전부 롤백 없음).
 * 키가 있으면 보존한다(createIssue의 key 규칙).
 */
export async function importIssues(
  projectId: string,
  inputs: {
    key?: string;
    title: string;
    description?: string;
    type?: IssueType;
    status?: string;
    priority?: IssuePriority;
    assigneeId?: string | null;
    labels?: string[];
    dueDate?: string | null;
    estimateHours?: number | null;
  }[],
): Promise<ImportResult> {
  if (inputs.length === 0) throw new Error("가져올 이슈가 없습니다");
  let created = 0;
  const failed: ImportResult["failed"] = [];
  for (const [index, input] of inputs.entries()) {
    try {
      await createIssue({ projectId, ...input });
      created += 1;
    } catch (error) {
      failed.push({
        row: index + 1,
        title: input.key ?? input.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { created, failed };
}

// ── 관리 콘솔 (목업: 활동 기록·프로젝트에서 합성) ─────────────

const ACTIVITY_EVENT: Record<string, string> = { created: "ISSUE_CREATED" };

/** 목업 감사 로그 — 이슈 활동은 생성/수정으로, 프로젝트는 생성일로 한 줄씩 */
export async function listAuditLog(
  filter: { type?: string; since?: string; projectId?: string },
  paging: { page: number; size: number },
): Promise<{ items: AuditEntry[]; page: number; size: number; total: number }> {
  const data = load();
  const issueById = new Map(data.issues.map((i) => [i.id, i]));
  const entries: AuditEntry[] = [
    ...data.projects.map((project) => ({
      id: `audit-p-${project.id}`,
      eventType: "PROJECT_CREATED",
      actorId: CURRENT_USER_ID,
      projectId: project.id,
      targetKey: project.key,
      summary: project.name,
      at: project.createdAt,
    })),
    ...data.activities.map((activity) => {
      const issue = issueById.get(activity.issueId);
      return {
        id: `audit-a-${activity.id}`,
        eventType: ACTIVITY_EVENT[activity.type] ?? "ISSUE_UPDATED",
        actorId: activity.actorId,
        projectId: issue?.projectId ?? null,
        targetKey: issue?.key ?? null,
        summary: issue ? `${issue.title}${activity.detail ? ` — ${activity.detail}` : ""}` : activity.detail,
        at: activity.at,
      };
    }),
  ]
    .filter((e) => (filter.type ? e.eventType === filter.type : true))
    .filter((e) => (filter.since ? e.at >= filter.since : true))
    .filter((e) => (filter.projectId ? e.projectId === filter.projectId : true))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const size = Math.max(1, paging.size);
  const page = Math.max(0, paging.page);
  return { items: entries.slice(page * size, page * size + size), page, size, total: entries.length };
}

export async function systemStats(): Promise<SystemStats> {
  const data = load();
  return {
    projects: data.projects.length,
    issues: data.issues.length,
    attachments: data.attachments.length,
    attachmentBytes: data.attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
    auditEntries: data.activities.length + data.projects.length,
  };
}

// ── 페이징 ───────────────────────────────────────────────────

export interface IssuePage {
  items: Issue[];
  page: number;
  size: number;
  total: number;
}

/**
 * 필터 + 페이지 — 목업은 `listIssues`를 자른다. REST는 서버 검색(`/api/alm/issues/search`)으로
 * total을 받는다. 화면은 이 계약만 쓰고 전량을 들고 있지 않는다(BACKLOG #5 해소).
 */
export async function listIssuesPage(
  projectId: string,
  filter: Parameters<typeof listIssues>[1],
  paging: { page: number; size: number },
): Promise<IssuePage> {
  const all = await listIssues(projectId, filter);
  const size = Math.max(1, paging.size);
  const page = Math.max(0, paging.page);
  return { items: all.slice(page * size, page * size + size), page, size, total: all.length };
}

// ── 워처 ─────────────────────────────────────────────────────

export interface WatchersView {
  watching: boolean;
  watchers: { userId: string; createdAt: string }[];
}

function watchersView(data: JiraData, issueId: string): WatchersView {
  const list = data.watchers
    .filter((w) => w.issueId === issueId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((w) => ({ userId: w.userId, createdAt: w.createdAt }));
  return { watching: list.some((w) => w.userId === CURRENT_USER_ID), watchers: list };
}

export async function listWatchers(issueId: string): Promise<WatchersView> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  return clone(watchersView(data, issueId));
}

/** 관심 등록 — 멱등. 보기 권한이면 된다 */
export async function watchIssue(issueId: string): Promise<WatchersView> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  addWatcher(data, issueId, CURRENT_USER_ID, new Date().toISOString());
  persist();
  return clone(watchersView(data, issueId));
}

export async function unwatchIssue(issueId: string): Promise<WatchersView> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  data.watchers = data.watchers.filter((w) => !(w.issueId === issueId && w.userId === CURRENT_USER_ID));
  persist();
  return clone(watchersView(data, issueId));
}

// ── 대량 변경 ────────────────────────────────────────────────

export interface BulkIssuePatch {
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  fixVersionId?: string | null;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface BulkResult {
  updated: number;
  failed: { id: string; key: string; reason: string }[];
}

/**
 * 여러 이슈에 같은 변경을 적용한다 — 이슈마다 `updateIssue`를 거치므로 전이 규칙·권한·타입 검증이
 * 그대로 먹는다. 막힌 이슈는 사유와 함께 실패 목록에 남기고 나머지는 적용한다(전부 롤백하지 않는다).
 * 이미 같은 값인 필드는 변경으로 세지 않는다.
 */
export async function bulkUpdateIssues(ids: string[], patch: BulkIssuePatch): Promise<BulkResult> {
  if (ids.length === 0) throw new Error("선택한 이슈가 없습니다");
  const data = load();
  let updated = 0;
  const failed: BulkResult["failed"] = [];
  for (const id of ids) {
    const issue = data.issues.find((i) => i.id === id);
    if (!issue) {
      failed.push({ id, key: id, reason: "이슈를 찾을 수 없습니다" });
      continue;
    }
    const next: Parameters<typeof updateIssue>[1] = {};
    if (patch.status !== undefined && patch.status !== issue.status) next.status = patch.status;
    if (patch.priority !== undefined && patch.priority !== issue.priority) {
      next.priority = resolvePriority(data, issue.projectId, patch.priority);
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId) {
      next.assigneeId = patch.assigneeId;
    }
    if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId) {
      next.sprintId = patch.sprintId;
    }
    if (patch.fixVersionId !== undefined && patch.fixVersionId !== issue.fixVersionId) {
      next.fixVersionId = patch.fixVersionId;
    }
    if (patch.addLabels || patch.removeLabels) {
      const remove = new Set(patch.removeLabels ?? []);
      const labels = [
        ...new Set([...issue.labels.filter((l) => !remove.has(l)), ...(patch.addLabels ?? [])]),
      ];
      if (labels.join("\u0000") !== issue.labels.join("\u0000")) next.labels = labels;
    }
    if (Object.keys(next).length === 0) continue;
    try {
      await updateIssue(id, next);
      updated += 1;
    } catch (error) {
      failed.push({
        id,
        key: issue.key,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { updated, failed };
}

export async function bulkDeleteIssues(
  ids: string[],
): Promise<{ deleted: number; failed: BulkResult["failed"] }> {
  if (ids.length === 0) throw new Error("선택한 이슈가 없습니다");
  let deleted = 0;
  const failed: BulkResult["failed"] = [];
  for (const id of ids) {
    const key = load().issues.find((i) => i.id === id)?.key ?? id;
    try {
      await deleteIssue(id);
      deleted += 1;
    } catch (error) {
      failed.push({ id, key, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { deleted, failed };
}

export async function deleteIssue(id: string): Promise<void> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, data.issues[index].projectId);
  data.issues.splice(index, 1);
  data.comments = data.comments.filter((c) => c.issueId !== id);
  data.activities = data.activities.filter((a) => a.issueId !== id);
  data.notifications = data.notifications.filter((n) => n.issueId !== id);
  data.watchers = data.watchers.filter((w) => w.issueId !== id);
  data.links = data.links.filter((l) => l.sourceId !== id && l.targetId !== id);
  data.worklogs = data.worklogs.filter((w) => w.issueId !== id);
  data.changes = data.changes.filter((c) => c.issueId !== id);
  data.attachments = data.attachments.filter((a) => a.issueId !== id);
  for (const child of data.issues) {
    if (child.parentId === id) child.parentId = null; // 자식은 부모만 해제
  }
  persist();
}

// ── comments / activity ──────────────────────────────────────

export async function listComments(issueId: string): Promise<Comment[]> {
  return clone(
    load()
      .comments.filter((c) => c.issueId === issueId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function addComment(issueId: string, body: string): Promise<Comment> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  const comment: Comment = {
    id: nextId(),
    issueId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.comments.push(comment);
  // 워처 ∪ 담당자에게 코멘트 알림 (본인 코멘트는 제외)
  const issue = data.issues.find((i) => i.id === issueId)!;
  const message = `${userLabel(data, CURRENT_USER_ID)} 님이 ${issue.key}에 코멘트를 남겼습니다`;
  if (preferencesOf(data, CURRENT_USER_ID).autoWatch.commented) {
    addWatcher(data, issue.id, CURRENT_USER_ID, comment.createdAt);
  }
  for (const userId of notificationRecipients(data, issue, CURRENT_USER_ID)) {
    pushNotification(data, userId, issue, message, comment.createdAt, "commented");
  }
  notifyMentions(data, issue, extractMentionIds(trimmed), `${issue.key} 코멘트`, comment.createdAt);
  persist();
  return clone(comment);
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) throw new Error("본인 댓글만 수정할 수 있습니다");
  const trimmed = body.trim();
  const previousBody = comment?.body ?? "";
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  comment.body = trimmed;
  comment.updatedAt = new Date().toISOString();
  {
    const issueOfComment = data.issues.find((i) => i.id === comment!.issueId);
    if (issueOfComment) notifyMentions(data, issueOfComment, newMentionIds(previousBody, comment!.body), `${issueOfComment.key} 코멘트`, new Date().toISOString());
  }
  persist();
  return clone(comment);
}

export async function deleteComment(id: string): Promise<void> {
  const data = load();
  const index = data.comments.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("코멘트를 찾을 수 없습니다");
  if (data.comments[index].authorId !== CURRENT_USER_ID) {
    throw new Error("본인 댓글만 삭제할 수 있습니다");
  }
  data.comments.splice(index, 1);
  persist();
}

// ── settings schemes (지라 구조: 전역 정의 → 배정 → 프로젝트 커스텀) ──

/** 의미마다 최소 1개·이름 유일(레지스트리 전체)/필수·카테고리 실재·subtask 고정 + 비-subtask 최소 1개 */
function validateSettingsBody(data: JiraData, body: SettingsBody): void {
  const names = new Set<string>();
  const ids = new Set<string>();
  const kinds = new Set<StatusKind>();
  for (const status of body.statuses) {
    const name = status.name.trim();
    if (!name) throw new Error("상태 이름을 입력하세요");
    if (names.has(name)) throw new Error(`상태 이름이 중복됩니다: ${name}`);
    names.add(name);
    if (ids.has(status.id)) throw new Error("같은 상태를 두 번 넣을 수 없습니다");
    ids.add(status.id);
    if (data.statusDefs.some((d) => d.id !== status.id && d.name === name)) {
      throw new Error(`상태 이름이 중복됩니다: ${name}`);
    }
    if (!data.statusCategories.some((c) => c.id === status.category)) {
      throw new Error("카테고리를 찾을 수 없습니다");
    }
    kinds.add(categoryById(data, status.category).kind);
  }
  for (const kind of STATUS_KIND_LIST) {
    if (!kinds.has(kind)) {
      throw new Error("카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다");
    }
  }
  for (const type of body.enabledTypes) {
    if (!typeDefOf(data, type)) throw new Error(`없는 이슈 타입입니다: ${type}`);
  }
  if (!body.enabledTypes.includes("subtask")) {
    throw new Error("하위 작업 타입은 비활성화할 수 없습니다");
  }
  if (!body.enabledTypes.some((t) => typeLevelOf(data, t) !== "subtask")) {
    throw new Error("이슈 타입은 최소 1개 활성화해야 합니다");
  }
  const enabledPriorities = body.enabledPriorities ?? defaultSettingsBody().enabledPriorities;
  for (const priority of enabledPriorities) {
    if (!priorityDefOf(data, priority)) throw new Error(`없는 우선순위입니다: ${priority}`);
  }
  if (enabledPriorities.length === 0) throw new Error("우선순위는 최소 1개 활성화해야 합니다");
  if (!enabledPriorities.includes(body.defaultPriority ?? "medium")) {
    throw new Error("기본 우선순위는 활성화된 우선순위 중에서 골라야 합니다");
  }
  validateFieldConfigs(body.fields);
  // 타입별 덮어쓰기 — 키는 레지스트리에 있는 타입이어야 하고, 각 목록은 기본 구성과 같은 규칙을 탄다
  for (const [typeId, fields] of Object.entries(body.fieldsByType ?? {})) {
    if (!typeDefOf(data, typeId)) throw new Error(`없는 이슈 타입입니다: ${typeId}`);
    validateFieldConfigs(fields);
  }
}

/** 필드 구성 규칙 — 서버(SettingsBody 검증)와 같은 문구를 쓴다 */
function validateFieldConfigs(fields?: IssueFieldConfig[] | null): void {
  if (!fields) return;
  const seen = new Set<string>();
  // 규칙마다 목록을 훑지 않고 **요소 하나마다** 여섯 검사를 다 돌린다(서버 validateFieldList와 같은 순회) —
  // 위반이 여러 종류 섞이면 "앞선 요소의 위반"이 먼저 나가야 문구가 서버와 갈리지 않는다
  for (const field of fields) {
    // 빈 문자열·누락·요소 자체가 null인 경우는 "없는 필드입니다: " 처럼 이름이 사라지므로 따로 말한다
    if (!field?.id || !String(field.id).trim()) throw new Error("필드 id가 비어 있습니다");
    if (!(ISSUE_FIELD_IDS as readonly string[]).includes(field.id)) {
      throw new Error(`없는 필드입니다: ${field.id}`);
    }
    if (seen.has(field.id)) {
      throw new Error(`같은 필드를 두 번 넣을 수 없습니다: ${ISSUE_FIELD_NAMES[field.id]}`);
    }
    seen.add(field.id);
    if (field.required && !field.visible) {
      throw new Error(`숨긴 필드는 필수로 지정할 수 없습니다: ${ISSUE_FIELD_NAMES[field.id]}`);
    }
    const neverRequired = NEVER_REQUIRED_FIELDS[field.id];
    if (field.required && neverRequired) throw new Error(neverRequired);
  }
}

function settingsEntry(data: JiraData, projectId: string): ProjectSettingsEntry {
  const entry = data.projectSettings.find((e) => e.projectId === projectId);
  if (!entry) throw new Error("프로젝트를 찾을 수 없습니다");
  return entry;
}

export interface ResolvedSettings {
  body: SettingsBody;
  source: "scheme" | "custom";
  scheme: SettingsScheme;
}

/** 설정 해석의 단일 진실 — 모든 화면·검증은 이 함수만 통한다 */
export async function resolveSettings(projectId: string): Promise<ResolvedSettings> {
  const data = load();
  const entry = settingsEntry(data, projectId);
  const scheme = data.schemes.find((s) => s.id === entry.schemeId) ?? data.schemes.find((s) => s.isDefault)!;
  return clone({
    body: enrichBody(data, entry.custom ?? scheme.body),
    source: entry.custom ? ("custom" as const) : ("scheme" as const),
    scheme: enrichScheme(data, scheme),
  });
}

/** 프로젝트의 해석된 상태 목록 (order 오름차순) — 보드 컬럼·상태 Select의 원천 */
export async function listProjectStatuses(projectId: string) {
  const data = load();
  return clone([...resolvedStatuses(data, projectId)].sort((a, b) => a.order - b.order));
}

/** projectId → (statusId → WorkflowStatus) — 크로스 프로젝트 화면(홈/검색)용 */
export async function statusMetaByProject() {
  const data = load();
  const map: Record<string, Record<string, SettingsBody["statuses"][number]>> = {};
  for (const project of data.projects) {
    map[project.id] = Object.fromEntries(
      resolvedStatuses(data, project.id).map((s) => [s.id, s]),
    );
  }
  return clone(map);
}

/** 레지스트리의 상태 전부 (id 유일) — 스마트 검색 상태 이름 매칭용 */
export async function listAllStatuses(): Promise<{ id: string; name: string }[]> {
  return load().statusDefs.map((d) => ({ id: d.id, name: d.name }));
}

/** 스킴 목록 — 본문 상태는 레지스트리로 해석돼 온다(kind/color 포함) */
export async function listSchemes(): Promise<SettingsScheme[]> {
  const data = load();
  return clone(data.schemes.map((s) => enrichScheme(data, s)));
}

/** 스킴별 배정(공유) 프로젝트 수 — 커스텀 전환한 프로젝트는 제외 */
export async function countSchemeProjects(schemeId: string): Promise<number> {
  return load().projectSettings.filter((e) => e.schemeId === schemeId && e.custom === null).length;
}

export async function createScheme(name: string): Promise<SettingsScheme> {
  const data = load();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("스킴 이름을 입력하세요");
  if (data.schemes.some((s) => s.name === trimmed)) {
    throw new Error(`이미 존재하는 스킴 이름입니다: ${trimmed}`);
  }
  const scheme: SettingsScheme = {
    id: nextId(),
    name: trimmed,
    isDefault: false,
    body: defaultSettingsBody(), // 디폴트 구성 복사에서 시작
  };
  data.schemes.push(scheme);
  persist();
  return clone(enrichScheme(data, scheme));
}

/** 스킴 수정 — 공유 중인 모든 프로젝트의 이슈를 새 상태 구성으로 이관한다 */
export async function updateScheme(
  id: string,
  patch: { name?: string; body?: SettingsBody },
): Promise<SettingsScheme> {
  const data = load();
  const scheme = data.schemes.find((s) => s.id === id);
  if (!scheme) throw new Error("스킴을 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("스킴 이름을 입력하세요");
    scheme.name = name;
  }
  if (patch.body !== undefined) {
    validateSettingsBody(data, patch.body);
    const sharedProjects = data.projectSettings
      .filter((e) => e.schemeId === id && e.custom === null)
      .map((e) => e.projectId);
    migrateIssueStatuses(data, sharedProjects, patch.body);
    applyBodyToRegistry(data, patch.body);
    scheme.body = cloneBody({ ...patch.body, transitions: pruneTransitions(patch.body), layout: pruneLayout(patch.body) });
  }
  persist();
  return clone(enrichScheme(data, scheme));
}

export async function deleteScheme(id: string): Promise<void> {
  const data = load();
  const scheme = data.schemes.find((s) => s.id === id);
  if (!scheme) throw new Error("스킴을 찾을 수 없습니다");
  if (scheme.isDefault) throw new Error("디폴트 스킴은 삭제할 수 없습니다");
  if (data.projectSettings.some((e) => e.schemeId === id)) {
    throw new Error("배정된 프로젝트가 있는 스킴은 삭제할 수 없습니다");
  }
  data.schemes = data.schemes.filter((s) => s.id !== id);
  persist();
}

export async function setDefaultScheme(id: string): Promise<void> {
  const data = load();
  if (!data.schemes.some((s) => s.id === id)) throw new Error("스킴을 찾을 수 없습니다");
  for (const scheme of data.schemes) scheme.isDefault = scheme.id === id;
  persist();
}

/**
 * 새 구성에 없는 상태의 이슈를 같은 카테고리의 첫 상태(order순)로 이관한다.
 * 호출자는 반드시 구성을 바꾸기 전에 호출해야 한다 — 옛 구성에서 카테고리를 읽는다.
 */
function migrateIssueStatuses(data: JiraData, projectIds: string[], newBody: SettingsBody): void {
  if (projectIds.length === 0) return;
  const valid = new Set(newBody.statuses.map((s) => s.id));
  const targets = new Set(projectIds);
  // 새 본문은 아직 레지스트리에 관통되기 전이라 본문의 카테고리로 의미를 읽는다
  const sorted = [...newBody.statuses]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ ...s, kind: categoryById(data, s.category).kind }));
  const at = new Date().toISOString();
  for (const issue of data.issues) {
    if (!targets.has(issue.projectId) || valid.has(issue.status)) continue;
    const old = resolvedStatuses(data, issue.projectId).find((s) => s.id === issue.status);
    const oldCategory = old?.category ?? issue.status;
    const oldKind = old?.kind ?? categoryById(data, issue.status).kind;
    // 같은 카테고리의 첫 상태 → 없으면 같은 의미의 첫 상태 → 없으면 첫 상태
    const fallback =
      sorted.find((s) => s.category === oldCategory) ??
      sorted.find((s) => s.kind === oldKind) ??
      sorted[0];
    const previous = issue.status;
    issue.status = fallback.id;
    // 구성 변경 이관도 이력에 남긴다 — 남기지 않으면 리포트 재생이 사라진 상태를 계속 되살린다
    logChange(data, issue, "status", previous, issue.status, at);
  }
  // 보드 컬럼도 함께 정리 — 사라진 상태의 컬럼(이름/WIP 오버라이드)이 잔존하지 않게
  for (const board of data.boards) {
    if (!targets.has(board.projectId)) continue;
    board.columns = board.columns.filter((c) => valid.has(c.status));
  }
}

/** 프로젝트에 스킴 재배정 — 커스텀은 해제되고 새 스킴 구성으로 이관된다 */
export async function assignScheme(projectId: string, schemeId: string): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const entry = settingsEntry(data, projectId);
  const scheme = data.schemes.find((s) => s.id === schemeId);
  if (!scheme) throw new Error("스킴을 찾을 수 없습니다");
  migrateIssueStatuses(data, [projectId], scheme.body);
  entry.schemeId = schemeId;
  entry.custom = null;
  persist();
}

/** 커스텀 전환(현재 구성 복사) / 스킴 복귀(이관 후 폐기) */
export async function setProjectCustom(projectId: string, custom: boolean): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const entry = settingsEntry(data, projectId);
  if (custom) {
    if (entry.custom) return;
    const scheme = data.schemes.find((s) => s.id === entry.schemeId)!;
    entry.custom = cloneBody(scheme.body);
  } else {
    if (!entry.custom) return;
    const scheme = data.schemes.find((s) => s.id === entry.schemeId)!;
    migrateIssueStatuses(data, [projectId], scheme.body);
    entry.custom = null;
  }
  persist();
}

export async function updateProjectCustomSettings(
  projectId: string,
  body: SettingsBody,
): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const entry = settingsEntry(data, projectId);
  if (!entry.custom) throw new Error("커스텀 설정을 사용 중일 때만 편집할 수 있습니다");
  validateSettingsBody(data, body);
  migrateIssueStatuses(data, [projectId], body);
  applyBodyToRegistry(data, body);
  entry.custom = cloneBody({ ...body, transitions: pruneTransitions(body), layout: pruneLayout(body) });
  persist();
}

// ── 상태 카테고리 · 상태 레지스트리 (전역) ───────────────────

export async function listStatusCategories(): Promise<StatusCategory[]> {
  return clone([...load().statusCategories].sort((a, b) => a.order - b.order));
}

export async function createStatusCategory(input: {
  name: string;
  kind: StatusKind;
  color: StatusColor;
}): Promise<StatusCategory> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("카테고리 이름을 입력하세요");
  if (data.statusCategories.some((c) => c.name === name)) {
    throw new Error(`카테고리 이름이 중복됩니다: ${name}`);
  }
  const category: StatusCategory = {
    id: `cat-${nextId().slice(0, 8)}`,
    name,
    kind: input.kind,
    color: input.color,
    order: data.statusCategories.length + 1,
    builtIn: false,
  };
  data.statusCategories.push(category);
  persist();
  return clone(category);
}

export async function updateStatusCategory(
  id: string,
  patch: Partial<Pick<StatusCategory, "name" | "kind" | "color">>,
): Promise<StatusCategory> {
  const data = load();
  const category = data.statusCategories.find((c) => c.id === id);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다");
  if (patch.kind !== undefined && patch.kind !== category.kind) {
    if (category.builtIn) throw new Error("기본 카테고리의 의미는 바꿀 수 없습니다");
    // 의미를 바꾸면 이 카테고리의 상태를 쓰는 워크플로가 어떤 의미를 잃을 수 있다
    const previous = category.kind;
    category.kind = patch.kind;
    const affected = new Set(data.statusDefs.filter((d) => d.categoryId === id).map((d) => d.id));
    const broken = allBodies(data).some(
      (body) => body.statuses.some((s) => affected.has(s.id)) && !bodyCoversAllKinds(data, body),
    );
    if (broken) {
      category.kind = previous;
      throw new Error("이 카테고리를 쓰는 워크플로에서 의미(할 일/진행 중/완료)가 비게 됩니다");
    }
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("카테고리 이름을 입력하세요");
    if (data.statusCategories.some((c) => c.id !== id && c.name === name)) {
      throw new Error(`카테고리 이름이 중복됩니다: ${name}`);
    }
    category.name = name;
  }
  if (patch.color !== undefined) category.color = patch.color;
  persist();
  return clone(category);
}

/** 순서 한 칸 이동 — order는 1부터 재부여 */
export async function moveStatusCategory(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.statusCategories].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((c) => c.id === id);
  if (index < 0) throw new Error("카테고리를 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  sorted.forEach((c, i) => {
    c.order = i + 1;
  });
  persist();
}

export async function deleteStatusCategory(id: string): Promise<void> {
  const data = load();
  const category = data.statusCategories.find((c) => c.id === id);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다");
  if (category.builtIn) throw new Error("기본 카테고리는 삭제할 수 없습니다");
  if (data.statusDefs.some((d) => d.categoryId === id)) {
    throw new Error("이 카테고리를 쓰는 상태가 있습니다");
  }
  data.statusCategories = data.statusCategories.filter((c) => c.id !== id);
  [...data.statusCategories]
    .sort((a, b) => a.order - b.order)
    .forEach((c, i) => {
      c.order = i + 1;
    });
  persist();
}

export async function listStatusDefs(): Promise<StatusDef[]> {
  return clone(load().statusDefs);
}

/** 상태 id → 쓰는 워크플로(스킴+커스텀) 수 */
export async function statusDefUsage(): Promise<Record<string, number>> {
  const data = load();
  const usage: Record<string, number> = {};
  for (const def of data.statusDefs) usage[def.id] = 0;
  for (const body of allBodies(data)) {
    for (const status of body.statuses) usage[status.id] = (usage[status.id] ?? 0) + 1;
  }
  return usage;
}

export async function createStatusDef(input: {
  name: string;
  categoryId: string;
  description?: string;
  /** lucide 아이콘 키. 생략·빈 문자열이면 화면이 카테고리 의미의 기본 아이콘으로 그린다 */
  icon?: string;
}): Promise<StatusDef> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("상태 이름을 입력하세요");
  if (data.statusDefs.some((d) => d.name === name)) {
    throw new Error(`상태 이름이 중복됩니다: ${name}`);
  }
  if (!data.statusCategories.some((c) => c.id === input.categoryId)) {
    throw new Error("카테고리를 찾을 수 없습니다");
  }
  const def: StatusDef = {
    id: `st-${nextId().slice(0, 8)}`,
    name,
    categoryId: input.categoryId,
    description: input.description?.trim() ?? "",
    icon: input.icon?.trim() ?? "",
  };
  data.statusDefs.push(def);
  persist();
  return clone(def);
}

/** 이름·카테고리 변경은 쓰는 곳 전부에 즉시 반영된다 (저장된 캐시도 함께 맞춘다) */
export async function updateStatusDef(
  id: string,
  patch: Partial<Pick<StatusDef, "name" | "categoryId" | "description" | "icon">>,
): Promise<StatusDef> {
  const data = load();
  const def = data.statusDefs.find((d) => d.id === id);
  if (!def) throw new Error("상태를 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("상태 이름을 입력하세요");
    if (data.statusDefs.some((d) => d.id !== id && d.name === name)) {
      throw new Error(`상태 이름이 중복됩니다: ${name}`);
    }
    def.name = name;
  }
  if (patch.categoryId !== undefined && patch.categoryId !== def.categoryId) {
    if (!data.statusCategories.some((c) => c.id === patch.categoryId)) {
      throw new Error("카테고리를 찾을 수 없습니다");
    }
    const previous = def.categoryId;
    def.categoryId = patch.categoryId;
    const broken = allBodies(data).some(
      (body) => body.statuses.some((s) => s.id === id) && !bodyCoversAllKinds(data, body),
    );
    if (broken) {
      def.categoryId = previous;
      throw new Error("이 상태를 쓰는 워크플로에서 의미(할 일/진행 중/완료)가 비게 됩니다");
    }
  }
  if (patch.description !== undefined) def.description = patch.description.trim();
  if (patch.icon !== undefined) def.icon = patch.icon.trim();
  for (const body of allBodies(data)) {
    for (const status of body.statuses) {
      if (status.id !== id) continue;
      status.name = def.name;
      status.category = def.categoryId;
    }
  }
  persist();
  return clone(def);
}

export async function deleteStatusDef(id: string): Promise<void> {
  const data = load();
  if (!data.statusDefs.some((d) => d.id === id)) throw new Error("상태를 찾을 수 없습니다");
  if (allBodies(data).some((body) => body.statuses.some((s) => s.id === id))) {
    throw new Error("워크플로에서 쓰는 상태는 삭제할 수 없습니다");
  }
  data.statusDefs = data.statusDefs.filter((d) => d.id !== id);
  persist();
}

// ── 이슈 타입 레지스트리 (전역) ───────────────────────────────

export async function listIssueTypes(): Promise<IssueTypeDef[]> {
  return clone([...load().issueTypes].sort((a, b) => a.order - b.order));
}

/** 타입 id → 쓰는 이슈 수 */
export async function issueTypeUsage(): Promise<Record<string, number>> {
  const data = load();
  const usage: Record<string, number> = {};
  for (const type of data.issueTypes) usage[type.id] = 0;
  for (const issue of data.issues) usage[issue.type] = (usage[issue.type] ?? 0) + 1;
  return usage;
}

export async function createIssueType(input: {
  name: string;
  level: IssueTypeLevel;
  icon: string;
  color: IssueTypeDef["color"];
  description?: string;
}): Promise<IssueTypeDef> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("이슈 타입 이름을 입력하세요");
  if (data.issueTypes.some((t) => t.name === name)) {
    throw new Error(`이슈 타입 이름이 중복됩니다: ${name}`);
  }
  const def: IssueTypeDef = {
    id: `it-${nextId().slice(0, 8)}`,
    name,
    icon: input.icon,
    color: input.color,
    level: input.level,
    description: input.description?.trim() ?? "",
    order: data.issueTypes.length + 1,
    builtIn: false,
  };
  data.issueTypes.push(def);
  persist();
  notifyIssueTypesChanged();
  return clone(def);
}

export async function updateIssueType(
  id: string,
  patch: Partial<Pick<IssueTypeDef, "name" | "icon" | "color" | "level" | "description">>,
): Promise<IssueTypeDef> {
  const data = load();
  const def = data.issueTypes.find((t) => t.id === id);
  if (!def) throw new Error("이슈 타입을 찾을 수 없습니다");
  if (patch.level !== undefined && patch.level !== def.level) {
    if (def.builtIn) throw new Error("기본 이슈 타입의 계층은 바꿀 수 없습니다");
    // 계층은 부모-자식 규칙의 근거 — 쓰는 이슈가 있으면 기존 계층이 깨진다
    if (data.issues.some((i) => i.type === id)) {
      throw new Error("이 타입을 쓰는 이슈가 있어 계층을 바꿀 수 없습니다");
    }
    def.level = patch.level;
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("이슈 타입 이름을 입력하세요");
    if (data.issueTypes.some((t) => t.id !== id && t.name === name)) {
      throw new Error(`이슈 타입 이름이 중복됩니다: ${name}`);
    }
    def.name = name;
  }
  if (patch.icon !== undefined) def.icon = patch.icon;
  if (patch.color !== undefined) def.color = patch.color;
  if (patch.description !== undefined) def.description = patch.description.trim();
  persist();
  notifyIssueTypesChanged();
  return clone(def);
}

export async function moveIssueType(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.issueTypes].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((t) => t.id === id);
  if (index < 0) throw new Error("이슈 타입을 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  sorted.forEach((t, i) => {
    t.order = i + 1;
  });
  persist();
  notifyIssueTypesChanged();
}

/** 삭제 — 쓰는 이슈가 없어야 하고, 스킴/커스텀의 활성 목록에서도 함께 빠진다 */
export async function deleteIssueType(id: string): Promise<void> {
  const data = load();
  const def = data.issueTypes.find((t) => t.id === id);
  if (!def) throw new Error("이슈 타입을 찾을 수 없습니다");
  if (def.builtIn) throw new Error("기본 이슈 타입은 삭제할 수 없습니다");
  if (data.issues.some((i) => i.type === id)) throw new Error("이 타입을 쓰는 이슈가 있습니다");
  data.issueTypes = data.issueTypes.filter((t) => t.id !== id);
  [...data.issueTypes]
    .sort((a, b) => a.order - b.order)
    .forEach((t, i) => {
      t.order = i + 1;
    });
  for (const body of allBodies(data)) {
    body.enabledTypes = body.enabledTypes.filter((t) => t !== id);
    // 그 타입의 필드 덮어쓰기도 함께 사라진다 — 남으면 저장할 때마다 "없는 이슈 타입" 400이 된다.
    // 비활성화만 한 타입의 덮어쓰기는 건드리지 않는다(다시 켜면 살아난다 — 서버와 같다)
    if (body.fieldsByType) delete body.fieldsByType[id];
  }
  persist();
  notifyIssueTypesChanged();
}

// ── boards ───────────────────────────────────────────────────

/** 기본 보드 우선, 이후 생성순 */
// ── 우선순위 레지스트리 (전역 관리 > 우선순위) ──────────────────────

export async function listPriorities(): Promise<PriorityDef[]> {
  return clone([...load().priorities].sort((a, b) => a.order - b.order));
}

export async function priorityUsage(): Promise<Record<string, number>> {
  const data = load();
  return Object.fromEntries(
    data.priorities.map((p) => [p.id, data.issues.filter((i) => i.priority === p.id).length]),
  );
}

export async function createPriority(input: {
  name: string;
  icon: string;
  color: PriorityDef["color"];
  description?: string;
}): Promise<PriorityDef> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("우선순위 이름을 입력하세요");
  if (data.priorities.some((p) => p.name === name)) throw new Error(`우선순위 이름이 중복됩니다: ${name}`);
  if (!input.icon) throw new Error("아이콘을 고르세요");
  const def: PriorityDef = {
    id: `pr-${nextId()}`,
    name,
    icon: input.icon,
    color: input.color,
    description: input.description?.trim() ?? "",
    order: data.priorities.length + 1,
    builtIn: false,
  };
  data.priorities.push(def);
  persist();
  notifyPrioritiesChanged();
  return clone(def);
}

export async function updatePriority(
  id: string,
  patch: Partial<Pick<PriorityDef, "name" | "icon" | "color" | "description">>,
): Promise<PriorityDef> {
  const data = load();
  const def = data.priorities.find((p) => p.id === id);
  if (!def) throw new Error("우선순위를 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("우선순위 이름을 입력하세요");
    if (data.priorities.some((p) => p.id !== id && p.name === name)) {
      throw new Error(`우선순위 이름이 중복됩니다: ${name}`);
    }
    def.name = name;
  }
  if (patch.icon !== undefined) def.icon = patch.icon;
  if (patch.color !== undefined) def.color = patch.color;
  if (patch.description !== undefined) def.description = patch.description.trim();
  persist();
  notifyPrioritiesChanged();
  return clone(def);
}

export async function movePriority(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.priorities].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((p) => p.id === id);
  if (index < 0) throw new Error("우선순위를 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  const a = sorted[index];
  const b = sorted[target];
  [a.order, b.order] = [b.order, a.order];
  persist();
  notifyPrioritiesChanged();
}

export async function deletePriority(id: string): Promise<void> {
  const data = load();
  const def = data.priorities.find((p) => p.id === id);
  if (!def) throw new Error("우선순위를 찾을 수 없습니다");
  if (def.builtIn) throw new Error("기본 우선순위는 삭제할 수 없습니다");
  if (data.issues.some((i) => i.priority === id)) throw new Error("이 우선순위를 쓰는 이슈가 있습니다");
  data.priorities = data.priorities.filter((p) => p.id !== id);
  // 모든 본문의 활성 목록에서 빼고, 기본값이었다면 보통(없으면 첫 항목)으로
  const fix = (body: SettingsBody) => {
    body.enabledPriorities = (body.enabledPriorities ?? defaultSettingsBody().enabledPriorities).filter((p) => p !== id);
    if (body.defaultPriority === id) {
      body.defaultPriority = body.enabledPriorities.includes("medium") ? "medium" : (body.enabledPriorities[0] ?? "medium");
    }
  };
  for (const scheme of data.schemes) fix(scheme.body);
  for (const entry of data.projectSettings) if (entry.custom) fix(entry.custom);
  [...data.priorities].sort((a, b) => a.order - b.order).forEach((p, i) => (p.order = i + 1));
  persist();
  notifyPrioritiesChanged();
}

// ── 대시보드 (지라 Dashboards) ──────────────────────────────

function requireDashboardName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) throw new Error("대시보드 이름을 입력하세요");
  if (trimmed.length > 120) throw new Error("대시보드 이름은 120자 이하여야 합니다");
  return trimmed;
}

/** 내 것 + 공유된 것, 만든 순 */
export async function listDashboards(): Promise<Dashboard[]> {
  return clone(
    load()
      .dashboards.filter((d) => d.ownerId === CURRENT_USER_ID || d.shared)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  const dashboard = load().dashboards.find((d) => d.id === id);
  if (!dashboard || (!dashboard.shared && dashboard.ownerId !== CURRENT_USER_ID)) return null;
  return clone(dashboard);
}

export async function createDashboard(input: { name: string; shared?: boolean; gadgets?: DashboardGadget[] }): Promise<Dashboard> {
  const data = load();
  const now = new Date().toISOString();
  const dashboard: Dashboard = {
    id: `d-${nextId()}`,
    ownerId: CURRENT_USER_ID,
    name: requireDashboardName(input.name),
    shared: input.shared ?? false,
    gadgets: input.gadgets ? clone(input.gadgets) : [],
    createdAt: now,
    updatedAt: now,
  };
  data.dashboards.push(dashboard);
  persist();
  return clone(dashboard);
}

export async function updateDashboard(
  id: string,
  patch: { name?: string; shared?: boolean; gadgets?: DashboardGadget[] },
): Promise<Dashboard> {
  const data = load();
  const dashboard = data.dashboards.find((d) => d.id === id);
  if (!dashboard) throw new Error("대시보드를 찾을 수 없습니다");
  if (dashboard.ownerId !== CURRENT_USER_ID) throw new Error("본인 대시보드만 수정할 수 있습니다");
  if (patch.name !== undefined) dashboard.name = requireDashboardName(patch.name);
  if (patch.shared !== undefined) dashboard.shared = patch.shared;
  if (patch.gadgets !== undefined) {
    if (patch.gadgets.length > 24) throw new Error("가젯은 최대 24개까지 놓을 수 있습니다");
    dashboard.gadgets = clone(patch.gadgets);
  }
  dashboard.updatedAt = new Date().toISOString();
  persist();
  return clone(dashboard);
}

export async function deleteDashboard(id: string): Promise<void> {
  const data = load();
  const dashboard = data.dashboards.find((d) => d.id === id);
  if (!dashboard) throw new Error("대시보드를 찾을 수 없습니다");
  if (dashboard.ownerId !== CURRENT_USER_ID) throw new Error("본인 대시보드만 수정할 수 있습니다");
  data.dashboards = data.dashboards.filter((d) => d.id !== id);
  persist();
}

/** 프로젝트 워크로그(가젯·리포트) — 활성 이슈의 기록만, 작업일 오름차순 */
export async function listProjectWorklogs(
  projectId: string,
  range: { since?: string; until?: string } = {},
): Promise<ProjectWorklogRow[]> {
  const data = load();
  const keys = new Map(data.issues.filter((i) => i.projectId === projectId).map((i) => [i.id, i.key]));
  return data.worklogs
    .filter((w) => keys.has(w.issueId))
    .filter((w) => (!range.since || w.workedOn >= range.since) && (!range.until || w.workedOn <= range.until))
    .sort((a, b) => a.workedOn.localeCompare(b.workedOn) || a.at.localeCompare(b.at))
    .map((w) => ({
      id: w.id,
      issueId: w.issueId,
      issueKey: keys.get(w.issueId)!,
      authorId: w.authorId,
      hours: w.hours,
      comment: w.comment,
      workedOn: w.workedOn,
    }));
}

// ── 컴포넌트 (지라 Components) ──────────────────────────────

const COMPONENT_ASSIGNEE_RULES: ComponentDefaultAssignee[] = ["project", "lead", "unassigned"];

/** 이슈에 붙일 컴포넌트 검증 — 같은 프로젝트, 순서 유지·중복 제거 */
function validateComponentIds(data: JiraData, projectId: string, ids: string[] | undefined): string[] {
  const result: string[] = [];
  for (const id of ids ?? []) {
    if (result.includes(id)) continue;
    const component = data.components.find((c) => c.id === id);
    if (!component) throw new Error("컴포넌트를 찾을 수 없습니다");
    if (component.projectId !== projectId) throw new Error(`다른 프로젝트의 컴포넌트입니다: ${component.name}`);
    result.push(id);
  }
  return result;
}

/** 담당자 없이 만든 이슈의 담당자 — 첫 컴포넌트의 규칙이 프로젝트 규칙보다 우선한다(지라) */
function resolveDefaultAssigneeFor(data: JiraData, project: Project, componentIds: string[]): string | null {
  for (const id of componentIds) {
    const component = data.components.find((c) => c.id === id);
    if (!component) continue;
    if (component.defaultAssignee === "unassigned") return null;
    if (component.defaultAssignee === "lead" && component.leadId) return component.leadId;
  }
  return project.defaultAssignee === "lead" ? project.leadId : null;
}

function componentWithCount(data: JiraData, component: Component): Component {
  return {
    ...component,
    issueCount: data.issues.filter((i) => (i.componentIds ?? []).includes(component.id)).length,
  };
}

export async function listComponents(projectId: string): Promise<Component[]> {
  const data = load();
  return clone(
    data.components
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => componentWithCount(data, c)),
  );
}

function requireComponentName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) throw new Error("컴포넌트 이름을 입력하세요");
  if (trimmed.length > 80) throw new Error("컴포넌트 이름은 80자 이하여야 합니다");
  return trimmed;
}

function requireAssigneeRule(rule: string | undefined): ComponentDefaultAssignee {
  if (!rule) return "project";
  if (!COMPONENT_ASSIGNEE_RULES.includes(rule as ComponentDefaultAssignee)) {
    throw new Error("기본 담당자는 project/lead/unassigned 중 하나입니다");
  }
  return rule as ComponentDefaultAssignee;
}

export async function createComponent(
  projectId: string,
  input: { name: string; description?: string; leadId?: string | null; defaultAssignee?: ComponentDefaultAssignee },
): Promise<Component> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, projectId);
  const name = requireComponentName(input.name);
  if (data.components.some((c) => c.projectId === projectId && c.name === name)) {
    throw new Error(`컴포넌트 이름이 중복됩니다: ${name}`);
  }
  const component: Component = {
    id: `c-${nextId()}`,
    projectId,
    name,
    description: input.description?.trim() ?? "",
    leadId: input.leadId ?? null,
    defaultAssignee: requireAssigneeRule(input.defaultAssignee),
    issueCount: 0,
    createdAt: new Date().toISOString(),
  };
  data.components.push(component);
  persist();
  return clone(component);
}

export async function updateComponent(
  id: string,
  patch: Partial<Pick<Component, "name" | "description" | "leadId" | "defaultAssignee">>,
): Promise<Component> {
  const data = load();
  const component = data.components.find((c) => c.id === id);
  if (!component) throw new Error("컴포넌트를 찾을 수 없습니다");
  assertCanAdmin(data, component.projectId);
  if (patch.name !== undefined) {
    const name = requireComponentName(patch.name);
    if (data.components.some((c) => c.id !== id && c.projectId === component.projectId && c.name === name)) {
      throw new Error(`컴포넌트 이름이 중복됩니다: ${name}`);
    }
    component.name = name;
  }
  if (patch.description !== undefined) component.description = patch.description.trim();
  if (patch.leadId !== undefined) component.leadId = patch.leadId;
  if (patch.defaultAssignee !== undefined) component.defaultAssignee = requireAssigneeRule(patch.defaultAssignee);
  persist();
  return clone(componentWithCount(data, component));
}

/** 지우면 이슈에서 떨어진다 */
export async function deleteComponent(id: string): Promise<void> {
  const data = load();
  const component = data.components.find((c) => c.id === id);
  if (!component) throw new Error("컴포넌트를 찾을 수 없습니다");
  assertCanAdmin(data, component.projectId);
  data.components = data.components.filter((c) => c.id !== id);
  for (const issue of [...data.issues, ...data.archivedIssues]) {
    if (issue.componentIds?.includes(id)) issue.componentIds = issue.componentIds.filter((c) => c !== id);
  }
  persist();
}

// ── 보관 (지라 "보관된 업무 항목") ──────────────────────────────

export async function archiveIssue(id: string): Promise<Issue> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, data.issues[index].projectId);
  const [issue] = data.issues.splice(index, 1);
  issue.archivedAt = new Date().toISOString();
  data.archivedIssues.push(issue);
  persist();
  return clone(issue);
}

export async function restoreIssue(id: string): Promise<Issue> {
  const data = load();
  const index = data.archivedIssues.findIndex((i) => i.id === id && i.archivedAt);
  if (index === -1) throw new Error("보관함에 없는 이슈입니다");
  assertCanEdit(data, data.archivedIssues[index].projectId);
  const [issue] = data.archivedIssues.splice(index, 1);
  issue.archivedAt = null;
  data.issues.push(issue);
  persist();
  return clone(issue);
}

/** 프로젝트 보관함 — 최근 보관 순 */
export async function listArchivedIssues(projectId: string): Promise<Issue[]> {
  return clone(
    load()
      .archivedIssues.filter((i) => i.projectId === projectId && i.archivedAt)
      .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
  );
}

export async function archiveProject(id: string): Promise<Project> {
  const data = load();
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  assertAdminIgnoringArchive(data, id);
  project.archivedAt = new Date().toISOString();
  persist();
  return clone(project);
}

export async function unarchiveProject(id: string): Promise<Project> {
  const data = load();
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  assertAdminIgnoringArchive(data, id);
  project.archivedAt = null;
  persist();
  return clone(project);
}

// ── 링크 타입 레지스트리 (전역 관리 > 링크 타입) ──────────────────────

export async function listLinkTypes(): Promise<LinkTypeDef[]> {
  return clone([...load().linkTypes].sort((a, b) => a.order - b.order));
}

export async function linkTypeUsage(): Promise<Record<string, number>> {
  const data = load();
  return Object.fromEntries(data.linkTypes.map((t) => [t.id, data.links.filter((l) => l.type === t.id).length]));
}

function requireLabel(value: string | undefined, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export async function createLinkType(input: { name: string; outward: string; inward: string }): Promise<LinkTypeDef> {
  const data = load();
  const name = requireLabel(input.name, "링크 타입 이름을 입력하세요");
  if (data.linkTypes.some((t) => t.name === name)) throw new Error(`링크 타입 이름이 중복됩니다: ${name}`);
  const def: LinkTypeDef = {
    id: `lt-${nextId()}`,
    name,
    outward: requireLabel(input.outward, "나가는 문구(예: 차단함)를 입력하세요"),
    inward: requireLabel(input.inward, "들어오는 문구(예: 차단됨)를 입력하세요"),
    order: data.linkTypes.length + 1,
    builtIn: false,
  };
  data.linkTypes.push(def);
  persist();
  notifyLinkTypesChanged();
  return clone(def);
}

export async function updateLinkType(
  id: string,
  patch: Partial<Pick<LinkTypeDef, "name" | "outward" | "inward">>,
): Promise<LinkTypeDef> {
  const data = load();
  const def = data.linkTypes.find((t) => t.id === id);
  if (!def) throw new Error("링크 타입을 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = requireLabel(patch.name, "링크 타입 이름을 입력하세요");
    if (data.linkTypes.some((t) => t.id !== id && t.name === name)) throw new Error(`링크 타입 이름이 중복됩니다: ${name}`);
    def.name = name;
  }
  const outward = patch.outward === undefined ? undefined : requireLabel(patch.outward, "나가는 문구(예: 차단함)를 입력하세요");
  const inward = patch.inward === undefined ? undefined : requireLabel(patch.inward, "들어오는 문구(예: 차단됨)를 입력하세요");
  if ((outward !== undefined || inward !== undefined) && data.links.some((l) => l.type === id)) {
    const nextOut = outward ?? def.outward;
    const nextIn = inward ?? def.inward;
    if (isSymmetric(def) !== (nextOut === nextIn)) {
      throw new Error("이 타입을 쓰는 링크가 있어 방향성(대칭 여부)을 바꿀 수 없습니다");
    }
  }
  if (outward !== undefined) def.outward = outward;
  if (inward !== undefined) def.inward = inward;
  persist();
  notifyLinkTypesChanged();
  return clone(def);
}

export async function moveLinkType(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.linkTypes].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((t) => t.id === id);
  if (index < 0) throw new Error("링크 타입을 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  const a = sorted[index];
  const b = sorted[target];
  [a.order, b.order] = [b.order, a.order];
  persist();
  notifyLinkTypesChanged();
}

export async function deleteLinkType(id: string): Promise<void> {
  const data = load();
  const def = data.linkTypes.find((t) => t.id === id);
  if (!def) throw new Error("링크 타입을 찾을 수 없습니다");
  if (def.builtIn) throw new Error("기본 링크 타입은 삭제할 수 없습니다");
  if (data.links.some((l) => l.type === id)) throw new Error("이 타입을 쓰는 링크가 있습니다");
  data.linkTypes = data.linkTypes.filter((t) => t.id !== id);
  [...data.linkTypes].sort((a, b) => a.order - b.order).forEach((t, i) => (t.order = i + 1));
  persist();
  notifyLinkTypesChanged();
}

export async function listBoards(projectId: string): Promise<Board[]> {
  return clone(
    load()
      .boards.filter((b) => b.projectId === projectId)
      .sort((a, b) =>
        a.isDefault === b.isDefault
          ? a.createdAt.localeCompare(b.createdAt)
          : a.isDefault
            ? -1
            : 1,
      ),
  );
}

export async function getBoard(id: string): Promise<Board | null> {
  const board = load().boards.find((b) => b.id === id);
  return board ? clone(board) : null;
}

export async function createBoard(input: {
  projectId: string;
  name: string;
  type: BoardType;
}): Promise<Board> {
  const data = load();
  if (!data.projects.some((p) => p.id === input.projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  const name = input.name.trim();
  if (!name) throw new Error("보드 이름을 입력하세요");
  const board = { ...defaultBoard(input.projectId, name, input.type), isDefault: false };
  data.boards.push(board);
  persist();
  return clone(board);
}

/** columns 패치는 status 3종 각 1개·WIP(null 또는 1 이상 정수)를 검증한다 */
/** 컬럼은 상태별 최대 1개 오버라이드 — 실제 컬럼 구성은 프로젝트 상태 목록에서 파생된다 */
function validateColumns(columns: Board["columns"]): void {
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.status)) throw new Error("컬럼은 상태마다 하나여야 합니다");
    seen.add(column.status);
    if (!column.name.trim()) throw new Error("컬럼 이름을 입력하세요");
    if (column.wipLimit !== null && (!Number.isInteger(column.wipLimit) || column.wipLimit < 1)) {
      throw new Error("WIP 제한은 1 이상의 정수여야 합니다");
    }
  }
}

export async function updateBoard(
  id: string,
  patch: Partial<Pick<Board, "name" | "filter" | "columns" | "swimlane" | "isDefault">>,
): Promise<Board> {
  const data = load();
  const board = data.boards.find((b) => b.id === id);
  if (!board) throw new Error("보드를 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("보드 이름을 입력하세요");
    board.name = name;
  }
  if (patch.columns !== undefined) {
    validateColumns(patch.columns);
    board.columns = patch.columns;
  }
  if (patch.filter !== undefined) board.filter = patch.filter;
  if (patch.swimlane !== undefined) board.swimlane = patch.swimlane;
  if (patch.isDefault === true) {
    for (const other of data.boards) {
      if (other.projectId === board.projectId) other.isDefault = other.id === board.id;
    }
  }
  persist();
  return clone(board);
}

export async function deleteBoard(id: string): Promise<void> {
  const data = load();
  const board = data.boards.find((b) => b.id === id);
  if (!board) throw new Error("보드를 찾을 수 없습니다");
  const siblings = data.boards.filter((b) => b.projectId === board.projectId);
  if (siblings.length <= 1) throw new Error("마지막 보드는 삭제할 수 없습니다");
  data.boards = data.boards.filter((b) => b.id !== id);
  // 기본 보드를 지웠으면 남은 첫 보드를 기본으로 승격
  if (board.isDefault) {
    const remaining = data.boards
      .filter((b) => b.projectId === board.projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (remaining[0]) remaining[0].isDefault = true;
  }
  persist();
}

/**
 * 보드에 보이는 이슈 — scrum: 활성 스프린트(없으면 빈 배열), kanban: 프로젝트 전체.
 * 공통으로 보드 저장 필터를 적용한다. 퀵 필터는 화면 몫이다.
 */
export async function listBoardIssues(boardId: string): Promise<Issue[]> {
  const data = load();
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) throw new Error("보드를 찾을 수 없습니다");
  let issues = data.issues.filter((i) => i.projectId === board.projectId);
  if (board.type === "scrum") {
    const active = data.sprints.find((s) => s.projectId === board.projectId && s.state === "active");
    if (!active) return [];
    issues = issues.filter((i) => i.sprintId === active.id);
  }
  const { assigneeIds, types, labels } = board.filter;
  if (assigneeIds.length > 0) {
    issues = issues.filter((i) =>
      i.assigneeId === null ? assigneeIds.includes("unassigned") : assigneeIds.includes(i.assigneeId),
    );
  }
  if (types.length > 0) issues = issues.filter((i) => types.includes(i.type));
  if (labels.length > 0) issues = issues.filter((i) => i.labels.some((l) => labels.includes(l)));
  return clone([...issues].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)));
}

// ── notifications ────────────────────────────────────────────

/** 수신자의 알림을 최신순으로 반환한다 (기본: 현재 사용자) */
export async function listNotifications(userId: string = CURRENT_USER_ID): Promise<Notification[]> {
  return clone(
    load()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => b.at.localeCompare(a.at)),
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  const data = load();
  const notification = data.notifications.find((n) => n.id === id);
  if (!notification) throw new Error("알림을 찾을 수 없습니다");
  notification.read = true;
  persist();
}

export async function markAllNotificationsRead(
  userId: string = CURRENT_USER_ID,
): Promise<void> {
  const data = load();
  for (const notification of data.notifications) {
    if (notification.userId === userId) notification.read = true;
  }
  persist();
}

/**
 * 프로젝트 변경 이력 — 리포트가 집계하는 원천. 시간 오름차순이며 필터는 전부 선택이다.
 * 스프린트 필터는 **전이의 양쪽**을 잡는다(서버와 같은 규칙) — 떠난 줄을 놓치면 원래 스프린트의
 * "빠진 이슈"를 셀 수 없다.
 */
export async function listProjectChanges(
  projectId: string,
  filter: { field?: ChangeField; sprintId?: string; since?: string } = {},
): Promise<IssueChange[]> {
  const data = load();
  const rows = data.changes.filter((change) => {
    if (change.projectId !== projectId) return false;
    if (filter.field && change.field !== filter.field) return false;
    if (filter.since && change.at < filter.since) return false;
    if (filter.sprintId) {
      const touchesSprint =
        change.sprintId === filter.sprintId ||
        (change.field === "sprint" &&
          (change.fromValue === filter.sprintId || change.toValue === filter.sprintId));
      if (!touchesSprint) return false;
    }
    return true;
  });
  // 같은 밀리초에 쌓인 줄은 **기록 순서**로 남긴다. id는 UUID라 문자열 비교가 무작위가 되고,
  // 그러면 "마지막 변경"이 실행마다 달라진다. Array.sort는 안정 정렬이라 동률은 삽입 순서를 지킨다.
  return clone(rows.sort((a, b) => a.at.localeCompare(b.at)));
}

export async function listActivity(issueId: string): Promise<Activity[]> {
  return clone(
    load()
      .activities.filter((a) => a.issueId === issueId)
      .sort((a, b) => a.at.localeCompare(b.at)),
  );
}

// ── 개인 설정 · 바로 가기 · 공지 배너 (지라 메뉴 대조 2026-08-30) ────────────

export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: { assigned: true, statusChanged: true, commented: true, mentioned: true },
  autoWatch: { created: true, commented: true, edited: false },
  startPage: "home",
  emailEnabled: false,
  // 목업에는 메일 서버가 없다 — 화면이 "구성되지 않음" 안내를 그리는 경로를 그대로 탄다
  mailConfigured: false,
};

const START_PAGES: readonly string[] = ["home", "projects", "last-project"];

function preferencesOf(data: JiraData, userId: string): UserPreferences {
  const stored = data.preferences[userId];
  return {
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...stored?.notifications },
    autoWatch: { ...DEFAULT_PREFERENCES.autoWatch, ...stored?.autoWatch },
    startPage: stored?.startPage ?? DEFAULT_PREFERENCES.startPage,
    emailEnabled: stored?.emailEnabled ?? DEFAULT_PREFERENCES.emailEnabled,
    mailConfigured: false,
  };
}

export async function getMyPreferences(): Promise<UserPreferences> {
  const data = load();
  return clone({ ...preferencesOf(data, CURRENT_USER_ID), avatarUrl: data.avatars[CURRENT_USER_ID] ?? null });
}

// ── 프로필 사진 (아바타) ─────────────────────────────────────
//
// 목업은 localStorage에 base64 dataURL로 넣는다(첨부와 달리 새로고침해도 남아야 하기 때문).
// 그래서 서버(2MB)보다 훨씬 작은 상한을 둔다 — base64는 약 1.37배로 부풀고 localStorage는 5MB다.

/** 목업 상한. REST 어댑터는 서버와 같은 2MB를 쓴다 — 화면은 이 값을 읽어 안내 문구를 만든다 */
export const AVATAR_MAX_BYTES = 200 * 1024;

/** 사진을 바꾸면 이미 그려진 아바타(상단바 등)가 갱신되도록 알린다 — 우선순위 레지스트리와 같은 방식 */
export const AVATAR_CHANGED_EVENT = "alm:avatar-changed";
export function notifyAvatarChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AVATAR_CHANGED_EVENT));
}
export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** 상한 문구용 — 서버가 "2MB"라고 말하므로 MB 단위가 떨어지면 MB로 쓴다 */
export function formatAvatarLimit(maxBytes: number): string {
  const mb = maxBytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${Math.round(maxBytes / 1024)}KB`;
}

/**
 * 목업·REST 공통 사전 검증. **문구는 서버(alm-backend V20)와 글자까지 같다** — 같은 파일이
 * 모드에 따라 다른 문장으로 거부되면 안 된다.
 *
 * 이건 어디까지나 사전 검증이다. 서버는 확장자·MIME이 아니라 **매직 바이트**로 판별하므로
 * (이름만 .png인 GIF, SVG 등) 여기를 통과해도 400이 날 수 있다 — 화면은 서버 `{error}`를
 * 항상 그대로 띄워야 한다.
 */
export function assertAvatarFile(file: File, maxBytes: number): void {
  if (file.size === 0) throw new Error("빈 파일은 올릴 수 없습니다");
  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다");
  }
  if (file.size > maxBytes) {
    throw new Error(`아바타는 ${formatAvatarLimit(maxBytes)} 이하 이미지여야 합니다`);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** 올린 사진을 즉시 보여줄 수 있는 URL(목업은 dataURL)로 돌려준다 */
export async function uploadMyAvatar(file: File): Promise<string> {
  assertAvatarFile(file, AVATAR_MAX_BYTES);
  const dataUrl = await readAsDataUrl(file);
  const data = load();
  data.avatars[CURRENT_USER_ID] = dataUrl;
  persist();
  notifyAvatarChanged();
  return dataUrl;
}

export async function removeMyAvatar(): Promise<void> {
  const data = load();
  delete data.avatars[CURRENT_USER_ID];
  persist();
  notifyAvatarChanged();
}

/** 부분 갱신 — 빠진 키는 그대로 */
export async function saveMyPreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  const data = load();
  const current = preferencesOf(data, CURRENT_USER_ID);
  if (patch.startPage !== undefined && !START_PAGES.includes(patch.startPage)) {
    throw new Error("시작 화면은 home/projects/last-project 중 하나입니다");
  }
  const next: UserPreferences = {
    notifications: { ...current.notifications, ...patch.notifications },
    autoWatch: { ...current.autoWatch, ...patch.autoWatch },
    startPage: patch.startPage ?? current.startPage,
    emailEnabled: patch.emailEnabled ?? current.emailEnabled,
    mailConfigured: false,
  };
  data.preferences[CURRENT_USER_ID] = next;
  persist();
  // 아바타는 preferences에 저장하지 않는다(별도 저장소) — 읽기 전용으로 얹어 돌려준다
  return clone({ ...next, avatarUrl: data.avatars[CURRENT_USER_ID] ?? null });
}

export async function listProjectShortcuts(projectId: string): Promise<ProjectShortcut[]> {
  return clone(
    load()
      .shortcuts.filter((s) => s.projectId === projectId)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
  );
}

function validateShortcut(input: { name: string; url: string }): { name: string; url: string } {
  const name = input.name.trim();
  if (!name) throw new Error("바로 가기 이름을 입력하세요");
  if (name.length > 80) throw new Error("바로 가기 이름은 80자 이하여야 합니다");
  const url = input.url.trim();
  if (!/^https?:\/\//.test(url)) throw new Error("바로 가기 URL은 http:// 또는 https://로 시작해야 합니다");
  return { name, url };
}

export async function addProjectShortcut(
  projectId: string,
  input: { name: string; url: string },
): Promise<ProjectShortcut> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, projectId);
  const valid = validateShortcut(input);
  const shortcut: ProjectShortcut = {
    id: nextId(),
    projectId,
    ...valid,
    order: data.shortcuts.filter((s) => s.projectId === projectId).length + 1,
    createdAt: new Date().toISOString(),
  };
  data.shortcuts.push(shortcut);
  persist();
  return clone(shortcut);
}

export async function updateProjectShortcut(
  id: string,
  input: { name: string; url: string },
): Promise<ProjectShortcut> {
  const data = load();
  const shortcut = data.shortcuts.find((s) => s.id === id);
  if (!shortcut) throw new Error("바로 가기를 찾을 수 없습니다");
  assertCanAdmin(data, shortcut.projectId);
  Object.assign(shortcut, validateShortcut(input));
  persist();
  return clone(shortcut);
}

export async function removeProjectShortcut(id: string): Promise<void> {
  const data = load();
  const shortcut = data.shortcuts.find((s) => s.id === id);
  if (!shortcut) throw new Error("바로 가기를 찾을 수 없습니다");
  assertCanAdmin(data, shortcut.projectId);
  data.shortcuts = data.shortcuts.filter((s) => s.id !== id);
  persist();
}

export async function getBanner(): Promise<AnnouncementBanner> {
  return clone(load().banner);
}

/** 관리자만 — 서버는 ADMIN 역할로 막는다. 켤 때는 내용이 필요하다 */
export async function saveBanner(banner: AnnouncementBanner): Promise<AnnouncementBanner> {
  const data = load();
  const message = banner.message.trim();
  if (banner.level !== "info" && banner.level !== "warning") {
    throw new Error("배너 수준은 info/warning 중 하나입니다");
  }
  if (banner.enabled && !message) throw new Error("배너 내용을 입력하세요");
  if (message.length > 500) throw new Error("배너 내용은 500자 이하여야 합니다");
  data.banner = { enabled: banner.enabled, level: banner.level, message };
  persist();
  return clone(data.banner);
}
