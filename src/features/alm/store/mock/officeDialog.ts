// localStorage 목업 스토어 — officeDialog (jiraMock.ts에서 분할, 동작 불변)
import type { AgentRunDirective, AgentRunCreateInput, AgentRunSummary, AgentDialogEntry, AgentDialogEntryInput, AgentChatReply, AgentChatInput, AgentDialogPage } from "../types";
import { ApiError } from "../mapping";
import { mockAllRuns, notifyMockOffice, AGENT_ACTIVE, agentState } from "./officeRuns";
import { teamState, type MockDirective, AGENT_FORBIDDEN, mockEffectiveSite } from "./aiTeam";
import { load, clone } from "./db";
import { baseOfficePersonas } from "./office";

// ── 실행 중 지시(목업, P4b D-P4b-5) — 검증 순서·문구는 agent-service RunDirectiveService(본문 400 → run 404 → RUNNING 409) ──

/** 목업 전달 — 워커가 다음 도구를 부르는 데 걸리는 시간. 시드(hold)는 전달하지 않는다 */
const MOCK_DIRECTIVE_DELIVERY_MS = 15_000;

const DIRECTIVE_MAX = 2000;

/** 서버처럼 실행 중(RUNNING)인 run에만 전달한다 — 끝난 run에 남은 지시는 미전달로 남는다 */
export function deliverDueDirectives(now: number): void {
  const running = new Set(mockAllRuns(now).filter((r) => r.status === "RUNNING").map((r) => r.id));
  for (const list of teamState.directives.values()) {
    for (const d of list) {
      if (d.deliveredAt || d.hold || !running.has(d.runId)) continue;
      if (now - Date.parse(d.createdAt) >= MOCK_DIRECTIVE_DELIVERY_MS) d.deliveredAt = new Date(now).toISOString();
    }
  }
}

export function pendingDirectiveCount(runId: string): number {
  return (teamState.directives.get(runId) ?? []).filter((d) => !d.deliveredAt).length;
}

const directiveView = (d: MockDirective, withText: boolean): AgentRunDirective => ({
  id: d.id,
  runId: d.runId,
  text: withText ? d.text : null,
  createdAt: d.createdAt,
  deliveredAt: d.deliveredAt,
});

/** 누구나 — 본문은 관리자에게만. 구 백엔드(404)면 null */
export async function fetchRunDirectives(runId: string): Promise<AgentRunDirective[] | null> {
  if (!teamState.directivesApi) return null;
  const now = Date.now();
  if (!mockAllRuns(now).some((r) => r.id === runId)) throw new ApiError(404, `run을 찾을 수 없습니다: ${runId}`);
  deliverDueDirectives(now);
  return (teamState.directives.get(runId) ?? []).map((d) => directiveView(d, teamState.permissions.canManage));
}

export async function sendRunDirective(runId: string, text: string): Promise<AgentRunDirective> {
  if (!teamState.directivesApi) throw new ApiError(404, "찾을 수 없습니다.");
  if (!teamState.permissions.canManage) throw new ApiError(403, AGENT_FORBIDDEN);
  const body = text.trim();
  if (!body) throw new ApiError(400, "text가 필요합니다");
  if (body.length > DIRECTIVE_MAX) throw new ApiError(400, `text는 ${DIRECTIVE_MAX}자 이하여야 합니다`);
  const now = Date.now();
  const run = mockAllRuns(now).find((r) => r.id === runId);
  if (!run) throw new ApiError(404, `run을 찾을 수 없습니다: ${runId}`);
  if (run.status !== "RUNNING") {
    throw new ApiError(
      409,
      `실행 중(RUNNING)인 run에만 지시할 수 있습니다(현재: ${run.status}) — 대기 중이면 취소 후 지시문과 함께 다시 요청하거나 이슈 코멘트로 남기세요`,
    );
  }
  const directive: MockDirective = {
    id: String(teamState.seq++),
    runId,
    text: body,
    createdAt: new Date(now).toISOString(),
    deliveredAt: null,
  };
  const list = teamState.directives.get(runId) ?? [];
  list.push(directive);
  teamState.directives.set(runId, list);
  notifyMockOffice("directive");
  return directiveView(directive, true);
}

// ── AI 사무실 1:1 대화(목업, P3g) — 거부 문구·순서는 agent-service RunService.createUserRun·ChatService·DialogService를 따른다 ──

const CHAT_OFF = "수다 기능이 꺼져 있습니다";

const CHAT_ERRORS: Record<number, string> = {
  409: "킬 스위치가 켜져 있거나 이달 예산 상한에 도달했습니다",
  429: "잠시 뒤 다시 시도하세요",
  503: CHAT_OFF,
};

