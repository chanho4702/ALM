import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { getIssueDevelopment, listProjectCommits, listProjectRepositories, saveProjectRepositories } from "./jiraApi";

/** 개발 기록(V41) REST 어댑터 — 계약 정본은 alm-backend README "개발 기록 — 커밋 연결"(DevDtos) */
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

const COMMIT = {
  id: 41,
  source: "COMMIT",
  repositoryName: "chanho4702/alm-backend",
  repositoryUrl: "https://github.com/chanho4702/alm-backend",
  sha: "3dc8bbc1f0e2a7d4c5b6a7980123456789abcdef",
  shortSha: "3dc8bbc",
  title: "feat: 커밋 연결 [PLAT-12]",
  message: "본문",
  authorName: "chanho",
  authorEmail: "c@x.com",
  authoredAt: "2026-10-25T03:00:00Z",
  branch: "main",
  url: "https://github.com/chanho4702/alm-backend/commit/3dc8bbc1f0e2a7d4c5b6a7980123456789abcdef",
  issues: null,
};

describe("저장소 등록", () => {
  it("GET → id 문자열, PUT은 {repositories} 통째(빈 이름·브랜치는 null)", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "PUT"
        ? response(200, [{ id: 3, name: "chanho4702/alm-backend", url: "https://github.com/chanho4702/alm-backend", defaultBranch: "main" }])
        : response(200, [{ id: 2, name: "alm", url: "https://github.com/a/b", defaultBranch: "develop" }]),
    );
    expect(await listProjectRepositories("7")).toEqual([{ id: "2", name: "alm", url: "https://github.com/a/b", defaultBranch: "develop" }]);
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/settings/repositories");

    const saved = await saveProjectRepositories("7", [{ name: " ", url: " https://github.com/chanho4702/alm-backend.git ", defaultBranch: "" }]);
    expect(spy.mock.calls[1][0]).toBe("/api/alm/projects/7/settings/repositories");
    expect(spy.mock.calls[1][1]?.method).toBe("PUT");
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({
      repositories: [{ name: null, url: "https://github.com/chanho4702/alm-backend.git", defaultBranch: null }],
    });
    expect(saved[0]).toEqual({ id: "3", name: "chanho4702/alm-backend", url: "https://github.com/chanho4702/alm-backend", defaultBranch: "main" });
  });

  it("400 {error} 문장을 그대로 던진다 · 403도 삼키지 않는다", async () => {
    fetchSpy(() => response(400, { error: "저장소 URL에 계정 정보를 넣을 수 없습니다" }));
    await expect(saveProjectRepositories("7", [{ url: "https://t@github.com/a/b" }])).rejects.toThrow("저장소 URL에 계정 정보를 넣을 수 없습니다");
  });
});

describe("이슈 개발 정보", () => {
  it("GET /issues/{id}/development — 커밋·PR·요약 매핑, WEB_LINK의 빈 칸 방어", async () => {
    const spy = fetchSpy(() =>
      response(200, {
        issueId: 12,
        issueKey: "PLAT-12",
        summary: { commits: 2, repositories: 1, pullRequests: 1, lastCommitAt: "2026-10-25T03:00:00Z" },
        commits: [
          COMMIT,
          { id: null, source: "WEB_LINK", repositoryName: null, repositoryUrl: null, sha: "0123456789", shortSha: null, title: null, message: null, authorName: null, authorEmail: null, authoredAt: null, branch: null, url: "https://github.com/a/b/commit/0123456789", issues: null },
        ],
        truncated: true,
        pullRequests: [{ id: 5, url: "https://github.com/a/b/pull/9", title: "PR", createdBy: 7, createdAt: "2026-10-24T00:00:00Z" }],
      }),
    );
    const dev = await getIssueDevelopment("12");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/12/development");
    expect(dev.issueId).toBe("12");
    expect(dev.truncated).toBe(true);
    expect(dev.commits[0]).toEqual(expect.objectContaining({ id: "41", source: "COMMIT", shortSha: "3dc8bbc", issues: null }));
    expect(dev.commits[1]).toEqual(
      expect.objectContaining({ id: null, source: "WEB_LINK", shortSha: "0123456", title: "https://github.com/a/b/commit/0123456789", authoredAt: null }),
    );
    expect(dev.pullRequests).toEqual([{ id: "5", url: "https://github.com/a/b/pull/9", title: "PR", createdBy: "7", createdAt: "2026-10-24T00:00:00Z" }]);
  });

  it("503은 에러로 전파한다(빈 패널로 삼키지 않는다)", async () => {
    fetchSpy(() => response(503, { error: "권한 서비스를 사용할 수 없습니다" }));
    await expect(getIssueDevelopment("12")).rejects.toMatchObject({ status: 503 });
  });
});

describe("프로젝트 최근 커밋", () => {
  it("cursor·limit 질의, 항목 issues → 문자열 id, nextCursor", async () => {
    const spy = fetchSpy(() =>
      response(200, { items: [{ ...COMMIT, issues: [{ issueId: 12, issueKey: "PLAT-12" }] }], nextCursor: "2026-10-25T03:00:00Z_41" }),
    );
    const page = await listProjectCommits("7", { cursor: "abc", limit: 30 });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/commits?cursor=abc&limit=30");
    expect(page.items[0].issues).toEqual([{ issueId: "12", issueKey: "PLAT-12" }]);
    expect(page.nextCursor).toBe("2026-10-25T03:00:00Z_41");

    spy.mockImplementation(() => Promise.resolve(response(200, { items: [], nextCursor: null })));
    expect(await listProjectCommits("7")).toEqual({ items: [], nextCursor: null });
    expect(spy.mock.calls[1][0]).toBe("/api/alm/projects/7/commits");
  });
});
