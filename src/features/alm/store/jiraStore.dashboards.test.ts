import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addWorklog,
  createDashboard,
  deleteDashboard,
  getDashboard,
  createIssue,
  createProject,
  listDashboards,
  listProjectWorklogs,
  updateDashboard,
} from "./jiraStore";
import { worklogSummary } from "../pages/worklogMetrics";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("대시보드 (지라 Dashboards)", () => {
  it("만들고 가젯을 배치하고 공유·삭제한다", async () => {
    const board = await createDashboard({ name: "내 보드" });
    expect(board).toMatchObject({ name: "내 보드", shared: false, gadgets: [] });
    await expect(createDashboard({ name: " " })).rejects.toThrow("대시보드 이름을 입력하세요");
    const updated = await updateDashboard(board.id, {
      shared: true,
      gadgets: [{ id: "g1", type: "status-distribution", column: 0, config: { projectId: "p1" } }],
    });
    expect(updated.shared).toBe(true);
    expect(updated.gadgets).toHaveLength(1);
    expect((await getDashboard(board.id))?.gadgets[0].type).toBe("status-distribution");
    expect((await listDashboards()).map((d) => d.name)).toEqual(["내 보드"]);
    await deleteDashboard(board.id);
    expect(await listDashboards()).toHaveLength(0);
    expect(await getDashboard(board.id)).toBeNull();
  });
});

describe("프로젝트 워크로그 (가젯·리포트)", () => {
  it("기간으로 거르고 이슈 키를 붙이며, 사람별·날짜별로 합산한다", async () => {
    const project = await createProject({ key: "WL", name: "워크로그" });
    const issue = await createIssue({ projectId: project.id, title: "기록" });
    await addWorklog(issue.id, { hours: 2, workedOn: "2026-08-01" });
    await addWorklog(issue.id, { hours: 3.5, workedOn: "2026-08-20" });
    await addWorklog(issue.id, { hours: 1, workedOn: "2026-08-30" });
    const rows = await listProjectWorklogs(project.id, { since: "2026-08-15", until: "2026-08-31" });
    expect(rows.map((r) => r.hours)).toEqual([3.5, 1]);
    expect(rows[0].issueKey).toBe("WL-1");
    const summary = worklogSummary(rows, [{ id: "u1", name: "김찬호" }]);
    expect(summary.total).toBe(4.5);
    expect(summary.byAuthor).toEqual([{ userId: "u1", name: "김찬호", hours: 4.5 }]);
    expect(summary.byDay.map((d) => d.day)).toEqual(["2026-08-20", "2026-08-30"]);
  });
});
