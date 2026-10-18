// localStorage 목업 스토어 — officeRuns (jiraMock.ts에서 분할, 동작 불변)
import type { AgentRunStatus, AgentRunSummary, AgentGateDecision, AgentCurrentRun, AgentOfficePersona, AgentGate, AgentRunQuery, AgentRunPage, AgentRunDetail, OfficeStreamReason, OfficeStreamHandlers, AgentRole, AgentMeetingInput, AgentMeetingCreated } from "../types";
import { projectWideIssueKey, AGENT_RUN_PAGE_SIZE } from "../agentMapping";
import { ApiError } from "../mapping";
import { OfficeStreamError } from "../officeStream";
import { mockRun, baseOfficePersonas, baseMeetingRun, baseRecentRuns } from "./office";
import { mockRunnerOfRun, teamState, mockEffectiveSite } from "./aiTeam";
import { ago } from "./clock";
import { load } from "./db";

// ── run·게이트 감독(목업) — 사무실 목업과 같은 run들 + 계보용 과거 run·다른 프로젝트 run ──────
// 취소·재개·승인·거절은 모듈 상태(agentState)에 덮어쓰기로 남는다 — 사무실 목업도 같은 덮어쓰기를 본다.
// 전이 규칙·거부 문구는 agent-service(Run.CANCELLABLE·RunResumeService·GateService)를 따른다.

interface AgentMockState {
  /** 닫힌 run — 원래 상태 대신 이 값을 본다 */
  closed: Map<string, { status: AgentRunStatus; endedAt: string }>;
  /** 재개·승인이 만든 후속 run(attempt+1) */
  added: AgentRunSummary[];
  decisions: Map<string, AgentGateDecision>;
  /** 프로젝트 → 소집된 회의 run id — 그 run이 아직 활성이면 같은 프로젝트 재소집은 409 */
  meetings: Map<string, string>;
  /** 사람 지시문(USER run) — 상세 API는 관리자에게만 싣는다 */
  instructions: Map<string, string>;
  seq: number;
}

function freshAgentState(): AgentMockState {
  return { closed: new Map(), added: [], decisions: new Map(), meetings: new Map(), instructions: new Map(), seq: 9100 };
}

export let agentState: AgentMockState = freshAgentState();

/** 테스트 초기화(`__resetForTest`) — run·게이트 목업 상태를 처음으로 */
export function resetAgentMockState(): void {
  agentState = freshAgentState();
}

const AGENT_CANCELLABLE: readonly AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "FAILED"];

const AGENT_RESUMABLE: readonly AgentRunStatus[] = ["BLOCKED", "FAILED"];

export const AGENT_ACTIVE: readonly AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED"];

export function withOverride(run: AgentRunSummary): AgentRunSummary {
  const closed = agentState.closed.get(run.id);
  return closed ? { ...run, ...closed } : run;
}

function toCurrentRun(run: AgentRunSummary): AgentCurrentRun {
  return {
    id: run.id,
    status: run.status as AgentCurrentRun["status"],
    issueKey: run.issueKey,
    type: run.type,
    trigger: run.trigger,
    attempt: run.attempt,
    model: run.model,
    startedAt: run.startedAt,
    executionSite: run.executionSite ?? "SERVER",
  };
}

/** 사무실 응답에 덮어쓰기 반영 — 닫힌 현재 run은 후속 run(있으면)으로 바뀌고, 최근 run 상태도 갱신 */
export function applyAgentOverrides(personas: AgentOfficePersona[], recentRuns: AgentRunSummary[]): void {
  for (const persona of personas) {
    const successor = [...agentState.added]
      .reverse()
      .map(withOverride)
      .find((r) => r.personaId === persona.id && AGENT_ACTIVE.includes(r.status));
    const current = persona.currentRun;
    if (!current || agentState.closed.has(current.id)) {
      persona.currentRun = successor ? toCurrentRun(successor) : null;
    }
  }
  recentRuns.forEach((run, i) => {
    recentRuns[i] = withOverride(run);
  });
}

/** 사무실 목업 밖의 과거 run — 같은 이슈 재시도 계보(ALM-5)·리뷰 부모(ALM-1)·다른 프로젝트(WEB-2) */
function mockRunHistory(now: number): AgentRunSummary[] {
  return [
    mockRun(now, "8985", "103", "DONE", "ALM-1", 60, 20),
    mockRun(now, "8983", "104", "FAILED", "ALM-5", 150, 140, { attempt: 2 }),
    mockRun(now, "8982", "104", "FAILED", "ALM-5", 200, 190),
    mockRun(now, "8981", "105", "DONE", "WEB-2", 400, 380, { trigger: "USER" }),
  ];
}

