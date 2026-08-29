import { describe, expect, it } from "vitest";
import type { Issue, IssueChange, Sprint, WorkflowStatus } from "../store/types";
import { burndownSeries, sprintReport } from "./reportMetrics";

const STATUSES: WorkflowStatus[] = [
  { id: "todo", name: "할 일", category: "todo", order: 1 },
  { id: "inprogress", name: "진행 중", category: "inprogress", order: 2 },
  { id: "done", name: "완료", category: "done", order: 3 },
];

const SPRINT: Sprint = {
  id: "s1",
  projectId: "p1",
  name: "Sprint 1",
  state: "active",
  plannedStart: "2026-08-24",
  plannedEnd: "2026-08-28",
  startedAt: "2026-08-24T00:00:00.000Z",
};

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
    labels: [],
    order: 1,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...over,
  };
}

let changeSeq = 0;
function change(over: Partial<IssueChange> & { issueId: string; field: IssueChange["field"] }): IssueChange {
  changeSeq += 1;
  return {
    id: `c${changeSeq}`,
    projectId: "p1",
    sprintId: "s1",
    fromValue: null,
    toValue: null,
    actorId: "u1",
    at: "2026-08-24T00:00:00.000Z",
    ...over,
  };
}

/** 스프린트 시작 시점 편입 + 최초 상태 */
function joined(issueId: string, at = "2026-08-24T00:00:00.000Z"): IssueChange[] {
  return [
    change({ issueId, field: "status", fromValue: null, toValue: "todo", at }),
    change({ issueId, field: "sprint", fromValue: null, toValue: "s1", at }),
  ];
}

describe("burndownSeries", () => {
  it("이력으로 일자별 잔여를 계단으로 만든다 (이슈 수 기준)", () => {
    const issues = [issue({ id: "1" }), issue({ id: "2" }), issue({ id: "3", status: "done" })];
    const changes = [
      ...joined("1"),
      ...joined("2"),
      ...joined("3"),
      change({ issueId: "3", field: "status", fromValue: "todo", toValue: "done", at: "2026-08-26T09:00:00.000Z" }),
    ];

    const series = burndownSeries({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-27",
    });

    expect(series.total).toBe(3);
    expect(series.points.map((p) => [p.date, p.remaining])).toEqual([
      ["2026-08-24", 3],
      ["2026-08-25", 3],
      ["2026-08-26", 2],
      ["2026-08-27", 2],
      ["2026-08-28", null], // 아직 오지 않은 날은 실제선을 그리지 않는다
    ]);
  });

  it("기준선은 시작 총량에서 종료일 0까지 직선이다", () => {
    const series = burndownSeries({
      sprint: SPRINT,
      issues: [issue({ id: "1" }), issue({ id: "2" })],
      changes: [...joined("1"), ...joined("2")],
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-24",
    });

    expect(series.points.map((p) => p.ideal)).toEqual([2, 1.5, 1, 0.5, 0]);
  });

  it("시간 기준은 예상 시간을 더하고 미입력 건수를 알려준다", () => {
    const issues = [
      issue({ id: "1", estimateHours: 8 }),
      issue({ id: "2", estimateHours: 4 }),
      issue({ id: "3" }),
    ];
    const changes = [
      ...joined("1"),
      ...joined("2"),
      ...joined("3"),
      change({ issueId: "2", field: "status", fromValue: "todo", toValue: "done", at: "2026-08-25T09:00:00.000Z" }),
    ];

    const series = burndownSeries({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      unit: "hours",
      today: "2026-08-25",
    });

    expect(series.total).toBe(12);
    expect(series.missingEstimates).toBe(1);
    expect(series.points[1].remaining).toBe(8);
  });

  it("도중에 편입된 이슈는 그날부터 잔여에 더해진다", () => {
    const issues = [issue({ id: "1" }), issue({ id: "2" })];
    const changes = [
      ...joined("1"),
      change({ issueId: "2", field: "status", fromValue: null, toValue: "todo", at: "2026-08-20T00:00:00.000Z", sprintId: null }),
      change({ issueId: "2", field: "sprint", fromValue: null, toValue: "s1", at: "2026-08-26T09:00:00.000Z" }),
    ];

    const series = burndownSeries({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-27",
    });

    expect(series.points.map((p) => p.remaining)).toEqual([1, 1, 2, 2, null]);
  });

  it("예정 종료일을 넘겨 완료하면 실제 완료일까지 축을 늘린다", () => {
    const late: Sprint = {
      ...SPRINT,
      state: "done",
      completedAt: "2026-08-30T10:00:00.000Z",
    };

    const series = burndownSeries({
      sprint: late,
      issues: [issue({ id: "1" })],
      changes: joined("1"),
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-31",
    });

    expect(series.points.at(-1)?.date).toBe("2026-08-30");
  });

  it("시작하지 않은 스프린트는 점을 만들지 않는다", () => {
    const planned: Sprint = { id: "s2", projectId: "p1", name: "Sprint 2", state: "planned" };

    const series = burndownSeries({
      sprint: planned,
      issues: [issue({ id: "1", sprintId: "s2" })],
      changes: [],
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-27",
    });

    expect(series.points).toEqual([]);
    expect(series.started).toBe(false);
  });
});

