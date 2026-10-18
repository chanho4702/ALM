// localStorage 목업 스토어 — office (jiraMock.ts에서 분할, 동작 불변)
import type { AgentRunSummary, AgentOfficePersona, AgentBoardPost, AgentActiveMeeting, AgentOffice, AgentPendingGate, AgentPersonaActivity, AgentAuditEntry } from "../types";
import { ago } from "./clock";
import { withOverride, applyAgentOverrides, mockAllRuns, mockGates } from "./officeRuns";
import { teamState, mockAwaitingRunner, mockReviewReady, mockRunnerOfRun } from "./aiTeam";
import { deliverDueDirectives, pendingDirectiveCount } from "./officeDialog";

// ── AI 사무실(목업) — 상태가 골고루 섞인 6인 팀 + 대기 게이트 1건 ─────────────
// agent-service가 없는 목업에서도 사무실 화면의 모든 상태(작업 중·대기열·승인 대기·차단·휴식·리뷰)를 본다.

export function mockRun(
  now: number,
  id: string,
  personaId: string,
  status: AgentRunSummary["status"],
  issueKey: string | null,
  startedMin: number,
  endedMin: number | null,
  extra: Partial<AgentRunSummary> = {},
): AgentRunSummary {
  return {
    id,
    issueKey,
    status,
    personaId,
    attempt: 1,
    model: "claude-sonnet-5",
    startedAt: ago(now, startedMin),
    endedAt: endedMin === null ? null : ago(now, endedMin),
    type: "TASK",
    trigger: "SCHEDULER",
    parentRunId: null,
    ...extra,
  };
}

export function baseOfficePersonas(now: number): AgentOfficePersona[] {
  return [
    {
      id: "101", slug: "planner-bot", name: "기획봇", emoji: "📝", role: "PLANNER", active: true,
      currentRun: { id: "9001", status: "RUNNING", issueKey: "ALM-4", type: "TASK", trigger: "SCHEDULER", attempt: 1, model: "claude-sonnet-5", startedAt: ago(now, 14) },
      lastActivity: { id: "70011", tool: "update_issue", status: "OK", summary: "ALM-4 인수 조건 보완", createdAt: ago(now, 1), origin: "WORKER", runId: "9001" },
      todayCostUsd: 0.42,
    },
    {
      id: "102", slug: "designer-bot", name: "디자인봇", emoji: "🎨", role: "DESIGNER", active: true,
      // 서버 실행 대기(P4a) — 목업 배포는 인프로세스가 꺼져 있고 플랫폼 러너가 오프라인이라 "서버 러너 대기"
      currentRun: { id: "9002", status: "QUEUED", issueKey: "ALM-2", type: "TASK", trigger: "USER", attempt: 1, model: null, startedAt: null, executionSite: "SERVER" },
      lastActivity: null,
      todayCostUsd: 0.18,
    },
    {
      id: "103", slug: "frontend-bot", name: "프론트봇", emoji: "🖥️", role: "FRONTEND", active: true,
      currentRun: { id: "9003", status: "WAITING_APPROVAL", issueKey: "ALM-3", type: "TASK", trigger: "SCHEDULER", attempt: 2, model: "claude-sonnet-5", startedAt: ago(now, 32) },
      lastActivity: { id: "70031", tool: "create_pr", status: "OK", summary: "PR #41 생성 — 이슈 상세 모달", createdAt: ago(now, 3), origin: "WORKER", runId: "9003" },
      todayCostUsd: 0.77,
    },
    {
      id: "104", slug: "backend-bot", name: "백엔드봇", emoji: "🛠️", role: "BACKEND", active: true,
      currentRun: { id: "9004", status: "BLOCKED", issueKey: "ALM-5", type: "TASK", trigger: "SCHEDULER", attempt: 3, model: "claude-sonnet-5", startedAt: ago(now, 95) },
      lastActivity: null,
      todayCostUsd: 1.05,
    },
    {
      // 원격 접속(AGP-63) — 워커 run 없이 사람이 발급한 페르소나 토큰으로 외부 Claude Code가 붙어 일하는 중
      id: "105", slug: "ops-bot", name: "운영봇", emoji: "⛑️", role: "OPS", active: true,
      currentRun: null,
      presence: "EXTERNAL",
      lastActivity: { id: "70051", tool: "search_issues", status: "OK", summary: "projectId=1 (검색어 생략)", createdAt: ago(now, 2), origin: "EXTERNAL", runId: null },
      todayCostUsd: 0,
    },
    {
      id: "106", slug: "reviewer-bot", name: "리뷰봇", emoji: "🔍", role: "REVIEWER", active: true,
      // 내 PC 러너(P4a) — 모니터에 도트 집, 러너 "chanho 노트북"(41)이 돌리는 중
      currentRun: { id: "9006", status: "RUNNING", issueKey: "ALM-1", type: "REVIEW", trigger: "SCHEDULER", attempt: 1, model: "claude-opus-5-5", startedAt: ago(now, 6), executionSite: "LOCAL" },
      lastActivity: { id: "70061", tool: "report_progress", status: "OK", summary: "run=9006 (본문 생략)", createdAt: ago(now, 2), origin: "WORKER", runId: "9006" },
      todayCostUsd: 0.31,
    },
  ];
}

