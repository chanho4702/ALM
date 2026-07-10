export interface User {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  key: string; // "ALM" 같은 대문자 접두어
  name: string;
  createdAt: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string; // "Sprint N" 자동 명명
  state: "planned" | "active" | "done";
  startedAt?: string;
  completedAt?: string;
}

export type IssueStatus = "todo" | "inprogress" | "done";
export type IssuePriority = "high" | "medium" | "low";

export interface Issue {
  id: string;
  key: string; // "ALM-1", 불변, 재사용 금지
  projectId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null; // null = 백로그
  order: number; // 컬럼/목록 내 정렬
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  issueId: string;
  actorId: string;
  type: "created" | "status" | "assignee" | "priority" | "sprint";
  detail: string; // 예: "할 일 → 진행 중"
  at: string;
}

/** localStorage `alm.jira.v1`에 저장되는 루트 구조 */
export interface JiraData {
  users: User[];
  projects: Project[];
  sprints: Sprint[];
  issues: Issue[];
  comments: Comment[];
  activities: Activity[];
  /** projectId → 마지막 발급 이슈 번호 (삭제돼도 감소하지 않는다) */
  issueCounters: Record<string, number>;
}
