import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { mapAgentOffice, mapAgentReviewSetting, mapAgentRunDirective, mapAgentRunDirectives } from "./agentMapping";
import { clearReviewSetting, fetchReviewSetting, fetchRunDirectives, saveReviewSetting, sendRunDirective } from "./jiraApi";
import { ApiError } from "./mapping";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchSpy(...responses: Response[]) {
  const spy = vi.spyOn(client, "sharedApiFetch");
  for (const r of responses) spy.mockResolvedValueOnce(r);
  return spy;
}

function sentBody(spy: ReturnType<typeof fetchSpy>, call = 0): unknown {
  const init = spy.mock.calls[call][1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P4b 경계 매퍼 — 리뷰어·지시·사무실 플래그", () => {
  it("리뷰어 설정 — id는 string, 출처 5종, 지정 페르소나가 사라졌으면 이름 null", () => {
    expect(
      mapAgentReviewSetting({
        setting: { personaId: 12, slug: "rev", name: "리뷰봇" },
        effective: { personaId: 12, slug: "rev", name: "리뷰봇", source: "PROJECT" },
      }),
    ).toEqual({
      setting: { personaId: "12", slug: "rev", name: "리뷰봇" },
      effective: { personaId: "12", slug: "rev", name: "리뷰봇", source: "PROJECT" },
    });
    for (const source of ["PLATFORM", "ENV", "AUTO"] as const) {
      expect(mapAgentReviewSetting({ setting: null, effective: { personaId: 3, slug: "a", name: "A", source } }).effective.source).toBe(
        source,
      );
    }
    expect(mapAgentReviewSetting({ setting: { personaId: 9, slug: null, name: null }, effective: null }).setting).toEqual({
      personaId: "9",
      slug: null,
      name: null,
    });
  });

  it("리뷰어 — NONE이면 이름까지 null, 모르는 출처·id 없는 유효 리뷰어·빈 응답은 NONE(경고 쪽으로 접는다)", () => {
    const none = { personaId: null, slug: null, name: null, source: "NONE" };
    expect(mapAgentReviewSetting({ setting: null, effective: { personaId: null, slug: null, name: null, source: "NONE" } }).effective).toEqual(none);
    // NONE인데 이름이 섞여 와도 걷어 낸다
    expect(mapAgentReviewSetting({ effective: { personaId: 4, slug: "x", name: "X", source: "NONE" } }).effective).toEqual(none);
    expect(mapAgentReviewSetting({ effective: { personaId: 4, slug: "x", name: "X", source: "MARS" } }).effective).toEqual(none);
    expect(mapAgentReviewSetting({ effective: { slug: "x", name: "X", source: "AUTO" } }).effective).toEqual(none);
    expect(mapAgentReviewSetting(null)).toEqual({ setting: null, effective: none });
  });

  it("지시 — id string, 가린 본문(textRedacted)·본문 없음은 null, 미전달은 deliveredAt null, 목록은 id 순", () => {
    expect(
      mapAgentRunDirective({ id: 5, runId: 9, text: "테스트 먼저", textRedacted: false, createdAt: "2026-09-29T01:00:00Z", deliveredAt: null }),
    ).toEqual({ id: "5", runId: "9", text: "테스트 먼저", createdAt: "2026-09-29T01:00:00Z", deliveredAt: null });
    expect(mapAgentRunDirective({ id: 5, runId: 9, text: null, textRedacted: true, createdAt: "t" }).text).toBeNull();
    expect(mapAgentRunDirective({ id: 5, runId: 9, text: "새어 나옴", textRedacted: true, createdAt: "t" }).text).toBeNull();
    expect(mapAgentRunDirective({ id: 5, runId: 9, createdAt: "t" })).toMatchObject({ text: null, deliveredAt: null });
    expect(
      mapAgentRunDirectives([
        { id: 11, runId: 9, text: "b", createdAt: "2026-09-29T02:00:00Z" },
        { id: 3, runId: 9, text: "a", createdAt: "2026-09-29T01:00:00Z", deliveredAt: "2026-09-29T01:00:05Z" },
      ]).map((d) => d.id),
    ).toEqual(["3", "11"]);
    expect(mapAgentRunDirectives(null)).toEqual([]);
  });

  it("사무실 — reviewReady는 false일 때만 경고, 구 백엔드(없음)는 준비됨. pendingDirectiveCount는 없으면 키째 없음(지시 API 없음 신호)", () => {
    const persona = (currentRun: Record<string, unknown>) => ({
      id: 1,
      slug: "a",
      name: "A",
      emoji: null,
      role: "FRONTEND",
      active: true,
      currentRun: { id: 9, status: "RUNNING", issueKey: "ALM-1", attempt: 1, model: null, startedAt: null, ...currentRun },
      lastActivity: null,
      todayCostUsd: 0,
    });
    expect(mapAgentOffice({ reviewReady: false }).reviewReady).toBe(false);
    expect(mapAgentOffice({ reviewReady: true }).reviewReady).toBe(true);
    expect(mapAgentOffice({}).reviewReady).toBe(true);

    const office = mapAgentOffice({
      personas: [
        persona({ pendingDirectiveCount: 2 }),
        persona({ pendingDirectiveCount: 0 }),
        persona({}),
        persona({ pendingDirectiveCount: -3 }),
        persona({ pendingDirectiveCount: "x" }),
      ],
    });
    const runs = office.personas.map((p) => p.currentRun!);
    expect(runs.map((r) => r.pendingDirectiveCount)).toEqual([2, 0, undefined, 0, 0]);
    expect(runs[2]).not.toHaveProperty("pendingDirectiveCount");
  });
});

