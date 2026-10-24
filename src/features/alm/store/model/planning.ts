// ALM 도메인 모델 타입 — 웨이브 D(저장된 보기·추정·속도)·트리아지·자동화 규칙 (2026-10-24)

// ── 저장된 보기(V31) ──────────────────────────────────────────

/** 그룹 기준 — 서버 `ViewDisplay.GROUPS`와 같은 닫힌 어휘 */
export const VIEW_GROUPS = [
  "none",
  "status",
  "assignee",
  "priority",
  "sprint",
  "epic",
  "label",
  "type",
  "component",
  "fixVersion",
] as const;
export type ViewGroupBy = (typeof VIEW_GROUPS)[number];

/** 정렬 기준 — manual = 랭크 */
export const VIEW_ORDERS = [
  "manual",
  "priority",
  "status",
  "updated",
  "created",
  "due",
  "startDate",
  "storyPoints",
  "estimate",
  "title",
  "key",
] as const;
export type ViewOrderBy = (typeof VIEW_ORDERS)[number];

/** 표시 속성(목록 열·카드 필드) */
export const VIEW_PROPERTIES = [
  "key",
  "type",
  "status",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "components",
  "sprint",
  "fixVersion",
  "due",
  "startDate",
  "storyPoints",
  "estimate",
  "flagged",
  "parent",
  "created",
  "updated",
] as const;
export type ViewProperty = (typeof VIEW_PROPERTIES)[number];

/** 서버 기본 표시 속성 — 비운 채 저장하면 이 값이 채워진다 */
export const DEFAULT_VIEW_PROPERTIES: ViewProperty[] = [
  "key",
  "type",
  "status",
  "priority",
  "assignee",
  "labels",
  "flagged",
];

export type ViewLayout = "list" | "board";
export type ViewScope = "personal" | "project";

/** 표시 옵션 — 응답은 언제나 모든 항목이 있는 모양이다(서버가 기본값으로 채운다) */
export interface ViewDisplay {
  groupBy: ViewGroupBy;
  /** 하위 그룹(목록) — groupBy와 달라야 하고, groupBy가 none이면 none */
  subGroupBy: ViewGroupBy;
  orderBy: ViewOrderBy;
  orderDirection: "asc" | "desc";
  properties: ViewProperty[];
  showSubIssues: boolean;
  showEmptyGroups: boolean;
}

export const DEFAULT_VIEW_DISPLAY: ViewDisplay = {
  groupBy: "none",
  subGroupBy: "none",
  orderBy: "manual",
  orderDirection: "asc",
  properties: [...DEFAULT_VIEW_PROPERTIES],
  showSubIssues: true,
  showEmptyGroups: false,
};

/** 보기 필터 — 저장 필터와 같은 모양(smart = 스마트 검색 문자열, aql = AQL) */
export interface ViewFilter {
  kind: "smart" | "aql";
  query: string;
}

