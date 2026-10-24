// localStorage 목업 스토어 — 웨이브 D(플래그·계획 필드·추정 합계·속도·저장된 보기)와 트리아지(V35) 대역
//
// 서버 README "계획 필드·플래그(V30)"·"저장된 보기(V31)"·"트리아지(V35)"와 같은 규칙·같은 문구다.
import type {
  EstimationGroup,
  EstimationSummary,
  Issue,
  JiraData,
  SavedView,
  SavedViewInput,
  SavedViewPatch,
  TriageAcceptInput,
  TriageQueueState,
  TriageSettings,
  VelocityReport,
  VelocityUnit,
  ViewDisplay,
  ViewFilter,
} from "../types";
import {
  DEFAULT_VIEW_PROPERTIES,
  VIEW_GROUPS,
  VIEW_ORDERS,
  VIEW_PROPERTIES,
} from "../types";
import type { MockTriageEntry } from "../model/mockData";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { ApiError } from "../mapping";
import { parseAndCheck } from "../aql/validate";
import { clone, load, nextId, persist } from "./db";
import { assertCanAdmin, assertCanEdit, myProjectRole } from "./members";
import { logChange, recordChanges, resolvePriority, statusKindOf } from "./rules";
import { addCommentInternal } from "./collab";
import { assertStatusInWorkflow, defaultStatusFor, workflowFor } from "./workflow";
import { emitIssueEvent, snapshotForAutomation } from "./automation";

// ── 계획 필드 검증 ───────────────────────────────────────────

/** 시작일·스토리 포인트 규칙 — 마감일보다 늦은 시작일, 범위 밖 포인트를 막는다(서버와 같은 문구) */
export function assertPlanning(
  startDate: string | null | undefined,
  storyPoints: number | null | undefined,
  dueDate: string | null | undefined,
): void {
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error(`날짜 형식이 올바르지 않습니다: ${startDate}`);
  if (startDate && dueDate && startDate > dueDate) throw new Error("시작일은 마감일보다 늦을 수 없습니다");
  if (storyPoints !== null && storyPoints !== undefined) {
    if (!Number.isFinite(storyPoints)) throw new Error("스토리 포인트는 수로 입력하세요");
    if (storyPoints < 0) throw new Error("스토리 포인트는 0 이상이어야 합니다");
    if (storyPoints > 9999) throw new Error("스토리 포인트는 9999 이하여야 합니다");
    if (Math.round(storyPoints * 10) !== storyPoints * 10) throw new Error("스토리 포인트는 소수 첫째 자리까지 쓸 수 있습니다");
  }
}

function requireIssue(data: JiraData, issueId: string): Issue {
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new ApiError(404, "이슈를 찾을 수 없습니다");
  return issue;
}

function activity(data: JiraData, issue: Issue, type: "flag" | "triage", detail: string, at: string): void {
  data.activities.push({ id: nextId(), issueId: issue.id, actorId: CURRENT_USER_ID, type, detail, at });
}

// ── 플래그(D2) ────────────────────────────────────────────────

/**
 * 플래그 켜기·끄기 — **버전을 올리지 않는다**(보드 이동과 같은 규칙: 열어 둔 편집 폼이 409가 되지 않게).
 * 이유를 주면 `플래그 추가: …`/`플래그 해제: …` 코멘트가 남는다. 같은 값이면 기록 없이 그대로 돌려준다.
 */
export async function setIssueFlag(issueId: string, flagged: boolean, comment?: string): Promise<Issue> {
  const data = load();
  const issue = requireIssue(data, issueId);
  assertCanEdit(data, issue.projectId);
  if (Boolean(issue.flagged) === flagged) return clone(issue);
  const before = snapshotForAutomation(issue);
  const now = new Date().toISOString();
  issue.flagged = flagged;
  issue.updatedAt = now;
  activity(data, issue, "flag", flagged ? "막힘" : "막힘 해제", now);
  const reason = comment?.trim();
  if (reason) addCommentInternal(data, issue, `${flagged ? "플래그 추가: " : "플래그 해제: "}${reason}`);
  persist();
  await emitIssueEvent(issue.id, before);
  return clone(load().issues.find((i) => i.id === issueId) ?? issue);
}

