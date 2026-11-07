import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { getIssueDevelopment, listRepositoryWebhooks, listScmSyncs, runScmSync, saveScmSync } from "./jiraApi";

/** 저장소 폴링 동기화(V45) REST 어댑터 + PR 상태 — 계약 정본은 alm-backend README "저장소 폴링 동기화" */
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

const SYNC = {
  id: 9,
  repositoryUrl: "https://ghe.corp/acme/app",
  provider: "GITHUB",
  apiBaseUrl: "https://ghe.corp/api/v3",
  enabled: true,
  actorId: 1,
  createdAt: "2026-11-07T01:00:00Z",
  tokenUpdatedAt: "2026-11-07T01:00:00Z",
  lastRunAt: "2026-11-07T02:00:00Z",
  lastSuccessAt: null,
  lastOutcome: "RATE_LIMITED",
  lastMessage: "Git 서버 레이트 리밋",
  nextRunAt: "2026-11-07T03:00:00Z",
  rateLimitedUntil: "2026-11-07T03:00:00Z",
  failureCount: 0,
  running: false,
};

describe("폴링 동기화 REST", () => {
  it("GET → 설치 스위치·id 문자열·모르는 결과는 FAILED", async () => {
    const spy = fetchSpy(() =>
      response(200, {
        syncMode: "polling",
        webhooksEnabled: false,
        pollingEnabled: true,
        schedulerActive: true,
        encryptionConfigured: true,
        pollIntervalSeconds: 300,
        repositories: [SYNC, { ...SYNC, id: 10, lastOutcome: "SOMETHING_NEW" }],
      }),
    );
    const list = await listScmSyncs("7");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/settings/scm-sync");
    expect(list.syncMode).toBe("polling");
    expect(list.webhooksEnabled).toBe(false);
    expect(list.repositories[0]).toEqual(expect.objectContaining({ id: "9", actorId: "1", lastOutcome: "RATE_LIMITED" }));
    expect(list.repositories[1].lastOutcome).toBe("FAILED");
  });

  it("PUT은 빈 토큰·API 주소를 보내지 않고, 지금 동기화는 POST …/run", async () => {
    const spy = fetchSpy(() => response(200, SYNC));
    await saveScmSync("7", { repositoryUrl: SYNC.repositoryUrl, provider: "GITHUB", apiBaseUrl: " ", token: "  ", enabled: false });
    expect(spy.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      repositoryUrl: SYNC.repositoryUrl,
      provider: "GITHUB",
      enabled: false,
    });
    await saveScmSync("7", { repositoryUrl: SYNC.repositoryUrl, provider: "GITHUB", token: " ghp_x " });
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({
      repositoryUrl: SYNC.repositoryUrl,
      provider: "GITHUB",
      token: "ghp_x",
    });
    await runScmSync("7", "9");
    expect(spy.mock.calls[2][0]).toBe("/api/alm/projects/7/settings/scm-sync/9/run");
    expect(spy.mock.calls[2][1]?.method).toBe("POST");
  });

  it("409 {error}(실행 중·레이트 리밋)를 그대로 던진다", async () => {
    fetchSpy(() => response(409, { error: "이미 동기화 중이거나 Git 서버 레이트 리밋 대기 중입니다 — 잠시 뒤 다시 시도하세요" }));
    await expect(runScmSync("7", "9")).rejects.toThrow("이미 동기화 중이거나");
  });

  it("PR 상태는 OPEN·MERGED·CLOSED만, 옛 서버(필드 없음)는 null · 웹훅 목록의 webhooksEnabled 기본 true", async () => {
    fetchSpy((path) =>
      path.endsWith("/development")
        ? response(200, {
            issueId: 1,
            issueKey: "PLAT-1",
            commits: [],
            pullRequests: [
              { id: 1, url: "https://x/pull/1", title: "a", createdBy: 1, createdAt: "2026-11-07T00:00:00Z", state: "MERGED" },
              { id: 2, url: "https://x/pull/2", title: "b", createdBy: 1, createdAt: "2026-11-07T00:00:00Z" },
              { id: 3, url: "https://x/pull/3", title: "c", createdBy: 1, createdAt: "2026-11-07T00:00:00Z", state: "DRAFT" },
            ],
          })
        : response(200, { encryptionConfigured: true, webhooks: [] }),
    );
    const dev = await getIssueDevelopment("1");
    expect(dev.pullRequests.map((p) => p.state)).toEqual(["MERGED", null, null]);
    expect((await listRepositoryWebhooks("7")).webhooksEnabled).toBe(true);
  });
});