/** 서버 USER run — 이슈 404 → 페르소나 404 → 관리 권한 403 → 비활성 400 → 같은 이슈 활성 run 409 */
export async function createAgentRun(input: AgentRunCreateInput): Promise<AgentRunSummary> {
  const now = Date.now();
  const key = input.issueKey.trim().toUpperCase();
  if (!key) throw new ApiError(400, "issueKey는 필수입니다");
  if ((input.instruction?.length ?? 0) > 4000) throw new ApiError(400, "instruction은 4000자 이하여야 합니다");
  const issue = load().issues.find((i) => i.key === key);
  if (!issue) throw new ApiError(404, `이슈를 찾을 수 없습니다: ${key}`);
  const persona = baseOfficePersonas(now).find((p) => p.slug === input.personaSlug);
  if (!persona) throw new ApiError(404, `페르소나를 찾을 수 없습니다: ${input.personaSlug}`);
  if (!teamState.permissions.canManage) throw new ApiError(403, AGENT_FORBIDDEN);
  const team = teamState.personas.find((p) => p.slug === input.personaSlug);
  if (team && !team.active) throw new ApiError(400, `비활성 페르소나입니다: ${input.personaSlug}`);
  if (mockAllRuns(now).some((r) => r.issueKey === key && AGENT_ACTIVE.includes(r.status))) {
    throw new ApiError(409, `이미 진행 중인 run이 있습니다: ${key}`);
  }
  const run: AgentRunSummary = {
    id: String(agentState.seq++),
    issueKey: key,
    status: "QUEUED",
    personaId: persona.id,
    attempt: 1,
    model: input.model?.trim() || null,
    startedAt: null,
    endedAt: null,
    type: "TASK",
    trigger: "USER",
    parentRunId: null,
    executionSite: input.executionSite ?? mockEffectiveSite(issue.projectId),
    runnerId: null,
  };
  agentState.added.push(run);
  const instruction = input.instruction?.trim();
  if (instruction) agentState.instructions.set(run.id, instruction);
  notifyMockOffice("run");
  return { ...run };
}

function mockDialogOf(personaId: string): AgentDialogEntry[] {
  let list = teamState.dialogs.get(personaId);
  if (!list) {
    list = [];
    teamState.dialogs.set(personaId, list);
  }
  return list;
}

function pushDialog(personaId: string, input: AgentDialogEntryInput): AgentDialogEntry {
  const entry: AgentDialogEntry = {
    id: String(teamState.seq++),
    speaker: input.speaker,
    kind: input.kind,
    text: input.text.slice(0, 2000),
    issueKey: input.issueKey ?? null,
    runId: input.runId ?? null,
    commentId: input.commentId ?? null,
    createdAt: new Date().toISOString(),
  };
  mockDialogOf(personaId).push(entry);
  return entry;
}

function requireMockPersona(personaId: string): void {
  if (!baseOfficePersonas(Date.now()).some((p) => p.id === personaId)) {
    throw new ApiError(404, `페르소나를 찾을 수 없습니다: id=${personaId}`);
  }
}

/** 작업을 시키는 말투면 서버처럼 suggest=DIRECTIVE — 수다는 일을 시키지 못한다 */
const WORK_REQUEST = /(해\s?줘|해\s?주세요|고쳐|만들어|추가해|수정해)/;

function mockChatReply(message: string): Omit<AgentChatReply, "sessionId"> {
  if (WORK_REQUEST.test(message)) {
    return { reply: "그건 '지시하기'로 남겨 주시면 다음 단계에서 꼭 챙길게요!", mood: "NEUTRAL", suggest: "DIRECTIVE" };
  }
  if (/(힘들|어려|막혀)/.test(message)) {
    return { reply: "음… 테스트가 자꾸 깨져서 조금 헤매는 중이에요.", mood: "TROUBLED", suggest: null };
  }
  if (/(고마|잘했|최고|수고)/.test(message)) {
    return { reply: "헤헤, 그렇게 말해 주시니 힘이 나요!", mood: "HAPPY", suggest: null };
  }
  return { reply: "그렇군요! 저는 오늘도 이슈들을 하나씩 정리하는 중이에요.", mood: null, suggest: null };
}

export async function sendPersonaChat(personaId: string, input: AgentChatInput): Promise<AgentChatReply> {
  if (!teamState.chat) throw new ApiError(503, CHAT_OFF);
  if (teamState.chatError !== null) {
    throw new ApiError(teamState.chatError, CHAT_ERRORS[teamState.chatError] ?? `요청 실패(${teamState.chatError})`);
  }
  requireMockPersona(personaId);
  const message = input.message.trim();
  if (!message || message.length > 500) throw new ApiError(400, "message는 1~500자여야 합니다");
  const sessionId = input.sessionId ?? `c-${teamState.chatSeq++}`;
  const answer = mockChatReply(message);
  if (teamState.dialogApi) {
    pushDialog(personaId, { speaker: "USER", kind: "SAY", text: message });
    pushDialog(personaId, { speaker: "PERSONA", kind: "SAY", text: answer.reply });
  }
  return { sessionId, ...answer };
}

export async function fetchPersonaDialog(
  personaId: string,
  options: { before?: string; limit?: number } = {},
): Promise<AgentDialogPage> {
  if (!teamState.dialogApi) throw new ApiError(404, "찾을 수 없습니다.");
  requireMockPersona(personaId);
  const limit = options.limit ?? 50;
  const all = mockDialogOf(personaId);
  const end = options.before ? all.findIndex((e) => e.id === options.before) : all.length;
  const upto = end < 0 ? all.length : end;
  const start = Math.max(0, upto - limit);
  return { entries: clone(all.slice(start, upto)), hasMore: start > 0 };
}

export async function savePersonaDialog(personaId: string, entries: AgentDialogEntryInput[]): Promise<number> {
  if (!teamState.dialogApi) throw new ApiError(404, "찾을 수 없습니다.");
  requireMockPersona(personaId);
  if (entries.length === 0) throw new ApiError(400, "entries가 필요합니다");
  if (entries.length > 20) throw new ApiError(400, "한 번에 20건까지 저장할 수 있습니다");
  for (const entry of entries) pushDialog(personaId, entry);
  return entries.length;
}
