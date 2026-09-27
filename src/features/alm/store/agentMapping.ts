/**
 * agent-service 응답 ↔ 프론트 타입 경계 매퍼(AI 사무실·run·게이트 공용).
 * 서버 long id → string, BigDecimal(숫자 또는 문자열로 올 수 있음) → number, 모르는 enum은 안전한 값으로 접는다.
 */
import type {
  AgentActiveRunStatus,
  AgentAuditEntry,
  AgentBoardPost,
  AgentCurrentRun,
  AgentGate,
  AgentGateKind,
  AgentMeetingAttendee,
  AgentMeetingCreated,
  AgentMeetingType,
  AgentOffice,
  AgentOfficePersona,
  AgentPendingGate,
  AgentPersona,
  AgentPersonaActivity,
  AgentRole,
  AgentRunStatus,
  AgentRunSummary,
  AgentRunTrigger,
  AgentRunType,
} from "./types";

type Id = number | string;

export interface AgentAuditEntryDto {
  id: Id;
  tool: string;
  status: string;
  summary: string | null;
  createdAt: string;
}

export interface AgentCurrentRunDto {
  id: Id;
  status: string;
  issueKey: string | null;
  type?: string | null;
  trigger?: string | null;
  attempt: number;
  model: string | null;
  startedAt: string | null;
}

export interface AgentOfficePersonaDto {
  id: Id;
  slug: string;
  name: string;
  emoji: string | null;
  role: string;
  active: boolean;
  currentRun: AgentCurrentRunDto | null;
  lastActivity: AgentAuditEntryDto | null;
  todayCostUsd: number | string | null;
}

export interface AgentRunSummaryDto {
  id: Id;
  issueKey: string | null;
  status: string;
  personaId: Id;
  attempt: number;
  model: string | null;
  startedAt: string | null;
  endedAt: string | null;
  type?: string | null;
  trigger?: string | null;
  parentRunId?: Id | null;
}

export interface AgentPendingGateDto {
  id: Id;
  runId: Id;
  issueKey: string | null;
  personaId: Id;
  kind: string;
  requestSummary: string | null;
  requestedAt: string;
}

/** `GET /api/agent/gates` 항목(GateSummaryResponse) */
export interface AgentGateDto {
  id: Id;
  runId: Id;
  issueKey: string | null;
  kind: string;
  request: string | null;
  decision: string | null;
  requestedAt: string;
}

/** `GET /api/agent/personas` 항목(PersonaResponse) — 목록 화면은 이름·이모지만 쓴다 */
export interface AgentPersonaDto {
  id: Id;
  name: string;
  emoji?: string | null;
}

/** 게시판 게시물(P3b) — issueKey는 안건 이슈 없는 회의면 서버 합성 키 `PROJECT-<projectId>` */
export interface AgentBoardPostDto {
  runId: Id;
  type: string;
  issueKey: string;
  projectId: Id;
  pageId: Id;
  /** 구 백엔드는 이 필드가 없다 */
  spaceId?: Id | null;
  endedAt: string;
}

/** `POST /api/agent/meetings` 201 */
export interface AgentMeetingCreatedDto {
  run: AgentRunSummaryDto;
  attendees?: {
    personaId: Id;
    slug: string;
    name: string;
    role: string;
    emoji: string | null;
  }[] | null;
}

export interface AgentOfficeDto {
  personas?: AgentOfficePersonaDto[] | null;
  recentRuns?: AgentRunSummaryDto[] | null;
  pendingGateCount?: number | null;
  pendingGates?: AgentPendingGateDto[] | null;
  budget?: {
    monthlyCapUsd: number | string | null;
    platformMonthToDateUsd: number | string | null;
    killSwitch: boolean;
  } | null;
  generatedAt?: string | null;
  /** P3b 이전 백엔드는 이 필드가 없다 */
  boardPosts?: AgentBoardPostDto[] | null;
}

export interface AgentPersonaActivityDto {
  personaId: Id;
  runs?: AgentRunSummaryDto[] | null;
  todayAudits?: AgentAuditEntryDto[] | null;
  todayCostUsd: number | string | null;
}

