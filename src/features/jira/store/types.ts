export interface User {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  key: string; // "ALM" 같은 대문자 접두어 — 생성 후 불변 (이슈 키 접두어 보전)
  name: string;
  description: string;
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
export type IssueType = "task" | "story" | "bug" | "epic";

export interface Issue {
  id: string;
  key: string; // "ALM-1", 불변, 재사용 금지
  projectId: string;
  title: string;
  description: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null; // null = 백로그
  dueDate: string | null; // "YYYY-MM-DD", null = 미지정
  labels: string[]; // 자유 문자열 라벨
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
  updatedAt?: string; // 수정된 댓글만 값 존재 ("수정됨" 표시 근거)
}

export interface Activity {
  id: string;
  issueId: string;
  actorId: string;
  type:
    | "created"
    | "status"
    | "assignee"
    | "priority"
    | "sprint"
    | "duedate"
    | "labels"
    | "issuetype";
  detail: string; // 예: "할 일 → 진행 중"
  at: string;
}

export type BoardType = "scrum" | "kanban";
export type BoardSwimlane = "none" | "assignee";

export interface BoardColumn {
  status: IssueStatus; // 3개 고정 (todo/inprogress/done 각 1개)
  name: string; // 표시 이름 (기본: 할 일/진행 중/완료)
  wipLimit: number | null; // null = 제한 없음
}

/** 보드 저장 필터 — 빈 배열 = 전체. assigneeIds의 "unassigned" = 미지정 매치 */
export interface BoardFilter {
  assigneeIds: string[];
  types: IssueType[];
  labels: string[];
}

/**
 * 보드 = "보는 방법"만 저장하는 필터 뷰 (지라와 동일 철학).
 * 이슈/스프린트는 계속 프로젝트 소속이다.
 */
export interface Board {
  id: string;
  projectId: string;
  name: string;
  type: BoardType; // scrum = 활성 스프린트 이슈, kanban = 스프린트 무관 전체
  filter: BoardFilter;
  columns: BoardColumn[]; // 항상 길이 3, status 순서 고정
  swimlane: BoardSwimlane; // 기본 스윔레인 (화면에서 임시 전환 가능)
  isDefault: boolean; // 뷰 탭 "보드"가 여는 보드
  createdAt: string;
}

/** 사용자에게 전달되는 알림 — 본인 액션은 알리지 않는다 (지라와 동일) */
export interface Notification {
  id: string;
  /** 수신자 */
  userId: string;
  issueId: string;
  issueKey: string;
  /** 행위자 */
  actorId: string;
  message: string;
  at: string;
  read: boolean;
}

/** localStorage `alm.jira.v1`에 저장되는 루트 구조 */
export interface JiraData {
  users: User[];
  projects: Project[];
  sprints: Sprint[];
  issues: Issue[];
  comments: Comment[];
  activities: Activity[];
  notifications: Notification[];
  boards: Board[];
  /** projectId → 마지막 발급 이슈 번호 (삭제돼도 감소하지 않는다) */
  issueCounters: Record<string, number>;
}
