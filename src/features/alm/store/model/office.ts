// ALM 도메인 모델 타입 — office (types.ts에서 분할, 동작 불변)
import type { AgentExecutionSite } from "./aiTeam";

// ── AI 사무실(agent-service P3a) — `GET /api/agent/office`, `GET /api/agent/personas/{id}/activity` ──
// 서버 long id는 경계(jiraApi)에서 string으로 바꾼다. 시각은 ISO-8601 UTC 문자열 그대로.

/** MANAGER(P3c)는 보드 순찰·보고를 맡는 매니저 — 실무 회의·회고 자동 참석에서 빠진다 */
export type AgentRole = "PLANNER" | "DESIGNER" | "FRONTEND" | "BACKEND" | "OPS" | "REVIEWER" | "MANAGER";

export type AgentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "BLOCKED"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

/** 아직 끝나지 않은 run — 페르소나의 "현재 run"이 될 수 있는 상태 */
export type AgentActiveRunStatus = "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "BLOCKED";

/**
 * 회의 계열 run(P3b) — MEETING=착수/계획, RETRO=회고, ESCALATION=에스컬레이션, MANAGER=매니저 보고(P3c, 매니저 1명의
 * 보드 순찰 — 회의는 아니지만 서버 MEETING_TYPES에 들어 소집 API·게시판·활성 회의 가드를 공유한다)
 */
export type AgentMeetingType = "MEETING" | "RETRO" | "ESCALATION" | "MANAGER";

export type AgentRunType = "TASK" | "REVIEW" | AgentMeetingType;

export type AgentRunTrigger = "SCHEDULER" | "USER";

export interface AgentCurrentRun {
  id: string;
  status: AgentActiveRunStatus;
  issueKey: string | null;
  type: AgentRunType;
  trigger: AgentRunTrigger;
  attempt: number;
  model: string | null;
  startedAt: string | null;
  /** 실행 위치(P4a) — 구 백엔드는 없다(= SERVER) */
  executionSite?: AgentExecutionSite;
  /** QUEUED인데 집어 갈 러너가 없다(P4a D-P4-4) — "러너 대기". 구 백엔드는 없다(= false) */
  awaitingRunner?: boolean;
  /**
   * 아직 워커에게 전달되지 않은 실행 중 지시 수(P4b AGP-67). 구 백엔드는 필드가 없다(undefined) — 그 서버엔 지시 API도
   * 없다는 신호로 쓴다(화면이 "바로 전하기"를 숨기고 코멘트로 폴백).
   */
  pendingDirectiveCount?: number;
}

/** 감사 출처(AGP-63) — 내부 워커 run / 사람이 발급한 페르소나 토큰으로 붙은 외부 MCP / 시스템 */
export type AgentAuditOrigin = "WORKER" | "EXTERNAL" | "SYSTEM";

/** 도구 호출 감사 한 건 — summary는 서버가 본문을 가린 값("(본문 생략)" 등)일 수 있다 */
export interface AgentAuditEntry {
  id: string;
  tool: string;
  status: "OK" | "ERROR";
  summary: string | null;
  createdAt: string;
  /** null = 출처 기록 전의 과거 감사(구 백엔드 포함) — 배지를 달지 않는다 */
  origin: AgentAuditOrigin | null;
  /** 워커 run의 감사면 그 run id */
  runId: string | null;
}

/** 활성 run 없이 최근 5분 안에 외부 MCP 활동이 있으면 "EXTERNAL"(AGP-63) */
export type AgentPresence = "EXTERNAL";

export interface AgentOfficePersona {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  role: AgentRole;
  active: boolean;
  currentRun: AgentCurrentRun | null;
  /** 5분 이내 활동만 온다 — 없으면 null(말풍선 2행 생략) */
  lastActivity: AgentAuditEntry | null;
  todayCostUsd: number;
  /** 렌더용 외형(AGP-62) — 구 백엔드는 필드가 없다(= 기본 외형) */
  avatarConfig?: string | null;
  /** 원격 접속(AGP-63) — 활성 run이 있으면 서버가 null로 준다. 구 백엔드는 필드가 없다(= null) */
  presence?: AgentPresence | null;
}

export interface AgentRunSummary {
  id: string;
  issueKey: string | null;
  status: AgentRunStatus;
  personaId: string;
  attempt: number;
  model: string | null;
  startedAt: string | null;
  endedAt: string | null;
  type: AgentRunType;
  trigger: AgentRunTrigger;
  parentRunId: string | null;
  /** 실행 위치(P4a) — 구 백엔드는 없다(= SERVER) */
  executionSite?: AgentExecutionSite;
  /** 배정·고정 러너 — 인프로세스 run·구 백엔드는 null */
  runnerId?: string | null;
  /**
   * 이 run의 원장 합계(F-16) — run 목록·단건에만 실린다. null(또는 없음)은 "기록 없음"이지 0원이 아니다.
   * USER run 생성 응답·사무실 요약 run은 늘 null이다.
   */
  cost?: AgentRunCost | null;
}

