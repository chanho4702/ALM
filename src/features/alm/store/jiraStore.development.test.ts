import { beforeEach, describe, expect, it } from "vitest";
import {
  __ingestMockCommits,
  __resetForTest,
  createAutomationRule,
  getIssueDevelopment,
  listActivity,
  listComments,
  listProjectCommits,
  listProjectRepositories,
  saveProjectRepositories,
  updateProjectMemberRole,
} from "./jiraStore";
import { MAX_PROJECT_REPOSITORIES } from "./types";

/** 개발 기록(V41) — 목업이 서버 규칙(alm-backend README "개발 기록 — 커밋 연결")을 같은 문구로 흉내 내는지 */
beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("저장소 등록", () => {
  it("시드 저장소 하나 — 통째 교체하면 URL을 정규화하고 이름·브랜치 기본값을 채운다", async () => {
    expect(await listProjectRepositories("p1")).toEqual([
      expect.objectContaining({ name: "chanho4702/alm-front", url: "https://github.com/chanho4702/alm-front", defaultBranch: "main" }),
    ]);
    const saved = await saveProjectRepositories("p1", [
      { url: "https://GitHub.com/chanho4702/alm-backend.git/" },
      { name: "위키", url: "git@github.com:chanho4702/wiki-front.git", defaultBranch: "develop" },
    ]);
    expect(saved.map(({ name, url, defaultBranch }) => ({ name, url, defaultBranch }))).toEqual([
      { name: "chanho4702/alm-backend", url: "https://github.com/chanho4702/alm-backend", defaultBranch: "main" },
      { name: "위키", url: "https://github.com/chanho4702/wiki-front", defaultBranch: "develop" },
    ]);
    expect(await listProjectRepositories("p1")).toHaveLength(2);
  });

  it("검증 — 서버와 같은 문구(계정 정보·질의·소유자 없음·중복·상한)", async () => {
    await expect(saveProjectRepositories("p1", [{ url: "https://token@github.com/a/b" }])).rejects.toThrow(
      "저장소 URL에 계정 정보를 넣을 수 없습니다",
    );
    await expect(saveProjectRepositories("p1", [{ url: "https://github.com/a/b?x=1" }])).rejects.toThrow(
      "저장소 URL에 질의·조각(?·#)을 넣을 수 없습니다",
    );
    await expect(saveProjectRepositories("p1", [{ url: "https://github.com/onlyowner" }])).rejects.toThrow(
      "저장소 URL은 소유자/저장소까지 있어야 합니다 (예: https://github.com/owner/repo)",
    );
    await expect(saveProjectRepositories("p1", [{ url: "ftp://x.com/a/b" }])).rejects.toThrow("저장소 URL은 http(s) 주소여야 합니다");
    await expect(
      saveProjectRepositories("p1", [{ url: "https://github.com/a/b" }, { url: "https://github.com/a/b.git" }]),
    ).rejects.toThrow("같은 저장소가 두 번 들어 있습니다: https://github.com/a/b");
    const many = Array.from({ length: MAX_PROJECT_REPOSITORIES + 1 }, (_, i) => ({ url: `https://github.com/o/r${i}` }));
    await expect(saveProjectRepositories("p1", many)).rejects.toThrow("저장소는 프로젝트당 20개까지 등록할 수 있습니다");
    // 실패하면 아무것도 바뀌지 않는다
    expect(await listProjectRepositories("p1")).toHaveLength(1);
  });

  it("관리자만 쓴다 — 편집자는 거절, 읽기는 된다", async () => {
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    await expect(saveProjectRepositories("p1", [])).rejects.toThrow("프로젝트 관리자만 할 수 있습니다");
    expect(await listProjectRepositories("p1")).toHaveLength(1);
  });
});

