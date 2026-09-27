import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { mapAgentChatReply, mapAgentDialogPage, mapAgentOffice } from "./agentMapping";
import { ApiError, errorStatus } from "./mapping";
import { createAgentRun, fetchPersonaDialog, savePersonaDialog, sendPersonaChat } from "./jiraApi";

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

const sentBody = (spy: ReturnType<typeof fetchSpy>, call = 0): unknown =>
  JSON.parse(String((spy.mock.calls[call][1] as RequestInit | undefined)?.body));

afterEach(() => {
  vi.restoreAllMocks();
});

const RUN = {
  id: 9500, issueKey: "ALM-7", status: "QUEUED", personaId: 105, attempt: 1, model: null,
  startedAt: null, endedAt: null, type: "TASK", trigger: "USER", parentRunId: null,
};

describe("P3g 경계 매퍼", () => {
  it("office features — 구 백엔드(필드 없음)·null은 꺼짐, true만 켜짐", () => {
    expect(mapAgentOffice({}).features).toEqual({ chat: false });
    expect(mapAgentOffice({ features: null }).features).toEqual({ chat: false });
    expect(mapAgentOffice({ features: { chat: true } }).features).toEqual({ chat: true });
  });

  it("수다 응답 — 모르는 mood는 null, suggest는 DIRECTIVE만", () => {
    expect(mapAgentChatReply({ sessionId: "c-1", reply: "네", mood: "HAPPY", suggest: "DIRECTIVE" })).toEqual({
      sessionId: "c-1", reply: "네", mood: "HAPPY", suggest: "DIRECTIVE",
    });
    expect(mapAgentChatReply({ sessionId: "c-1", reply: null, mood: "ANGRY", suggest: "RUN" })).toEqual({
      sessionId: "c-1", reply: "", mood: null, suggest: null,
    });
  });

  it("대화 기록 — id·runId·commentId 문자열, 시간순 정렬, 모르는 enum은 접는다", () => {
    const page = mapAgentDialogPage({
      entries: [
        { id: 813, speaker: "PERSONA", kind: "STATUS", text: "지금은…", issueKey: "ALM-12", runId: 9004, commentId: null, createdAt: "2026-09-27T05:13:00Z" },
        { id: 812, speaker: "USER", kind: "DIRECTIVE", text: "문구", issueKey: "ALM-12", runId: null, commentId: 3301, createdAt: "2026-09-27T05:12:03Z" },
        { id: 814, speaker: "ROBOT", kind: "WHAT", text: null, createdAt: "2026-09-27T05:14:00Z" },
      ],
      hasMore: true,
    });
    expect(page.hasMore).toBe(true);
    expect(page.entries.map((e) => e.id)).toEqual(["812", "813", "814"]);
    expect(page.entries[0]).toMatchObject({ speaker: "USER", kind: "DIRECTIVE", commentId: "3301", runId: null });
    expect(page.entries[1].runId).toBe("9004");
    expect(page.entries[2]).toMatchObject({ speaker: "PERSONA", kind: "SAY", text: "" });
  });
});

describe("P3g REST 계약", () => {
  it("USER run — 빈 지시문·모델은 싣지 않고 201 RunSummary를 매핑, 409는 상태를 싣는 ApiError", async () => {
    const spy = fetchSpy(response(201, RUN), response(409, { error: "이미 진행 중인 run이 있습니다: ALM-2" }));
    const run = await createAgentRun({ issueKey: " ALM-7 ", instruction: "  ", model: "", personaSlug: "ops-bot" });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/runs");
    expect(sentBody(spy)).toEqual({ issueKey: "ALM-7", personaSlug: "ops-bot" });
    expect(run).toMatchObject({ id: "9500", status: "QUEUED", personaId: "105" });

    const error = await createAgentRun({ issueKey: "ALM-2", personaSlug: "ops-bot", model: "claude-haiku-4-5-20251001" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(errorStatus(error)).toBe(409);
    expect((error as Error).message).toBe("이미 진행 중인 run이 있습니다: ALM-2");
    expect(sentBody(spy, 1)).toEqual({ issueKey: "ALM-2", model: "claude-haiku-4-5-20251001", personaSlug: "ops-bot" });
  });

  it("수다 — 첫 턴은 sessionId 생략, projectId는 숫자. 503·429는 상태로 구분된다", async () => {
    const spy = fetchSpy(
      response(200, { sessionId: "c-5f1", reply: "음…", mood: "TROUBLED", suggest: null }),
      response(503, { error: "수다 기능이 꺼져 있습니다" }),
      response(429, { error: "잠시 뒤 다시 시도하세요" }),
    );
    const reply = await sendPersonaChat("105", { message: "요즘 어때?", projectId: "3" });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/personas/105/chat");
    expect(sentBody(spy)).toEqual({ message: "요즘 어때?", projectId: 3 });
    expect(reply).toEqual({ sessionId: "c-5f1", reply: "음…", mood: "TROUBLED", suggest: null });
    expect(errorStatus(await sendPersonaChat("105", { message: "a", sessionId: "c-5f1" }).catch((e: unknown) => e))).toBe(503);
    expect(sentBody(spy, 1)).toEqual({ message: "a", sessionId: "c-5f1" });
    expect(errorStatus(await sendPersonaChat("105", { message: "b" }).catch((e: unknown) => e))).toBe(429);
  });

  it("대화 기록 — GET before·limit, 구 백엔드 404는 ApiError(화면이 메모리로 폴백), POST는 빈 선택 필드를 빼고 saved를 돌려준다", async () => {
    const spy = fetchSpy(
      response(200, { entries: [], hasMore: false }),
      response(404, null),
      response(201, { saved: 1 }),
    );
    await fetchPersonaDialog("101", { before: "812" });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/personas/101/dialog?before=812&limit=50");
    expect(errorStatus(await fetchPersonaDialog("101").catch((e: unknown) => e))).toBe(404);
    const saved = await savePersonaDialog("101", [{ speaker: "PERSONA", kind: "STATUS", text: "쉬는 중", issueKey: null, runId: "9004" }]);
    expect(saved).toBe(1);
    expect(spy.mock.calls[2][0]).toBe("/api/agent/personas/101/dialog");
    expect(sentBody(spy, 2)).toEqual({ entries: [{ speaker: "PERSONA", kind: "STATUS", text: "쉬는 중", runId: "9004" }] });
  });
});