// ── 추정 합계·속도 ───────────────────────────────────────────

const round1 = (value: number) => Math.round(value * 10) / 10;

/** 진행 중·예정 스프린트(번호 순) + 백로그 — 트리아지 대기열은 빠진다. 미추정은 0으로 센다 */
export async function getEstimationSummary(projectId: string): Promise<EstimationSummary> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new ApiError(404, "프로젝트를 찾을 수 없습니다");
  const issues = data.issues.filter((i) => i.projectId === projectId && !i.triageState);
  const group = (sprintId: string | null, name: string, state: EstimationGroup["state"]): EstimationGroup => {
    const rows = issues.filter((i) => i.sprintId === sprintId);
    const done = rows.filter((i) => statusKindOf(data, projectId, i.status) === "complete");
    const sum = (list: Issue[], pick: (i: Issue) => number | null) => round1(list.reduce((t, i) => t + (pick(i) ?? 0), 0));
    return {
      sprintId,
      name,
      state,
      issueCount: rows.length,
      completedCount: done.length,
      storyPoints: sum(rows, (i) => i.storyPoints),
      completedStoryPoints: sum(done, (i) => i.storyPoints),
      unestimatedCount: rows.filter((i) => i.storyPoints === null).length,
      estimateHours: sum(rows, (i) => i.estimateHours),
      completedEstimateHours: sum(done, (i) => i.estimateHours),
    };
  };
  const sprints = data.sprints
    .filter((s) => s.projectId === projectId && s.state !== "done")
    .sort((a, b) => (Number(/\d+/.exec(a.name)?.[0]) || 0) - (Number(/\d+/.exec(b.name)?.[0]) || 0));
  return clone({
    projectId,
    groups: [
      ...sprints.map((s) => group(s.id, s.name, s.state === "active" ? "active" : "planned")),
      group(null, "백로그", null),
    ],
  });
}

/**
 * 속도 — 최근 완료 스프린트부터. committed = 완료 + 그 순간 이월(이력 시각이 completedAt과 같은 것).
 * 값은 지금의 추정치로 센다(서버와 같은 정의).
 */
export async function getVelocity(projectId: string, unit: VelocityUnit = "points", limit = 7): Promise<VelocityReport> {
  const data = load();
  if (!["points", "hours", "count"].includes(unit)) throw new Error("추정 단위는 points·hours·count 중 하나입니다");
  const cap = Math.min(20, Math.max(1, limit));
  const done = data.sprints
    .filter((s) => s.projectId === projectId && s.state === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, cap);
  const all = [...data.issues, ...data.archivedIssues].filter((i) => i.projectId === projectId);
  const amount = (issue: Issue) =>
    unit === "count" ? 1 : unit === "hours" ? (issue.estimateHours ?? 0) : (issue.storyPoints ?? 0);
  const sprints = done.map((sprint) => {
    const completedIds = all
      .filter((i) => i.sprintId === sprint.id && statusKindOf(data, projectId, i.status) === "complete")
      .map((i) => i.id);
    const carriedIds = data.changes
      .filter((c) => c.field === "sprint" && c.fromValue === sprint.id && c.at === sprint.completedAt)
      .map((c) => c.issueId);
    const committedIds = [...new Set([...completedIds, ...carriedIds])];
    const total = (ids: string[]) => round1(ids.reduce((t, id) => t + amount(all.find((i) => i.id === id) ?? ({} as Issue)), 0));
    return {
      sprintId: sprint.id,
      name: sprint.name,
      completedAt: sprint.completedAt ?? null,
      committed: total(committedIds),
      completed: total(completedIds),
    };
  });
  const average = sprints.length === 0 ? null : round1(sprints.reduce((t, s) => t + s.completed, 0) / sprints.length);
  return clone({ projectId, unit, sprints, average });
}

