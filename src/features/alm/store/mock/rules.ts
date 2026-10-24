// localStorage 목업 스토어 — rules (jiraMock.ts에서 분할, 동작 불변)
import { type IssuePriority, type IssueResolution, type IssueTypeDef, type JiraData, type IssueTypeLevel, type PriorityDef, type LinkTypeDef, type SettingsBody, type Issue, type WorkflowLayout, WORKFLOW_ANY_NODE, type WorkflowTransition, type StatusKind, type ChangeField, type Activity, type UserPreferences } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { newMentionIds } from "../richText";
import { defaultSettingsBody, enrichStatuses, categoryById, nextId } from "./db";
import { preferencesOf } from "./personal";

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
export const BUILTIN_ISSUE_TYPES: IssueTypeDef[] = [
  { id: "task", name: "작업", icon: "check-square", color: "info", level: "standard", description: "", order: 1, builtIn: true },
  { id: "story", name: "스토리", icon: "bookmark", color: "success", level: "standard", description: "", order: 2, builtIn: true },
  { id: "bug", name: "버그", icon: "bug", color: "danger", level: "standard", description: "", order: 3, builtIn: true },
  { id: "epic", name: "에픽", icon: "zap", color: "warning", level: "epic", description: "", order: 4, builtIn: true },
  { id: "subtask", name: "하위 작업", icon: "list-tree", color: "neutral", level: "subtask", description: "", order: 5, builtIn: true },
];

export function typeDefOf(data: JiraData, id: string): IssueTypeDef | undefined {
  return data.issueTypes.find((t) => t.id === id) ?? BUILTIN_ISSUE_TYPES.find((t) => t.id === id);
}

/** 타입 id → 계층. 모르는 id는 일반으로 본다 */
export function typeLevelOf(data: JiraData, id: string): IssueTypeLevel {
  return typeDefOf(data, id)?.level ?? "standard";
}

/** 기본 우선순위 5단계(지라) — 순서 고정 삭제 불가, 이름·아이콘·색은 바꿀 수 있다 */
export const BUILTIN_PRIORITIES: PriorityDef[] = [
  { id: "highest", name: "최상", icon: "chevrons-up", color: "danger", description: "지금 당장 처리해야 한다", order: 1, builtIn: true },
  { id: "high", name: "높음", icon: "chevron-up", color: "danger", description: "다른 일보다 먼저 처리한다", order: 2, builtIn: true },
  { id: "medium", name: "보통", icon: "equal", color: "warning", description: "순서대로 처리한다", order: 3, builtIn: true },
  { id: "low", name: "낮음", icon: "chevron-down", color: "info", description: "여유가 있을 때 처리한다", order: 4, builtIn: true },
  { id: "lowest", name: "최하", icon: "chevrons-down", color: "neutral", description: "미뤄도 된다", order: 5, builtIn: true },
];

/** 기본 링크 타입 5종(지라) — outward/inward가 같으면 대칭 */
export const BUILTIN_LINK_TYPES: LinkTypeDef[] = [
  { id: "blocks", name: "차단", outward: "차단함", inward: "차단됨", order: 1, builtIn: true },
  { id: "relates", name: "관련", outward: "관련됨", inward: "관련됨", order: 2, builtIn: true },
  { id: "duplicates", name: "중복", outward: "중복함", inward: "중복됨", order: 3, builtIn: true },
  { id: "causes", name: "원인", outward: "원인임", inward: "결과임", order: 4, builtIn: true },
  { id: "clones", name: "복제", outward: "복제함", inward: "복제됨", order: 5, builtIn: true },
];

export function linkTypeDefOf(data: JiraData, id: string): LinkTypeDef | undefined {
  return data.linkTypes.find((t) => t.id === id) ?? BUILTIN_LINK_TYPES.find((t) => t.id === id);
}

export const isSymmetric = (def: LinkTypeDef) => def.outward === def.inward;