/** 전체 run(서버 findAll처럼 전역) — 최신 id 먼저 */
export function mockAllRuns(now: number): AgentRunSummary[] {
  const byId = new Map<string, AgentRunSummary>();
  for (const persona of baseOfficePersonas(now)) {
    const cur = persona.currentRun;
    if (!cur) continue;
    byId.set(cur.id, {
      id: cur.id, issueKey: cur.issueKey, status: cur.status, personaId: persona.id, attempt: cur.attempt,
      model: cur.model, startedAt: cur.startedAt, endedAt: null, type: cur.type, trigger: cur.trigger,
      // 리뷰 run의 부모 = 검증 대상 TASK run
      parentRunId: cur.id === "9006" ? "8985" : null,
      executionSite: cur.executionSite ?? "SERVER",
      runnerId: mockRunnerOfRun(cur.id),
    });
  }
  for (const run of [baseMeetingRun(now), ...baseRecentRuns(now), ...mockRunHistory(now)]) {
    if (!byId.has(run.id)) byId.set(run.id, run);
  }
  for (const run of agentState.added) byId.set(run.id, run);
  return [...byId.values()].map(withOverride).sort((a, b) => Number(b.id) - Number(a.id));
}

export function mockGates(now: number): AgentGate[] {
  const seed: AgentGate[] = [
    {
      id: "501", runId: "9003", issueKey: "ALM-3", kind: "MERGE",
      request: "PR #41 머지 승인 요청 — 이슈 상세 모달 개선", decision: null, requestedAt: ago(now, 3),
    },
    {
      id: "498", runId: "8985", issueKey: "ALM-1", kind: "MERGE",
      request: "PR #39 머지 승인 요청 — 로그인 리다이렉트 정리", decision: "APPROVE", requestedAt: ago(now, 40),
    },
    {
      id: "497", runId: "8987", issueKey: null, kind: "PLAN",
      request: "계획 승인 요청 — 알림 설정 화면을 두 단계로 나눈다", decision: "REJECT", requestedAt: ago(now, 298),
    },
  ];
  return seed.map((g) => ({ ...g, decision: agentState.decisions.get(g.id) ?? g.decision }));
}

function closeRun(run: AgentRunSummary, now: number): void {
  notifyMockOffice("run");
  agentState.closed.set(run.id, { status: "CANCELLED", endedAt: new Date(now).toISOString() });
}

/** 서버 Run.continuation — attempt+1 새 run(QUEUED), 부모는 그대로 잇는다 */
function continueRun(run: AgentRunSummary): void {
  agentState.added.push({
    ...run,
    id: String(agentState.seq++),
    status: "QUEUED",
    attempt: run.attempt + 1,
    startedAt: null,
    endedAt: null,
  });
}

function requireRun(now: number, runId: string): AgentRunSummary {
  const run = mockAllRuns(now).find((r) => r.id === runId);
  if (!run) throw new Error(`run을 찾을 수 없습니다: ${runId}`);
  return run;
}

/** 목업 run의 프로젝트 — 서버는 run.project_id로 거르지만 목업 run에는 없어 이슈키 접두어·합성 키로 맞춘다 */
function mockRunInProject(run: AgentRunSummary, projectId: string): boolean {
  if (run.issueKey === projectWideIssueKey(projectId)) return true;
  const key = load().projects.find((p) => p.id === projectId)?.key;
  const dash = run.issueKey?.lastIndexOf("-") ?? -1;
  return !!key && !!run.issueKey && dash > 0 && run.issueKey.slice(0, dash).toUpperCase() === key.toUpperCase();
}

/** 서버 `GET /api/agent/runs` — 조건 AND, id 내림차순, size 1~100 밖이면 400 */
export async function fetchAgentRuns(query: AgentRunQuery = {}): Promise<AgentRunPage> {
  const page = query.page ?? 0;
  const size = query.size ?? AGENT_RUN_PAGE_SIZE;
  if (size < 1 || size > 100) throw new ApiError(400, "size는 1~100이어야 합니다");
  if (page < 0) throw new ApiError(400, "page는 0 이상이어야 합니다");
  const all = mockAllRuns(Date.now()).filter(
    (r) =>
      (!query.status || r.status === query.status) &&
      (!query.personaId || r.personaId === query.personaId) &&
      (!query.type || r.type === query.type) &&
      (!query.projectId || mockRunInProject(r, query.projectId)),
  );
  return {
    items: all.slice(page * size, (page + 1) * size),
    page,
    size,
    total: all.length,
    hasNext: (page + 1) * size < all.length,
  };
}

/** 목업 run 오류 로그 — 실패·차단 run만 */
const MOCK_RUN_ERRORS: Record<string, string> = {
  "9004": "claude 워커 종료 코드 1 — 테스트 3건 실패(IssueSearchTest)\n재시도 전 사람 확인이 필요합니다",
  "8983": "빌드 실패: gradle compileJava — 심볼을 찾을 수 없습니다(IssueRepository.findByKey)",
  "8982": "워커 시간 초과(45분)",
};

