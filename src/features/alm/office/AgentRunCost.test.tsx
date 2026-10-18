import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import { mapAgentRunCost, mapAgentRunSummary } from "../store/agentMapping";
import { formatRunCost, formatRunTokens } from "./runModel";

/** F-16 — run별 비용(원장 합계). 기록이 없으면 "기록 없음"이지 0원이 아니다 */

function renderApp(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const BASE = "/projects/p1/ai-office";

beforeAll(async () => {
  await Promise.all([import("./AgentRunsPage"), import("./AgentRunDetailPage")]);
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("run 비용 매퍼·표기", () => {
  it("cost 객체는 그대로, null·없음·모양이 낯선 값은 null(0으로 메우지 않는다)", () => {
    const base = { id: 1, issueKey: "ALM-1", status: "DONE", personaId: 2, attempt: 1, model: null, startedAt: null, endedAt: null };
    expect(mapAgentRunSummary({ ...base, cost: { costUsd: 0.25, inputTokens: 1000, outputTokens: 200, entries: 2 } }).cost).toEqual({
      costUsd: 0.25,
      inputTokens: 1000,
      outputTokens: 200,
      entries: 2,
    });
    expect(mapAgentRunSummary({ ...base, cost: null }).cost).toBeNull();
    expect(mapAgentRunSummary(base).cost).toBeNull();
    expect(mapAgentRunCost({ inputTokens: 5 })).toBeNull();
  });

  it("비용은 소수 넷째 자리 달러, 토큰은 입력·출력 — 기록이 없으면 null", () => {
    const cost = { costUsd: 0.0042, inputTokens: 12345, outputTokens: 678, entries: 1 };
    expect(formatRunCost(cost)).toBe("$0.0042");
    expect(formatRunTokens(cost)).toBe("입력 12,345 · 출력 678");
    expect(formatRunCost({ ...cost, costUsd: 0 })).toBe("$0.0000"); // 원장이 있고 0이면 0이다
    expect(formatRunCost(null)).toBeNull();
    expect(formatRunTokens(undefined)).toBeNull();
  });
});

describe("실행 기록·상세의 비용", () => {
  it("목록에 비용 열 — 원장이 없는 run은 '기록 없음'", async () => {
    vi.spyOn(store, "fetchAgentRuns").mockResolvedValue({
      items: [
        { id: "7001", issueKey: "ALM-1", status: "DONE", personaId: "101", attempt: 1, model: null, startedAt: "2026-10-18T00:00:00Z", endedAt: "2026-10-18T00:10:00Z", type: "TASK", trigger: "SCHEDULER", parentRunId: null, cost: { costUsd: 1.5, inputTokens: 90000, outputTokens: 4000, entries: 3 } },
        { id: "7000", issueKey: "ALM-2", status: "DONE", personaId: "101", attempt: 1, model: null, startedAt: "2026-10-18T00:00:00Z", endedAt: "2026-10-18T00:10:00Z", type: "TASK", trigger: "SCHEDULER", parentRunId: null, cost: null },
      ],
      page: 0,
      size: 20,
      total: 2,
      hasNext: false,
    });
    renderApp(`${BASE}/runs`);
    const table = await screen.findByRole("table", { name: "실행 기록" });
    expect(within(table).getByRole("columnheader", { name: "비용" })).toBeInTheDocument();
    expect(await within(table).findByText("$1.5000")).toBeInTheDocument();
    expect(within(table).getByText("기록 없음")).toBeInTheDocument();
  });

  it("상세에 비용과 토큰 — 원장이 없으면 둘 다 '기록 없음'", async () => {
    renderApp(`${BASE}/runs/9004`);
    const summary = await screen.findByLabelText("실행 요약");
    const detail = await store.fetchAgentRun("9004");
    expect(within(summary).getByText(formatRunCost(detail.cost)!)).toBeInTheDocument();
    expect(within(summary).getByText(formatRunTokens(detail.cost)!)).toBeInTheDocument();
  });

  it("목업 run 중 원장이 없는 run은 상세에서 '기록 없음'", async () => {
    vi.spyOn(store, "fetchAgentRun").mockImplementation(async (id) => ({ ...(await store.fetchAgentRuns({ size: 100 })).items.find((r) => r.id === id)!, projectId: "p1", outputPageId: null, attendeePersonaIds: [], rejectCount: 0, createdAt: null, updatedAt: null, error: null, instruction: null, redacted: true, cost: null }));
    renderApp(`${BASE}/runs/9004`);
    const summary = await screen.findByLabelText("실행 요약");
    expect(await within(summary).findAllByText("기록 없음")).toHaveLength(2);
  });
});
