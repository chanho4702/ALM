import type {
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
  IssueStatus,
  IssueType,
  JiraData,
  Notification,
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
import type { IssueQuery } from "./searchQuery";
import { getTemplate } from "./projectTemplates";
import type { ProjectTemplateId } from "./projectTemplates";

const STORAGE_KEY = "alm.jira.v1";

let cache: JiraData | null = null;

/** 디폴트 스킴 본문 — 상태 id를 기존 status 값과 동일하게 두어 저장 데이터와 100% 호환 */
function defaultSettingsBody(): SettingsBody {
  return {
    statuses: [
      { id: "todo", name: "할 일", category: "todo", order: 1 },
      { id: "inprogress", name: "진행 중", category: "inprogress", order: 2 },
      { id: "done", name: "완료", category: "done", order: 3 },
    ],
    enabledTypes: ["task", "story", "bug", "epic", "subtask"],
  };
}

function cloneBody(body: SettingsBody): SettingsBody {
  return {
    statuses: body.statuses.map((s) => ({ ...s })),
    enabledTypes: [...body.enabledTypes],
    ...(body.transitions
      ? { transitions: body.transitions.map((t) => ({ ...t, from: [...t.from] })) }
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
  }
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
  const defaultScheme = data.schemes.find((s) => s.isDefault)!;
  for (const project of data.projects) {
    if (!data.projectSettings.some((e) => e.projectId === project.id)) {
      data.projectSettings.push({ projectId: project.id, schemeId: defaultScheme.id, custom: null });
    }
  }
  // 해결 도입 전 데이터: 이미 완료 카테고리인 이슈는 "완료됨"으로 백필한다(설정 정규화 뒤에 판정)
  for (const issue of data.issues) {
    if (issue.resolution === null && statusCategoryOf(data, issue.projectId, issue.status) === "done") {
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
    cache = createSeedData();
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

export async function listUsers(): Promise<User[]> {
  return clone(load().users);
}

export async function getCurrentUser(): Promise<User> {
  const user = load().users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(user);
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
  return clone(project);
}

/** 키는 이슈 키 접두어라 불변 — 이름/설명만 수정 가능 */
export async function updateProject(
  id: string,
  patch: { name?: string; description?: string },
): Promise<Project> {
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
  persist();
  return clone(project);
}

/** 프로젝트의 스프린트·이슈·댓글·활동·이슈 카운터까지 연쇄 삭제한다 */
export async function deleteProject(id: string): Promise<void> {
  const data = load();
  const index = data.projects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, id);
  const issueIds = new Set(data.issues.filter((i) => i.projectId === id).map((i) => i.id));
  data.projects.splice(index, 1);
  data.sprints = data.sprints.filter((s) => s.projectId !== id);
  data.issues = data.issues.filter((i) => i.projectId !== id);
  data.comments = data.comments.filter((c) => !issueIds.has(c.issueId));
  data.activities = data.activities.filter((a) => !issueIds.has(a.issueId));
  data.notifications = data.notifications.filter((n) => !issueIds.has(n.issueId));
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

const TYPE_LABELS: Record<IssueType, string> = {
  task: "작업",
  story: "스토리",
  bug: "버그",
  epic: "에픽",
  subtask: "하위 작업",
};

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
    throw new Error("같은 프로젝트의 이슈만 부모로 지정할 수 있습니다");
  }
  if (issue.type === "epic") throw new Error("에픽은 부모를 가질 수 없습니다");
  if (issue.type === "subtask") {
    if (parent.type === "epic" || parent.type === "subtask") {
      throw new Error("하위 작업의 부모는 일반 이슈여야 합니다");
    }
    return;
  }
  if (parent.type !== "epic") throw new Error("일반 이슈의 부모는 에픽이어야 합니다");
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
  return resolvedBody(data, projectId).statuses;
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
  const wasDone = statusCategoryOf(data, issue.projectId, previousStatus) === "done";
  const isDone = statusCategoryOf(data, issue.projectId, issue.status) === "done";
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

function statusCategoryOf(data: JiraData, projectId: string, statusId: string): IssueStatus {
  const found = resolvedStatuses(data, projectId).find((s) => s.id === statusId);
  if (found) return found.category;
  return statusId === "inprogress" || statusId === "done" ? statusId : "todo";
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
    push("issuetype", `${TYPE_LABELS[before.type]} → ${TYPE_LABELS[after.type]}`);
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
function notifyIssueChanges(data: JiraData, before: Issue, after: Issue, at: string): void {
  const actorName = userLabel(data, CURRENT_USER_ID);
  const notify = (userId: string | null, message: string) => {
    if (!userId || userId === CURRENT_USER_ID) return;
    data.notifications.push({
      id: nextId(),
      userId,
      issueId: after.id,
      issueKey: after.key,
      actorId: CURRENT_USER_ID,
      message,
      at,
      read: false,
    });
  };
  if (before.assigneeId !== after.assigneeId) {
    notify(after.assigneeId, `${actorName} 님이 ${after.key}를 나에게 할당했습니다`);
  }
  if (before.status !== after.status) {
    notify(
      after.assigneeId,
      `${actorName} 님이 ${after.key}를 ${statusNameOf(data, after.projectId, after.status)}(으)로 옮겼습니다`,
    );
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
      .map((member) => ({
        user: data.users.find((u) => u.id === member.userId),
        role: member.role,
      }))
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
 * 쓰기 권한 가드 — 역할 계층은 org-service와 같다(뷰어 ⊂ 편집자 ⊂ 관리자).
 * 목업이 백엔드 대역이므로 여기서 막지 않으면 "뷰어 = 읽기만"이 화면의 빈말이 된다.
 * 서버 전환 후에는 org-service gRPC 판정이 이 자리를 대신한다.
 */
function assertCanEdit(data: JiraData, projectId: string): void {
  const role = myRole(data, projectId);
  if (role === null || role === "viewer") {
    throw new Error("이 프로젝트를 편집할 권한이 없습니다");
  }
}

function assertCanAdmin(data: JiraData, projectId: string): void {
  if (myRole(data, projectId) !== "admin") {
    throw new Error("프로젝트 관리자만 할 수 있습니다");
  }
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
        statusCategoryOf(data, issue.projectId, issue.status) !== "done"
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
    (i) => statusCategoryOf(data, i.projectId, i.status) === "done",
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
    if (issue.sprintId === id && statusCategoryOf(data, issue.projectId, issue.status) !== "done") {
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
        i.description.toLowerCase().includes(text),
    );
  }
  if (filter?.status) issues = issues.filter((i) => i.status === filter.status);
  if (filter?.priority) issues = issues.filter((i) => i.priority === filter.priority);
  if (filter?.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
  if (filter?.label) issues = issues.filter((i) => i.labels.includes(filter.label!));
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
        i.description.toLowerCase().includes(text),
    );
  }
  if (query.projectIds.length > 0) {
    issues = issues.filter((i) => query.projectIds.includes(i.projectId));
  }
  if (query.statuses.length > 0) {
    // 카테고리 기준 매치 — 프로젝트별 커스텀 상태도 카테고리로 걸린다
    issues = issues.filter((i) =>
      query.statuses.includes(statusCategoryOf(data, i.projectId, i.status)),
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
        i.description.toLowerCase().includes(query),
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
}): Promise<Issue> {
  const data = load();
  const project = data.projects.find((p) => p.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  const title = input.title.trim();
  if (!title) throw new Error("이슈 제목을 입력하세요");
  // 타입은 프로젝트 설정(enabledTypes)을 따른다 — 미지정이면 task, task가 꺼져 있으면 첫 활성 타입
  const settingsEntryForCreate = data.projectSettings.find((e) => e.projectId === project.id);
  const enabledTypes =
    settingsEntryForCreate?.custom?.enabledTypes ??
    data.schemes.find((s) => s.id === settingsEntryForCreate?.schemeId)?.body.enabledTypes ??
    defaultSettingsBody().enabledTypes;
  const resolvedType =
    input.type ?? (enabledTypes.includes("task") ? "task" : enabledTypes.find((t) => t !== "subtask")!);
  if (resolvedType !== "subtask" && !enabledTypes.includes(resolvedType)) {
    throw new Error(`이 프로젝트에서 사용할 수 없는 타입입니다: ${TYPE_LABELS[resolvedType]}`);
  }
  assertCanEdit(data, project.id);
  if (input.status !== undefined) assertValidStatus(data, project.id, input.status);
  const seq = (data.issueCounters[project.id] ?? 0) + 1;
  data.issueCounters[project.id] = seq; // 삭제돼도 감소하지 않는다 → 키 미재사용
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
        .find((s) => s.category === "todo")?.id ?? "todo"),
    priority: input.priority ?? "medium",
    assigneeId: input.assigneeId ?? null,
    reporterId: CURRENT_USER_ID,
    sprintId: input.sprintId ?? null,
    parentId: null, // 계층 검증 후 아래에서 지정
    dueDate: input.dueDate ?? null,
    estimateHours: null,
    resolution: null,
    fixVersionId: null,
    labels: input.labels ?? [],
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
  // 타입 전환 정합성: 자식이 있는데 규칙 위반 타입이 되면 거부, 자신의 parent가 위반되면 자동 해제
  if (patch.type !== undefined && patch.type !== issue.type) {
    // 프로젝트 설정(enabledTypes) 검증 — subtask는 계층 기능이라 예외
    const entry = data.projectSettings.find((e) => e.projectId === issue.projectId);
    const enabled =
      entry?.custom?.enabledTypes ??
      data.schemes.find((s) => s.id === entry?.schemeId)?.body.enabledTypes ??
      defaultSettingsBody().enabledTypes;
    if (patch.type !== "subtask" && !enabled.includes(patch.type)) {
      throw new Error(`이 프로젝트에서 사용할 수 없는 타입입니다: ${TYPE_LABELS[patch.type]}`);
    }
    const children = data.issues.filter((i) => i.parentId === issue.id);
    if (children.length > 0) {
      const childrenAllowed =
        patch.type === "epic"
          ? children.every((c) => c.type !== "subtask" && c.type !== "epic")
          : patch.type === "subtask"
            ? false // 하위 작업은 자식을 가질 수 없다
            : children.every((c) => c.type === "subtask");
      if (!childrenAllowed) throw new Error("하위 이슈가 있어 타입을 변경할 수 없습니다");
    }
  }
  const { resolution: explicitResolution, ...rest } = patch;
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
  const duplicate = data.links.some((l) => {
    if (l.type !== input.type) return false;
    if (l.sourceId === input.sourceId && l.targetId === input.targetId) return true;
    // relates는 양방향 — 무순서 중복도 막는다
    return input.type === "relates" && l.sourceId === input.targetId && l.targetId === input.sourceId;
  });
  if (duplicate) throw new Error("이미 연결돼 있습니다");
  const link: IssueLink = { id: nextId(), ...input };
  data.links.push(link);
  const at = new Date().toISOString();
  const label = input.type === "blocks" ? "차단" : "관련";
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
    const direction: IssueLinkView["direction"] =
      link.type === "relates" || link.sourceId === issueId ? "outward" : "inward";
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

export async function deleteIssue(id: string): Promise<void> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, data.issues[index].projectId);
  data.issues.splice(index, 1);
  data.comments = data.comments.filter((c) => c.issueId !== id);
  data.activities = data.activities.filter((a) => a.issueId !== id);
  data.notifications = data.notifications.filter((n) => n.issueId !== id);
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
  // 담당자에게 코멘트 알림 (본인 코멘트는 제외)
  const issue = data.issues.find((i) => i.id === issueId)!;
  if (issue.assigneeId && issue.assigneeId !== CURRENT_USER_ID) {
    data.notifications.push({
      id: nextId(),
      userId: issue.assigneeId,
      issueId: issue.id,
      issueKey: issue.key,
      actorId: CURRENT_USER_ID,
      message: `${userLabel(data, CURRENT_USER_ID)} 님이 ${issue.key}에 코멘트를 남겼습니다`,
      at: comment.createdAt,
      read: false,
    });
  }
  persist();
  return clone(comment);
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) throw new Error("본인 댓글만 수정할 수 있습니다");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  comment.body = trimmed;
  comment.updatedAt = new Date().toISOString();
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

/** 카테고리별 최소 1개·이름 유일/필수·subtask 고정 + 비-subtask 최소 1개 */
function validateSettingsBody(body: SettingsBody): void {
  const names = new Set<string>();
  for (const status of body.statuses) {
    const name = status.name.trim();
    if (!name) throw new Error("상태 이름을 입력하세요");
    if (names.has(name)) throw new Error(`상태 이름이 중복됩니다: ${name}`);
    names.add(name);
  }
  for (const category of ["todo", "inprogress", "done"] as const) {
    if (!body.statuses.some((s) => s.category === category)) {
      throw new Error("카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다");
    }
  }
  if (!body.enabledTypes.includes("subtask")) {
    throw new Error("하위 작업 타입은 비활성화할 수 없습니다");
  }
  if (!body.enabledTypes.some((t) => t !== "subtask")) {
    throw new Error("이슈 타입은 최소 1개 활성화해야 합니다");
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
    body: entry.custom ?? scheme.body,
    source: entry.custom ? ("custom" as const) : ("scheme" as const),
    scheme,
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

/** 전 스킴+커스텀의 상태 합집합 (id 유일) — 스마트 검색 상태 이름 매칭용 */
export async function listAllStatuses(): Promise<{ id: string; name: string }[]> {
  const data = load();
  const map = new Map<string, string>();
  for (const scheme of data.schemes) {
    for (const s of scheme.body.statuses) map.set(s.id, s.name);
  }
  for (const entry of data.projectSettings) {
    for (const s of entry.custom?.statuses ?? []) map.set(s.id, s.name);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export async function listSchemes(): Promise<SettingsScheme[]> {
  return clone(load().schemes);
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
  return clone(scheme);
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
    validateSettingsBody(patch.body);
    const sharedProjects = data.projectSettings
      .filter((e) => e.schemeId === id && e.custom === null)
      .map((e) => e.projectId);
    migrateIssueStatuses(data, sharedProjects, patch.body);
    scheme.body = cloneBody({ ...patch.body, transitions: pruneTransitions(patch.body) });
  }
  persist();
  return clone(scheme);
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
  const sorted = [...newBody.statuses].sort((a, b) => a.order - b.order);
  const at = new Date().toISOString();
  for (const issue of data.issues) {
    if (!targets.has(issue.projectId) || valid.has(issue.status)) continue;
    const oldCategory = statusCategoryOf(data, issue.projectId, issue.status);
    const fallback = sorted.find((s) => s.category === oldCategory) ?? sorted[0];
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
  validateSettingsBody(body);
  migrateIssueStatuses(data, [projectId], body);
  entry.custom = cloneBody({ ...body, transitions: pruneTransitions(body) });
  persist();
}

// ── boards ───────────────────────────────────────────────────

/** 기본 보드 우선, 이후 생성순 */
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
