// ALM 도메인 모델 타입 — mockData (types.ts에서 분할, 동작 불변)
import type { User, Project, Component, Dashboard, ProjectShortcut, UserPreferences, AnnouncementBanner } from "./project";
import type { Sprint, Issue, Comment, Activity, IssueLink, WebLink, Worklog, IssueChange, ProjectMember, ProjectVersion, Attachment, StatusCategory, StatusDef, IssueTypeDef, PriorityDef, LinkTypeDef } from "./issue";
import type { Notification, IssueWatcher } from "./activity";
import type { Board } from "./board";
import type { SettingsScheme, ProjectSettingsEntry } from "./settings";
import type { SavedView, AutomationRule, AutomationRun } from "./planning";
import type { PlanningSettings } from "./cycles";

/** 트리아지 대기열 한 줄(목업 전용 저장 — 서버는 issue.triage_* 컬럼) */
export interface MockTriageEntry {
  issueId: string;
  source: "EXTERNAL" | "MANUAL";
  /** 들어온 시각 — 대기열 순서 */
  enteredAt: string;
  /** 보류 시각(지나면 다시 pending) */
  snoozedUntil: string | null;
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
  /** 웹 링크(F-08) — 옛 저장분에는 없다(normalize가 채운다) */
  webLinks: WebLink[];
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
  /** userId → 프로필 사진 dataURL (목업 전용 저장소 — 서버는 오브젝트 스토리지에 둔다) */
  avatars: Record<string, string>;
  banner: AnnouncementBanner;
  /** 저장된 보기(V31) — 목업은 모두 현재 사용자 소유로 본다 */
  views: (Omit<SavedView, "mine" | "canEdit">)[];
  /** 트리아지를 켠 프로젝트 id(V35) */
  triageProjects: string[];
  triageEntries: MockTriageEntry[];
  /** 자동화 규칙·실행 이력(V36·V37) */
  automationRules: AutomationRule[];
  automationRuns: AutomationRun[];
  /** 프로젝트 계획 설정(V39) — 없으면 기본값(자동 생성 끔·이월 백로그·수직선 척도) */
  planningSettings: Record<string, PlanningSettings>;
}