// ── 저장된 보기(D1, V31) ─────────────────────────────────────

const MAX_VIEW_NAME = 60;
const MAX_VIEW_QUERY = 4000;
const VIEW_NOT_FOUND = "저장된 보기를 찾을 수 없습니다: ";

type StoredView = JiraData["views"][number];

/** 표시 옵션 검증 + 기본값 채우기 — 서버 `ViewDisplay.normalize`와 같은 규칙·문구 */
export function normalizeViewDisplay(requested: Partial<ViewDisplay> | null | undefined): ViewDisplay {
  const input = requested ?? {};
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, label: string): T => {
    if (value === undefined || value === null || value === "") return fallback;
    if (!(allowed as readonly string[]).includes(value)) throw new Error(`모르는 ${label}입니다: ${value}`);
    return value as T;
  };
  const groupBy = pick(input.groupBy, VIEW_GROUPS, "none", "그룹 기준");
  const subGroupBy = pick(input.subGroupBy, VIEW_GROUPS, "none", "하위 그룹 기준");
  if (subGroupBy !== "none" && subGroupBy === groupBy) throw new Error("하위 그룹 기준은 그룹 기준과 달라야 합니다");
  if (groupBy === "none" && subGroupBy !== "none") throw new Error("하위 그룹은 그룹 기준이 있을 때만 쓸 수 있습니다");
  const orderBy = pick(input.orderBy, VIEW_ORDERS, "manual", "정렬 기준");
  const orderDirection = pick(input.orderDirection, ["asc", "desc"] as const, "asc", "정렬 방향");
  let properties = input.properties ? [...input.properties] : [...DEFAULT_VIEW_PROPERTIES];
  if (properties.length > VIEW_PROPERTIES.length) throw new Error("표시 속성이 너무 많습니다");
  for (const property of properties) {
    if (!(VIEW_PROPERTIES as readonly string[]).includes(property)) throw new Error(`모르는 표시 속성입니다: ${property}`);
  }
  properties = [...new Set(properties)];
  return {
    groupBy,
    subGroupBy,
    orderBy,
    orderDirection,
    properties,
    showSubIssues: input.showSubIssues ?? true,
    showEmptyGroups: input.showEmptyGroups ?? false,
  };
}

function normalizeViewFilter(filter: ViewFilter | null | undefined): ViewFilter | null {
  if (!filter) return null;
  if (filter.kind !== "smart" && filter.kind !== "aql") throw new Error("필터 종류는 smart 또는 aql입니다");
  const query = (filter.query ?? "").trim();
  if (!query) throw new Error("필터 질의를 입력하세요");
  if (query.length > MAX_VIEW_QUERY) throw new Error(`필터 질의는 ${MAX_VIEW_QUERY}자 이하여야 합니다`);
  if (filter.kind === "aql") parseAndCheck(query); // 400 {error, position, expected}
  return { kind: filter.kind, query };
}

function viewName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("보기 이름을 입력하세요");
  if (trimmed.length > MAX_VIEW_NAME) throw new Error(`보기 이름은 ${MAX_VIEW_NAME}자 이하여야 합니다`);
  return trimmed;
}

/** 내가 고칠 수 있나 — 만든 사람(공유면 지금 편집 권한) 또는 프로젝트 관리자 */
function canEditView(data: JiraData, view: StoredView): boolean {
  const role = view.projectId ? myProjectRole(data, view.projectId) : null;
  if (role === "admin") return true;
  if (view.ownerId !== CURRENT_USER_ID) return false;
  return view.scope === "personal" || role === "editor";
}

function present(data: JiraData, view: StoredView): SavedView {
  return { ...view, mine: view.ownerId === CURRENT_USER_ID, canEdit: canEditView(data, view) };
}

