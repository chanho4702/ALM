export interface User {
  id: string;
  name: string;
}

/** 담당자 없이 만든 이슈의 담당자 — 미지정 또는 프로젝트 리더(지라 "기본 담당자") */
export type ProjectDefaultAssignee = "unassigned" | "lead";

export interface Project {
  id: string;
  key: string; // "ALM" 같은 대문자 접두어 — 생성 후 불변 (이슈 키 접두어 보전)
  name: string;
  description: string;
  /** 지라 프로젝트 설정 > 세부: 범주·리더·기본 담당자·아이콘·색·URL */
  category: string;
  leadId: string | null;
  defaultAssignee: ProjectDefaultAssignee;
  icon: string; // typeIcons 키, "" = 키 이니셜
  color: string; // 색 이름(typeAppearance 팔레트), "" = 키 해시 색
  url: string;
  /** 보관(읽기 전용) 시각 — null/없음이면 활성 */
  archivedAt?: string | null;
  /** 휴지통 이동 시각 — 휴지통 목록에서만 값이 있다 */
  deletedAt?: string | null;
  createdAt: string;
}

/** 컴포넌트 기본 담당자 규칙 — project(프로젝트 규칙) | lead(컴포넌트 리더) | unassigned */
export type ComponentDefaultAssignee = "project" | "lead" | "unassigned";

/** 컴포넌트(지라 Components) — 프로젝트 하위 구성 단위, 이슈는 여러 개를 가질 수 있다 */
export interface Component {
  id: string;
  projectId: string;
  name: string;
  description: string;
  leadId: string | null;
  defaultAssignee: ComponentDefaultAssignee;
  issueCount: number;
  createdAt: string;
}

/** 대시보드 가젯 종류 — 데이터는 프론트가 기존 스토어 함수로 계산한다 */
export type GadgetType =
  | "status-distribution"
  | "assignee-load"
  | "priority-distribution"
  | "sprint-burnup"
  | "recent-issues"
  | "filter-results"
  | "worklog-summary";

export interface GadgetConfig {
  /** 프로젝트 범위 가젯의 프로젝트. recent-issues/filter-results는 없으면 전체 */
  projectId?: string;
  /** 기간(일) — worklog-summary, recent-issues */
  period?: 7 | 30 | 90;
  /** 스마트 검색 쿼리 — filter-results */
  query?: string;
}

export interface DashboardGadget {
  id: string;
  type: GadgetType;
  /** 2열 그리드의 열(0/1). 같은 열 안에서는 배열 순서 */
  column: 0 | 1;
  title?: string;
  config: GadgetConfig;
}

/** 대시보드(지라 Dashboards) — 소유자가 가젯을 배치하고, 공유하면 모두가 읽는다 */
export interface Dashboard {
  id: string;
  ownerId: string;
  name: string;
  shared: boolean;
  gadgets: DashboardGadget[];
  createdAt: string;
  updatedAt: string;
}

/** 프로젝트 단위 워크로그 한 줄(가젯·리포트) */
export interface ProjectWorklogRow {
  id: string;
  issueId: string;
  issueKey: string;
  authorId: string;
  hours: number;
  comment: string;
  workedOn: string;
}

/** 프로젝트 바로 가기 — 사이드바/헤더의 외부 링크(위키·저장소·대시보드) */
export interface ProjectShortcut {
  id: string;
  projectId: string;
  name: string;
  url: string;
  order: number;
  createdAt: string;
}

/** 개인 설정 — 지라 개인 설정(일반·알림) 축약판 */
export interface NotificationPreferences {
  assigned: boolean;
  statusChanged: boolean;
  commented: boolean;
}
export interface AutoWatchPreferences {
  created: boolean;
  commented: boolean;
  edited: boolean;
}
export type StartPage = "home" | "projects" | "last-project";
export interface UserPreferences {
  notifications: NotificationPreferences;
  autoWatch: AutoWatchPreferences;
  startPage: StartPage;
}
export type UserPreferencesPatch = {
  notifications?: Partial<NotificationPreferences>;
  autoWatch?: Partial<AutoWatchPreferences>;
  startPage?: StartPage;
};

