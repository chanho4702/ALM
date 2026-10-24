import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  archiveNotification,
  bulkNotifications,
  completeSprint,
  getPlanningSettings,
  updatePlanningSettings,
  listNotificationInbox,
  snoozeNotification,
  unsnoozeNotification,
} from "./jiraApi";

/** Linear 강점 반영 — REST 어댑터 계약(alm-backend README "실시간 동기화·사이클·추정 척도·알림 인박스") */
function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function fetchSpy(handler: (path: string, init?: RequestInit) => Response) {
  return vi
    .spyOn(client, "sharedApiFetch")
    .mockImplementation((path: string, init?: RequestInit) => Promise.resolve(handler(path, init)));
}

const bodyOf = (spy: ReturnType<typeof fetchSpy>, index: number) =>
  JSON.parse(spy.mock.calls[index][1]!.body as string) as Record<string, unknown>;

afterEach(() => vi.restoreAllMocks());

const NOTIFICATION = {
  id: 31,
  issueId: 1024,
  issueKey: "ALM-42",
  actorId: 7,
  type: "MENTIONED",
  detail: null,
  read: false,
  createdAt: "2026-10-24T00:00:00Z",
  snoozedUntil: "2026-10-25T00:00:00Z",
  archivedAt: null,
};

describe("알림 인박스(V40)", () => {
  it("GET /notifications/inbox — filter·cursor·limit, 응답 {items,nextCursor,unreadCount}, 새 필드 매핑", async () => {
    const spy = fetchSpy(() => response(200, { items: [NOTIFICATION], nextCursor: "1729_31", unreadCount: 4 }));
    const page = await listNotificationInbox({ filter: "mentions", cursor: "1730_40", limit: 20 });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/notifications/inbox?filter=mentions&cursor=1730_40&limit=20");
    expect(page).toEqual({
      items: [expect.objectContaining({ id: "31", type: "mentioned", snoozedUntil: "2026-10-25T00:00:00Z", archivedAt: null })],
      nextCursor: "1729_31",
      unreadCount: 4,
    });
  });

  it("옛 서버 응답(새 필드 없음)도 null로 접는다", async () => {
    const { snoozedUntil: _s, archivedAt: _a, ...old } = NOTIFICATION;
    fetchSpy(() => response(200, { items: [old], nextCursor: null, unreadCount: 1 }));
    const page = await listNotificationInbox();
    expect(page.items[0]).toMatchObject({ snoozedUntil: null, archivedAt: null });
  });

  it("미루기 POST/DELETE, 보관, 일괄 — 경로·본문(ids는 숫자)", async () => {
    const spy = fetchSpy((path) =>
      path.endsWith("/bulk") ? response(200, { updated: 2, unreadCount: 0 }) : response(200, NOTIFICATION),
    );
    await snoozeNotification("31", "2026-10-25T00:00:00.000Z");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/notifications/31/snooze");
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
    expect(bodyOf(spy, 0)).toEqual({ until: "2026-10-25T00:00:00.000Z" });
    await unsnoozeNotification("31");
    expect(spy.mock.calls[1]).toEqual(["/api/alm/notifications/31/snooze", { method: "DELETE" }]);
    await archiveNotification("31");
    expect(spy.mock.calls[2]).toEqual(["/api/alm/notifications/31/archive", { method: "POST" }]);
    expect(await bulkNotifications(["31", "32"], "read")).toEqual({ updated: 2, unreadCount: 0 });
    expect(bodyOf(spy, 3)).toEqual({ ids: [31, 32], action: "read" });
  });

  it("남의 알림(403) 문구는 그대로 올린다", async () => {
    fetchSpy(() => response(403, { error: "본인 알림만 보관할 수 있습니다" }));
    await expect(archiveNotification("9")).rejects.toThrow("본인 알림만 보관할 수 있습니다");
  });
});