/** run 비용 합계 — 원장(usage_ledger) 항목들의 합. `entries`는 합친 원장 행 수 */
export interface AgentRunCost {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  entries: number;
}

/** `GET /api/agent/runs` 조건(P4c D-P4c-1) — 전부 선택, AND. page는 0부터, size 1~100(기본 20) */
export interface AgentRunQuery {
  status?: AgentRunStatus;
  projectId?: string;
  /**
   * projectId 프로젝트의 키(예: "ALM") — 서버로 보내지 않는다. 프로젝트 축이 없는 구 백엔드(배열 응답)일 때 어댑터가
   * 이슈키 접두어로 그 프로젝트 run만 남기는 데 쓴다. 없으면 프로젝트 전체 회의(`PROJECT-<id>`)만 남긴다(남의 run 노출 방지).
   */
  projectKey?: string;
  personaId?: string;
  type?: AgentRunType;
  page?: number;
  size?: number;
}

/** run 목록 한 페이지 — id 내림차순. 구 백엔드(배열 전체)도 어댑터가 이 모양으로 접는다 */
export interface AgentRunPage {
  items: AgentRunSummary[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

/**
 * `GET /api/agent/runs/{id}`(P4c) — 요약 + 상세. `error`·`instruction`은 run 프로젝트 관리자에게만 실린다 —
 * 그 밖은 null + `redacted: true`(값이 없어서 null인 것과 구분).
 */
export interface AgentRunDetail extends AgentRunSummary {
  projectId: string | null;
  outputPageId: string | null;
  attendeePersonaIds: string[];
  rejectCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  error: string | null;
  instruction: string | null;
  redacted: boolean;
}

/** 사무실 무효화 신호(P4c §15) — 데이터 없이 "다시 조회하라"만 알린다 */
export type OfficeStreamReason = "run" | "gate" | "audit" | "directive" | "persona";

export interface OfficeStreamEvent {
  reason: OfficeStreamReason | null;
  projectId: string | null;
  at: string | null;
}

/**
 * 사무실 스트림 콜백 — `onOpen`은 연결 수립(200) 직후, `onActivity`는 바이트가 도착할 때마다(주석·heartbeat 포함,
 * 생존 판정용), `onEvent`는 `event: office` 프레임마다.
 */
export interface OfficeStreamHandlers {
  signal: AbortSignal;
  onOpen: () => void;
  onActivity: () => void;
  onEvent: (event: OfficeStreamEvent) => void;
}

export type AgentGateKind = "MERGE" | "ESCALATION" | "PLAN";

export interface AgentPendingGate {
  id: string;
  runId: string;
  issueKey: string | null;
  personaId: string;
  kind: AgentGateKind;
  requestSummary: string;
  requestedAt: string;
}

export type AgentGateDecision = "APPROVE" | "REJECT";

/** 게이트 감독 목록 한 건 — `GET /api/agent/gates`. 결정자·거절 사유는 서버가 주지 않는다 */
export interface AgentGate {
  id: string;
  runId: string;
  issueKey: string | null;
  kind: AgentGateKind;
  /** 요청 전문 */
  request: string;
  /** null = 아직 결정 전(pending) */
  decision: AgentGateDecision | null;
  requestedAt: string;
}

export interface AgentBudget {
  monthlyCapUsd: number | null;
  platformMonthToDateUsd: number;
  killSwitch: boolean;
}

export interface AgentOffice {
  personas: AgentOfficePersona[];
  /** 최근 run — BLOCKED run은 personas[].currentRun과 여기 양쪽에 나온다(endedAt null) */
  recentRuns: AgentRunSummary[];
  pendingGateCount: number;
  pendingGates: AgentPendingGate[];
  budget: AgentBudget;
  generatedAt: string;
  /** 게시판 — 회의록이 보고된 완료 회의 run 최신 5건. 구 백엔드 응답이면 빈 배열 */
  boardPosts: AgentBoardPost[];
  /** 진행 중(RUNNING) 회의 계열 run(P3e) — 대기·차단 회의·회의 없음·구 백엔드 응답이면 null */
  activeMeeting: AgentActiveMeeting | null;
  /** 설치·키 상태로 켜지는 기능(P3g) — 구 백엔드 응답이면 전부 false */
  features: AgentOfficeFeatures;
  /**
   * TASK가 끝나면 검증할 리뷰어가 있다(P4b D-P4b-1) — false면 AI 작업이 done이 되지 않는다("리뷰어 없음" 경고).
   * 구 백엔드(필드 없음)는 true — 모르는 상태로 경고를 띄우지 않는다.
   */
  reviewReady: boolean;
}

export interface AgentOfficeFeatures {
  /** 수다 API(`POST /api/agent/personas/{id}/chat`)가 동작 가능 — LLM 키 해석됨 + `CHAT_ENABLED` */
  chat: boolean;
}

// ── AI 사무실 1:1 대화(P3g AGP-65) — 수다·대화 기록·USER run ──

/** `POST /api/agent/runs` — 사람이 지시문을 붙여 run을 직접 요청한다(모델 생략 = 프로젝트 정책) */
export interface AgentRunCreateInput {
  issueKey: string;
  instruction?: string;
  model?: string;
  personaSlug: string;
  /** 생략 = 프로젝트 설정(없으면 전역 기본) */
  executionSite?: AgentExecutionSite;
}

export type AgentChatMood = "NEUTRAL" | "THINKING" | "HAPPY" | "TROUBLED";

export interface AgentChatInput {
  /** 1~500자 */
  message: string;
  /** 첫 턴은 생략 — 서버가 발급해 응답에 싣는다 */
  sessionId?: string;
  projectId?: string;
}

/** `POST /api/agent/personas/{id}/chat` 200 — 수다는 일을 시키지 못한다: 작업 요청으로 보이면 suggest="DIRECTIVE" */
export interface AgentChatReply {
  sessionId: string;
  reply: string;
  mood: AgentChatMood | null;
  suggest: "DIRECTIVE" | null;
}

export type AgentDialogSpeaker = "USER" | "PERSONA";

/** SAY = 수다 한 턴(서버가 저장), STATUS = "지금 뭐 해?" 답, DIRECTIVE = 지시 코멘트, ASSIGN = USER run 생성 */
export type AgentDialogKind = "SAY" | "STATUS" | "DIRECTIVE" | "ASSIGN";

/** 대화 기록 한 줄 — 호출자 본인 기록만(관리자도 남의 기록은 못 본다) */
export interface AgentDialogEntry {
  id: string;
  speaker: AgentDialogSpeaker;
  kind: AgentDialogKind;
  text: string;
  issueKey: string | null;
  runId: string | null;
  commentId: string | null;
  createdAt: string;
}

/** `GET /api/agent/personas/{id}/dialog` — entries는 시간순(오래된 것 먼저), 더 이전은 entries[0].id를 before로 */
export interface AgentDialogPage {
  entries: AgentDialogEntry[];
  hasMore: boolean;
}

export interface AgentDialogEntryInput {
  speaker: AgentDialogSpeaker;
  kind: AgentDialogKind;
  text: string;
  issueKey?: string | null;
  runId?: string | null;
  commentId?: string | null;
}

/** 사무실 회의실에 앉힐 진행 중 회의(P3e). 매니저 보고는 매니저 1명 */
export interface AgentActiveMeeting {
  runId: string;
  type: AgentMeetingType;
  status: AgentRunStatus;
  /** 안건 이슈 키 — 안건 이슈 없는 회의면 서버 합성 키 `PROJECT-<projectId>` */
  issueKey: string | null;
  projectId: string;
  hostPersonaId: string;
  /** 진행자 먼저 */
  attendeePersonaIds: string[];
  startedAt: string | null;
}

/**
 * 게시판 게시물(P3b D-P3b-7). 제목은 서버가 위키를 조회하지 않아 없다 — 화면은 종류 라벨 + 시각으로 그린다.
 */
export interface AgentBoardPost {
  runId: string;
  type: AgentMeetingType;
  /** 안건 이슈 키 — 안건 이슈 없는 회의(서버 합성 키 `PROJECT-<projectId>`)면 null */
  agendaIssueKey: string | null;
  projectId: string;
  pageId: string;
  /** 회의록 스페이스(서버 설정값) — 구 백엔드이거나 미설정이면 null: 위키 링크 없이 라벨만 */
  spaceId: string | null;
  endedAt: string;
}

/** `POST /api/agent/meetings` 요청 — MEETING·ESCALATION은 안건 이슈나 안건 지시 중 하나가 필요하다 */
export interface AgentMeetingInput {
  type: AgentMeetingType;
  projectId: string;
  agendaIssueKey?: string;
  agenda?: string;
  /** 생략하면 서버의 롤 기본 참석 규칙 */
  personaSlugs?: string[];
  /** 생략 = 프로젝트 설정(없으면 전역 기본) */
  executionSite?: AgentExecutionSite;
}

export interface AgentMeetingAttendee {
  personaId: string;
  slug: string;
  name: string;
  role: AgentRole;
  emoji: string | null;
}

export interface AgentMeetingCreated {
  run: AgentRunSummary;
  /** 첫 번째가 진행자 */
  attendees: AgentMeetingAttendee[];
}

export interface AgentPersonaActivity {
  personaId: string;
  /** 최근 run 20 */
  runs: AgentRunSummary[];
  /** 오늘 감사 ≤ 50, 최신 먼저 */
  todayAudits: AgentAuditEntry[];
  todayCostUsd: number;
}