const ROLES: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS", "REVIEWER"];
const RUN_STATUSES: readonly AgentRunStatus[] = [
  "QUEUED",
  "RUNNING",
  "WAITING_APPROVAL",
  "BLOCKED",
  "DONE",
  "FAILED",
  "CANCELLED",
];
const ACTIVE_STATUSES: readonly AgentActiveRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED"];
const GATE_KINDS: readonly AgentGateKind[] = ["MERGE", "ESCALATION", "PLAN"];
const MEETING_TYPES: readonly AgentMeetingType[] = ["MEETING", "RETRO", "ESCALATION"];

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** BigDecimal은 직렬화 설정에 따라 숫자·문자열 둘 다 올 수 있다. 못 읽으면 null */
function money(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const RUN_TYPES: readonly AgentRunType[] = ["TASK", "REVIEW", ...MEETING_TYPES];
const runType = (value: unknown): AgentRunType => pick(RUN_TYPES, value, "TASK");
const runTrigger = (value: unknown): AgentRunTrigger => (value === "USER" ? "USER" : "SCHEDULER");

export function mapAgentAuditEntry(dto: AgentAuditEntryDto): AgentAuditEntry {
  return {
    id: String(dto.id),
    tool: dto.tool,
    status: dto.status === "ERROR" ? "ERROR" : "OK",
    summary: dto.summary ?? null,
    createdAt: dto.createdAt,
  };
}

function mapCurrentRun(dto: AgentCurrentRunDto): AgentCurrentRun | null {
  // 종결 상태가 currentRun으로 오면(서버 계약 위반) 유휴로 본다 — 화면이 "완료"를 활성처럼 그리지 않게
  if (!ACTIVE_STATUSES.includes(dto.status as AgentActiveRunStatus)) return null;
  return {
    id: String(dto.id),
    status: dto.status as AgentActiveRunStatus,
    issueKey: dto.issueKey ?? null,
    type: runType(dto.type),
    trigger: runTrigger(dto.trigger),
    attempt: dto.attempt,
    model: dto.model ?? null,
    startedAt: dto.startedAt ?? null,
  };
}

export function mapAgentRunSummary(dto: AgentRunSummaryDto): AgentRunSummary {
  return {
    id: String(dto.id),
    issueKey: dto.issueKey ?? null,
    status: pick(RUN_STATUSES, dto.status, "QUEUED"),
    personaId: String(dto.personaId),
    attempt: dto.attempt,
    model: dto.model ?? null,
    startedAt: dto.startedAt ?? null,
    endedAt: dto.endedAt ?? null,
    type: runType(dto.type),
    trigger: runTrigger(dto.trigger),
    parentRunId: dto.parentRunId === null || dto.parentRunId === undefined ? null : String(dto.parentRunId),
  };
}

function mapPersona(dto: AgentOfficePersonaDto): AgentOfficePersona {
  return {
    id: String(dto.id),
    slug: dto.slug,
    name: dto.name,
    emoji: dto.emoji || null,
    role: pick(ROLES, dto.role, "FRONTEND"),
    active: dto.active,
    currentRun: dto.currentRun ? mapCurrentRun(dto.currentRun) : null,
    lastActivity: dto.lastActivity ? mapAgentAuditEntry(dto.lastActivity) : null,
    todayCostUsd: money(dto.todayCostUsd) ?? 0,
  };
}

function mapGate(dto: AgentPendingGateDto): AgentPendingGate {
  return {
    id: String(dto.id),
    runId: String(dto.runId),
    issueKey: dto.issueKey ?? null,
    personaId: String(dto.personaId),
    kind: pick(GATE_KINDS, dto.kind, "ESCALATION"),
    requestSummary: dto.requestSummary ?? "",
    requestedAt: dto.requestedAt,
  };
}

const PROJECT_WIDE_KEY = /^PROJECT-\d+$/;

/**
 * 안건 이슈 없는 회의 run인가 — 서버가 issueKey 자리에 합성 키 `PROJECT-<projectId>`를 넣는다(ALM에 없는 이슈).
 * run 요약·현재 run에는 projectId가 없어 게시판 매퍼처럼 "정확히 그 프로젝트 번호"로 대조할 수 없다. 그래서
 * 회의 종류 && `PROJECT-<숫자>` 형태로 완화한다. 한계: 프로젝트 키가 "PROJECT"인 ALM 프로젝트의 실제 이슈를 안건으로 연
 * 회의는 여기서 "프로젝트 전반"으로 잘못 보인다(TASK·REVIEW run은 해당 없음).
 */
export function isProjectWideMeeting(run: { type: AgentRunType; issueKey: string | null }): boolean {
  return MEETING_TYPES.includes(run.type as AgentMeetingType) && !!run.issueKey && PROJECT_WIDE_KEY.test(run.issueKey);
}

/**
 * 그 프로젝트의 합성 키. 서버 id는 숫자라 그대로이고, 목업 프로젝트 id("p1")는 숫자만 남긴다 — 목업이 같은 함수로 키를
 * 만들어 `isProjectWideMeeting`의 `PROJECT-<숫자>` 규칙과 run 목록의 프로젝트 범위가 목업에서도 성립한다.
 */
export function projectWideIssueKey(projectId: string): string {
  return `PROJECT-${projectId.replace(/\D/g, "")}`;
}

/** 합성 키(`PROJECT-<projectId>`)는 ALM에 없는 이슈다 — 화면이 이슈 링크를 걸지 않게 여기서 null로 접는다 */
export function mapAgentBoardPost(dto: AgentBoardPostDto): AgentBoardPost {
  const projectId = String(dto.projectId);
  return {
    runId: String(dto.runId),
    type: pick(MEETING_TYPES, dto.type, "MEETING"),
    agendaIssueKey: !dto.issueKey || dto.issueKey === `PROJECT-${projectId}` ? null : dto.issueKey,
    projectId,
    pageId: String(dto.pageId),
    spaceId: dto.spaceId === null || dto.spaceId === undefined ? null : String(dto.spaceId),
    endedAt: dto.endedAt,
  };
}

export function mapAgentMeetingCreated(dto: AgentMeetingCreatedDto): AgentMeetingCreated {
  return {
    run: mapAgentRunSummary(dto.run),
    attendees: (dto.attendees ?? []).map(
      (a): AgentMeetingAttendee => ({
        personaId: String(a.personaId),
        slug: a.slug,
        name: a.name,
        role: pick(ROLES, a.role, "FRONTEND"),
        emoji: a.emoji || null,
      }),
    ),
  };
}

export function mapAgentOffice(dto: AgentOfficeDto): AgentOffice {
  return {
    personas: (dto.personas ?? []).map(mapPersona),
    recentRuns: (dto.recentRuns ?? []).map(mapAgentRunSummary),
    pendingGateCount: dto.pendingGateCount ?? 0,
    pendingGates: (dto.pendingGates ?? []).map(mapGate),
    budget: {
      monthlyCapUsd: money(dto.budget?.monthlyCapUsd),
      platformMonthToDateUsd: money(dto.budget?.platformMonthToDateUsd) ?? 0,
      killSwitch: dto.budget?.killSwitch ?? false,
    },
    generatedAt: dto.generatedAt ?? new Date().toISOString(),
    boardPosts: (dto.boardPosts ?? []).map(mapAgentBoardPost),
  };
}

export function mapAgentPersonaActivity(dto: AgentPersonaActivityDto): AgentPersonaActivity {
  return {
    personaId: String(dto.personaId),
    runs: (dto.runs ?? []).map(mapAgentRunSummary),
    todayAudits: (dto.todayAudits ?? []).map(mapAgentAuditEntry),
    todayCostUsd: money(dto.todayCostUsd) ?? 0,
  };
}

export function mapAgentGate(dto: AgentGateDto): AgentGate {
  return {
    id: String(dto.id),
    runId: String(dto.runId),
    issueKey: dto.issueKey ?? null,
    kind: pick(GATE_KINDS, dto.kind, "ESCALATION"),
    request: dto.request ?? "",
    decision: dto.decision === "APPROVE" || dto.decision === "REJECT" ? dto.decision : null,
    requestedAt: dto.requestedAt,
  };
}

export function mapAgentPersona(dto: AgentPersonaDto): AgentPersona {
  return { id: String(dto.id), name: dto.name, emoji: dto.emoji || null };
}