describe("계획 설정(V39)·스프린트 완료 이월", () => {
  const DTO = {
    projectId: 7,
    sprintAutomation: { autoCreateNext: true, lengthDays: 14, cooldownDays: 2, defaultCarryOver: "next" },
    estimationScale: "tshirt",
    customValues: [],
    tshirtPoints: { XS: 1, S: 2, M: 3, L: 5, XL: 8 },
    allowedPoints: [1, 2, 3, 5, 8],
    version: 3,
  };

  it("GET planning-settings — id는 문자열, NUMERIC 문자열도 숫자로", async () => {
    const spy = fetchSpy(() => response(200, { ...DTO, tshirtPoints: { ...DTO.tshirtPoints, M: "3.5" }, allowedPoints: ["1", 2] }));
    const settings = await getPlanningSettings("7");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/planning-settings");
    expect(settings).toMatchObject({ projectId: "7", estimationScale: "tshirt", version: 3, allowedPoints: [1, 2] });
    expect(settings.tshirtPoints.M).toBe(3.5);
  });

  it("행이 없는 옛 응답(일부 필드 없음)은 기본값으로 채우고 allowedPoints를 척도에서 파생", async () => {
    fetchSpy(() => response(200, { projectId: 7, estimationScale: "fibonacci" }));
    const settings = await getPlanningSettings("7");
    expect(settings.sprintAutomation).toEqual({ autoCreateNext: false, lengthDays: 14, cooldownDays: 0, defaultCarryOver: "backlog" });
    expect(settings.allowedPoints).toEqual([0, 1, 2, 3, 5, 8, 13, 21]);
  });

  it("PUT — 보낸 항목 + expectedVersion, 409는 ApiError(409)", async () => {
    const spy = fetchSpy(() => response(200, DTO));
    await updatePlanningSettings("7", { sprintAutomation: { cooldownDays: 2 } }, 2);
    expect(spy.mock.calls[0][1]?.method).toBe("PUT");
    expect(bodyOf(spy, 0)).toEqual({ sprintAutomation: { cooldownDays: 2 }, expectedVersion: 2 });
    spy.mockImplementation(() => Promise.resolve(response(409, { error: "버전이 맞지 않습니다" })));
    await expect(updatePlanningSettings("7", { estimationScale: "linear" }, 2)).rejects.toMatchObject({ status: 409 });
  });

  it("스프린트 완료 — 스프린트 id > moveUnfinishedTo(next·backlog), 응답 carryOver 매핑", async () => {
    const SPRINT = { id: 12, projectId: 7, name: "Sprint 3", state: "DONE", version: 3 };
    const spy = fetchSpy(() =>
      response(200, { ...SPRINT, carryOver: { target: "sprint", sprintId: 13, movedCount: 4, nextSprintId: 13, nextSprintAutoCreated: true } }),
    );
    const done = await completeSprint("12", { carryOver: "next" });
    expect(bodyOf(spy, 0)).toEqual({ moveUnfinishedTo: "next" });
    expect(done.carryOver).toEqual({ target: "sprint", sprintId: "13", movedCount: 4, nextSprintId: "13", nextSprintAutoCreated: true });
    await completeSprint("12", { moveUnfinishedTo: "20", carryOver: "backlog" });
    expect(bodyOf(spy, 1)).toEqual({ moveUnfinishedToSprintId: 20 });
    await completeSprint("12");
    expect(bodyOf(spy, 2)).toEqual({});
  });
});

describe("프로젝트 실시간 스트림 — fetch 스트리밍", () => {
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

  it("경로·Accept·Last-Event-ID 헤더, 프레임을 화면 이벤트로(조각 경계와 무관)", async () => {
    const { streamProject } = await import("./jiraApi");
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      streamResponse([
        "retry:3000\n:connected\n\nid:1729-0\nevent:ready\ndata:{\"projectId\":7,\"replayed\":2,\"reset\":false}\n\n",
        "id:1729-1\nevent:iss",
        'ue\ndata:{"type":"issue.transitioned","projectId":7,"issueId":123,"issueKey":"ALM-12","version":6,"changedFields":["status"],"actorId":42}\n\n:hb\n\n',
      ]),
    );
    const events: unknown[] = [];
    const controller = new AbortController();
    const onOpen = vi.fn();
    await streamProject("7", { signal: controller.signal, lastEventId: "1728-9", onOpen, onActivity: vi.fn(), onEvent: (e) => events.push(e) });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/stream");
    const headers = new Headers((spy.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("Accept")).toBe("text/event-stream");
    expect(headers.get("Last-Event-ID")).toBe("1728-9");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { kind: "ready", projectId: "7", replayed: 2, reset: false, eventId: "1729-0" },
      expect.objectContaining({ kind: "issue", type: "issue.transitioned", issueId: "123", version: 6, actorId: "42", eventId: "1729-1" }),
    ]);
  });

  it.each([
    [403, "unauthorized"],
    [404, "unsupported"],
    [429, "rate-limited"],
    [503, "network"],
  ] as const)("%i → %s(재연결 판단)", async (status, kind) => {
    const { streamProject } = await import("./jiraApi");
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(status, { error: "x" }));
    const error = await streamProject("7", {
      signal: new AbortController().signal,
      lastEventId: null,
      onOpen: vi.fn(),
      onActivity: vi.fn(),
      onEvent: vi.fn(),
    }).catch((e: unknown) => e);
    expect((error as { kind: string }).kind).toBe(kind);
  });
});
