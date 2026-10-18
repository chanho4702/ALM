// ALM 도메인 모델 타입 — project (types.ts에서 분할, 동작 불변)

export interface User {
  id: string;
  name: string;
  /**
   * 프로필 사진 — 화면이 `<Avatar src>`에 그대로 넣을 수 있는 URL.
   * 목업은 base64 dataURL, REST는 인증 헤더가 필요해 바이트를 받아 만든 object URL이다
   * (`/api/org/members/{id}/avatar`는 Bearer 토큰을 요구하므로 `<img src>`로 직접 못 연다).
   * 없으면 이니셜 아바타.
   */
  avatarUrl?: string | null;
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
  /** 자동 영구 삭제 예정 시각(deletedAt + 보존 기간, 서버 계산) — 휴지통 목록에서만 값이 있다 */
  purgeAt?: string | null;
  /** 편집 버전(낙관적 락) — 설정 화면이 편집을 시작할 때 본 값을 `updateProject`에 그대로 보낸다 */
  version: number;
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
  /** 코멘트·설명에서 @멘션됐을 때 — 워처가 아니어도 받는다 */
  mentioned: boolean;
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
  /** 알림함에 새 알림이 생길 때 같은 내용을 이메일로도 받는다(서버 V19). 메일 서버가 없으면 켜도 발송되지 않는다 */
  emailEnabled: boolean;
  /** 서버에 메일 서버(ALM_MAIL_HOST)가 구성돼 있는지 — 읽기 전용, 화면 안내용 */
  mailConfigured?: boolean;
  /** 내 프로필 사진 URL — 읽기 전용(저장은 uploadMyAvatar/removeMyAvatar). 없으면 null */
  avatarUrl?: string | null;
}

export type UserPreferencesPatch = {
  notifications?: Partial<NotificationPreferences>;
  autoWatch?: Partial<AutoWatchPreferences>;
  startPage?: StartPage;
  emailEnabled?: boolean;
};

/** 전역 공지 배너 — 관리자가 켜면 모든 화면 상단에 뜬다 */
export interface AnnouncementBanner {
  enabled: boolean;
  level: "info" | "warning";
  message: string;
}