export function priorityDefOf(data: JiraData, id: string): PriorityDef | undefined {
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
export function resolvePriority(data: JiraData, projectId: string, requested: string | null | undefined): string {
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

export function typeNameOf(data: JiraData, id: string): string {
  return typeDefOf(data, id)?.name ?? id;
}

/**
 * 2단계 계층 규칙 — 위반이면 throw.
 * 에픽: parent 불가 / 하위 작업: parent = 일반 이슈만 / 일반 이슈: parent = 에픽만.
 */
export function assertParentAllowed(data: JiraData, issue: Issue, parentId: string | null): void {
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

export function userLabel(data: JiraData, userId: string | null): string {
  if (!userId) return "미지정";
  return data.users.find((u) => u.id === userId)?.name ?? "미지정";
}

function versionLabel(data: JiraData, versionId: string | null): string {
  if (!versionId) return "없음";
  return data.versions.find((v) => v.id === versionId)?.name ?? "없음";
}

/** 이슈에 달 수 있는 버전인지 — 같은 프로젝트이고 보관되지 않았어야 한다 */
export function assertVersionAssignable(data: JiraData, versionId: string, projectId: string): void {
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
export function resolvedBody(data: JiraData, projectId: string): SettingsBody {
  const entry = data.projectSettings.find((e) => e.projectId === projectId);
  const scheme =
    data.schemes.find((s) => s.id === entry?.schemeId) ?? data.schemes.find((s) => s.isDefault);
  return entry?.custom ?? scheme?.body ?? defaultSettingsBody();
}

/** 프로젝트의 해석된 상태 목록 */
export function resolvedStatuses(data: JiraData, projectId: string): SettingsBody["statuses"] {
  return enrichStatuses(data, resolvedBody(data, projectId).statuses);
}

function statusNameOf(data: JiraData, projectId: string, statusId: string): string {
  return resolvedStatuses(data, projectId).find((s) => s.id === statusId)?.name ?? statusId;
}

/**
 * 없는 상태를 가리키는 전이는 남기지 않는다 — 상태를 지우면 그 전이도 함께 사라진다.
 * 원래 전역 전이(from 비었음)는 그대로 두고, from을 전부 잃은 전이만 버린다.
 */
/** 빠진 상태의 노드 위치는 남기지 않는다 — 가상 "모든 상태" 노드는 유지 */
export function pruneLayout(body: SettingsBody): WorkflowLayout | undefined {
  if (!body.layout) return undefined;
  const valid = new Set(body.statuses.map((status) => status.id));
  valid.add(WORKFLOW_ANY_NODE);
  return Object.fromEntries(Object.entries(body.layout).filter(([id]) => valid.has(id)));
}

export function pruneTransitions(body: SettingsBody): WorkflowTransition[] | undefined {
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
 * 해결 규칙 — **서버 `ResolutionRule`이 정본**이고 이 함수는 같은 규칙의 목업 대역이다(2026-10-24 A1).
 * 완료 의미로 **들어가면** 기본값(후처리 setResolution 값, 없으면 "done"), 완료에서 **나가면** 비운다.
 * 완료 안에서 지정한 값은 그대로, `null`을 지정하면 기본값(완료 이슈는 해결이 비지 않는다).
 * 완료가 아닌 상태에 값을 지정하면 거부한다.
 *
 * @param explicit undefined = 지정 안 함. 수정(PUT) 경로는 **현재 값과 다를 때만** 지정으로 넘긴다
 *                 (화면이 들고 있던 값을 그대로 다시 보내므로 — 서버와 같은 판정)
 * @param defaultValue 완료로 들어갈 때의 기본값(전환 후처리 setResolution). null/undefined면 "done"
 */
export function applyResolutionRule(
  data: JiraData,
  issue: Issue,
  previousStatus: string,
  explicit: IssueResolution | null | undefined,
  defaultValue?: IssueResolution | null,
): void {
  const fallback = defaultValue ?? "done";
  const wasDone = statusKindOf(data, issue.projectId, previousStatus) === "complete";
  const isDone = statusKindOf(data, issue.projectId, issue.status) === "complete";
  if (!isDone) {
    if (explicit !== undefined && explicit !== null) {
      throw new Error("완료된 이슈에만 해결을 설정할 수 있습니다");
    }
    setResolution(issue, null);
    return;
  }
  if (explicit !== undefined) {
    setResolution(issue, explicit ?? fallback);
  } else if (!wasDone || issue.resolution === null) {
    setResolution(issue, fallback);
  }
}

/**
 * 해결을 바꾸는 **유일한 자리** — 해결 시각(`resolvedAt`)이 규칙과 갈라지지 않게 한 곳에 묶는다.
 * null→값이면 지금 시각을 찍고, 값→null이면 지운다. 값→다른 값은 처음 해결한 시각을 지킨다
 * (서버 `Issue.applyResolution`과 같은 규칙).
 */
function setResolution(issue: Issue, next: IssueResolution | null): void {
  const before = issue.resolution ?? null;
  issue.resolution = next;
  if (before === null && next !== null) issue.resolvedAt = new Date().toISOString();
  else if (next === null) issue.resolvedAt = null;
}

export function assertValidStatus(data: JiraData, projectId: string, statusId: string): void {
  if (!resolvedStatuses(data, projectId).some((s) => s.id === statusId)) {
    throw new Error(`이 프로젝트에 없는 상태입니다: ${statusId}`);
  }
}

export function statusKindOf(data: JiraData, projectId: string, statusId: string): StatusKind {
  const found = resolvedStatuses(data, projectId).find((s) => s.id === statusId);
  if (found) return found.kind ?? "new";
  return categoryById(data, statusId).kind; // 기본 id 폴백 (구버전 데이터)
}

/**
 * 구조화 변경 이력 — 사람이 읽는 활동로그(activities)와 별도로, 리포트가 집계하는 원천이다.
 * 서버 `issue_change_log`와 같은 모양이라 REST 전환 때 계약이 바뀌지 않는다.
 */
export function logChange(
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

export function recordChanges(data: JiraData, before: Issue, after: Issue, at: string): void {
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
export function addWatcher(data: JiraData, issueId: string, userId: string, at: string): void {
  if (!data.watchers.some((w) => w.issueId === issueId && w.userId === userId)) {
    data.watchers.push({ issueId, userId, createdAt: at });
  }
}

/** 알림 대상 = 워처 ∪ 담당자 − 행위자. 본인 행동은 본인에게 알리지 않는다 */
export function notificationRecipients(data: JiraData, issue: Issue, actorId: string): string[] {
  const set = new Set(data.watchers.filter((w) => w.issueId === issue.id).map((w) => w.userId));
  if (issue.assigneeId) set.add(issue.assigneeId);
  set.delete(actorId);
  return [...set];
}

type NotificationKind = keyof UserPreferences["notifications"];

const NOTIFICATION_TYPE_OF: Record<NotificationKind, NonNullable<import("../types").Notification["type"]>> = {
  assigned: "assigned",
  statusChanged: "status_changed",
  commented: "commented",
  mentioned: "mentioned",
};

export function pushNotification(
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
    // 인박스 필터(멘션·할당)가 종류로 거른다 — 서버 type의 소문자
    type: NOTIFICATION_TYPE_OF[kind],
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
export function notifyMentions(data: JiraData, issue: Issue, userIds: string[], where: string, at: string): void {
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