/** 이름 순(공유 보기가 먼저) */
function sortViews(list: SavedView[]): SavedView[] {
  return [...list].sort((a, b) =>
    a.scope === b.scope ? a.name.localeCompare(b.name, "ko") : a.scope === "project" ? -1 : 1,
  );
}

function visible(data: JiraData, view: StoredView): boolean {
  if (view.scope === "personal") return view.ownerId === CURRENT_USER_ID;
  return view.projectId !== null && myProjectRole(data, view.projectId) !== null;
}

function requireView(data: JiraData, viewId: string): StoredView {
  const view = data.views.find((v) => v.id === viewId);
  if (!view || !visible(data, view)) throw new ApiError(404, `${VIEW_NOT_FOUND}${viewId}`);
  return view;
}

function requireEditable(data: JiraData, view: StoredView): void {
  if (view.projectId && data.projects.find((p) => p.id === view.projectId)?.archivedAt) {
    throw new Error("보관된 프로젝트는 읽기만 할 수 있습니다");
  }
  if (!canEditView(data, view)) {
    throw new ApiError(403, "공유된 보기는 만든 사람이나 프로젝트 관리자만 수정·삭제할 수 있습니다");
  }
}

/** 내 개인 보기 — projectId를 주면 그 프로젝트 것만 */
export async function listMyViews(projectId?: string): Promise<SavedView[]> {
  const data = load();
  const rows = data.views.filter(
    (v) => v.scope === "personal" && v.ownerId === CURRENT_USER_ID && (projectId === undefined || v.projectId === projectId),
  );
  return clone(sortViews(rows.map((v) => present(data, v))));
}

/** 프로젝트 화면의 보기 — 프로젝트 공유 보기 + 그 프로젝트의 내 개인 보기 */
export async function listProjectViews(projectId: string): Promise<SavedView[]> {
  const data = load();
  if (myProjectRole(data, projectId) === null) throw new ApiError(403, "이 프로젝트를 볼 권한이 없습니다");
  const rows = data.views.filter(
    (v) => v.projectId === projectId && (v.scope === "project" || v.ownerId === CURRENT_USER_ID),
  );
  return clone(sortViews(rows.map((v) => present(data, v))));
}

export async function getView(viewId: string): Promise<SavedView> {
  const data = load();
  return clone(present(data, requireView(data, viewId)));
}