describe("P4b REST — 리뷰어 지정", () => {
  it("GET(404 = 구 백엔드 → null)·PUT {personaId}(숫자)·DELETE 204 — 400은 서버 문구 그대로", async () => {
    const view = {
      setting: { personaId: 12, slug: "rev", name: "리뷰봇" },
      effective: { personaId: 12, slug: "rev", name: "리뷰봇", source: "PROJECT" },
    };
    const spy = fetchSpy(
      response(200, { setting: null, effective: { personaId: 7, slug: "auto", name: "자동", source: "AUTO" } }),
      response(404, { error: "찾을 수 없습니다" }),
      response(200, view),
      response(204),
      response(400, { error: "리뷰어로 지정할 수 없는 페르소나입니다 — 활성 REVIEWER 롤" }),
    );
    await expect(fetchReviewSetting("3")).resolves.toMatchObject({ setting: null, effective: { personaId: "7", source: "AUTO" } });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/review-settings/projects/3");
    await expect(fetchReviewSetting("3")).resolves.toBeNull();

    await expect(saveReviewSetting("3", "12")).resolves.toMatchObject({ effective: { source: "PROJECT", name: "리뷰봇" } });
    expect((spy.mock.calls[2][1] as RequestInit).method).toBe("PUT");
    expect(sentBody(spy, 2)).toEqual({ personaId: 12 });

    await expect(clearReviewSetting("3")).resolves.toBeUndefined();
    expect(spy.mock.calls[3][0]).toBe("/api/agent/review-settings/projects/3");
    expect((spy.mock.calls[3][1] as RequestInit).method).toBe("DELETE");

    await expect(saveReviewSetting("3", "5")).rejects.toThrow("리뷰어로 지정할 수 없는 페르소나입니다");
  });

  it("조회 403·5xx는 삼키지 않는다(오류 상태로 보여야 한다)", async () => {
    fetchSpy(response(503, { error: "org 판정 불가" }));
    await expect(fetchReviewSetting("3")).rejects.toThrow("org 판정 불가");
  });
});

describe("P4b REST — 실행 중 지시", () => {
  it("GET 목록(404 = 구 백엔드 → null)·POST {text}(앞뒤 공백 제거) — 409·404는 상태를 싣는 ApiError", async () => {
    const spy = fetchSpy(
      response(200, [{ id: 1, runId: 9001, text: null, textRedacted: true, createdAt: "2026-09-29T01:00:00Z", deliveredAt: null }]),
      response(404),
      response(201, { id: 2, runId: 9001, text: "캐시 먼저", textRedacted: false, createdAt: "2026-09-29T01:01:00Z", deliveredAt: null }),
      response(409, { error: "실행 중(RUNNING)인 run에만 지시할 수 있습니다(현재: DONE)" }),
      response(404, { error: "찾을 수 없습니다" }),
    );
    await expect(fetchRunDirectives("9001")).resolves.toEqual([
      { id: "1", runId: "9001", text: null, createdAt: "2026-09-29T01:00:00Z", deliveredAt: null },
    ]);
    expect(spy.mock.calls[0][0]).toBe("/api/agent/runs/9001/directives");
    await expect(fetchRunDirectives("9001")).resolves.toBeNull();

    await expect(sendRunDirective("9001", "  캐시 먼저  ")).resolves.toMatchObject({ id: "2", text: "캐시 먼저", deliveredAt: null });
    expect((spy.mock.calls[2][1] as RequestInit).method).toBe("POST");
    expect(sentBody(spy, 2)).toEqual({ text: "캐시 먼저" });

    const conflict = await sendRunDirective("9001", "x").catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(ApiError);
    expect((conflict as ApiError).status).toBe(409);
    expect((conflict as ApiError).message).toContain("실행 중(RUNNING)인 run에만");
    const gone = await sendRunDirective("9001", "x").catch((e: unknown) => e);
    expect((gone as ApiError).status).toBe(404);
  });
});
