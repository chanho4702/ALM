// localStorage 목업 스토어 — settings (jiraMock.ts에서 분할, 동작 불변)
import { type JiraData, type SettingsBody, type StatusKind, type IssueFieldConfig, ISSUE_FIELD_IDS, ISSUE_FIELD_NAMES, type ProjectSettingsEntry, type SettingsScheme, type WorkflowTransition, TRANSITION_VALIDATOR_FIELDS, TRANSITION_SCREEN_FIELDS } from "../types";
import { categoryById, STATUS_KIND_LIST, defaultSettingsBody, NEVER_REQUIRED_FIELDS, load, clone, enrichBody, enrichScheme, nextId, persist, applyBodyToRegistry, cloneBody } from "./db";
import { typeDefOf, typeLevelOf, typeNameOf, priorityDefOf, resolvedStatuses, pruneTransitions, pruneLayout, logChange } from "./rules";
import { workflowForBody } from "./workflow";
import { assertCanAdmin } from "./members";

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
  validateWorkflows(data, body);
  validateFieldConfigs(body.fields);
  // 타입별 덮어쓰기 — 키는 레지스트리에 있는 타입이어야 하고, 각 목록은 기본 구성과 같은 규칙을 탄다
  for (const [typeId, fields] of Object.entries(body.fieldsByType ?? {})) {
    if (!typeDefOf(data, typeId)) throw new Error(`없는 이슈 타입입니다: ${typeId}`);
    validateFieldConfigs(fields);
  }
}

const CONDITION_TYPES = ["assignee", "role", "subtasksDone"];
const POST_FUNCTION_TYPES = ["assignToActor", "clearAssignee", "setResolution"];
const SERVER_RESOLUTIONS = ["DONE", "WONT_DO", "DUPLICATE", "CANNOT_REPRODUCE"];

/**
 * 전환 규칙(C1~C3)과 타입별 워크플로(C5) — 서버 `SchemeService.validateWorkflows`와 같은 규칙·같은 문구.
 * 대상·출발 상태가 워크플로에 있어야 하고, 조건·검증·화면 칸·후처리는 정해진 어휘만. 해결 칸·해결 후처리는
 * 완료 의미로 가는 전환에만.
 */
function validateWorkflows(data: JiraData, body: SettingsBody): void {
  const kindById = new Map<string, StatusKind>();
  for (const status of body.statuses) kindById.set(status.id, categoryById(data, status.category).kind);
  validateTransitions(body.transitions ?? [], kindById);
  for (const [typeId, flow] of Object.entries(body.workflowsByType ?? {})) {
    if (!typeId.trim() || !typeDefOf(data, typeId)) throw new Error(`없는 이슈 타입입니다: ${typeId}`);
    if (!flow) throw new Error(`이슈 타입 워크플로가 비어 있습니다: ${typeNameOf(data, typeId)}`);
    const subset = flow.statuses ?? [];
    const scoped = new Map<string, StatusKind>();
    for (const id of subset) {
      const kind = kindById.get(id);
      if (!kind) throw new Error(`${typeNameOf(data, typeId)} 워크플로에 프로젝트에 없는 상태가 있습니다: ${id}`);
      scoped.set(id, kind);
    }
    if (subset.length === 0) kindById.forEach((kind, id) => scoped.set(id, kind));
    const kinds = new Set(scoped.values());
    if (!STATUS_KIND_LIST.every((kind) => kinds.has(kind))) {
      throw new Error(`${typeNameOf(data, typeId)} 워크플로에도 카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다`);
    }
    if (flow.transitions != null) validateTransitions(flow.transitions, scoped);
  }
}

function validateTransitions(transitions: WorkflowTransition[], kindById: Map<string, StatusKind>): void {
  const ids = new Set<string>();
  for (const t of transitions) {
    if (!t || !t.to || !kindById.has(t.to)) throw new Error("전환의 대상 상태가 워크플로에 없습니다");
    if (t.id?.trim()) {
      if (ids.has(t.id)) throw new Error(`같은 전환 id가 두 번 있습니다: ${t.id}`);
      ids.add(t.id);
    }
    for (const from of t.from ?? []) {
      if (!kindById.has(from)) throw new Error(`전환의 출발 상태가 워크플로에 없습니다: ${from}`);
    }
    const toComplete = kindById.get(t.to) === "complete";
    for (const c of t.conditions ?? []) {
      if (!c || !CONDITION_TYPES.includes(c.type)) throw new Error(`없는 전환 조건입니다: ${c?.type ?? null}`);
      if (c.type === "role" && c.role !== "ADMIN" && c.role !== "EDIT") throw new Error("역할 조건은 ADMIN 또는 EDIT여야 합니다");
    }
    const seen = new Set<string>();
    for (const field of t.validators ?? []) {
      if (!(TRANSITION_VALIDATOR_FIELDS as readonly string[]).includes(field)) throw new Error(`전환 검증에 쓸 수 없는 필드입니다: ${field}`);
      if (seen.has(field)) throw new Error(`같은 필드를 두 번 넣을 수 없습니다: ${(ISSUE_FIELD_NAMES as Record<string, string>)[field] ?? field}`);
      seen.add(field);
    }
    seen.clear();
    for (const field of t.screenFields ?? []) {
      if (!(TRANSITION_SCREEN_FIELDS as readonly string[]).includes(field)) throw new Error(`전환 화면에 넣을 수 없는 칸입니다: ${field}`);
      if (seen.has(field)) throw new Error(`같은 칸을 두 번 넣을 수 없습니다: ${field}`);
      seen.add(field);
      if (field === "resolution" && !toComplete) throw new Error("해결 칸은 완료 상태로 가는 전환에만 넣을 수 있습니다");
    }
    for (const f of t.postFunctions ?? []) {
      if (!f || !POST_FUNCTION_TYPES.includes(f.type)) throw new Error(`없는 후처리입니다: ${f?.type ?? null}`);
      if (f.type === "setResolution") {
        if (!toComplete) throw new Error("해결 설정 후처리는 완료 상태로 가는 전환에만 쓸 수 있습니다");
        if (!SERVER_RESOLUTIONS.includes(f.value ?? "")) throw new Error(`없는 해결 값입니다: ${f.value ?? null}`);
      }
    }
    const types = (t.postFunctions ?? []).map((f) => f.type);
    if (types.includes("assignToActor") && types.includes("clearAssignee")) {
      throw new Error("담당자를 나로 지정하면서 비울 수는 없습니다");
    }
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
  // 타입별 워크플로(C5) — 그 타입 워크플로에 없는 상태의 이슈도 같은 규칙으로 옮긴다
  const enrichedNew = { ...newBody, statuses: sorted };
  for (const issue of data.issues) {
    if (!targets.has(issue.projectId)) continue;
    if (valid.has(issue.status)) {
      const flow = workflowForBody(data, enrichedNew, issue.type);
      if (!flow.typeSpecific || flow.statuses.some((s) => s.id === issue.status)) continue;
      const current = sorted.find((s) => s.id === issue.status);
      const target =
        flow.statuses.find((s) => s.category === current?.category) ??
        flow.statuses.find((s) => s.kind === current?.kind) ??
        flow.statuses[0];
      if (!target || target.id === issue.status) continue;
      const previous = issue.status;
      issue.status = target.id;
      logChange(data, issue, "status", previous, issue.status, new Date().toISOString());
      continue;
    }
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
    // 매핑 형식(C4) 열은 읽을 때 빠진 상태를 거른다(서버와 같다) — 상태 형식 덮어쓰기만 정리
    if (board.columns.some((c) => Array.isArray(c.statuses))) continue;
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
