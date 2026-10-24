// localStorage 목업 스토어 — 워크플로 엔진(가용 전환·전환 실행·조건·검증·후처리, 2026-10-24 웨이브 A·C)
//
// 서버 `workflow/WorkflowEngine`·`issue/IssueTransitionService`·`SettingsBody.workflowFor`와 같은 규칙·같은 문구다.
// 상태가 바뀌는 모든 목업 경로(updateIssue·moveIssue·bulk·transitionIssue)가 이 모듈 하나로 규칙을 탄다.
import {
  type Issue,
  type IssueResolution,
  type IssueTransitionOption,
  type IssueTransitions,
  type JiraData,
  type ServerResolution,
  type SettingsBody,
  type TransitionCondition,
  type TransitionRequest,
  type WorkflowStatus,
  type WorkflowTransition,
  ISSUE_FIELD_NAMES,
  IMPLICIT_TRANSITION_PREFIX,
} from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { ApiError } from "../mapping";
import { htmlToText } from "../richText";
import { clone, enrichStatuses, load, persist } from "./db";
import { applyResolutionRule, assertVersionAssignable, recordChanges, resolvedBody, statusKindOf } from "./rules";
import { assertCanEdit, myProjectRole } from "./members";
import { addCommentInternal } from "./collab";
import { emitIssueEvent, snapshotForAutomation } from "./automation";

/** 이슈 하나에 적용되는 최종 워크플로 — 상태(order 순)와 전환. 전환이 비면 상태 사이 이동이 모두 허용된다 */
export interface ResolvedWorkflow {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  typeSpecific: boolean;
}

/** 서버 `SettingsBody.workflowFor` — 타입 키가 없으면 프로젝트 기본 워크플로(폴백) */
export function workflowForBody(data: JiraData, body: SettingsBody, typeId: string | null): ResolvedWorkflow {
  const all = [...enrichStatuses(data, body.statuses)].sort((a, b) => a.order - b.order);
  const override = typeId ? body.workflowsByType?.[typeId] : undefined;
  if (!override) return { statuses: all, transitions: body.transitions ?? [], typeSpecific: false };
  const subset = override.statuses ?? [];
  const statuses = subset.length === 0 ? all : all.filter((s) => subset.includes(s.id));
  const ids = new Set(statuses.map((s) => s.id));
  let transitions: WorkflowTransition[];
  if (override.transitions == null) {
    transitions = [];
    for (const t of body.transitions ?? []) {
      if (!ids.has(t.to)) continue;
      if (t.from.length === 0) {
        transitions.push(t);
        continue;
      }
      const from = t.from.filter((id) => ids.has(id));
      if (from.length > 0) transitions.push({ ...t, from });
    }
  } else {
    transitions = override.transitions;
  }
  return { statuses, transitions, typeSpecific: true };
}

export function workflowFor(data: JiraData, projectId: string, typeId: string | null): ResolvedWorkflow {
  return workflowForBody(data, resolvedBody(data, projectId), typeId);
}

/** 평가된 전환 — 암묵 전환(전환 목록이 빈 워크플로)이면 transition이 null */
export interface EvaluatedTransition {
  transition: WorkflowTransition | null;
  id: string;
  name: string;
  to: string;
  global: boolean;
  available: boolean;
  reason: string | null;
}

const statusName = (flow: ResolvedWorkflow, id: string) => flow.statuses.find((s) => s.id === id)?.name ?? id;

export function transitionName(t: WorkflowTransition, flow: ResolvedWorkflow): string {
  return t.name?.trim() ? t.name.trim() : statusName(flow, t.to);
}