/** 전역 공지 배너 — 관리자가 켜면 모든 화면 상단에 뜬다 */
export interface AnnouncementBanner {
  enabled: boolean;
  level: "info" | "warning";
  message: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string; // "Sprint N" 자동 명명
  state: "planned" | "active" | "done";
  /** 스프린트 목표 — "무엇을 위한 스프린트인가". 비어 있으면 필드 자체가 없다 */
  goal?: string;
  /** 계획 기간 "YYYY-MM-DD". 실제 시작·완료 시각과 별개로 번다운의 시간축이 된다 */
  plannedStart?: string;
  plannedEnd?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * 상태 카테고리 — 워크플로 커스텀 상태(WorkflowStatus)가 반드시 소속되는 3분류.
 * 통계/색/완료 판정은 전부 카테고리 기준이다. (커스텀 상태 도입 후에도 불변)
 */
/** 기본 상태 카테고리 id 3종 — 시드·템플릿·검색이 이 id를 쓴다. 사용자 카테고리는 `cat-*` */
export type IssueStatus = "todo" | "inprogress" | "done";

/** 카테고리의 의미 — 완료 판정·번다운·보드 정렬은 전부 여기서 파생한다 (지라의 statusCategory) */
export type StatusKind = "new" | "active" | "complete";
/** 카테고리 색 — Lozenge appearance와 1:1 */
export type StatusColor = "neutral" | "info" | "success" | "warning" | "danger";

/** 전역 상태 카테고리 — 기본 3개(todo/inprogress/done)는 의미를 바꾸거나 지울 수 없다 */
export interface StatusCategory {
  id: string;
  name: string;
  kind: StatusKind;
  color: StatusColor;
  order: number;
  builtIn: boolean;
}

/** 전역 상태 레지스트리 항목 — 워크플로(스킴/커스텀)가 골라 쓴다. 이름·카테고리의 진실 */
export interface StatusDef {
  id: string;
  name: string;
  categoryId: string; // StatusCategory.id
  description: string;
}
/** 기본 우선순위 id 5종(지라 5단계) — 시드·CSV·REST 매핑이 쓴다. 사용자 우선순위는 `pr-*` */
export type BuiltinIssuePriority = "highest" | "high" | "medium" | "low" | "lowest";
/** 우선순위 id — 레지스트리(`PriorityDef`)가 진실 */
export type IssuePriority = string;

/** 전역 우선순위 레지스트리 — order가 높음→낮음(정렬 근거). 기본 5종은 삭제 불가 */
export interface PriorityDef {
  id: string;
  name: string;
  icon: string;
  color: StatusColor;
  description: string;
  order: number;
  builtIn: boolean;
}
/** 기본 이슈 타입 id 5종 — 시드·템플릿·REST 매핑이 쓴다. 사용자 타입은 `it-*` */
export type BuiltinIssueType = "task" | "story" | "bug" | "epic" | "subtask";
/** 이슈 타입 id — 레지스트리(`IssueTypeDef`)가 진실 */
export type IssueType = string;
/** 타입의 계층 — 부모-자식 규칙의 근거 (상위 → 일반 → 하위 작업) */
export type IssueTypeLevel = "epic" | "standard" | "subtask";

/** 전역 이슈 타입 레지스트리 항목 — 기본 5종은 계층을 바꾸거나 지울 수 없다 */
export interface IssueTypeDef {
  id: string;
  name: string;
  /** typeIcons.tsx의 키 */
  icon: string;
  color: StatusColor;
  level: IssueTypeLevel;
  description: string;
  order: number;
  builtIn: boolean;
}
/** 해결 — "왜 끝났는가". 지라 기본 4종. 완료 카테고리에서만 값을 갖고, 다시 열면 비워진다 */
export type IssueResolution = "done" | "wont_do" | "duplicate" | "cannot_reproduce";

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
  /** 완료 카테고리일 때만 non-null. 완료로 들어가면 "done"이 기본값, 벗어나면 null */
  resolution: IssueResolution | null;
  /** 수정 버전(fix version). null = 미지정 */
  fixVersionId: string | null;
  /** 보관 시각 — 보관함 목록에서만 값이 있다(활성 이슈는 null/없음) */
  archivedAt?: string | null;
  labels: string[]; // 자유 문자열 라벨
  /** 컴포넌트 id 목록(순서 유지). 없으면 빈 배열로 본다 */
  componentIds?: string[];
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
    | "worklog"
    | "resolution"
    | "fixversion"
    | "attachment";
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
  id: string; // StatusDef.id
  /** 레지스트리 값의 캐시 — 읽을 때는 레지스트리가 이기고, 저장할 때는 레지스트리로 관통된다 */
  name: string;
  category: string; // StatusCategory.id
  order: number;
  /** 해석(resolve) 시 채워지는 파생 — 카테고리 의미·색. 저장 데이터에는 없다 */
  kind?: StatusKind;
  color?: StatusColor;
}

