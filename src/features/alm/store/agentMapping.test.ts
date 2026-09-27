import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  isProjectWideMeeting,
  mapAgentGate,
  mapAgentOffice,
  mapAgentPersonaActivity,
  mapAgentRunSummary,
  projectWideIssueKey,
} from "./agentMapping";
import {
  approveGate,
  cancelRun,
  createMeeting,
  fetchAgentGates,
  fetchAgentPersonas,
  fetchAgentRuns,
  fetchOffice,
  fetchPersonaActivity,
  rejectGate,
  resumeRun,
} from "./jiraApi";

const OFFICE_DTO = {
  personas: [
    {
      id: 104,
      slug: "backend-bot",
      name: "백엔드봇",
      emoji: null,
      role: "BACKEND",
      active: true,
      currentRun: {
        id: 9004,
        status: "BLOCKED",
        issueKey: "ALM-5",
        type: "TASK",
        trigger: "SCHEDULER",
        attempt: 3,
        model: "claude-sonnet-5",
        startedAt: "2026-09-26T01:00:00Z",
      },
      lastActivity: { id: 7, tool: "add_comment", status: "OK", summary: "ALM-5 (본문 생략)", createdAt: "2026-09-26T01:01:00Z" },
      todayCostUsd: "1.05",
    },
    {
      id: 105,
      slug: "ops-bot",
      name: "운영봇",
      emoji: "⛑️",
      role: "OPS",
      active: true,
      currentRun: { id: 1, status: "DONE", issueKey: null, attempt: 1, model: null, startedAt: null },
      lastActivity: null,
      todayCostUsd: null,
    },
  ],
  recentRuns: [
    {
      id: 9004,
      issueKey: "ALM-5",
      status: "BLOCKED",
      personaId: 104,
      attempt: 3,
      model: null,
      startedAt: "2026-09-26T01:00:00Z",
      endedAt: null,
      type: "TASK",
      trigger: "SCHEDULER",
      parentRunId: 12,
    },
  ],
  pendingGateCount: 1,
  pendingGates: [
    {
      id: 501,
      runId: 9003,
      issueKey: "ALM-3",
      personaId: 103,
      kind: "MERGE",
      requestSummary: "PR 머지",
      requestedAt: "2026-09-26T01:02:00Z",
    },
  ],
  budget: { monthlyCapUsd: null, platformMonthToDateUsd: 18.4, killSwitch: true },
  generatedAt: "2026-09-26T01:03:00Z",
};

afterEach(() => vi.restoreAllMocks());

describe("agent-service 경계 매퍼", () => {
  it("long id → string, BigDecimal 문자열 → number, 상한 없음은 null", () => {
    const office = mapAgentOffice(OFFICE_DTO);
    expect(office.personas[0]).toMatchObject({ id: "104", todayCostUsd: 1.05, role: "BACKEND" });
    expect(office.personas[0].currentRun).toMatchObject({ id: "9004", status: "BLOCKED", attempt: 3 });
    expect(office.personas[0].lastActivity).toMatchObject({ id: "7", summary: "ALM-5 (본문 생략)" });
    expect(office.recentRuns[0]).toMatchObject({ id: "9004", personaId: "104", parentRunId: "12", endedAt: null });
    expect(office.pendingGates[0]).toMatchObject({ id: "501", runId: "9003", personaId: "103", kind: "MERGE" });
    expect(office.budget).toEqual({ monthlyCapUsd: null, platformMonthToDateUsd: 18.4, killSwitch: true });
  });

  it("종결 상태가 currentRun으로 오면 유휴로 접고, 비용 null은 0, type/trigger 누락은 TASK/SCHEDULER", () => {
    const office = mapAgentOffice(OFFICE_DTO);
    expect(office.personas[1].currentRun).toBeNull();
    expect(office.personas[1].todayCostUsd).toBe(0);
    const activity = mapAgentPersonaActivity({
      personaId: 5,
      runs: [{ id: 1, issueKey: null, status: "DONE", personaId: 5, attempt: 1, model: null, startedAt: null, endedAt: null }],
      todayAudits: null,
      todayCostUsd: 0.5,
    });
    expect(activity).toMatchObject({ personaId: "5", todayAudits: [], todayCostUsd: 0.5 });
    expect(activity.runs[0]).toMatchObject({ type: "TASK", trigger: "SCHEDULER", parentRunId: null });
  });
});

describe("REST 어댑터 — AI 사무실", () => {
  it("office는 프로젝트 id를 숫자로 붙여 조회하고 매핑한다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValue(new Response(JSON.stringify(OFFICE_DTO), { status: 200 }));
    const office = await fetchOffice("3");
    expect(spy).toHaveBeenCalledWith("/api/agent/office?projectId=3");
    expect(office.personas).toHaveLength(2);
  });

  it("실패를 삼키지 않는다 — 화면이 오류 상태를 보여 줘야 한다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "서비스를 사용할 수 없습니다" }), { status: 503 }),
    );
    await expect(fetchOffice("3")).rejects.toThrow();
  });

  it("개인 오피스 활동", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      new Response(JSON.stringify({ personaId: 104, runs: [], todayAudits: [], todayCostUsd: 1 }), { status: 200 }),
    );
    const activity = await fetchPersonaActivity("104");
    expect(spy).toHaveBeenCalledWith("/api/agent/personas/104/activity");
    expect(activity.personaId).toBe("104");
  });
});