/** 서버 `GET /api/agent/runs/{id}` — error·instruction은 관리자에게만(그 밖은 null + redacted) */
export async function fetchAgentRun(runId: string): Promise<AgentRunDetail> {
  const now = Date.now();
  const run = mockAllRuns(now).find((r) => r.id === runId);
  if (!run) throw new ApiError(404, `run을 찾을 수 없습니다: ${runId}`);
  const manager = teamState.permissions.canManage;
  const meeting = agentState.meetings.size > 0 ? [...agentState.meetings.entries()].find(([, id]) => id === runId) : undefined;
  return {
    ...run,
    projectId: meeting ? meeting[0] : "p1",
    outputPageId: null,
    attendeePersonaIds: [],
    rejectCount: 0,
    createdAt: run.startedAt,
    updatedAt: run.endedAt ?? run.startedAt,
    error: manager ? (MOCK_RUN_ERRORS[runId] ?? null) : null,
    instruction: manager ? (agentState.instructions.get(runId) ?? null) : null,
    redacted: !manager,
  };
}

// ── 사무실 무효화 스트림(목업, P4c §15) — 목업 변경(취소·재개·결정·요청·지시)마다 신호를 흉내 낸다 ──
// 테스트는 기본으로 스트림이 없는 환경(= 폴링)이다. 목업 dev 서버는 실시간으로 보인다.

const mockOfficeListeners = new Set<(reason: OfficeStreamReason) => void>();

let mockOfficeStreamOn = import.meta.env.MODE !== "test";

export function notifyMockOffice(reason: OfficeStreamReason): void {
  // 서버처럼 커밋 뒤에 흐른다 — 변경을 마친 다음 틱
  setTimeout(() => {
    for (const listener of mockOfficeListeners) listener(reason);
  }, 0);
}

/** 테스트 초기화(`__resetForTest`) — 스트림을 끄고 구독자를 비운다 */
export function resetMockOfficeStream(): void {
  mockOfficeStreamOn = false;
  mockOfficeListeners.clear();
}

/** 테스트 전용 — 목업 스트림을 켜고 끈다(`__resetForTest`가 끈다) */
export function __setMockOfficeStream(on: boolean): void {
  mockOfficeStreamOn = on;
}

export async function streamOffice(_projectId: string | undefined, handlers: OfficeStreamHandlers): Promise<void> {
  if (!mockOfficeStreamOn) throw new OfficeStreamError("unsupported", 404);
  const { signal } = handlers;
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  handlers.onOpen();
  handlers.onActivity();
  const listener = (reason: OfficeStreamReason) => {
    handlers.onActivity();
    handlers.onEvent({ reason, projectId: null, at: new Date().toISOString() });
  };
  mockOfficeListeners.add(listener);
  // 서버 heartbeat(15초) — 생존 판정(45초)이 목업 스트림을 죽이지 않게
  const heartbeat = setInterval(() => handlers.onActivity(), 15_000);
  try {
    await new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  } finally {
    clearInterval(heartbeat);
    mockOfficeListeners.delete(listener);
  }
}

export async function cancelRun(runId: string): Promise<void> {
  const now = Date.now();
  const run = requireRun(now, runId);
  if (!AGENT_CANCELLABLE.includes(run.status)) {
    throw new Error(`취소할 수 없는 상태의 run입니다(현재: ${run.status}): run=${runId}`);
  }
  closeRun(run, now);
}

export async function resumeRun(runId: string): Promise<void> {
  const now = Date.now();
  const run = requireRun(now, runId);
  if (!AGENT_RESUMABLE.includes(run.status)) {
    throw new Error(`BLOCKED 또는 FAILED 상태가 아닌 run은 재개할 수 없습니다(현재: ${run.status}): run=${runId}`);
  }
  continueRun(run);
  closeRun(run, now);
}

