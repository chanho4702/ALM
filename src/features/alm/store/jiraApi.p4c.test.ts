import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { mapAgentRunDetail, mapAgentRunPage, mapOfficeStreamEvent } from "./agentMapping";
import { fetchAgentRun, fetchAgentRuns, streamOffice } from "./jiraApi";
import { ApiError } from "./mapping";
import { OfficeStreamError } from "./officeStream";
import type { OfficeStreamEvent } from "./types";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function summary(id: number, extra: Record<string, unknown> = {}) {
  return {
    id, issueKey: `ALM-${id}`, status: "DONE", personaId: 101, attempt: 1, model: null,
    startedAt: null, endedAt: null, type: "TASK", trigger: "SCHEDULER", parentRunId: null, ...extra,
  };
}

/** 조각 배열을 그대로 흘려 보내는 text/event-stream 응답 */
function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run 목록 — 두 응답 모양(P4c 페이지 객체 / 구 서버 배열)", () => {
  it("페이지 객체는 그대로 — long id → string, hasNext·total 서버 값", () => {
    const page = mapAgentRunPage(
      { items: [summary(9004, { status: "BLOCKED", parentRunId: 8990 })], page: 2, size: 1, total: 7, hasNext: true },
      { page: 2, size: 1 },
    );
    expect(page).toMatchObject({ page: 2, size: 1, total: 7, hasNext: true });
    expect(page.items[0]).toMatchObject({ id: "9004", personaId: "101", parentRunId: "8990", status: "BLOCKED" });
  });

  it("구 서버 배열 — id 내림차순으로 잘라 페이지를 만들고, 서버가 안 보던 persona·type 조건을 여기서 거른다", () => {
    const rows = [summary(1), summary(5, { personaId: 102 }), summary(3), summary(4, { type: "REVIEW" }), summary(2)];
    const first = mapAgentRunPage(rows, { size: 2 });
    expect(first.items.map((r) => r.id)).toEqual(["5", "4"]);
    expect(first).toMatchObject({ page: 0, size: 2, total: 5, hasNext: true });
    const last = mapAgentRunPage(rows, { page: 2, size: 2 });
    expect(last.items.map((r) => r.id)).toEqual(["1"]);
    expect(last.hasNext).toBe(false);
    expect(mapAgentRunPage(rows, { personaId: "101", type: "TASK" }).items.map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(mapAgentRunPage(rows, { status: "FAILED" }).total).toBe(0);
  });

  it("구 서버 배열은 projectId를 무시하므로 페이지를 자르기 전에 이슈키 접두어·프로젝트 전체 키로 그 프로젝트 run만 남긴다", () => {
    const rows = [
      summary(1, { issueKey: "ALM-1" }),
      summary(2, { issueKey: "OPS-7" }),
      summary(3, { issueKey: "alm-9" }),
      summary(4, { issueKey: "PROJECT-3" }),
      summary(5, { issueKey: "PROJECT-8" }),
      summary(6, { issueKey: null }),
      summary(7, { issueKey: "OPS-8" }),
    ];
    const page = mapAgentRunPage(rows, { projectId: "3", projectKey: "ALM", size: 2 });
    expect(page.items.map((r) => r.id)).toEqual(["4", "3"]);
    expect(page).toMatchObject({ total: 3, hasNext: true });
    // 키를 모르면 남의 프로젝트 run을 보이느니 프로젝트 전체 회의만 남긴다
    expect(mapAgentRunPage(rows, { projectId: "3" }).items.map((r) => r.id)).toEqual(["4"]);
    // 프로젝트 조건이 없으면(전체 범위) 그대로
    expect(mapAgentRunPage(rows, {}).total).toBe(7);
  });

  it("필드가 빠진 페이지 객체·null은 빈 페이지로 접는다(화면이 깨지지 않게)", () => {
    expect(mapAgentRunPage(null)).toEqual({ items: [], page: 0, size: 20, total: 0, hasNext: false });
    expect(mapAgentRunPage({ items: [summary(1)] }, { page: 0, size: 20 })).toMatchObject({ total: 1, hasNext: false });
  });

  it("fetchAgentRuns — 조건을 쿼리로(projectId는 서버 숫자 id), 배열 응답이어도 같은 페이지 모양", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { items: [summary(9)], page: 1, size: 20, total: 21, hasNext: false }))
      .mockResolvedValueOnce(response(200, [summary(1), summary(2)]));
    const page = await fetchAgentRuns({ status: "DONE", projectId: "7", personaId: "101", type: "TASK", page: 1, size: 20 });
    expect(spy).toHaveBeenCalledWith("/api/agent/runs?status=DONE&projectId=7&personaId=101&type=TASK&page=1&size=20");
    expect(page).toMatchObject({ page: 1, total: 21 });
    const legacy = await fetchAgentRuns();
    expect(spy).toHaveBeenLastCalledWith("/api/agent/runs");
    expect(legacy.items.map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("size 범위 밖 400은 서버 {error} 문구 그대로", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(400, { error: "size는 1~100이어야 합니다" }));
    await expect(fetchAgentRuns({ size: 500 })).rejects.toThrow("size는 1~100이어야 합니다");
  });
});