export async function createView(input: SavedViewInput): Promise<SavedView> {
  const data = load();
  const scope = input.scope ?? "personal";
  if (scope !== "personal" && scope !== "project") throw new Error("보기 공유 범위는 personal 또는 project입니다");
  const projectId = input.projectId ?? null;
  if (scope === "project" && !projectId) throw new Error("프로젝트 보기에는 프로젝트가 필요합니다");
  if (projectId) {
    if (!data.projects.some((p) => p.id === projectId)) throw new ApiError(404, "프로젝트를 찾을 수 없습니다");
    if (scope === "project") assertCanEdit(data, projectId);
    else if (myProjectRole(data, projectId) === null) throw new ApiError(403, "이 프로젝트를 볼 권한이 없습니다");
  }
  const layout = input.layout ?? "list";
  if (layout !== "list" && layout !== "board") throw new Error("보기 레이아웃은 list 또는 board입니다");
  const now = new Date().toISOString();
  const view: StoredView = {
    id: nextId(),
    name: viewName(input.name),
    scope,
    projectId,
    ownerId: CURRENT_USER_ID,
    layout,
    filter: normalizeViewFilter(input.filter),
    display: normalizeViewDisplay(input.display),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  data.views.push(view);
  persist();
  return clone(present(data, view));
}

/** 보낸 항목만 바꾼다. `filter: null`이면 필터를 지운다. `expectedVersion`이 어긋나면 409 */
export async function updateView(viewId: string, patch: SavedViewPatch, expectedVersion: number): Promise<SavedView> {
  const data = load();
  const view = requireView(data, viewId);
  requireEditable(data, view);
  if (view.version !== expectedVersion) {
    throw new ApiError(409, `다른 사용자가 먼저 보기를 수정했습니다. 현재 ${view.version}, 요청 ${expectedVersion}`);
  }
  if (patch.scope !== undefined && patch.scope !== view.scope) {
    if (patch.scope !== "personal" && patch.scope !== "project") throw new Error("보기 공유 범위는 personal 또는 project입니다");
    if (patch.scope === "project") {
      if (!view.projectId) throw new Error("프로젝트가 없는 보기는 프로젝트에 공유할 수 없습니다");
      assertCanEdit(data, view.projectId);
    } else if (view.ownerId !== CURRENT_USER_ID) {
      throw new ApiError(403, "공유 보기를 비공개로 돌리는 것은 만든 사람만 할 수 있습니다");
    }
    view.scope = patch.scope;
  }
  if (patch.name !== undefined) view.name = viewName(patch.name);
  if (patch.layout !== undefined) {
    if (patch.layout !== "list" && patch.layout !== "board") throw new Error("보기 레이아웃은 list 또는 board입니다");
    view.layout = patch.layout;
  }
  if (patch.filter !== undefined) view.filter = normalizeViewFilter(patch.filter);
  if (patch.display !== undefined) view.display = normalizeViewDisplay({ ...view.display, ...patch.display });
  view.version += 1;
  view.updatedAt = new Date().toISOString();
  persist();
  return clone(present(data, view));
}

export async function deleteView(viewId: string): Promise<void> {
  const data = load();
  const view = requireView(data, viewId);
  requireEditable(data, view);
  data.views = data.views.filter((v) => v.id !== viewId);
  persist();
}

// ── 트리아지(V35) ────────────────────────────────────────────

const NOT_IN_TRIAGE = "트리아지 대기열에 없는 이슈입니다";
const MAX_SNOOZE_MS = 366 * 24 * 60 * 60 * 1000;

/** 지금 보이는 대기 상태 — 보류 시각이 지났으면 pending */
function effectiveState(entry: MockTriageEntry, now: number): "pending" | "snoozed" {
  return entry.snoozedUntil && Date.parse(entry.snoozedUntil) > now ? "snoozed" : "pending";
}

/** 대기열 상태를 이슈에 다시 쓴다 — 보류가 풀린 이슈를 pending으로 */
function refreshTriage(data: JiraData): void {
  const now = Date.now();
  for (const entry of data.triageEntries) {
    const issue = data.issues.find((i) => i.id === entry.issueId);
    if (issue) issue.triageState = effectiveState(entry, now);
  }
}

/** 대기열에 넣는다(저장은 호출자) — 스프린트에서 빠지고 백로그 끝에 놓인다 */
export function enterTriage(data: JiraData, issue: Issue, source: MockTriageEntry["source"], at: string): void {
  if (issue.sprintId !== null) {
    logChange(data, issue, "sprint", issue.sprintId, null, at);
    issue.sprintId = null;
  }
  issue.order = data.issues.filter((i) => i.projectId === issue.projectId && i.sprintId === null).reduce((m, i) => Math.max(m, i.order), 0) + 1;
  issue.triageState = "pending";
  data.triageEntries = data.triageEntries.filter((e) => e.issueId !== issue.id);
  data.triageEntries.push({ issueId: issue.id, source, enteredAt: at, snoozedUntil: null });
}

function leaveTriage(data: JiraData, issue: Issue): void {
  issue.triageState = null;
  data.triageEntries = data.triageEntries.filter((e) => e.issueId !== issue.id);
}

export async function getTriageSettings(projectId: string): Promise<TriageSettings> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new ApiError(404, "프로젝트를 찾을 수 없습니다");
  refreshTriage(data);
  const now = Date.now();
  const entries = data.triageEntries.filter((e) => data.issues.some((i) => i.id === e.issueId && i.projectId === projectId));
  return clone({
    projectId,
    enabled: data.triageProjects.includes(projectId),
    pending: entries.filter((e) => effectiveState(e, now) === "pending").length,
    snoozed: entries.filter((e) => effectiveState(e, now) === "snoozed").length,
  });
}

