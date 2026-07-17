import type {
  Activity,
  Board,
  BoardType,
  Comment,
  Issue,
  IssueLink,
  IssueLinkType,
  IssuePriority,
  IssueStatus,
  IssueType,
  JiraData,
  Notification,
  Project,
  Sprint,
  User,
} from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";
import type { IssueQuery } from "./searchQuery";
import { getTemplate } from "./projectTemplates";
import type { ProjectTemplateId } from "./projectTemplates";

const STORAGE_KEY = "alm.jira.v1";

let cache: JiraData | null = null;

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
  }
  data.notifications ??= [];
  data.boards ??= [];
  data.links ??= [];
  // 보드가 없는 프로젝트에는 기본 스크럼 보드를 만들어 기존 데이터/URL과 호환한다
  for (const project of data.projects) {
    if (!data.boards.some((b) => b.projectId === project.id)) {
      data.boards.push(defaultBoard(project.id));
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
  data.issueCounters[project.id] = 0;

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
  const issueIds = new Set(data.issues.filter((i) => i.projectId === id).map((i) => i.id));
  data.projects.splice(index, 1);
  data.sprints = data.sprints.filter((s) => s.projectId !== id);
  data.issues = data.issues.filter((i) => i.projectId !== id);
  data.comments = data.comments.filter((c) => !issueIds.has(c.issueId));
  data.activities = data.activities.filter((a) => !issueIds.has(a.issueId));
  data.notifications = data.notifications.filter((n) => !issueIds.has(n.issueId));
  data.boards = data.boards.filter((b) => b.projectId !== id);
  data.links = data.links.filter((l) => !issueIds.has(l.sourceId) && !issueIds.has(l.targetId));
  delete data.issueCounters[id];
  persist();
}

// ── 라벨 매핑 (활동로그 detail용) ─────────────────────────────

const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "할 일",
  inprogress: "진행 중",
  done: "완료",
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
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

function sprintLabel(data: JiraData, sprintId: string | null): string {
  if (!sprintId) return "백로그";
  return data.sprints.find((s) => s.id === sprintId)?.name ?? "백로그";
}

/** 활동로그 부수효과: before/after를 비교해 변경 항목별 Activity를 쌓는다 */
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
    push("status", `${STATUS_LABELS[before.status]} → ${STATUS_LABELS[after.status]}`);
  }
  if (before.assigneeId !== after.assigneeId) {
    push("assignee", `${userLabel(data, before.assigneeId)} → ${userLabel(data, after.assigneeId)}`);
  }
  if (before.priority !== after.priority) {
    push("priority", `${PRIORITY_LABELS[before.priority]} → ${PRIORITY_LABELS[after.priority]}`);
  }
  if (before.sprintId !== after.sprintId) {
    push("sprint", `${sprintLabel(data, before.sprintId)} → ${sprintLabel(data, after.sprintId)}`);
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
      `${actorName} 님이 ${after.key}를 ${STATUS_LABELS[after.status]}(으)로 옮겼습니다`,
    );
  }
}

// ── sprints ──────────────────────────────────────────────────

export async function listSprints(projectId: string): Promise<Sprint[]> {
  return clone(load().sprints.filter((s) => s.projectId === projectId));
}

export async function createSprint(projectId: string): Promise<Sprint> {
  const data = load();
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

export async function startSprint(id: string): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  if (sprint.state !== "planned") throw new Error("계획 상태의 스프린트만 시작할 수 있습니다");
  if (data.sprints.some((s) => s.projectId === sprint.projectId && s.state === "active")) {
    throw new Error("이미 진행 중인 스프린트가 있습니다");
  }
  sprint.state = "active";
  sprint.startedAt = new Date().toISOString();
  persist();
  return clone(sprint);
}

export async function completeSprint(id: string): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  if (sprint.state !== "active") throw new Error("진행 중인 스프린트만 완료할 수 있습니다");
  const now = new Date().toISOString();
  for (const issue of data.issues) {
    if (issue.sprintId === id && issue.status !== "done") {
      issue.sprintId = null; // 미완료 이슈는 백로그로
      issue.updatedAt = now;
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
    status?: IssueStatus;
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
  let issues = [...load().issues];
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
  if (query.statuses.length > 0) issues = issues.filter((i) => query.statuses.includes(i.status));
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
  status?: IssueStatus;
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
    type: input.type ?? "task",
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    assigneeId: input.assigneeId ?? null,
    reporterId: CURRENT_USER_ID,
    sprintId: input.sprintId ?? null,
    parentId: null, // 계층 검증 후 아래에서 지정
    dueDate: input.dueDate ?? null,
    labels: input.labels ?? [],
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  if (input.parentId) {
    assertParentAllowed(data, issue, input.parentId);
    issue.parentId = input.parentId;
  }
  data.issues.push(issue);
  data.activities.push({
    id: nextId(),
    issueId: issue.id,
    actorId: CURRENT_USER_ID,
    type: "created",
    detail: "이슈 생성",
    at: now,
  });
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
    >
  >,
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  const before = { ...issue, labels: [...issue.labels] };
  // 타입 전환 정합성: 자식이 있는데 규칙 위반 타입이 되면 거부, 자신의 parent가 위반되면 자동 해제
  if (patch.type !== undefined && patch.type !== issue.type) {
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
  Object.assign(issue, patch);
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
  to: { status: IssueStatus; beforeId?: string },
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  const before = { ...issue };
  issue.status = to.status;
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
  data.issues.splice(index, 1);
  data.comments = data.comments.filter((c) => c.issueId !== id);
  data.activities = data.activities.filter((a) => a.issueId !== id);
  data.notifications = data.notifications.filter((n) => n.issueId !== id);
  data.links = data.links.filter((l) => l.sourceId !== id && l.targetId !== id);
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
function validateColumns(columns: Board["columns"]): void {
  const statuses = columns.map((c) => c.status).sort();
  if (columns.length !== 3 || statuses.join() !== ["done", "inprogress", "todo"].join()) {
    throw new Error("컬럼은 할 일/진행 중/완료 각 1개여야 합니다");
  }
  for (const column of columns) {
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

export async function listActivity(issueId: string): Promise<Activity[]> {
  return clone(
    load()
      .activities.filter((a) => a.issueId === issueId)
      .sort((a, b) => a.at.localeCompare(b.at)),
  );
}
