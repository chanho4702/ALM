import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { deleteRepositoryWebhook, issueRepositoryWebhook, listRepositoryWebhooks } from "./jiraApi";

/** 저장소 웹훅(V44) REST 어댑터 — 계약 정본은 alm-backend README "저장소 웹훅"(WebhookDtos) */
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

afterEach(() => vi.restoreAllMocks());

const HOOK = {
  id: 4,
  repositoryUrl: "https://github.com/chanho4702/alm-backend",
  provider: "GITHUB",
  payloadPath: "/api/alm/webhooks/github/abc",
  payloadUrl: null,
  actorId: 1,
  createdAt: "2026-11-07T01:00:00Z",
  secretRotatedAt: "2026-11-07T01:00:00Z",
  lastDeliveryAt: "2026-11-07T02:00:00Z",
  lastEvent: "push",
  lastOutcome: "PROCESSED",
  lastMessage: "커밋 2건 — 새로 저장 2 · 새 연결 2",
  recentDeliveries: [
    { deliveryId: "d-1", event: "push", outcome: "PROCESSED", message: "커밋 2건", receivedAt: "2026-11-07T02:00:00Z" },
    { deliveryId: "d-0", event: "future", outcome: "SOMETHING_NEW", message: null, receivedAt: "2026-11-07T01:30:00Z" },
  ],
};

describe("저장소 웹훅", () => {
  it("GET → id 문자열·결과 어휘 정규화(모르는 값은 IGNORED)", async () => {
    const spy = fetchSpy(() => response(200, { encryptionConfigured: true, webhooks: [HOOK] }));
    const list = await listRepositoryWebhooks("7");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/settings/webhooks");
    expect(list.encryptionConfigured).toBe(true);
    expect(list.webhooks[0]).toEqual(
      expect.objectContaining({ id: "4", actorId: "1", provider: "GITHUB", payloadUrl: null, lastOutcome: "PROCESSED" }),
    );
    expect(list.webhooks[0].recentDeliveries.map((d) => d.outcome)).toEqual(["PROCESSED", "IGNORED"]);
  });

  it("POST는 {repositoryUrl, provider}, 응답의 secret을 그대로 돌려준다", async () => {
    const spy = fetchSpy(() => response(200, { webhook: { ...HOOK, provider: "GITLAB", recentDeliveries: null }, secret: "ab".repeat(32) }));
    const issued = await issueRepositoryWebhook("7", { repositoryUrl: HOOK.repositoryUrl, provider: "GITLAB" });
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ repositoryUrl: HOOK.repositoryUrl, provider: "GITLAB" });
    expect(issued.secret).toBe("ab".repeat(32));
    expect(issued.webhook.provider).toBe("GITLAB");
    expect(issued.webhook.recentDeliveries).toEqual([]);
  });

  it("400 {error}(키 없음 등)를 그대로 던지고, DELETE는 204", async () => {
    fetchSpy(() => response(400, { error: "웹훅 시크릿을 저장하려면 서버에 ALM_SETTINGS_ENC_KEY(32바이트 hex)가 필요합니다" }));
    await expect(issueRepositoryWebhook("7", { repositoryUrl: HOOK.repositoryUrl, provider: "GITHUB" })).rejects.toThrow(
      "ALM_SETTINGS_ENC_KEY",
    );
    vi.restoreAllMocks();
    const spy = fetchSpy(() => response(204));
    await deleteRepositoryWebhook("7", "4");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/settings/webhooks/4");
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
  });
});