function editDenied(data: JiraData, projectId: string): string | null {
  try {
    assertCanEdit(data, projectId);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** 완료되지 않은 하위 이슈 수 — 보관 이슈는 data.issues 밖이라 자연히 빠진다 */
function openChildren(data: JiraData, issue: Issue): number {
  return data.issues.filter(
    (child) => child.parentId === issue.id && statusKindOf(data, child.projectId, child.status) !== "complete",
  ).length;
}

/** 조건 하나 — 충족하면 null, 아니면 사용자에게 보일 이유(서버와 같은 문구) */
function check(data: JiraData, condition: TransitionCondition, issue: Issue): string | null {
  switch (condition.type) {
    case "assignee":
      return issue.assigneeId === CURRENT_USER_ID ? null : "담당자만 이 전환을 할 수 있습니다";
    case "role": {
      const role = myProjectRole(data, issue.projectId);
      if (condition.role === "ADMIN") {
        return role === "admin" ? null : "프로젝트 관리자만 이 전환을 할 수 있습니다";
      }
      return role === "admin" || role === "editor"
        ? null
        : "프로젝트 편집 권한이 있는 사람만 이 전환을 할 수 있습니다";
    }
    case "subtasksDone": {
      const open = openChildren(data, issue);
      return open === 0 ? null : `완료되지 않은 하위 이슈가 ${open}개 있습니다`;
    }
    default:
      return `알 수 없는 전환 조건입니다: ${(condition as { type: string }).type}`;
  }
}

function evaluateOne(data: JiraData, t: WorkflowTransition, flow: ResolvedWorkflow, issue: Issue, denied: string | null): EvaluatedTransition {
  let reason = denied;
  if (reason === null) {
    for (const condition of t.conditions ?? []) {
      reason = check(data, condition, issue);
      if (reason !== null) break;
    }
  }
  return {
    transition: t,
    id: t.id?.trim() ? t.id : `${IMPLICIT_TRANSITION_PREFIX}${t.to}`,
    name: transitionName(t, flow),
    to: t.to,
    global: t.from.length === 0,
    available: reason === null,
    reason,
  };
}

function implicit(target: WorkflowStatus, denied: string | null): EvaluatedTransition {
  return {
    transition: null,
    id: `${IMPLICIT_TRANSITION_PREFIX}${target.id}`,
    name: target.name,
    to: target.id,
    global: true,
    available: denied === null,
    reason: denied,
  };
}

/** 현재 상태에서 갈 수 있는 전환 전부 — 못 하는 것도 이유와 함께. 자기 루프는 뺀다 */
export function evaluateTransitions(data: JiraData, issue: Issue, flow: ResolvedWorkflow): EvaluatedTransition[] {
  const denied = editDenied(data, issue.projectId);
  if (flow.transitions.length === 0) {
    return flow.statuses.filter((s) => s.id !== issue.status).map((s) => implicit(s, denied));
  }
  return flow.transitions
    .filter((t) => (t.from.length === 0 || t.from.includes(issue.status)) && t.to !== issue.status)
    .map((t) => evaluateOne(data, t, flow, issue, denied));
}

/**
 * 상태만 오는 경로(PUT·보드 이동·일괄)의 전환 고르기 — 같은 대상으로 가는 전환 중 조건을 충족하는 첫 번째.
 * 하나도 못 하면 첫 후보의 이유로, 정의되지 않은 이동이면 예전 문구로 거부한다.
 */
export function chooseTransition(data: JiraData, issue: Issue, flow: ResolvedWorkflow, to: string): EvaluatedTransition {
  if (flow.transitions.length === 0) {
    const target = flow.statuses.find((s) => s.id === to);
    if (!target) throw new Error(`이 이슈 타입의 워크플로에 없는 상태입니다: ${to}`);
    return implicit(target, null);
  }
  let firstRejected: EvaluatedTransition | null = null;
  for (const t of flow.transitions) {
    if (t.to !== to || !(t.from.length === 0 || t.from.includes(issue.status))) continue;
    const evaluated = evaluateOne(data, t, flow, issue, null);
    if (evaluated.available) return evaluated;
    firstRejected ??= evaluated;
  }
  if (firstRejected) throw new Error(firstRejected.reason ?? "");
  throw new Error(`${statusName(flow, issue.status)}에서 ${statusName(flow, to)}로 옮길 수 없습니다`);
}

/** 전환 id로 고르기 — 전환 실행 경로 */
function chooseById(data: JiraData, issue: Issue, flow: ResolvedWorkflow, transitionId: string): EvaluatedTransition {
  const id = transitionId.trim();
  if (flow.transitions.length === 0) {
    if (!id.startsWith(IMPLICIT_TRANSITION_PREFIX)) throw new Error(`없는 전환입니다: ${id}`);
    const target = flow.statuses.find((s) => s.id === id.slice(IMPLICIT_TRANSITION_PREFIX.length));
    if (!target) throw new Error(`없는 전환입니다: ${id}`);
    return implicit(target, null);
  }
  const t = flow.transitions.find(
    (x) => x.id === id || (!x.id?.trim() && id === `${IMPLICIT_TRANSITION_PREFIX}${x.to}`),
  );
  if (!t) throw new Error(`없는 전환입니다: ${id}`);
  if (!(t.from.length === 0 || t.from.includes(issue.status))) {
    throw new Error(`지금 상태(${statusName(flow, issue.status)})에서는 할 수 없는 전환입니다: ${transitionName(t, flow)}`);
  }
  const evaluated = evaluateOne(data, t, flow, issue, null);
  if (!evaluated.available) throw new Error(evaluated.reason ?? "");
  return evaluated;
}

/** 검증 필드에 값이 있나 — 서버 `WorkflowEngine.present` */
function present(field: string, issue: Issue): boolean {
  switch (field) {
    case "description":
      return htmlToText(issue.description ?? "").trim() !== "";
    case "assignee":
      return issue.assigneeId !== null;
    case "labels":
      return issue.labels.length > 0;
    case "components":
      return (issue.componentIds ?? []).length > 0;
    case "parent":
      return issue.parentId !== null;
    case "sprint":
      return issue.sprintId !== null;
    case "dueDate":
      return issue.dueDate !== null;
    case "fixVersion":
      return issue.fixVersionId !== null;
    case "estimate":
      return issue.estimateHours !== null;
    default:
      return true;
  }
}

/** "담당자는 필수입니다" — 생성 필수 검사와 같은 문구(받침으로 은/는) */
export function requiredMessage(field: string): string {
  const name = (ISSUE_FIELD_NAMES as Record<string, string>)[field] ?? field;
  const code = name.charCodeAt(name.length - 1);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${name}${hasFinal ? "은" : "는"} 필수입니다`;
}

export function assertValidators(used: EvaluatedTransition | null, issue: Issue): void {
  for (const field of used?.transition?.validators ?? []) {
    if (!present(field, issue)) throw new Error(requiredMessage(field));
  }
}

function missingFields(used: EvaluatedTransition, issue: Issue): string[] {
  return (used.transition?.validators ?? []).filter((field) => !present(field, issue));
}

/** 고정 후처리 — 담당자를 실행자로·비우기. 담당자가 바뀌었으면 true(버전을 올린다) */
export function applyPostFunctions(used: EvaluatedTransition | null, issue: Issue): boolean {
  const before = issue.assigneeId;
  for (const f of used?.transition?.postFunctions ?? []) {
    if (f.type === "assignToActor") issue.assigneeId = CURRENT_USER_ID;
    else if (f.type === "clearAssignee") issue.assigneeId = null;
  }
  return before !== issue.assigneeId;
}

const RESOLUTION_FROM_SERVER: Record<ServerResolution, IssueResolution> = {
  DONE: "done",
  WONT_DO: "wont_do",
  DUPLICATE: "duplicate",
  CANNOT_REPRODUCE: "cannot_reproduce",
};

/** 후처리 setResolution이 있으면 그 값, 없으면 null(= 규칙 기본값 "done") */
export function defaultResolution(used: EvaluatedTransition | null): IssueResolution | null {
  const f = used?.transition?.postFunctions?.find((p) => p.type === "setResolution" && p.value);
  return f?.value ? (RESOLUTION_FROM_SERVER[f.value] ?? null) : null;
}

/**
 * 상태 검사 — 프로젝트에 없으면 "프로젝트에 없는 상태", 프로젝트에는 있지만 타입 워크플로(C5)에 없으면
 * "이 이슈 타입의 워크플로에 없는 상태"(서버 `SchemeService.assertValidStatus`와 같은 문구).
 */
export function assertStatusInWorkflow(data: JiraData, projectId: string, typeId: string | null, statusId: string): void {
  const body = resolvedBody(data, projectId);
  const all = enrichStatuses(data, body.statuses);
  const found = all.find((s) => s.id === statusId);
  if (!found) throw new Error(`이 프로젝트에 없는 상태입니다: ${statusId}`);
  if (typeId && !workflowForBody(data, body, typeId).statuses.some((s) => s.id === statusId)) {
    throw new Error(`이 이슈 타입의 워크플로에 없는 상태입니다: ${found.name}`);
  }
}

/** 워크플로(타입별이 있으면 그것)의 첫 '할 일' 의미 상태 — 없으면 첫 상태 */
export function defaultStatusFor(data: JiraData, projectId: string, typeId: string | null): string {
  const statuses = workflowFor(data, projectId, typeId).statuses;
  return statuses.find((s) => s.kind === "new")?.id ?? statuses[0]?.id ?? "todo";
}

/**
 * 워크플로 밖 상태를 옮길 곳 — 설정 변경 이관과 같은 규칙: 같은 카테고리의 첫 상태 → 같은 의미의 첫 상태 → 첫 상태.
 */
export function mappedStatus(data: JiraData, projectId: string, statusId: string, target: WorkflowStatus[]): string {
  const previous = enrichStatuses(data, resolvedBody(data, projectId).statuses).find((s) => s.id === statusId);
  const oldCategory = previous?.category ?? statusId;
  const oldKind = previous?.kind ?? statusKindOf(data, projectId, statusId);
  return (
    target.find((s) => s.category === oldCategory) ??
    target.find((s) => s.kind === oldKind) ??
    target[0]
  )?.id ?? statusId;
}

// ── 공개 함수 ────────────────────────────────────────────────

/** 가용 전환 — `GET /api/alm/issues/{id}/transitions`와 같은 모양 */
export async function listIssueTransitions(issueId: string): Promise<IssueTransitions> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new ApiError(404, "이슈를 찾을 수 없습니다");
  const flow = workflowFor(data, issue.projectId, issue.type);
  const transitions: IssueTransitionOption[] = evaluateTransitions(data, issue, flow).map((e) => {
    const target = flow.statuses.find((s) => s.id === e.to);
    const screenFields = e.transition?.screenFields ?? [];
    return {
      id: e.id,
      name: e.name,
      to: e.to,
      toName: target?.name ?? e.to,
      toKind: target?.kind ?? null,
      toIcon: target?.icon ?? null,
      isGlobal: e.global,
      available: e.available,
      unavailableReason: e.reason,
      hasScreen: screenFields.length > 0,
      screenFields: [...screenFields],
      requiredFields: [...(e.transition?.validators ?? [])],
      missingFields: missingFields(e, issue),
    };
  });
  return clone({ issueId: issue.id, status: issue.status, version: issue.version, typeWorkflow: flow.typeSpecific, transitions });
}

const SCREEN_FIELD_LABELS: Record<string, string> = {
  resolution: "해결",
  assignee: "담당자",
  fixVersion: "수정 버전",
  dueDate: "마감일",
};

/**
 * 전환 실행 — 조건 → 화면 값 반영 → 상태 + 해결 규칙 → 검증 → 후처리 → 코멘트(서버와 같은 순서).
 * 어느 단계에서 거부돼도 아무것도 남지 않는다(작업 사본에서 검사한 뒤 반영한다).
 */
export async function transitionIssue(issueId: string, request: TransitionRequest): Promise<import("../types").Issue> {
  const data = load();
  const stored = data.issues.find((i) => i.id === issueId);
  if (!stored) throw new ApiError(404, "이슈를 찾을 수 없습니다");
  assertCanEdit(data, stored.projectId);
  if (request.expectedVersion !== undefined && stored.version !== request.expectedVersion) {
    throw new ApiError(409, `다른 사용자가 먼저 이슈를 수정했습니다. 현재 ${stored.version}, 요청 ${request.expectedVersion}`);
  }
  const flow = workflowFor(data, stored.projectId, stored.type);
  const used = chooseById(data, stored, flow, request.transitionId);
  const fields = request.fields ?? {};
  const screen = used.transition?.screenFields ?? [];
  const sent: [string, boolean][] = [
    ["resolution", "resolution" in fields],
    ["assignee", "assigneeId" in fields],
    ["fixVersion", "fixVersionId" in fields],
    ["dueDate", "dueDate" in fields],
  ];
  for (const [field, isSent] of sent) {
    if (isSent && !(screen as string[]).includes(field)) {
      throw new Error(`이 전환 화면에 없는 칸입니다: ${SCREEN_FIELD_LABELS[field]}`);
    }
  }
  const comment = request.comment?.trim() ?? "";
  if (comment && !(screen as string[]).includes("comment")) throw new Error("이 전환 화면에는 코멘트 칸이 없습니다");

  const before = { ...stored, labels: [...stored.labels] };
  const issue: Issue = { ...stored, labels: [...stored.labels] };
  if ("assigneeId" in fields) issue.assigneeId = fields.assigneeId ?? null;
  if ("dueDate" in fields) issue.dueDate = fields.dueDate ?? null;
  if ("fixVersionId" in fields) {
    const versionId = fields.fixVersionId ?? null;
    if (versionId && versionId !== issue.fixVersionId) assertVersionAssignable(data, versionId, issue.projectId);
    issue.fixVersionId = versionId;
  }
  issue.status = used.to;
  applyResolutionRule(
    data,
    issue,
    before.status,
    "resolution" in fields ? (fields.resolution ?? null) : undefined,
    defaultResolution(used),
  );
  assertValidators(used, issue);
  applyPostFunctions(used, issue);
  if (before.status !== issue.status) {
    // 상태가 바뀌면 대상 그룹 맨 뒤로(PUT 수정과 같다)
    const maxOrder = data.issues
      .filter((i) => i.id !== issue.id && i.projectId === issue.projectId && i.sprintId === issue.sprintId && i.status === issue.status)
      .reduce((max, i) => Math.max(max, i.order), 0);
    issue.order = maxOrder + 1;
  }
  // 편집 폼이 보는 값이 바뀌었으면 버전을 올린다 — 상태·해결만 바뀐 전환은 보드 이동처럼 그대로
  if (before.assigneeId !== issue.assigneeId || before.fixVersionId !== issue.fixVersionId || before.dueDate !== issue.dueDate) {
    issue.version += 1;
  }
  issue.updatedAt = new Date().toISOString();
  const automationBefore = snapshotForAutomation(before);
  Object.assign(stored, issue);
  recordChanges(data, before, stored, stored.updatedAt);
  if (comment) addCommentInternal(data, stored, comment);
  persist();
  emitIssueEvent(stored.id, automationBefore, used.transition ? used.id : null);
  return clone(stored);
}
