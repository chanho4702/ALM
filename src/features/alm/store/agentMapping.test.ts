import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { mapAgentOffice, mapAgentPersonaActivity } from "./agentMapping";
import { fetchOffice, fetchPersonaActivity } from "./jiraApi";

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
      lastActivity: { id: 7, tool: "read_issue", status: "OK", summary: "(본문 생략)", createdAt: "2026-09-26T01:01:00Z" },
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
    expect(office.personas[0].lastActivity).toMatchObject({ id: "7", summary: "(본문 생략)" });
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