export async function fetchAgentGates(options: { pending: boolean }): Promise<AgentGate[]> {
  const gates = mockGates(Date.now()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return options.pending ? gates.filter((g) => g.decision === null) : gates.slice(0, 50);
}

function decideGate(gateId: string, decision: AgentGateDecision): void {
  const now = Date.now();
  const gate = mockGates(now).find((g) => g.id === gateId);
  if (!gate) throw new Error(`게이트를 찾을 수 없습니다: ${gateId}`);
  const run = requireRun(now, gate.runId);
  if (gate.decision !== null || run.status !== "WAITING_APPROVAL") {
    throw new Error(`WAITING_APPROVAL 상태가 아닌 run의 게이트는 결정할 수 없습니다(현재: ${run.status}): run=${run.id}`);
  }
  agentState.decisions.set(gateId, decision);
  if (decision === "APPROVE") continueRun(run);
  closeRun(run, now);
}

export async function approveGate(gateId: string): Promise<void> {
  decideGate(gateId, "APPROVE");
}

export async function rejectGate(gateId: string): Promise<void> {
  decideGate(gateId, "REJECT");
}

// ── 회의 소집(목업) — 검증 순서·거부 문구는 agent-service MeetingService·MeetingCreateRequest를 따른다 ──

const MEETING_PLANNING_ROLES: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND"];

function mockMeetingAttendees(input: AgentMeetingInput, now: number): AgentOfficePersona[] {
  const active = baseOfficePersonas(now).filter((p) => p.active);
  if (input.personaSlugs && input.personaSlugs.length > 0) {
    const picked = input.personaSlugs.map((slug) => {
      const persona = baseOfficePersonas(now).find((p) => p.slug === slug);
      if (!persona) throw new Error(`페르소나를 찾을 수 없습니다: ${slug}`);
      if (!persona.active) throw new Error(`비활성 페르소나는 회의에 참석할 수 없습니다: ${slug}`);
      return persona;
    });
    if (input.type === "MANAGER" && (picked.length !== 1 || picked[0].role !== "MANAGER")) {
      throw new Error("MANAGER run의 personaSlugs는 MANAGER 롤 페르소나 1명이어야 합니다");
    }
    return picked;
  }
  if (input.type === "MEETING") return active.filter((p) => MEETING_PLANNING_ROLES.includes(p.role));
  // 매니저 보고는 매니저 1명 단독(여럿이면 id 최솟값), 회고 "전원"에서 매니저는 빠진다
  if (input.type === "MANAGER") return active.filter((p) => p.role === "MANAGER").slice(0, 1);
  if (input.type === "RETRO") return active.filter((p) => p.role !== "MANAGER");
  // 에스컬레이션 — 목업은 run 이력으로 "관련 롤"을 찾지 않고 기획 + 리뷰로 앉힌다(서버의 관련 run 없음 경로)
  return active.filter((p) => p.role === "PLANNER" || p.role === "REVIEWER");
}

export async function createMeeting(input: AgentMeetingInput): Promise<AgentMeetingCreated> {
  const now = Date.now();
  const issueKeyInput = input.agendaIssueKey?.trim() || null;
  const agenda = input.agenda?.trim() || null;
  if (issueKeyInput && issueKeyInput.length > 40) throw new Error("agendaIssueKey는 40자 이하여야 합니다");
  if (agenda && agenda.length > 4000) throw new Error("agenda는 4000자 이하여야 합니다");
  if ((input.personaSlugs?.length ?? 0) > 20) throw new Error("personaSlugs는 20명 이하여야 합니다");
  if (input.type !== "RETRO" && input.type !== "MANAGER" && !issueKeyInput && !agenda) {
    throw new Error(`${input.type} 회의에는 agendaIssueKey 또는 agenda가 필요합니다`);
  }
  const attendees = mockMeetingAttendees(input, now);
  if (attendees.length === 0) throw new Error(`${input.type} 회의에 참석할 활성 페르소나가 없습니다`);

  let issueKey = projectWideIssueKey(input.projectId);
  if (issueKeyInput) {
    const issue = load().issues.find((i) => i.key === issueKeyInput.toUpperCase());
    if (!issue) throw new Error(`이슈를 찾을 수 없습니다: ${issueKeyInput}`);
    if (issue.projectId !== input.projectId) {
      throw new Error(`안건 이슈 ${issue.key}는 프로젝트 ${input.projectId} 소속이 아닙니다`);
    }
    issueKey = issue.key;
  }
  const activeId = agentState.meetings.get(input.projectId);
  if (activeId && mockAllRuns(now).some((r) => r.id === activeId && AGENT_ACTIVE.includes(r.status))) {
    throw new Error(`이 프로젝트에 이미 진행 중인 회의 run이 있습니다: projectId=${input.projectId}`);
  }

  const run: AgentRunSummary = {
    id: String(agentState.seq++),
    issueKey,
    status: "QUEUED",
    personaId: attendees[0].id,
    attempt: 1,
    model: "claude-sonnet-5",
    startedAt: null,
    endedAt: null,
    type: input.type,
    trigger: "USER",
    parentRunId: null,
    executionSite: input.executionSite ?? mockEffectiveSite(input.projectId),
    runnerId: null,
  };
  agentState.added.push(run);
  agentState.meetings.set(input.projectId, run.id);
  notifyMockOffice("run");
  return {
    run: { ...run },
    attendees: attendees.map((p) => ({ personaId: p.id, slug: p.slug, name: p.name, role: p.role, emoji: p.emoji })),
  };
}
