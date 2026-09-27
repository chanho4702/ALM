/**
 * agent-service 응답 ↔ 프론트 타입 경계 매퍼(AI 사무실·run·게이트 공용).
 * 서버 long id → string, BigDecimal(숫자 또는 문자열로 올 수 있음) → number, 모르는 enum은 안전한 값으로 접는다.
 */
import type {
  AgentActiveMeeting,
  AgentActiveRunStatus,
  AgentAuditEntry,
  AgentBoardPost,
  AgentChatMood,
  AgentChatReply,
  AgentCredentialScope,
  AgentCurrentRun,
  AgentDialogEntry,
  AgentDialogKind,
  AgentDialogPage,
  AgentDialogSpeaker,
  AgentGate,
  AgentGateKind,
  AgentMeetingAttendee,
  AgentMeetingCreated,
  AgentMeetingType,
  AgentOffice,
  AgentOfficePersona,
  AgentPendingGate,
  AgentPermissions,
  AgentPersona,
  AgentPersonaActivity,
  AgentPersonaDetail,
  AgentProjectCredential,
  AgentRole,
  AgentRunStatus,
  AgentRunSummary,
  AgentRunTrigger,
  AgentRunType,
  AgentTeamPersona,
  AgentToken,
  AgentTokenIssued,
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
  /** AGP-62 — JSON 문자열(구 백엔드는 없음) */
  avatarConfig?: unknown;
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
  /** P3e 이전 백엔드는 이 필드가 없다 */
  activeMeeting?: AgentActiveMeetingDto | null;
  /** P3g 이전 백엔드는 이 필드가 없다 — 없으면 전부 꺼짐 */
  features?: { chat?: boolean | null } | null;
}

export interface AgentActiveMeetingDto {
  runId: Id;
  type: string;
  status: string;
  issueKey: string | null;
  projectId: Id;
  hostPersonaId: Id | null;
  attendeePersonaIds?: Id[] | null;
  startedAt: string | null;
}

export interface AgentPersonaActivityDto {
  personaId: Id;
  runs?: AgentRunSummaryDto[] | null;
  todayAudits?: AgentAuditEntryDto[] | null;
  todayCostUsd: number | string | null;
}

const ROLES: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS", "REVIEWER", "MANAGER"];
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
const MEETING_TYPES: readonly AgentMeetingType[] = ["MEETING", "RETRO", "ESCALATION", "MANAGER"];

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
    avatarConfig: avatarConfigOf(dto.avatarConfig),
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

/**
 * 진행 중 회의 — 진행자는 `hostPersonaId`가 정본이고 명단 맨 앞에 오게 다시 세운다(중복 제거).
 * 진행자도 참석자도 없으면 앉힐 사람이 없으니 회의 없음(null)으로 접는다.
 */