/** 저장된 보기 — 필터 + 표시 옵션. 결과는 여는 사람이 자기 권한으로 다시 실행한다 */
export interface SavedView {
  id: string;
  name: string;
  scope: ViewScope;
  /** 프로젝트 밖 개인 보기면 null */
  projectId: string | null;
  ownerId: string;
  mine: boolean;
  canEdit: boolean;
  layout: ViewLayout;
  /** 없으면 null(프로젝트 전체) */
  filter: ViewFilter | null;
  display: ViewDisplay;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewInput {
  name: string;
  scope?: ViewScope;
  projectId?: string | null;
  layout?: ViewLayout;
  filter?: ViewFilter | null;
  display?: Partial<ViewDisplay>;
}

/** 보기 고치기 — 보낸 항목만. `filter: null`이면 필터를 지운다(프로젝트 전체) */
export interface SavedViewPatch {
  name?: string;
  scope?: ViewScope;
  layout?: ViewLayout;
  filter?: ViewFilter | null;
  display?: Partial<ViewDisplay>;
}

// ── 추정 합계·속도(V30) ──────────────────────────────────────

/** 스프린트(또는 백로그) 하나의 추정 합계 — 미추정은 0으로 센다 */
export interface EstimationGroup {
  /** 백로그면 null */
  sprintId: string | null;
  name: string;
  /** active·planned, 백로그면 null */
  state: "active" | "planned" | null;
  issueCount: number;
  completedCount: number;
  storyPoints: number;
  completedStoryPoints: number;
  /** 포인트가 비어 있는 이슈 수 */
  unestimatedCount: number;
  estimateHours: number;
  completedEstimateHours: number;
}

export interface EstimationSummary {
  projectId: string;
  /** 진행 중·예정 스프린트(번호 순) 뒤에 백로그. 트리아지 대기열은 빠진다 */
  groups: EstimationGroup[];
}

export type VelocityUnit = "points" | "hours" | "count";

export interface VelocityRow {
  sprintId: string;
  name: string;
  completedAt: string | null;
  /** 완료 시점 범위 = 완료 + 그 순간 이월(같은 단위) */
  committed: number;
  completed: number;
}

export interface VelocityReport {
  projectId: string;
  unit: VelocityUnit;
  /** 최근 완료 스프린트부터 */
  sprints: VelocityRow[];
  /** completed 평균(소수 첫째 자리) — 완료 스프린트가 없으면 null */
  average: number | null;
}

// ── 트리아지(V35) ─────────────────────────────────────────────

export interface TriageSettings {
  projectId: string;
  enabled: boolean;
  /** 대기 중 건수(보류가 풀린 것 포함) */
  pending: number;
  /** 보류 중 건수 */
  snoozed: number;
}

export type TriageQueueState = "pending" | "snoozed" | "all";

export interface TriageAcceptInput {
  /** 지정 상태(기본 첫 '할 일'). 완료 의미 상태는 400 */
  status?: string;
  assigneeId?: string | null;
  priority?: string;
  comment?: string;
}

// ── 자동화 규칙(V36·V37) ─────────────────────────────────────

export type AutomationTriggerType = "ISSUE_CREATED" | "ISSUE_TRANSITIONED" | "FIELD_CHANGED" | "SCHEDULED";
export const AUTOMATION_TRIGGER_TYPES: AutomationTriggerType[] = [
  "ISSUE_CREATED",
  "ISSUE_TRANSITIONED",
  "FIELD_CHANGED",
  "SCHEDULED",
];

/** FIELD_CHANGED가 지켜볼 수 있는 필드 — 서버 `IssueDomainEventPublisher.CHANGED_FIELDS` */
export const AUTOMATION_WATCH_FIELDS = [
  "title",
  "description",
  "type",
  "status",
  "priority",
  "assignee",
  "parent",
  "sprint",
  "dueDate",
  "estimate",
  "resolution",
  "fixVersion",
  "labels",
  "components",
  "startDate",
  "storyPoints",
  "flagged",
  "triage",
] as const;
export type AutomationWatchField = (typeof AUTOMATION_WATCH_FIELDS)[number];

export interface AutomationTrigger {
  type: AutomationTriggerType;
  /** ISSUE_TRANSITIONED: 출발 상태(비우면 아무 상태) */
  fromStatuses?: string[] | null;
  /** ISSUE_TRANSITIONED: 도착 상태(비우면 아무 상태) */
  toStatuses?: string[] | null;
  /** FIELD_CHANGED: 하나 이상 */
  fields?: AutomationWatchField[] | null;
  /** SCHEDULED: cron(서울 시각). 5분보다 자주 불가 */
  cron?: string | null;
}

export type AutomationActionType = "SET_FIELD" | "ASSIGN" | "COMMENT" | "TRANSITION" | "LABELS" | "NOTIFY";
export const AUTOMATION_ACTION_TYPES: AutomationActionType[] = [
  "SET_FIELD",
  "ASSIGN",
  "COMMENT",
  "TRANSITION",
  "LABELS",
  "NOTIFY",
];

/** SET_FIELD가 바꿀 수 있는 필드 */
export const AUTOMATION_SETTABLE_FIELDS = ["priority", "dueDate", "startDate", "storyPoints", "flagged"] as const;
export type AutomationSettableField = (typeof AUTOMATION_SETTABLE_FIELDS)[number];

export const AUTOMATION_RECIPIENTS = ["assignee", "reporter", "watchers"] as const;
export type AutomationRecipient = (typeof AUTOMATION_RECIPIENTS)[number];

/** 액션 하나 — type에 따라 쓰는 항목이 다르다(서버 `AutomationSpec.Action`과 같은 모양, id만 문자열) */
export interface AutomationAction {
  type: AutomationActionType;
  /** SET_FIELD */
  field?: AutomationSettableField | null;
  /** SET_FIELD: 우선순위 id·"YYYY-MM-DD"·수·true/false, null이면 비우기(priority·flagged는 비울 수 없다) */
  value?: string | number | boolean | null;
  /** ASSIGN */
  assignee?: "reporter" | "unassigned" | "user" | null;
  /** ASSIGN(user) */
  userId?: string | null;
  /** COMMENT: 1~5000자 */
  body?: string | null;
  /** TRANSITION: 도착 상태 — 워크플로 전환 규칙을 그대로 탄다 */
  toStatus?: string | null;
  /** LABELS */
  add?: string[] | null;
  remove?: string[] | null;
  /** NOTIFY */
  recipients?: AutomationRecipient[] | null;
  userIds?: string[] | null;
  /** NOTIFY: 1~200자 */
  message?: string | null;
}

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  description: string;
  enabled: boolean;
  /** 자동으로 꺼진 이유(연속 실패·실행 상한). 사람이 다시 켜서 저장하면 비워진다 */
  disabledReason: string | null;
  trigger: AutomationTrigger;
  /** 조건(AQL) — 비면 모든 이슈. 예약 트리거는 필수 */
  condition: string;
  actions: AutomationAction[];
  /** 다른 규칙이 만든 변경에도 반응할지(기본 false — 루프 방지) */
  allowRuleTrigger: boolean;
  /** 실행 주체 — 마지막으로 저장한 사람 */
  actorId: string;
  createdBy: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  consecutiveFailures: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRuleInput {
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  condition?: string;
  actions: AutomationAction[];
  allowRuleTrigger?: boolean;
}

export type AutomationOutcome = "SUCCESS" | "FAILED" | "LOOP_BLOCKED" | "RATE_LIMITED";

/** 실행 이력 한 줄 — 조건에 안 맞아 건너뛴 실행은 남지 않는다 */
export interface AutomationRun {
  id: string;
  ruleId: string;
  projectId: string;
  /** 예약 회차 요약이면 null */
  issueId: string | null;
  issueKey: string | null;
  triggerType: AutomationTriggerType;
  outcome: AutomationOutcome;
  /** 연쇄 깊이(1 = 사람의 변경에 대한 첫 반응) */
  depth: number;
  actionsRun: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}