describe("이슈 개발 정보", () => {
  it("ALM-2 — 수집 커밋 최신 순 + 웹 링크 PR, 요약", async () => {
    const dev = await getIssueDevelopment("i2");
    expect(dev.issueKey).toBe("ALM-2");
    expect(dev.summary).toEqual(expect.objectContaining({ commits: 2, repositories: 1, pullRequests: 1 }));
    expect(dev.commits.map((c) => c.shortSha)).toEqual(["3dc8bbc", "a1b2c3d"]);
    expect(dev.commits[0]).toEqual(
      expect.objectContaining({ source: "COMMIT", authorName: "이영희", repositoryName: "chanho4702/alm-front", issues: null }),
    );
    expect(dev.pullRequests).toEqual([expect.objectContaining({ title: "칸반 보드 UI PR" })]);
    expect(dev.truncated).toBe(false);
  });

  it("연결이 없으면 0건", async () => {
    const dev = await getIssueDevelopment("i5");
    expect(dev.summary).toEqual({ commits: 0, repositories: 0, pullRequests: 0, lastCommitAt: null });
    expect(dev.commits).toEqual([]);
  });
});

describe("프로젝트 최근 커밋", () => {
  it("최신 순 커서 페이징 — 항목마다 이어진 이슈 키", async () => {
    const first = await listProjectCommits("p1", { limit: 3 });
    expect(first.items.map((c) => c.shortSha)).toEqual(["3dc8bbc", "a1b2c3d", "9f8e7d6"]);
    expect(first.items[0].issues).toEqual([{ issueId: "i2", issueKey: "ALM-2" }]);
    expect(first.nextCursor).not.toBeNull();
    const second = await listProjectCommits("p1", { cursor: first.nextCursor, limit: 3 });
    expect(second.items.map((c) => c.shortSha)).toEqual(["0123456"]);
    expect(second.nextCursor).toBeNull();
    await expect(listProjectCommits("p1", { cursor: "엉망" })).rejects.toThrow("커서 형식이 올바르지 않습니다");
  });
});

describe("수집 대역(__ingestMockCommits)", () => {
  it("메시지 키로 잇고 활동 한 줄·자동화 COMMIT_LINKED — 같은 커밋 재전송은 멱등", async () => {
    await createAutomationRule("p1", {
      name: "커밋 연결 알림",
      description: "",
      enabled: true,
      trigger: { type: "COMMIT_LINKED" },
      condition: "",
      actions: [{ type: "COMMENT", body: "커밋이 연결됐습니다" }],
      allowRuleTrigger: false,
    } as Parameters<typeof createAutomationRule>[1]);
    const commit = { sha: "b".repeat(40), message: "fix: 필터 초기화 [alm-005]\n\n본문", authorName: "김찬호" };
    const first = await __ingestMockCommits!("https://github.com/chanho4702/alm-front.git", [commit]);
    expect(first.linksCreated).toBe(1);
    const dev = await getIssueDevelopment("i5");
    expect(dev.commits).toEqual([expect.objectContaining({ shortSha: "bbbbbbb", title: "fix: 필터 초기화 [alm-005]", message: "본문" })]);
    expect((await listActivity("i5")).filter((a) => a.type === "commit_linked")).toEqual([
      expect.objectContaining({ detail: "커밋 1건 연결: bbbbbbb" }),
    ]);
    expect((await listComments("i5")).map((c) => c.body)).toContain("커밋이 연결됐습니다");

    const again = await __ingestMockCommits!("https://github.com/chanho4702/alm-front", [commit]);
    expect(again.linksCreated).toBe(0);
    expect((await listActivity("i5")).filter((a) => a.type === "commit_linked")).toHaveLength(1);
  });

  it("등록된 프로젝트 키만 키다 — UTF-8·영숫자에 붙은 키는 무시", async () => {
    const result = await __ingestMockCommits!("https://github.com/someone/other", [
      { sha: "c".repeat(40), message: "chore: UTF-8 정리 xALM-1 ALM-1a" },
    ]);
    expect(result.linksCreated).toBe(0);
    // 등록 안 된 저장소이고 이어진 이슈도 없으면 저장하지 않는다
    expect((await listProjectCommits("p1")).items).toHaveLength(4);
  });
});