describe("sprintReport", () => {
  it("완료·미완료·스코프 변경을 나눈다", () => {
    const issues = [
      issue({ id: "1", status: "done" }),
      issue({ id: "2", status: "inprogress" }),
      issue({ id: "3", sprintId: null }), // 도중에 빠진 이슈
      issue({ id: "4" }), // 도중에 들어온 이슈
    ];
    const changes = [
      ...joined("1"),
      ...joined("2"),
      ...joined("3"),
      change({ issueId: "1", field: "status", fromValue: "todo", toValue: "done", at: "2026-08-26T00:00:00.000Z" }),
      change({ issueId: "3", field: "sprint", fromValue: "s1", toValue: null, at: "2026-08-26T00:00:00.000Z", sprintId: null }),
      change({ issueId: "4", field: "status", fromValue: null, toValue: "todo", at: "2026-08-20T00:00:00.000Z", sprintId: null }),
      change({ issueId: "4", field: "sprint", fromValue: null, toValue: "s1", at: "2026-08-27T00:00:00.000Z" }),
    ];

    const report = sprintReport({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      sprints: [SPRINT],
      now: "2026-08-27T12:00:00.000Z",
    });

    expect(report.completed.map((i) => i.id)).toEqual(["1"]);
    expect(report.notCompleted.map((row) => row.issue.id)).toEqual(["2", "4"]);
    expect(report.added.map((i) => i.id)).toEqual(["4"]);
    expect(report.removed.map((i) => i.id)).toEqual(["3"]);
  });

  it("완료된 스프린트는 미완료 이슈의 이관 행선지를 알려준다", () => {
    const done: Sprint = { ...SPRINT, state: "done", completedAt: "2026-08-28T10:00:00.000Z" };
    const next: Sprint = { id: "s2", projectId: "p1", name: "Sprint 2", state: "active" };
    const issues = [issue({ id: "1", status: "done" }), issue({ id: "2", sprintId: "s2" })];
    const changes = [
      ...joined("1"),
      ...joined("2"),
      change({ issueId: "1", field: "status", fromValue: "todo", toValue: "done", at: "2026-08-26T00:00:00.000Z" }),
      change({ issueId: "2", field: "sprint", fromValue: "s1", toValue: "s2", at: "2026-08-28T10:00:00.000Z", sprintId: "s2" }),
    ];

    const report = sprintReport({
      sprint: done,
      issues,
      changes,
      statuses: STATUSES,
      sprints: [done, next],
      now: "2026-08-29T00:00:00.000Z",
    });

    expect(report.completed.map((i) => i.id)).toEqual(["1"]);
    expect(report.notCompleted).toEqual([
      expect.objectContaining({ destination: "Sprint 2" }),
    ]);
    // 완료 시점 이관은 "도중에 빠진 이슈"가 아니다
    expect(report.removed).toEqual([]);
  });
});

