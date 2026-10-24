import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetViewedIssues,
  getSideNavWidth,
  isSideNavCollapsed,
  listRecentProjectIds,
  listStarredProjectIds,
  listViewedIssues,
  pruneProject,
  recordIssueView,
  recordProjectVisit,
  setSideNavCollapsed,
  setSideNavWidth,
  toggleProjectStar,
} from "./uiStore";

beforeEach(() => {
  localStorage.clear();
});

describe("uiStore 최근 방문", () => {
  it("방문 순서를 최신순으로 유지하고 중복은 맨 앞으로 끌어올린다", async () => {
    await recordProjectVisit("a");
    await recordProjectVisit("b");
    await recordProjectVisit("a");
    expect(await listRecentProjectIds()).toEqual(["a", "b"]);
  });

  it("최대 5개까지만 보관한다", async () => {
    for (const id of ["1", "2", "3", "4", "5", "6"]) await recordProjectVisit(id);
    const recents = await listRecentProjectIds();
    expect(recents).toHaveLength(5);
    expect(recents[0]).toBe("6");
    expect(recents).not.toContain("1");
  });
});

describe("uiStore 최근 본 이슈", () => {
  it("연 순서를 최신순으로, 다시 열면 맨 앞으로 올린다", async () => {
    await recordIssueView("u1", "ALM-1");
    await recordIssueView("u1", "ALM-2");
    await recordIssueView("u1", "ALM-1");
    expect((await listViewedIssues("u1")).map((v) => v.key)).toEqual(["ALM-1", "ALM-2"]);
  });

  it("최대 20건까지만 보관한다", async () => {
    for (let n = 1; n <= 21; n += 1) await recordIssueView("u1", `ALM-${n}`);
    const viewed = await listViewedIssues("u1");
    expect(viewed).toHaveLength(20);
    expect(viewed[0].key).toBe("ALM-21");
    expect(viewed.map((v) => v.key)).not.toContain("ALM-1");
  });

  it("사용자별로 따로 보관하고, 걷어낸 키는 그 사용자 목록에서만 빠진다", async () => {
    await recordIssueView("u1", "ALM-1");
    await recordIssueView("u2", "ALM-1");
    await recordIssueView("u2", "ALM-2");
    await forgetViewedIssues("u2", ["ALM-1"]);
    expect((await listViewedIssues("u1")).map((v) => v.key)).toEqual(["ALM-1"]);
    expect((await listViewedIssues("u2")).map((v) => v.key)).toEqual(["ALM-2"]);
  });

  it("기록은 사이드바 구독 이벤트를 내지 않는다(이슈를 열 때마다 사이드바가 다시 읽지 않게)", async () => {
    let fired = 0;
    const onChange = () => {
      fired += 1;
    };
    window.addEventListener("alm:ui-changed", onChange);
    await recordIssueView("u1", "ALM-1");
    window.removeEventListener("alm:ui-changed", onChange);
    expect(fired).toBe(0);
  });
});

describe("uiStore 별표", () => {
  it("토글로 켜고 끈다", async () => {
    expect(await toggleProjectStar("p1")).toBe(true);
    expect(await listStarredProjectIds()).toEqual(["p1"]);
    expect(await toggleProjectStar("p1")).toBe(false);
    expect(await listStarredProjectIds()).toEqual([]);
  });
});

describe("uiStore 접힘/정리", () => {
  it("사이드바 접힘 상태를 저장한다", async () => {
    expect(await isSideNavCollapsed()).toBe(false);
    await setSideNavCollapsed(true);
    expect(await isSideNavCollapsed()).toBe(true);
  });

  it("pruneProject는 최근/별표에서 프로젝트를 제거한다", async () => {
    await recordProjectVisit("p1");
    await toggleProjectStar("p1");
    await pruneProject("p1");
    expect(await listRecentProjectIds()).toEqual([]);
    expect(await listStarredProjectIds()).toEqual([]);
  });
});

describe("uiStore 사이드바 너비", () => {
  it("기본 240, 저장 시 180~400으로 클램프한다", async () => {
    expect(await getSideNavWidth()).toBe(240);
    await setSideNavWidth(320);
    expect(await getSideNavWidth()).toBe(320);
    await setSideNavWidth(50);
    expect(await getSideNavWidth()).toBe(180);
    await setSideNavWidth(9999);
    expect(await getSideNavWidth()).toBe(400);
  });
});