describe("REST 어댑터 — run·게이트 감독(AGP-12/13)", () => {
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  it("runs 목록은 status를 쿼리로 넘기고 long id를 string으로 바꾼다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      json(200, [
        {
          id: 9004, issueKey: "ALM-5", status: "BLOCKED", personaId: 104, attempt: 3, model: null,
          startedAt: null, endedAt: null, type: "TASK", trigger: "SCHEDULER", parentRunId: 8990,
        },
      ]),
    );
    const runs = await fetchAgentRuns("BLOCKED");
    expect(spy).toHaveBeenCalledWith("/api/agent/runs?status=BLOCKED");
    expect(runs[0]).toMatchObject({ id: "9004", personaId: "104", parentRunId: "8990", status: "BLOCKED" });
    await fetchAgentRuns();
    expect(spy).toHaveBeenLastCalledWith("/api/agent/runs");
  });

  it("취소·재개는 POST 204, 409 전이 거부는 서버 {error} 문구 그대로 올린다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(json(204));
    await cancelRun("9004");
    expect(spy).toHaveBeenCalledWith("/api/agent/runs/9004/cancel", { method: "POST" });

    spy.mockResolvedValueOnce(
      json(409, { error: "BLOCKED 또는 FAILED 상태가 아닌 run은 재개할 수 없습니다(현재: DONE): run=8990" }),
    );
    await expect(resumeRun("8990")).rejects.toThrow("BLOCKED 또는 FAILED 상태가 아닌 run은 재개할 수 없습니다(현재: DONE)");
    expect(spy).toHaveBeenLastCalledWith("/api/agent/runs/8990/resume", { method: "POST" });

    spy.mockResolvedValueOnce(json(403));
    await expect(cancelRun("1")).rejects.toThrow("권한이 없습니다.");
  });

  it("게이트 목록은 pending 쿼리로 조회하고 GateSummaryResponse를 매핑한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      json(200, [
        { id: 501, runId: 9003, issueKey: "ALM-3", kind: "MERGE", request: "PR 머지", decision: null, requestedAt: "2026-09-26T01:00:00Z" },
      ]),
    );
    const gates = await fetchAgentGates({ pending: true });
    expect(spy).toHaveBeenCalledWith("/api/agent/gates?pending=true");
    expect(gates).toEqual([
      { id: "501", runId: "9003", issueKey: "ALM-3", kind: "MERGE", request: "PR 머지", decision: null, requestedAt: "2026-09-26T01:00:00Z" },
    ]);
    await fetchAgentGates({ pending: false });
    expect(spy).toHaveBeenLastCalledWith("/api/agent/gates?pending=false");
  });

  it("승인·거절은 본문 없는 POST — 실패는 삼키지 않는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(json(204)).mockResolvedValueOnce(json(204));
    await approveGate("501");
    await rejectGate("502");
    expect(spy).toHaveBeenNthCalledWith(1, "/api/agent/gates/501/approve", { method: "POST" });
    expect(spy).toHaveBeenNthCalledWith(2, "/api/agent/gates/502/reject", { method: "POST" });
    spy.mockResolvedValueOnce(json(409, { error: "WAITING_APPROVAL 상태가 아닌 run의 게이트는 결정할 수 없습니다" }));
    await expect(approveGate("501")).rejects.toThrow("WAITING_APPROVAL 상태가 아닌 run의 게이트는 결정할 수 없습니다");
  });

  it("게이트 매퍼 — 모르는 kind·decision은 안전한 값으로, request null은 빈 문자열", () => {
    expect(
      mapAgentGate({ id: 1, runId: 2, issueKey: null, kind: "WHAT", request: null, decision: "MAYBE", requestedAt: "x" }),
    ).toEqual({ id: "1", runId: "2", issueKey: null, kind: "ESCALATION", request: "", decision: null, requestedAt: "x" });
  });

  it("페르소나 목록은 id를 string으로, 이모지를 곁들여 돌려준다(실패는 여전히 빈 목록)", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      json(200, [{ id: 104, memberId: 9, slug: "backend-bot", role: "BACKEND", name: "백엔드봇", emoji: "🛠️", active: true }]),
    );
    expect(await fetchAgentPersonas()).toEqual([{ id: "104", name: "백엔드봇", emoji: "🛠️" }]);
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(json(503));
    expect(await fetchAgentPersonas()).toEqual([]);
  });
});