export function baseRecentRuns(now: number): AgentRunSummary[] {
  return [
    // BLOCKED run은 currentRun과 recentRuns 양쪽에 나온다(서버 계약) — 화면이 중복을 걸러야 한다
    mockRun(now, "9004", "104", "BLOCKED", "ALM-5", 95, null, { attempt: 3 }),
    mockRun(now, "8990", "105", "DONE", "ALM-6", 70, 52),
    mockRun(now, "8989", "106", "DONE", "ALM-2", 120, 101, { type: "REVIEW" }),
    mockRun(now, "8988", "101", "FAILED", "ALM-7", 180, 171),
    mockRun(now, "8987", "103", "CANCELLED", null, 300, 296, { trigger: "USER" }),
  ];
}

/** 게시판 목업 — 매니저 보고·회고(안건 이슈 없음)·착수/계획·에스컬레이션 각 1건, 최신 먼저. 회의록 스페이스는 5 */
function baseBoardPosts(now: number, projectId: string): AgentBoardPost[] {
  return [
    { runId: "8996", type: "MANAGER", agendaIssueKey: null, projectId, pageId: "315", spaceId: "5", endedAt: ago(now, 12) },
    { runId: "8995", type: "RETRO", agendaIssueKey: null, projectId, pageId: "312", spaceId: "5", endedAt: ago(now, 25) },
    { runId: "8994", type: "MEETING", agendaIssueKey: "ALM-4", projectId, pageId: "308", spaceId: "5", endedAt: ago(now, 190) },
    { runId: "8993", type: "ESCALATION", agendaIssueKey: "ALM-5", projectId, pageId: "305", spaceId: "5", endedAt: ago(now, 60 * 26) },
  ];
}

/**
 * 진행 중 착수/계획 회의(P3e) — 기획봇 진행, 디자인봇(대기열)·운영봇(휴식)이 회의실로 가고, 프론트봇은 승인 대기라
 * 책상에 남는다(스펙 §2.2 규칙 2) — 목업 한 장면에서 착석·예외를 함께 본다. run 목록·상세에도 같은 run이 있다.
 */
const MOCK_MEETING_RUN_ID = "9007";

export function baseMeetingRun(now: number): AgentRunSummary {
  return mockRun(now, MOCK_MEETING_RUN_ID, "101", "RUNNING", "ALM-4", 12, null, { type: "MEETING", trigger: "USER" });
}

function mockActiveMeeting(now: number, projectId: string): AgentActiveMeeting | null {
  const run = withOverride(baseMeetingRun(now));
  if (run.status !== "RUNNING") return null;
  return {
    runId: run.id,
    type: "MEETING",
    status: run.status,
    issueKey: run.issueKey,
    projectId,
    hostPersonaId: "101",
    attendeePersonaIds: ["101", "102", "105", "103"],
    startedAt: run.startedAt,
  };
}