/** 켜기·끄기 — 관리자. 꺼도 남은 대기열은 처리할 수 있다(새로 들어오지만 않는다) */
export async function saveTriageSettings(projectId: string, enabled: boolean): Promise<TriageSettings> {
  const data = load();
  assertCanAdmin(data, projectId);
  data.triageProjects = data.triageProjects.filter((id) => id !== projectId);
  if (enabled) data.triageProjects.push(projectId);
  persist();
  return getTriageSettings(projectId);
}

/** 대기열 — 들어온 순서(오래된 것 먼저) */
export async function listTriage(projectId: string, state: TriageQueueState = "pending"): Promise<Issue[]> {
  if (!["pending", "snoozed", "all"].includes(state)) throw new Error("트리아지 보기는 pending·snoozed·all 중 하나입니다");
  const data = load();
  refreshTriage(data);
  const now = Date.now();
  const rows = data.issues
    .filter((i) => i.projectId === projectId && i.triageState)
    .filter((i) => {
      const entry = data.triageEntries.find((e) => e.issueId === i.id);
      if (!entry) return state !== "snoozed";
      return state === "all" || effectiveState(entry, now) === state;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key, "ko", { numeric: true }));
  return clone(rows);
}

function lockTriaged(data: JiraData, issueId: string): Issue {
  const issue = requireIssue(data, issueId);
  assertCanEdit(data, issue.projectId);
  if (!issue.triageState) throw new Error(NOT_IN_TRIAGE);
  return issue;
}

async function finish(data: JiraData, issue: Issue, before: Issue, detail: string, comment: string | undefined): Promise<Issue> {
  const at = new Date().toISOString();
  const automationBefore = snapshotForAutomation(before);
  issue.updatedAt = at;
  activity(data, issue, "triage", detail, at);
  recordChanges(data, before, issue, at);
  if (comment?.trim()) addCommentInternal(data, issue, comment);
  persist();
  await emitIssueEvent(issue.id, automationBefore);
  return clone(load().issues.find((i) => i.id === issue.id) ?? issue);
}

/** 기존 이슈를 대기열로(MANUAL) — 트리아지를 켠 프로젝트의 완료되지 않은 이슈만 */
export async function sendToTriage(issueId: string): Promise<Issue> {
  const data = load();
  const issue = requireIssue(data, issueId);
  assertCanEdit(data, issue.projectId);
  if (!data.triageProjects.includes(issue.projectId)) throw new Error("트리아지를 켜지 않은 프로젝트입니다");
  if (issue.triageState) throw new Error("이미 트리아지 대기열에 있습니다");
  if (statusKindOf(data, issue.projectId, issue.status) === "complete") {
    throw new Error("완료된 이슈는 트리아지로 보낼 수 없습니다");
  }
  const before = { ...issue, labels: [...issue.labels] };
  enterTriage(data, issue, "MANUAL", new Date().toISOString());
  return finish(data, issue, before, "트리아지로 보냄", undefined);
}

/** 수락 — 지정 상태(기본 첫 '할 일')로 백로그 끝. 완료 의미 상태로는 수락할 수 없다 */
export async function acceptTriage(issueId: string, input: TriageAcceptInput = {}): Promise<Issue> {
  const data = load();
  const issue = lockTriaged(data, issueId);
  const status = input.status?.trim() ? input.status.trim() : defaultStatusFor(data, issue.projectId, issue.type);
  assertStatusInWorkflow(data, issue.projectId, issue.type, status);
  if (statusKindOf(data, issue.projectId, status) === "complete") {
    throw new Error("수락은 진행할 상태로만 할 수 있습니다 — 끝내려면 거절이나 중복을 쓰세요");
  }
  const priority = input.priority ? resolvePriority(data, issue.projectId, input.priority) : null;
  const before = { ...issue, labels: [...issue.labels] };
  leaveTriage(data, issue);
  issue.status = status;
  if (input.assigneeId !== undefined && input.assigneeId !== null) issue.assigneeId = input.assigneeId;
  if (priority) issue.priority = priority;
  issue.order = data.issues.filter((i) => i.projectId === issue.projectId && i.sprintId === null && i.id !== issue.id).reduce((m, i) => Math.max(m, i.order), 0) + 1;
  return finish(data, issue, before, "수락", input.comment);
}