describe("burndownSeries 경계", () => {
  it("총량은 첫날 변경 이전(스프린트 시작 시점) 값이다", () => {
    // 시작 당일 오후에 하나가 완료됐다 — 총량은 2여야 하고 첫 점은 1이 된다
    const issues = [issue({ id: "1" }), issue({ id: "2", status: "done" })];
    const changes = [
      ...joined("1"),
      ...joined("2"),
      change({ issueId: "2", field: "status", fromValue: "todo", toValue: "done", at: "2026-08-24T14:00:00.000Z" }),
    ];

    const series = burndownSeries({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-24",
    });

    expect(series.total).toBe(2);
    expect(series.points[0].remaining).toBe(1);
    expect(series.points[0].ideal).toBe(2);
  });

  it("완료된 스프린트의 미입력 건수는 이관 직전 소속으로 센다", () => {
    const done: Sprint = { ...SPRINT, state: "done", completedAt: "2026-08-28T10:00:00.000Z" };
    // 이관돼 지금은 백로그에 있는 미완료 이슈 — 예상 미입력 경고에 잡혀야 한다
    const issues = [issue({ id: "1", sprintId: null })];
    const changes = [
      ...joined("1"),
      change({ issueId: "1", field: "sprint", fromValue: "s1", toValue: null, at: "2026-08-28T10:00:00.000Z", sprintId: null }),
    ];

    const series = burndownSeries({
      sprint: done,
      issues,
      changes,
      statuses: STATUSES,
      unit: "hours",
      today: "2026-08-29",
    });

    expect(series.missingEstimates).toBe(1);
  });

  it("창설 이력이 없는 이슈 수를 알려준다 (평평한 선의 근거)", () => {
    const issues = [issue({ id: "1" }), issue({ id: "2" })];
    const series = burndownSeries({
      sprint: SPRINT,
      issues,
      changes: joined("1"), // 2번 이슈는 이력이 없다
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-25",
    });

    expect(series.historyMissing).toBe(1);
  });

  it("변경 시각은 사용자 달력 기준 날짜에 반영된다", () => {
    // 로컬 2026-08-25 01:00 에 완료 — UTC로는 08-24일 수 있다(KST). 08-25 점에 반영돼야 한다
    const localOneAm = new Date(2026, 7, 25, 1, 0, 0).toISOString();
    const issues = [issue({ id: "1", status: "done" })];
    const changes = [
      ...joined("1"),
      change({ issueId: "1", field: "status", fromValue: "todo", toValue: "done", at: localOneAm }),
    ];

    const series = burndownSeries({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      unit: "count",
      today: "2026-08-26",
    });

    const byDate = Object.fromEntries(series.points.map((p) => [p.date, p.remaining]));
    expect(byDate["2026-08-24"]).toBe(1);
    expect(byDate["2026-08-25"]).toBe(0);
  });
});

describe("sprintReport 스코프", () => {
  it("여러 번 오간 이슈는 한 줄로만 세고 최종 결과로 분류한다", () => {
    const issues = [issue({ id: "1" })]; // 최종적으로 스프린트에 있다
    const changes = [
      change({ issueId: "1", field: "status", fromValue: null, toValue: "todo", at: "2026-08-20T00:00:00.000Z", sprintId: null }),
      change({ issueId: "1", field: "sprint", fromValue: null, toValue: "s1", at: "2026-08-25T00:00:00.000Z" }),
      change({ issueId: "1", field: "sprint", fromValue: "s1", toValue: null, at: "2026-08-26T00:00:00.000Z", sprintId: null }),
      change({ issueId: "1", field: "sprint", fromValue: null, toValue: "s1", at: "2026-08-27T00:00:00.000Z" }),
    ];

    const report = sprintReport({
      sprint: SPRINT,
      issues,
      changes,
      statuses: STATUSES,
      sprints: [SPRINT],
      now: "2026-08-27T12:00:00.000Z",
    });

    expect(report.added.map((i) => i.id)).toEqual(["1"]);
    expect(report.removed).toEqual([]);
  });
});