function mockOffice(now: number, projectId = "p1"): AgentOffice {
  // 설정 화면에서 고친 이름·이모지·외형이 사무실에도 보이게(서버는 같은 persona 행을 읽는다)
  const personas = baseOfficePersonas(now).map((p) => {
    const team = teamState.personas.find((t) => t.id === p.id);
    return team ? { ...p, name: team.name, emoji: team.emoji, avatarConfig: team.avatarConfig ?? null } : p;
  });
  const recentRuns = baseRecentRuns(now);
  applyAgentOverrides(personas, recentRuns);
  deliverDueDirectives(now);
  for (const p of personas) {
    if (p.currentRun) {
      const run = p.currentRun;
      p.currentRun = {
        ...run,
        awaitingRunner: run.status === "QUEUED" && mockAwaitingRunner(run.executionSite ?? "SERVER", projectId),
        // 구 백엔드(지시 API 없음)는 필드 자체가 없다
        ...(teamState.directivesApi ? { pendingDirectiveCount: pendingDirectiveCount(run.id) } : {}),
      };
    }
  }
  const personaOfRun = new Map(mockAllRuns(now).map((r) => [r.id, r.personaId]));
  const pendingGates: AgentPendingGate[] = mockGates(now)
    .filter((g) => g.decision === null)
    .map((g) => ({
      id: g.id, runId: g.runId, issueKey: g.issueKey, personaId: personaOfRun.get(g.runId) ?? "",
      kind: g.kind, requestSummary: g.request, requestedAt: g.requestedAt,
    }));
  return {
    personas,
    recentRuns,
    pendingGateCount: pendingGates.length,
    pendingGates,
    budget: {
      monthlyCapUsd: 50,
      platformMonthToDateUsd: 18.4,
      killSwitch: false,
    },
    generatedAt: new Date(now).toISOString(),
    boardPosts: baseBoardPosts(now, projectId),
    activeMeeting: mockActiveMeeting(now, projectId),
    features: { chat: teamState.chat },
    reviewReady: mockReviewReady(projectId),
  };
}

export async function fetchOffice(projectId?: string): Promise<AgentOffice> {
  return mockOffice(Date.now(), projectId);
}

export async function fetchPersonaActivity(personaId: string): Promise<AgentPersonaActivity> {
  const now = Date.now();
  const office = mockOffice(now);
  const persona = office.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error("페르소나를 찾을 수 없습니다");
  const runs = office.recentRuns.filter((r) => r.personaId === personaId);
  if (persona.currentRun && !runs.some((r) => r.id === persona.currentRun?.id)) {
    const cur = persona.currentRun;
    runs.unshift({
      id: cur.id, issueKey: cur.issueKey, status: cur.status, personaId, attempt: cur.attempt,
      model: cur.model, startedAt: cur.startedAt, endedAt: null, type: cur.type, trigger: cur.trigger,
      parentRunId: null, executionSite: cur.executionSite ?? "SERVER", runnerId: mockRunnerOfRun(cur.id),
    });
  }
  const runId = persona.currentRun?.id ?? null;
  // 출처(AGP-63): 워커 run 감사 + 출처 기록 전 과거 감사(null) / 원격 접속은 외부 MCP·시스템·과거 감사
  const todayAudits: AgentAuditEntry[] = persona.currentRun
    ? [
        ...(persona.lastActivity ? [persona.lastActivity] : []),
        { id: `${personaId}-a2`, tool: "search_issues", status: "OK", summary: "projectId=1 (검색어 생략)", createdAt: ago(now, 8), origin: "WORKER", runId },
        { id: `${personaId}-a3`, tool: "get_issue", status: "OK", summary: persona.currentRun.issueKey ?? "이슈", createdAt: ago(now, 12), origin: "WORKER", runId },
        { id: `${personaId}-a4`, tool: "add_comment", status: "ERROR", summary: `${persona.currentRun.issueKey ?? "ALM-1"} (본문 생략)`, createdAt: ago(now, 40), origin: null, runId: null },
      ]
    : persona.presence === "EXTERNAL"
      ? [
          ...(persona.lastActivity ? [persona.lastActivity] : []),
          { id: `${personaId}-a2`, tool: "get_issue", status: "OK", summary: "ALM-6", createdAt: ago(now, 4), origin: "EXTERNAL", runId: null },
          { id: `${personaId}-a3`, tool: "report_progress", status: "OK", summary: "토큰 사용 기록", createdAt: ago(now, 30), origin: "SYSTEM", runId: null },
          { id: `${personaId}-a4`, tool: "update_issue", status: "OK", summary: "ALM-6 배포 체크리스트", createdAt: ago(now, 55), origin: null, runId: null },
        ]
      : [];
  return { personaId, runs, todayAudits, todayCostUsd: persona.todayCostUsd };
}
