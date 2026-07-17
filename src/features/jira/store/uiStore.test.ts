import { beforeEach, describe, expect, it } from "vitest";
import {
  isSideNavCollapsed,
  listRecentProjectIds,
  listStarredProjectIds,
  pruneProject,
  recordProjectVisit,
  setSideNavCollapsed,
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