describe("uiStore 저장 필터 (목업 절반 — 화면은 jiraStore 파사드로 만난다)", () => {
  it("만들기·나열·수정·삭제, 이름 중복·빈 이름 거부", async () => {
    const { createSavedFilter, deleteSavedFilter, listSavedFilters, updateSavedFilter } =
      await import("./uiStore");
    const first = await createSavedFilter({ name: "내 버그", query: "타입:버그 담당:김찬호" });
    await createSavedFilter({ name: "이번 주", query: "정렬:마감" });
    // 이름 순 — 서버 `GET /api/alm/me/filters`와 같은 정렬이다
    expect((await listSavedFilters()).map((f) => f.name)).toEqual(["내 버그", "이번 주"]);

    await updateSavedFilter(first.id, { query: "타입:버그" });
    const filters = await listSavedFilters();
    expect(filters).toHaveLength(2);
    expect(filters.find((f) => f.id === first.id)?.query).toBe("타입:버그");

    await expect(createSavedFilter({ name: "이번 주", query: "x" })).rejects.toThrow(
      "같은 이름의 필터가 있습니다",
    );
    await expect(updateSavedFilter(first.id, { name: "이번 주" })).rejects.toThrow(
      "같은 이름의 필터가 있습니다",
    );

    await deleteSavedFilter(first.id);
    expect((await listSavedFilters()).map((f) => f.name)).toEqual(["이번 주"]);

    await expect(createSavedFilter({ name: "  ", query: "x" })).rejects.toThrow(
      "필터 이름을 입력하세요",
    );
  });

  it("REST 이관용 읽기·비우기는 저장 순서를 그대로 준다", async () => {
    const { clearLocalSavedFilters, createSavedFilter, localSavedFilters } =
      await import("./uiStore");
    await createSavedFilter({ name: "나중", query: "a" });
    await createSavedFilter({ name: "가장먼저", query: "status = done", kind: "aql" });
    expect(localSavedFilters().map((f) => f.name)).toEqual(["나중", "가장먼저"]);
    clearLocalSavedFilters();
    expect(localSavedFilters()).toEqual([]);
  });
});

describe("uiStore 즐겨찾기 · 이슈 만들기 초안 (Linear)", () => {
  it("고정·해제·순서 바꾸기 — 새 항목은 끝, moveFavorite는 범위를 잘라 넣는다", async () => {
    const { listFavorites, moveFavorite, toggleFavorite, isFavoriteSync } = await import("./uiStore");
    expect(await toggleFavorite({ kind: "project", id: "p1", label: "ALM" })).toBe(true);
    await toggleFavorite({ kind: "issue", id: "ALM-3", label: "ALM-3 제목", projectId: "p1" });
    await toggleFavorite({ kind: "view", id: "v9", label: "막힌 이슈", projectId: "p1" });
    expect(isFavoriteSync("issue", "ALM-3")).toBe(true);
    await moveFavorite("view", "v9", 0);
    expect((await listFavorites()).map((f) => f.id)).toEqual(["v9", "p1", "ALM-3"]);
    await moveFavorite("view", "v9", 99);
    expect((await listFavorites()).map((f) => f.id)).toEqual(["p1", "ALM-3", "v9"]);
    expect(await toggleFavorite({ kind: "issue", id: "ALM-3", label: "" })).toBe(false);
    expect((await listFavorites()).map((f) => f.id)).toEqual(["p1", "v9"]);
  });

  it("옛 전역 별표(starredProjectIds)는 프로젝트 즐겨찾기로 읽히고, 첫 쓰기 때 옮겨 적힌다", async () => {
    localStorage.setItem("alm.jira.ui.v1", JSON.stringify({ starredProjectIds: ["p2"] }));
    const { listFavorites, toggleProjectStar } = await import("./uiStore");
    expect(await listStarredProjectIds()).toEqual(["p2"]);
    await toggleProjectStar("p1", "ALM");
    expect((await listFavorites()).map((f) => `${f.kind}:${f.id}`)).toEqual(["project:p2", "project:p1"]);
    expect(JSON.parse(localStorage.getItem("alm.jira.ui.v1")!).starredProjectIds).toEqual([]);
  });

  it("프로젝트를 지우면 그 프로젝트의 이슈·보기 즐겨찾기도 걷어 낸다", async () => {
    const { listFavorites, toggleFavorite } = await import("./uiStore");
    await toggleFavorite({ kind: "project", id: "p1", label: "" });
    await toggleFavorite({ kind: "issue", id: "ALM-1", label: "", projectId: "p1" });
    await toggleFavorite({ kind: "issue", id: "WEB-1", label: "", projectId: "p2" });
    await pruneProject("p1");
    expect((await listFavorites()).map((f) => f.id)).toEqual(["WEB-1"]);
  });

  it("초안은 프로젝트별·사용자별 — 빈 내용은 저장하지 않고, 지우면 사라진다", async () => {
    const { clearCreateIssueDraft, getCreateIssueDraft, saveCreateIssueDraft, setUiUser } = await import("./uiStore");
    setUiUser("u1");
    await saveCreateIssueDraft("p1", { title: "  ", description: "" });
    expect(await getCreateIssueDraft("p1")).toBeNull();
    await saveCreateIssueDraft("p1", { title: "로그인 버그", priority: "high" });
    expect(await getCreateIssueDraft("p1")).toMatchObject({ title: "로그인 버그", priority: "high" });
    expect(await getCreateIssueDraft("p2")).toBeNull();
    setUiUser("u2");
    expect(await getCreateIssueDraft("p1")).toBeNull();
    setUiUser("u1");
    await clearCreateIssueDraft("p1");
    expect(await getCreateIssueDraft("p1")).toBeNull();
  });
});
