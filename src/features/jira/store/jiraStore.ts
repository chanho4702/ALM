import type {
  Activity,
  Comment,
  Issue,
  IssuePriority,
  IssueStatus,
  JiraData,
  Project,
  Sprint,
  User,
} from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";

const STORAGE_KEY = "alm.jira.v1";

let cache: JiraData | null = null;

function load(): JiraData {
  if (cache) return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      cache = JSON.parse(raw) as JiraData;
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

export async function createProject(input: { key: string; name: string }): Promise<Project> {
  const data = load();
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!key) throw new Error("프로젝트 키를 입력하세요");
  if (!name) throw new Error("프로젝트 이름을 입력하세요");
  if (data.projects.some((p) => p.key === key)) {
    throw new Error(`이미 존재하는 프로젝트 키입니다: ${key}`);
  }
  const project: Project = { id: nextId(), key, name, createdAt: new Date().toISOString() };
  data.projects.push(project);
  data.issueCounters[project.id] = 0;
  persist();
  return clone(project);
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
  },
): Promise<Issue[]> {
  let issues = load().issues.filter((i) => i.projectId === projectId);
  if (filter?.text) {
    const text = filter.text.toLowerCase();
    issues = issues.filter(
      (i) => i.title.toLowerCase().includes(text) || i.key.toLowerCase().includes(text),
    );
  }
  if (filter?.status) issues = issues.filter((i) => i.status === filter.status);
  if (filter?.priority) issues = issues.filter((i) => i.priority === filter.priority);
  if (filter?.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
  return clone([...issues].sort((a, b) => a.order - b.order));
}

export async function getIssueByKey(key: string): Promise<Issue | null> {
  const issue = load().issues.find((i) => i.key === key);
  return issue ? clone(issue) : null;
}

export async function createIssue(input: {
  projectId: string;
  title: string;
  description?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
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
    status: "todo",
    priority: input.priority ?? "medium",
    assigneeId: input.assigneeId ?? null,
    reporterId: CURRENT_USER_ID,
    sprintId: input.sprintId ?? null,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
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
    Pick<Issue, "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">
  >,
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  const before = { ...issue };
  Object.assign(issue, patch);
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

export async function deleteIssue(id: string): Promise<void> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  data.issues.splice(index, 1);
  data.comments = data.comments.filter((c) => c.issueId !== id);
  data.activities = data.activities.filter((a) => a.issueId !== id);
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
  persist();
  return clone(comment);
}

export async function listActivity(issueId: string): Promise<Activity[]> {
  return clone(
    load()
      .activities.filter((a) => a.issueId === issueId)
      .sort((a, b) => a.at.localeCompare(b.at)),
  );
}