describe("run 단건 — 가림(redacted)", () => {
  const detail = {
    ...summary(9004, { status: "BLOCKED" }),
    projectId: 7, outputPageId: null, attendeePersonaIds: [101, 102], rejectCount: 2,
    createdAt: "2026-09-29T01:00:00Z", updatedAt: "2026-09-29T02:00:00Z",
  };

  it("관리자 — 오류 로그·지시문 전문", () => {
    expect(mapAgentRunDetail({ ...detail, error: "boom", instruction: "테스트 먼저", redacted: false })).toMatchObject({
      id: "9004", projectId: "7", attendeePersonaIds: ["101", "102"], rejectCount: 2,
      error: "boom", instruction: "테스트 먼저", redacted: false,
    });
  });

  it("비관리자 — null + redacted:true(값이 없어 null인 것과 구분), 필드 누락은 안전한 빈 값", () => {
    expect(mapAgentRunDetail({ ...detail, error: null, instruction: null, redacted: true })).toMatchObject({
      error: null, instruction: null, redacted: true,
    });
    expect(mapAgentRunDetail(summary(1))).toMatchObject({
      projectId: null, attendeePersonaIds: [], rejectCount: 0, createdAt: null, error: null, redacted: false,
    });
  });

  it("fetchAgentRun — 없는 id 404는 ApiError(화면이 목록 폴백 판단에 쓴다)", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ...detail, error: null, instruction: null, redacted: true }))
      .mockResolvedValueOnce(response(404, { error: "run을 찾을 수 없습니다: 1" }));
    expect((await fetchAgentRun("9004")).redacted).toBe(true);
    expect(spy).toHaveBeenCalledWith("/api/agent/runs/9004");
    const error = await fetchAgentRun("1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });
});

describe("사무실 스트림 — fetch 스트리밍", () => {
  function handlers() {
    const events: OfficeStreamEvent[] = [];
    const h = {
      signal: new AbortController().signal,
      onOpen: vi.fn(),
      onActivity: vi.fn(),
      onEvent: (e: OfficeStreamEvent) => events.push(e),
    };
    return { h, events };
  }

  it("Authorization을 싣는 공용 fetch(401→refresh 재시도 포함)로 Accept: text/event-stream 요청, 프레임마다 신호", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      streamResponse([
        ":connected\n\n",
        'event:office\r\ndata:{"reason":"run","projectId":7,"at":"2026-09-29T03:00:00Z"}\r',
        "\n\r\n:hb\n\nevent:office\ndata:not-json\n\n",
      ]),
    );
    const { h, events } = handlers();
    await streamOffice("7", h);
    expect(spy.mock.calls[0][0]).toBe("/api/agent/office/stream?projectId=7");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Accept")).toBe("text/event-stream");
    expect(init.signal).toBe(h.signal);
    expect(h.onOpen).toHaveBeenCalledTimes(1);
    expect(h.onActivity).toHaveBeenCalledTimes(3);
    // 모양이 낯선 신호도 재조회 신호로 넘긴다
    expect(events).toEqual([
      { reason: "run", projectId: "7", at: "2026-09-29T03:00:00Z" },
      { reason: null, projectId: null, at: null },
    ]);
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate-limited"],
    [404, "unsupported"],
    [502, "network"],
  ] as const)("%i → %s(재연결 판단용 종류)", async (status, kind) => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(status, { error: "x" }));
    const { h } = handlers();
    const error = await streamOffice(undefined, h).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OfficeStreamError);
    expect((error as OfficeStreamError).kind).toBe(kind);
    expect(h.onOpen).not.toHaveBeenCalled();
  });

  it("네트워크 오류는 network로 감싼다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { h } = handlers();
    await expect(streamOffice(undefined, h)).rejects.toMatchObject({ kind: "network" });
  });

  it("신호 data 매퍼 — reason 5종 외는 null, projectId null 허용", () => {
    expect(mapOfficeStreamEvent('{"reason":"persona","projectId":null,"at":"t"}')).toEqual({
      reason: "persona", projectId: null, at: "t",
    });
    expect(mapOfficeStreamEvent('{"reason":"weird"}')?.reason).toBeNull();
    expect(mapOfficeStreamEvent("nope")).toBeNull();
  });
});
