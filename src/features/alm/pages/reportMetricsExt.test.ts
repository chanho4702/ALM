import { describe, expect, it } from "vitest";
import type { Issue, IssueChange, Sprint, WorkflowStatus } from "../store/types";
import { burnupSeries, controlChart, cumulativeFlow, velocitySeries } from "./reportMetricsExt";

const STATUSES: WorkflowStatus[] = [
  { id: "todo", name: "할 일", category: "todo", order: 1, kind: "new", color: "neutral" },
  { id: "inprogress", name: "진행 중", category: "inprogress", order: 2, kind: "active", color: "info" },
  { id: "done", name: "완료", category: "done", order: 3, kind: "complete", color: "success" },
];

function issue(over: Partial<Issue> & { id: string }): Issue {
  return {
    key: `ALM-${over.id}`,
    projectId: "p1",
    title: `이슈 ${over.id}`,
    description: "",
    type: "task",
    status: "todo",
    priority: "medium",
    assigneeId: null,
    reporterId: "u1",
    sprintId: "s1",
    parentId: null,
    dueDate: null,
    estimateHours: null,
    resolution: null,
    fixVersionId: null,
    labels: [],
    order: 1,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...over,
  };
}

let seq = 0;
function change(over: Partial<IssueChange> & { issueId: string; field: IssueChange["field"] }): IssueChange {
  seq += 1;
  return {
    id: `c${seq}`,
    projectId: "p1",
    sprintId: "s1",
    fromValue: null,
    toValue: null,
    actorId: "u1",
    at: "2026-08-24T00:00:00.000Z",
    ...over,
  };
}
const joined = (issueId: string, at = "2026-08-24T00:00:00.000Z", sprintId = "s1") => [
  change({ issueId, field: "status", fromValue: null, toValue: "todo", at, sprintId }),
  change({ issueId, field: "sprint", fromValue: null, toValue: sprintId, at, sprintId }),
];
const moved = (issueId: string, to: string, at: string, sprintId = "s1") =>
  change({ issueId, field: "status", fromValue: "todo", toValue: to, at, sprintId });

const SPRINT: Sprint = {
  id: "s1",
  projectId: "p1",
  name: "Sprint 1",
  state: "active",
  plannedStart: "2026-08-24",
  plannedEnd: "2026-08-27",
  startedAt: "2026-08-24T00:00:00.000Z",
};

describe("burnupSeries", () => {
  it("범위선은 편입으로 늘고 완료선은 완료로 오른다", () => {
    const issues = [issue({ id: "1", status: "done" }), issue({ id: "2" }), issue({ id: "3" })];
    const changes = [
      ...joined("1"),
      ...joined("2"),
      moved("1", "done", "2026-08-25T10:00:00.000Z"),
      ...joined("3", "2026-08-26T09:00:00.000Z"), // 도중 편입
    ];
    const series = burnupSeries({ sprint: SPRINT, issues, changes, statuses: STATUSES, unit: "count", today: "2026-08-27" });
    expect(series.started).toBe(true);
    expect(series.points.map((p) => [p.date.slice(5), p.scope, p.completed])).toEqual([
      ["08-24", 2, 0],
      ["08-25", 2, 1],
      ["08-26", 3, 1],
      ["08-27", 3, 1],
    ]);
  });
});

describe("velocitySeries", () => {
  it("완료된 스프린트마다 약속(시작 총량)과 완료량을 순서대로 낸다", () => {
    const s1: Sprint = { ...SPRINT, state: "done", completedAt: "2026-08-27T18:00:00.000Z" };
    const s2: Sprint = {
      id: "s2", projectId: "p1", name: "Sprint 2", state: "done",
      plannedStart: "2026-08-28", plannedEnd: "2026-08-31",
      startedAt: "2026-08-28T00:00:00.000Z", completedAt: "2026-08-31T18:00:00.000Z",
    };
    const active: Sprint = { ...SPRINT, id: "s3", name: "Sprint 3", state: "active", startedAt: "2026-09-01T00:00:00.000Z" };
    const issues = [
      issue({ id: "1", status: "done", estimateHours: 3 }),
      issue({ id: "2", status: "done", sprintId: "s2", estimateHours: 5 }), // s1 미완료 → s2로 이관 뒤 완료
      issue({ id: "3", status: "done", sprintId: "s2", estimateHours: 2 }),
    ];
    const changes = [
      ...joined("1"), ...joined("2"),
      moved("1", "done", "2026-08-25T10:00:00.000Z"),
      change({ issueId: "2", field: "sprint", fromValue: "s1", toValue: "s2", at: s1.completedAt!, sprintId: "s2" }),
      ...joined("3", "2026-08-28T00:00:00.000Z", "s2"),
      moved("2", "done", "2026-08-29T10:00:00.000Z", "s2"),
      moved("3", "done", "2026-08-30T10:00:00.000Z", "s2"),
    ];
    const rows = velocitySeries({ sprints: [s1, s2, active], issues, changes, statuses: STATUSES, unit: "hours" });
    expect(rows.map((r) => [r.name, r.committed, r.completed])).toEqual([
      ["Sprint 1", 8, 3],
      ["Sprint 2", 7, 7],
    ]);
    const counts = velocitySeries({ sprints: [s1, s2, active], issues, changes, statuses: STATUSES, unit: "count" });
    expect(counts.map((r) => [r.committed, r.completed])).toEqual([[2, 1], [2, 2]]);
  });
});

describe("cumulativeFlow", () => {
  it("날짜마다 의미별 이슈 수를 누적으로 센다 (이력 없는 이슈는 생성일부터 현재 상태)", () => {
    const issues = [
      issue({ id: "1", status: "done" }),
      issue({ id: "2", status: "inprogress" }),
      issue({ id: "9", status: "todo", createdAt: "2026-08-26T00:00:00.000Z" }), // 이력 없음
    ];
    const changes = [
      ...joined("1"), ...joined("2"),
      moved("2", "inprogress", "2026-08-25T09:00:00.000Z"),
      moved("1", "done", "2026-08-26T09:00:00.000Z"),
    ];
    const points = cumulativeFlow({ issues, changes, statuses: STATUSES, from: "2026-08-24", to: "2026-08-26" });
    expect(points.map((p) => [p.date.slice(5), p.new, p.active, p.complete])).toEqual([
      ["08-24", 2, 0, 0],
      ["08-25", 1, 1, 0],
      ["08-26", 1, 1, 1],
    ]);
  });
});

describe("controlChart", () => {
  it("완료 이슈의 사이클 타임(진행 시작 → 완료)을 일 단위로 재고 평균을 낸다", () => {
    const issues = [issue({ id: "1", status: "done" }), issue({ id: "2", status: "done" }), issue({ id: "3" })];
    const changes = [
      ...joined("1"), ...joined("2"), ...joined("3"),
      moved("1", "inprogress", "2026-08-24T12:00:00.000Z"),
      change({ issueId: "1", field: "status", fromValue: "inprogress", toValue: "done", at: "2026-08-26T12:00:00.000Z" }),
      moved("2", "done", "2026-08-25T00:00:00.000Z"), // 진행 없이 바로 완료 → 생성부터
    ];
    const chart = controlChart({ issues, changes, statuses: STATUSES, from: "2026-08-24", to: "2026-08-31" });
    expect(chart.points.map((p) => [p.key, p.completedDate.slice(5), p.cycleDays])).toEqual([
      ["ALM-2", "08-25", 1],
      ["ALM-1", "08-26", 2],
    ]);
    expect(chart.averageDays).toBe(1.5);
  });
});
