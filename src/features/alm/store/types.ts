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

/**
 * 상태 카테고리 — 워크플로 커스텀 상태(WorkflowStatus)가 반드시 소속되는 3분류.
 * 통계/색/완료 판정은 전부 카테고리 기준이다. (커스텀 상태 도입 후에도 불변)
 */
export type IssueStatus = "todo" | "inprogress" | "done";
export type IssuePriority = "high" | "medium" | "low";
export type IssueType = "task" | "story" | "bug" | "epic" | "subtask";

export interface Issue {
  id: string;
  key: string; // "ALM-1", 불변, 재사용 금지
  projectId: string;
  title: string;
  description: string;
  type: IssueType;
  /** WorkflowStatus.id 참조 — 기본 상태 id는 카테고리 값("todo" 등)과 동일 */
  status: string;
  priority: IssuePriority;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null; // null = 백로그
  /**
   * 부모 이슈 (지라 최신 모델의 단일 parent — 2단계 계층):
   * 에픽은 parent 불가 / 일반 이슈(작업·스토리·버그) parent = 에픽만 / 하위 작업 parent = 일반 이슈만
   */
  parentId: string | null;
  dueDate: string | null; // "YYYY-MM-DD", null = 미지정
  /** 예상 시간(h, 소수 허용) — 워크로그 합계와 함께 진행률을 만든다 */
  estimateHours: number | null;
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
    | "issuetype"
    | "parent"
    | "link"
    | "worklog";
  detail: string; // 예: "할 일 → 진행 중"
  at: string;
}

export type BoardType = "scrum" | "kanban";
export type BoardSwimlane = "none" | "assignee" | "epic";

export interface BoardColumn {
  /** WorkflowStatus.id 참조 — 실제 컬럼 구성은 프로젝트 상태 목록에서 파생된다 */
  status: string;
  name: string; // 표시 이름 (기본: 상태 이름)
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

/** 워크플로 상태 — id는 불변(이슈가 참조), category가 색/완료 판정을 결정한다 */
export interface WorkflowStatus {
  id: string;
  name: string;
  category: IssueStatus; // "todo" | "inprogress" | "done"
  order: number;
}

/** 설정 본문 — 스킴과 프로젝트 커스텀이 같은 형태를 공유한다 */
export interface SettingsBody {
  statuses: WorkflowStatus[];
  /** 프로젝트에서 쓸 이슈 타입 — subtask는 항상 포함 */
  enabledTypes: IssueType[];
}

/** 지라식 설정 스킴 — 전역 관리가 정의하고 프로젝트에 배정한다 */
export interface SettingsScheme {
  id: string;
  name: string;
  isDefault: boolean; // 새 프로젝트 자동 배정, 삭제 불가
  body: SettingsBody;
}

export interface ProjectSettingsEntry {
  projectId: string;
  schemeId: string; // 배정된 스킴 (커스텀 중에도 복귀 대상으로 유지)
  custom: SettingsBody | null; // null = 스킴 사용
}

/** 작업 시간 기록 — 시간(h) 단위, 소수 허용 */
export interface Worklog {
  id: string;
  issueId: string;
  authorId: string;
  hours: number; // > 0
  comment: string;
  workedOn: string; // "YYYY-MM-DD" 작업일
  at: string; // 기록 시각(ISO)
}

export type IssueLinkType = "blocks" | "relates";

/**
 * 이슈 링크 — blocks: source가 target을 차단(방향 있음), relates: 양방향(레코드 1개).
 */
export interface IssueLink {
  id: string;
  sourceId: string;
  targetId: string;
  type: IssueLinkType;
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
  links: IssueLink[];
  worklogs: Worklog[];
  schemes: SettingsScheme[];
  projectSettings: ProjectSettingsEntry[];
  /** projectId → 마지막 발급 이슈 번호 (삭제돼도 감소하지 않는다) */
  issueCounters: Record<string, number>;
}
