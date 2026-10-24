// ALM 도메인 모델 타입 — issue (types.ts에서 분할, 동작 불변)

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
  /** 편집 버전(낙관적 락) — 계획 수정·시작·완료가 올린다. 계획 수정은 편집을 시작할 때 본 값을 보낸다 */
  version: number;
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
  /**
   * lucide 아이콘 키 (`components/typeIcons.tsx`의 맵). 빈 문자열이면 카테고리 의미(kind)의
   * 기본 아이콘으로 폴백한다 — 화면은 `labels.ts`의 `statusIcon()`만 쓴다.
   */
  icon: string;
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

/** 트리아지 대기 상태 — 서버 `PENDING`·`SNOOZED`를 소문자로 */
export type TriageState = "pending" | "snoozed";

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
  /**
   * 해결 시각 — `resolution`이 null→non-null이 되는 순간 찍히고, 다시 null이 되면 지워진다.
   * AQL `resolved`(해결일)가 읽는 값이다. 직접 대입하지 말고 해결을 바꾸는 한 경로만 쓴다.
   */
  resolvedAt: string | null;
  /** 수정 버전(fix version). null = 미지정 */
  fixVersionId: string | null;
  /** 보관 시각 — 보관함 목록에서만 값이 있다(활성 이슈는 null/없음) */
  archivedAt?: string | null;
  /** 시작일 "YYYY-MM-DD"(V30) — 타임라인 막대의 시작. 마감일보다 늦을 수 없다 */
  startDate: string | null;
  /** 스토리 포인트(V30) — 0~9999, 소수 첫째 자리. null = 추정 안 함 */
  storyPoints: number | null;
  /** 플래그(막힘, V30) — 보드 카드·목록 행에 장애물 표시. 버전을 올리지 않는다 */
  flagged: boolean;
  /**
   * 트리아지 대기열(V35) — `pending`·`snoozed`, 대기열 밖이면 null. 보류 시각이 지났으면 pending.
   * 대기열 이슈는 보드·백로그·추정 합계에서 빠지고 검색·AQL(`triage = true`)에는 나온다.
   */
  triageState: TriageState | null;
  labels: string[]; // 자유 문자열 라벨
  /** 컴포넌트 id 목록(순서 유지). 없으면 빈 배열로 본다 */
  componentIds?: string[];
  order: number; // 컬럼/목록 내 정렬
  /**
   * 편집 버전(낙관적 락) — 서버 `version`. 편집 저장(`updateIssue`)만 올리고 보드 이동·랭크는 올리지 않는다.
   * 화면은 편집을 **시작할 때** 들고 있던 값을 `expectedVersion`으로 보내야 남의 저장을 덮어쓰지 않는다.
   */
  version: number;
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
    | "attachment"
    | "flag"
    | "triage";
  detail: string; // 예: "할 일 → 진행 중"
  at: string;
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
  /** 낙관적 락 — 편집을 시작할 때 본 값으로 저장한다(남이 먼저 고쳤으면 409). 옛 목업 데이터에는 없을 수 있다 */
  version?: number;
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

/** 웹 링크 종류(F-08) — 서버 `WEB_LINK_KINDS`. PR·커밋은 개발 도구(커밋 파서)도 붙인다 */
export type WebLinkKind = "PR" | "COMMIT" | "WEB";

/** 이슈에 붙은 외부 링크(PR·커밋·문서) — `GET /api/alm/issues/{id}/web-links` */
export interface WebLink {
  id: string;
  issueId: string;
  url: string;
  /** 표시 이름 — 없으면 화면이 URL을 보인다 */
  title: string | null;
  kind: WebLinkKind;
  createdBy: string;
  createdAt: string;
}

export interface WebLinkInput {
  url: string;
  title?: string | null;
  kind?: WebLinkKind;
}

/** 추가 결과 — 같은 URL이 이미 있으면 새로 만들지 않고 기존 것을 돌려준다(`created: false`, 서버 200) */
export interface WebLinkAdded {
  link: WebLink;
  created: boolean;
}
