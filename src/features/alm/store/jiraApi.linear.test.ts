import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  archiveNotification,
  bulkNotifications,
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