export function mapAgentActiveMeeting(dto: AgentActiveMeetingDto | null | undefined): AgentActiveMeeting | null {
  if (!dto) return null;
  const listed = (dto.attendeePersonaIds ?? []).map(String);
  const host = dto.hostPersonaId === null || dto.hostPersonaId === undefined ? listed[0] : String(dto.hostPersonaId);
  if (!host) return null;
  return {
    runId: String(dto.runId),
    type: pick(MEETING_TYPES, dto.type, "MEETING"),
    status: pick(RUN_STATUSES, dto.status, "RUNNING"),
    issueKey: dto.issueKey ?? null,
    projectId: String(dto.projectId),
    hostPersonaId: host,
    attendeePersonaIds: [host, ...listed.filter((id, i) => id !== host && listed.indexOf(id) === i)],
    startedAt: dto.startedAt ?? null,
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
    activeMeeting: mapAgentActiveMeeting(dto.activeMeeting),
    features: { chat: dto.features?.chat === true },
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

// ── AI 팀 설정(P3f·P3h) ──

export interface AgentPermissionsDto {
  canManage?: boolean | null;
  isGlobalAdmin?: boolean | null;
}

/** PersonaResponse 전체 — projectId는 P3f 이전 백엔드엔 없다(= 공용으로 본다) */
export interface AgentTeamPersonaDto {
  id: Id;
  slug: string;
  role: string;
  name: string;
  emoji?: string | null;
  active: boolean;
  projectId?: Id | null;
  /** AGP-62 — JSON 문자열(구 백엔드는 없음) */
  avatarConfig?: unknown;
}

/** `GET/PATCH /api/agent/personas/{id}` 응답(PersonaDetailResponse) — 목록 필드 + 편집 필드 */
export interface AgentPersonaDetailDto extends AgentTeamPersonaDto {
  voicePrompt?: string | null;
  defaultModel?: string | null;
  skills?: string | null;
}

export interface AgentTokenDto {
  id: Id;
  label: string;
  personaSlug: string;
  createdAt?: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revoked?: boolean | null;
}

export interface AgentTokenIssuedDto {
  token: string;
  id: Id;
  label: string;
  personaSlug: string;
}

export interface AgentProjectCredentialDto {
  project?: {
    set?: boolean | null;
    provider?: string | null;
    keyHint?: string | null;
    updatedBy?: Id | null;
    updatedAt?: string | null;
  } | null;
  effective?: {
    scope?: string | null;
    keyHint?: string | null;
  } | null;
}

const CREDENTIAL_SCOPES: readonly AgentCredentialScope[] = ["PROJECT", "PLATFORM", "ENV", "NONE"];

const optId = (value: Id | null | undefined): string | null =>
  value === null || value === undefined ? null : String(value);

/**
 * avatarConfig 원문 — 계약은 JSON 문자열|null이지만, 객체로 온(직렬화 설정이 다른) 응답도 문자열로 되돌려 둔다.
 * 그 밖의 타입·빈 문자열은 null(= 기본 외형). 값 해석·검증은 office `parseAvatarConfig`가 한다.
 */
function avatarConfigOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** 판정 힌트라 모르는 값은 "못 한다"로 접는다 — 버튼이 잘못 열리는 쪽보다 닫히는 쪽이 안전하다 */
export function mapAgentPermissions(dto: AgentPermissionsDto | null): AgentPermissions {
  return { canManage: dto?.canManage === true, isGlobalAdmin: dto?.isGlobalAdmin === true };
}

export function mapAgentTeamPersona(dto: AgentTeamPersonaDto): AgentTeamPersona {
  return {
    id: String(dto.id),
    slug: dto.slug,
    name: dto.name,
    emoji: dto.emoji || null,
    role: pick(ROLES, dto.role, "FRONTEND"),
    active: dto.active,
    projectId: optId(dto.projectId),
    avatarConfig: avatarConfigOf(dto.avatarConfig),
  };
}

export function mapAgentPersonaDetail(dto: AgentPersonaDetailDto): AgentPersonaDetail {
  return {
    ...mapAgentTeamPersona(dto),
    avatarConfig: avatarConfigOf(dto.avatarConfig),
    voicePrompt: typeof dto.voicePrompt === "string" ? dto.voicePrompt : null,
    defaultModel: typeof dto.defaultModel === "string" && dto.defaultModel ? dto.defaultModel : null,
    skills: typeof dto.skills === "string" ? dto.skills : null,
  };
}

export function mapAgentToken(dto: AgentTokenDto): AgentToken {
  return {
    id: String(dto.id),
    label: dto.label,
    personaSlug: dto.personaSlug,
    createdAt: dto.createdAt ?? null,
    expiresAt: dto.expiresAt ?? null,
    lastUsedAt: dto.lastUsedAt ?? null,
    revoked: dto.revoked === true,
  };
}

export function mapAgentTokenIssued(dto: AgentTokenIssuedDto): AgentTokenIssued {
  return { token: dto.token, id: String(dto.id), label: dto.label, personaSlug: dto.personaSlug };
}

/** 출처를 모르면 NONE — "키 없음"으로 보이는 쪽이 "키 있음"으로 잘못 안심시키는 쪽보다 낫다 */
export function mapAgentProjectCredential(dto: AgentProjectCredentialDto | null): AgentProjectCredential {
  const project = dto?.project ?? null;
  const set = project?.set === true;
  return {
    project: {
      set,
      provider: set && project?.provider === "ANTHROPIC" ? "ANTHROPIC" : null,
      keyHint: set ? (project?.keyHint ?? null) : null,
      updatedBy: set ? optId(project?.updatedBy) : null,
      updatedAt: set ? (project?.updatedAt ?? null) : null,
    },
    effective: {
      scope: pick(CREDENTIAL_SCOPES, dto?.effective?.scope, "NONE"),
      keyHint: dto?.effective?.keyHint ?? null,
    },
  };
}

// ── P3g 1:1 대화 — 수다·대화 기록 ──

export interface AgentChatReplyDto {
  sessionId: string;
  reply: string | null;
  mood?: string | null;
  suggest?: string | null;
}

const CHAT_MOODS: readonly AgentChatMood[] = ["NEUTRAL", "THINKING", "HAPPY", "TROUBLED"];

/** 모르는 mood는 null(평소 표정), suggest는 "DIRECTIVE"만 인정한다 */
export function mapAgentChatReply(dto: AgentChatReplyDto): AgentChatReply {
  return {
    sessionId: dto.sessionId,
    reply: dto.reply ?? "",
    mood: CHAT_MOODS.includes(dto.mood as AgentChatMood) ? (dto.mood as AgentChatMood) : null,
    suggest: dto.suggest === "DIRECTIVE" ? "DIRECTIVE" : null,
  };
}

export interface AgentDialogEntryDto {
  id: Id;
  speaker: string;
  kind: string;
  text: string | null;
  issueKey?: string | null;
  runId?: Id | null;
  commentId?: Id | null;
  createdAt: string;
}

export interface AgentDialogPageDto {
  entries?: AgentDialogEntryDto[] | null;
  hasMore?: boolean | null;
}

const DIALOG_SPEAKERS: readonly AgentDialogSpeaker[] = ["USER", "PERSONA"];
const DIALOG_KINDS: readonly AgentDialogKind[] = ["SAY", "STATUS", "DIRECTIVE", "ASSIGN"];

export function mapAgentDialogEntry(dto: AgentDialogEntryDto): AgentDialogEntry {
  return {
    id: String(dto.id),
    speaker: pick(DIALOG_SPEAKERS, dto.speaker, "PERSONA"),
    kind: pick(DIALOG_KINDS, dto.kind, "SAY"),
    text: dto.text ?? "",
    issueKey: dto.issueKey ?? null,
    runId: optId(dto.runId),
    commentId: optId(dto.commentId),
    createdAt: dto.createdAt,
  };
}

/** 시간순(오래된 것 먼저)으로 정렬해 둔다 — 서버 계약이 이미 그렇지만 순서에 기대는 백로그가 깨지지 않게 */
export function mapAgentDialogPage(dto: AgentDialogPageDto | null): AgentDialogPage {
  const entries = (dto?.entries ?? []).map(mapAgentDialogEntry);
  entries.sort((a, b) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.createdAt.localeCompare(b.createdAt);
  });
  return { entries, hasMore: dto?.hasMore === true };
}
