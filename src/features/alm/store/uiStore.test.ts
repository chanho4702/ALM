import { beforeEach, describe, expect, it } from "vitest";
import {
  getSideNavWidth,
  isSideNavCollapsed,
  listRecentProjectIds,
  listStarredProjectIds,
  pruneProject,
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

describe("uiStore 저장 필터", () => {
  it("저장·나열·삭제, 같은 이름은 덮어쓴다, 빈 이름 거부", async () => {
    const { deleteSavedFilter, listSavedFilters, saveFilter } = await import("./uiStore");
    const first = await saveFilter("내 버그", "타입:버그 담당:김찬호");
    await saveFilter("이번 주", "정렬:마감");
    expect((await listSavedFilters()).map((f) => f.name)).toEqual(["내 버그", "이번 주"]);

    await saveFilter("내 버그", "타입:버그"); // 덮어쓰기
    const filters = await listSavedFilters();
    expect(filters).toHaveLength(2);
    expect(filters.find((f) => f.id === first.id)?.query).toBe("타입:버그");

    await deleteSavedFilter(first.id);
    expect((await listSavedFilters()).map((f) => f.name)).toEqual(["이번 주"]);

    await expect(saveFilter("  ", "x")).rejects.toThrow("필터 이름을 입력하세요");
  });
});