/** 그 이슈 타입 워크플로에서 순서상 첫 완료 의미 상태 */
function firstCompleteStatus(data: JiraData, issue: Issue): string {
  const found = workflowFor(data, issue.projectId, issue.type).statuses.find((s) => s.kind === "complete");
  if (!found) throw new Error("이 프로젝트 워크플로에 완료 상태가 없습니다");
  return found.id;
}

function closeFromTriage(data: JiraData, issue: Issue, resolution: Issue["resolution"]): void {
  leaveTriage(data, issue);
  issue.status = firstCompleteStatus(data, issue);
  issue.resolution = resolution;
  issue.resolvedAt ??= new Date().toISOString();
}

/** 거절 — 해결 "하지 않음" + 첫 완료 상태. 이유는 코멘트로 남는다 */
export async function declineTriage(issueId: string, input: { comment?: string } = {}): Promise<Issue> {
  const data = load();
  const issue = lockTriaged(data, issueId);
  const before = { ...issue, labels: [...issue.labels] };
  closeFromTriage(data, issue, "wont_do");
  return finish(data, issue, before, "거절(하지 않음)", input.comment);
}

/** 중복 — "중복" 링크(이 이슈 → 원본) + 해결 "중복" + 첫 완료 상태 */
export async function duplicateTriage(issueId: string, input: { duplicateOfIssueId: string; comment?: string }): Promise<Issue> {
  if (!input?.duplicateOfIssueId) throw new Error("원본 이슈를 지정하세요");
  if (input.duplicateOfIssueId === issueId) throw new Error("자기 자신의 중복일 수는 없습니다");
  const data = load();
  const issue = lockTriaged(data, issueId);
  const original = data.issues.find((i) => i.id === input.duplicateOfIssueId);
  if (!original) throw new ApiError(404, "원본 이슈를 찾을 수 없습니다");
  const before = { ...issue, labels: [...issue.labels] };
  closeFromTriage(data, issue, "duplicate");
  if (!data.links.some((l) => l.sourceId === issue.id && l.targetId === original.id && l.type === "duplicates")) {
    data.links.push({ id: nextId(), sourceId: issue.id, targetId: original.id, type: "duplicates" });
  }
  return finish(data, issue, before, `중복: ${original.key}`, input.comment);
}

/** 보류 — 미래 시각(최대 1년)까지 접어 둔다. 지나면 다시 대기로 보인다 */
export async function snoozeTriage(issueId: string, until: string): Promise<Issue> {
  const at = Date.parse(until);
  const now = Date.now();
  if (Number.isNaN(at) || at <= now) throw new Error("보류는 미래 시각까지로 지정하세요");
  if (at > now + MAX_SNOOZE_MS) throw new Error("보류는 1년까지만 할 수 있습니다");
  const data = load();
  const issue = lockTriaged(data, issueId);
  const before = { ...issue, labels: [...issue.labels] };
  const entry = data.triageEntries.find((e) => e.issueId === issue.id);
  if (entry) entry.snoozedUntil = new Date(at).toISOString();
  else data.triageEntries.push({ issueId: issue.id, source: "MANUAL", enteredAt: issue.createdAt, snoozedUntil: new Date(at).toISOString() });
  issue.triageState = "snoozed";
  return finish(data, issue, before, `보류(${new Date(at).toISOString().slice(0, 16)}까지)`, undefined);
}
