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