/**
 * 워크플로 전이 — 어느 상태에서 어느 상태로 갈 수 있는가.
 * `from`이 비면 모든 상태에서 허용한다(지라의 "All statuses" 전이).
 */
export interface WorkflowTransition {
  id: string;
  name: string;
  from: string[]; // WorkflowStatus.id 목록. 빈 배열 = 모든 상태
  to: string; // WorkflowStatus.id
}

/** 워크플로 캔버스 노드 위치 — 상태 id(또는 `WORKFLOW_ANY_NODE`) → 좌상단 좌표 */
export type WorkflowLayout = Record<string, { x: number; y: number }>;
/** 캔버스의 가상 "모든 상태" 노드 id — 전역 전이(`from: []`)의 출발점 */
export const WORKFLOW_ANY_NODE = "__any__";

/** 설정 본문 — 스킴과 프로젝트 커스텀이 같은 형태를 공유한다 */
export interface SettingsBody {
  statuses: WorkflowStatus[];
  /** 캔버스에서 끌어 놓은 노드 위치. 없는 노드는 자동 배치(dagre) */
  layout?: WorkflowLayout;
  /**
   * 전이 목록. **비어 있거나 없으면 모든 이동을 허용**한다 — 기존 프로젝트가 갑자기
   * 막히지 않게 하려는 기본값이다.
   */
  transitions?: WorkflowTransition[];
  /** 프로젝트에서 쓸 이슈 타입 — subtask는 항상 포함 */
  enabledTypes: IssueType[];
  /** 프로젝트에서 쓸 우선순위(레지스트리 id) — 최소 1개 */
  enabledPriorities: IssuePriority[];
  /** 우선순위 없이 만든 이슈에 붙는 값 — enabledPriorities 안에 있어야 한다 */
  defaultPriority: IssuePriority;
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

/**
 * 프로젝트 역할 — org-service `GrantRole`(VIEWER/EDITOR/ADMIN)과 1:1이다.
 * 권한의 단일 진실 소스는 org-service이며 여기 값은 그 계약을 화면 모델로 옮긴 것이다.
 */
export type ProjectRole = "viewer" | "editor" | "admin";

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

/** 버전 상태 — 지라와 같은 3단계 */
export type VersionStatus = "unreleased" | "released" | "archived";

/** 버전(릴리스). 이름은 프로젝트 안에서 유일하다 */
export interface ProjectVersion {
  id: string;
  projectId: string;
  name: string;
  description: string;
  startDate?: string; // "YYYY-MM-DD"
  releaseDate?: string;
  status: VersionStatus;
  releasedAt?: string;
  createdAt: string;
}

/**
 * 이슈 첨부 메타. 바이트는 서버(오브젝트 스토리지)에 있고 목업은 메모리에만 둔다 — 새로고침하면
 * 목업의 바이트는 사라진다(메타는 남는다). localStorage는 용량·base64 팽창 때문에 부적합하다.
 */
export interface Attachment {
  id: string;
  issueId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

/** 이력으로 남기는 필드 — 서버 V5 issue_change_log와 같은 범위(상태·스프린트 소속) */
export type ChangeField = "status" | "sprint";

/**
 * 이슈 변경 이력 한 줄. 번다운·스프린트 리포트가 "언제 완료됐고 스코프가 어떻게 바뀌었나"를
 * 재구성하는 원천이며, 서버 `GET /api/alm/projects/{id}/changes`와 같은 모양이다.
 */
export interface IssueChange {
  id: string;
  issueId: string;
  projectId: string;
  /** 변경 시점의 소속 스프린트 (sprint 변경이면 옮겨간 쪽). null = 백로그 */
  sprintId: string | null;
  field: ChangeField;
  fromValue: string | null;
  toValue: string | null;
  actorId: string;
  at: string;
}

/** 기본 링크 타입 id 5종 — 시드·타임라인(blocks 의존)이 쓴다. 사용자 타입은 `lt-*` */
export type BuiltinIssueLinkType = "blocks" | "relates" | "duplicates" | "causes" | "clones";
/** 링크 타입 id — 레지스트리(`LinkTypeDef`)가 진실 */
export type IssueLinkType = string;

/** 링크 타입 레지스트리 — outward/inward가 같으면 대칭(양방향) 링크. 기본 5종은 삭제 불가 */
export interface LinkTypeDef {
  id: string;
  name: string;
  /** source 쪽에서 보는 문구("차단함") */
  outward: string;
  /** target 쪽에서 보는 문구("차단됨") */
  inward: string;
  order: number;
  builtIn: boolean;
}

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
/** 감사 로그 한 줄 — 서버 이벤트 봉투(payloadCase) 이름이 eventType */
export interface AuditEntry {
  id: string;
  eventType: string;
  actorId: string;
  projectId: string | null;
  targetKey: string | null;
  summary: string | null;
  at: string;
}

export interface SystemStats {
  projects: number;
  issues: number;
  attachments: number;
  attachmentBytes: number;
  auditEntries: number;
}

/** 이슈 워처 — 알림 대상. 보고자·담당자는 자동, 나머지는 스스로 등록 */
export interface IssueWatcher {
  issueId: string;
  userId: string;
  createdAt: string;
}

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
  /** 상태·스프린트 변경 이력 (리포트 원천) */
  changes: IssueChange[];
  /** 프로젝트 멤버십과 역할 */
  members: ProjectMember[];
  /** 버전(릴리스) */
  versions: ProjectVersion[];
  /** 이슈 첨부 메타 */
  attachments: Attachment[];
  /** 이슈 워처 */
  watchers: IssueWatcher[];
  /** 전역 상태 카테고리 (order순) */
  statusCategories: StatusCategory[];
  /** 전역 상태 레지스트리 */
  statusDefs: StatusDef[];
  /** 전역 이슈 타입 레지스트리 (order순) */
  issueTypes: IssueTypeDef[];
  priorities: PriorityDef[];
  linkTypes: LinkTypeDef[];
  /** 보관된 이슈 + 휴지통 프로젝트의 이슈 — 일반 조회 배열(issues) 밖으로 옮겨 자동으로 숨긴다 */
  archivedIssues: Issue[];
  /** 휴지통 프로젝트 — projects 밖으로 옮긴다 */
  trashedProjects: Project[];
  components: Component[];
  dashboards: Dashboard[];
  schemes: SettingsScheme[];
  projectSettings: ProjectSettingsEntry[];
  /** projectId → 마지막 발급 이슈 번호 (삭제돼도 감소하지 않는다) */
  issueCounters: Record<string, number>;
  shortcuts: ProjectShortcut[];
  preferences: Record<string, UserPreferences>;
  banner: AnnouncementBanner;
}