describe("게시판·회의 소집(P3b)", () => {
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  it("구 백엔드 응답(boardPosts 없음·null)은 빈 게시판으로 읽는다", () => {
    expect(mapAgentOffice(OFFICE_DTO).boardPosts).toEqual([]);
    expect(mapAgentOffice({ ...OFFICE_DTO, boardPosts: null }).boardPosts).toEqual([]);
  });

  it("게시물 — long id → string, 합성 키 PROJECT-<projectId>는 안건 없음(null), 모르는 종류는 MEETING", () => {
    const office = mapAgentOffice({
      ...OFFICE_DTO,
      boardPosts: [
        { runId: 31, type: "RETRO", issueKey: "PROJECT-3", projectId: 3, pageId: 47, spaceId: 5, endedAt: "2026-09-27T01:00:00Z" },
        { runId: 30, type: "ESCALATION", issueKey: "ALM-5", projectId: 3, pageId: 46, spaceId: null, endedAt: "2026-09-27T00:00:00Z" },
        // 다른 프로젝트 번호의 PROJECT- 키는 합성 키가 아니다 — 실제 이슈 키로 둔다
        { runId: 29, type: "PLANNING", issueKey: "PROJECT-7", projectId: 3, pageId: 45, endedAt: "2026-09-26T00:00:00Z" },
      ],
    });
    expect(office.boardPosts).toEqual([
      { runId: "31", type: "RETRO", agendaIssueKey: null, projectId: "3", pageId: "47", spaceId: "5", endedAt: "2026-09-27T01:00:00Z" },
      { runId: "30", type: "ESCALATION", agendaIssueKey: "ALM-5", projectId: "3", pageId: "46", spaceId: null, endedAt: "2026-09-27T00:00:00Z" },
      // spaceId 필드가 없는 구 백엔드 → null(라벨만)
      { runId: "29", type: "MEETING", agendaIssueKey: "PROJECT-7", projectId: "3", pageId: "45", spaceId: null, endedAt: "2026-09-26T00:00:00Z" },
    ]);
  });

  it("합성 키 판정 — 회의 종류 && PROJECT-<숫자>만(run 요약엔 projectId가 없어 번호 대조는 못 한다)", () => {
    expect(isProjectWideMeeting({ type: "RETRO", issueKey: "PROJECT-3" })).toBe(true);
    expect(isProjectWideMeeting({ type: "MEETING", issueKey: "ALM-4" })).toBe(false);
    expect(isProjectWideMeeting({ type: "ESCALATION", issueKey: null })).toBe(false);
    // TASK·REVIEW는 키가 같은 모양이어도 실제 이슈
    expect(isProjectWideMeeting({ type: "TASK", issueKey: "PROJECT-3" })).toBe(false);
    expect(isProjectWideMeeting({ type: "MEETING", issueKey: "PROJECT-X1" })).toBe(false);
    expect(projectWideIssueKey("12")).toBe("PROJECT-12");
    expect(projectWideIssueKey("p1")).toBe("PROJECT-1");
  });

  it("run 요약의 회의 종류(MEETING·RETRO·ESCALATION)를 작업으로 접지 않는다", () => {
    const base = { id: 1, issueKey: null, status: "DONE", personaId: 5, attempt: 1, model: null, startedAt: null, endedAt: null };
    expect(mapAgentRunSummary({ ...base, type: "RETRO" }).type).toBe("RETRO");
    expect(mapAgentRunSummary({ ...base, type: "ESCALATION" }).type).toBe("ESCALATION");
    expect(mapAgentRunSummary({ ...base, type: "WHAT" }).type).toBe("TASK");
  });

  it("소집은 숫자 projectId로 POST하고, 빈 안건·빈 참석자는 보내지 않는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async () =>
      json(201, {
        run: {
          id: 9200, issueKey: "PROJECT-3", status: "QUEUED", personaId: 101, attempt: 1, model: null,
          startedAt: null, endedAt: null, type: "RETRO", trigger: "USER", parentRunId: null,
        },
        attendees: [{ personaId: 101, slug: "planner-bot", name: "기획봇", role: "PLANNER", emoji: "📝" }],
      }),
    );
    const created = await createMeeting({ type: "RETRO", projectId: "3", agendaIssueKey: "  ", agenda: "", personaSlugs: [] });
    expect(spy).toHaveBeenCalledWith("/api/agent/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "RETRO", projectId: 3 }),
    });
    expect(created.run).toMatchObject({ id: "9200", type: "RETRO", trigger: "USER", personaId: "101" });
    expect(created.attendees).toEqual([{ personaId: "101", slug: "planner-bot", name: "기획봇", role: "PLANNER", emoji: "📝" }]);

    await createMeeting({ type: "MEETING", projectId: "3", agendaIssueKey: " ALM-4 ", agenda: "로그인 개편", personaSlugs: ["planner-bot"] });
    expect(JSON.parse(spy.mock.lastCall?.[1]?.body as string)).toEqual({
      type: "MEETING", projectId: 3, agendaIssueKey: "ALM-4", agenda: "로그인 개편", personaSlugs: ["planner-bot"],
    });
  });

  it("409(같은 프로젝트 활성 회의)는 서버 {error} 문구 그대로 올린다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      json(409, { error: "이 프로젝트에 이미 진행 중인 회의 run이 있습니다: projectId=3" }),
    );
    await expect(createMeeting({ type: "RETRO", projectId: "3" })).rejects.toThrow(
      "이 프로젝트에 이미 진행 중인 회의 run이 있습니다: projectId=3",
    );
  });
});
