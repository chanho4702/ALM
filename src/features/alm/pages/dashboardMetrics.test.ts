import { describe, expect, it } from "vitest";
import type { Issue, User, WorkflowStatus } from "../store/types";
import {
  assigneeDistribution,
  dueRows,
  recentlyUpdated,
  remainingDays,
  statusDistribution,
  workProgress,
} from "./dashboardMetrics";

const STATUSES: WorkflowStatus[] = [
  { id: "todo", name: "할 일", category: "todo", order: 1 },
  { id: "review", name: "코드 리뷰", category: "inprogress", order: 2 },
  { id: "inprogress", name: "진행 중", category: "inprogress", order: 3 },
  { id: "done", name: "완료", category: "done", order: 4 },
];

const USERS: User[] = [
  { id: "u1", name: "김찬호" },
  { id: "u2", name: "이서연" },
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
    sprintId: null,
    parentId: null,
    dueDate: null,
    estimateHours: null,
    labels: [],
    order: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("workProgress", () => {
  it("완료 건수와 완료율을 카테고리로 센다", () => {
    const progress = workProgress(
      [
        issue({ id: "1", status: "done" }),
        issue({ id: "2", status: "review" }),
        issue({ id: "3", status: "todo" }),
        issue({ id: "4", status: "todo" }),
      ],
      STATUSES,
    );

    expect(progress).toEqual({ total: 4, done: 1, percent: 25 });
  });

  it("이슈가 없으면 완료율 0으로 답한다 (0으로 나누지 않는다)", () => {
    expect(workProgress([], STATUSES)).toEqual({ total: 0, done: 0, percent: 0 });
  });
});

describe("dueRows", () => {
  const today = "2026-08-28";

  it("지난 마감과 임박한 마감을 나누고 지난 것을 먼저 준다", () => {
    const rows = dueRows(
      [
        issue({ id: "1", dueDate: "2026-09-03" }), // 6일 뒤
        issue({ id: "2", dueDate: "2026-08-25" }), // 3일 지남
        issue({ id: "3", dueDate: "2026-08-28" }), // 오늘
      ],
      STATUSES,
      today,
    );

    expect(rows.map((r) => [r.issue.id, r.daysLeft, r.overdue])).toEqual([
      ["2", -3, true],
      ["3", 0, false],
      ["1", 6, false],
    ]);
  });

  it("완료된 이슈와 창 밖의 마감은 제외한다", () => {
    const rows = dueRows(
      [
        issue({ id: "1", dueDate: "2026-08-25", status: "done" }),
        issue({ id: "2", dueDate: "2026-09-30" }),
        issue({ id: "3", dueDate: null }),
      ],
      STATUSES,
      today,
    );

    expect(rows).toHaveLength(0);
  });

  it("상한을 주지 않으면 위험한 이슈를 전부 돌려준다 (배지 카운트가 잘리지 않는다)", () => {
    const many = ["1", "2", "3", "4", "5", "6", "7"].map((id) =>
      issue({ id, dueDate: id <= "3" ? "2026-08-20" : "2026-08-30" }),
    );

    const rows = dueRows(many, STATUSES, today);

    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.overdue)).toHaveLength(3);
  });

  it("건수 상한을 지킨다", () => {
    const many = ["1", "2", "3", "4", "5", "6"].map((id) =>
      issue({ id, dueDate: "2026-08-29" }),
    );

    expect(dueRows(many, STATUSES, today, { limit: 4 })).toHaveLength(4);
  });
});

describe("statusDistribution", () => {
  it("커스텀 상태를 순서대로 세고 0건도 남긴다", () => {
    const rows = statusDistribution(
      [issue({ id: "1", status: "review" }), issue({ id: "2", status: "todo" })],
      STATUSES,
    );

    expect(rows.map((r) => [r.name, r.count])).toEqual([
      ["할 일", 1],
      ["코드 리뷰", 1],
      ["진행 중", 0],
      ["완료", 0],
    ]);
  });
});

describe("assigneeDistribution", () => {
  it("많은 순으로 정렬하고 미지정을 마지막에 둔다", () => {
    const rows = assigneeDistribution(
      [
        issue({ id: "1", assigneeId: "u2" }),
        issue({ id: "2", assigneeId: "u2" }),
        issue({ id: "3", assigneeId: "u1" }),
        issue({ id: "4", assigneeId: null }),
      ],
      USERS,
    );

    expect(rows.map((r) => [r.name, r.count])).toEqual([
      ["이서연", 2],
      ["김찬호", 1],
      ["미지정", 1],
    ]);
  });

  it("상한을 넘으면 나머지를 기타로 접는다", () => {
    const users: User[] = ["u1", "u2", "u3"].map((id, i) => ({ id, name: `사용자${i}` }));
    const rows = assigneeDistribution(
      [
        issue({ id: "1", assigneeId: "u1" }),
        issue({ id: "2", assigneeId: "u2" }),
        issue({ id: "3", assigneeId: "u3" }),
      ],
      users,
      { limit: 2 },
    );

    expect(rows.map((r) => r.name)).toEqual(["사용자0", "사용자1", "기타 1명"]);
    expect(rows[2].count).toBe(1);
  });
});

describe("recentlyUpdated", () => {
  it("수정 시각 내림차순으로 상한까지 준다", () => {
    const rows = recentlyUpdated(
      [
        issue({ id: "1", updatedAt: "2026-08-20T00:00:00.000Z" }),
        issue({ id: "2", updatedAt: "2026-08-27T00:00:00.000Z" }),
        issue({ id: "3", updatedAt: "2026-08-25T00:00:00.000Z" }),
      ],
      2,
    );

    expect(rows.map((r) => r.id)).toEqual(["2", "3"]);
  });
});

describe("remainingDays", () => {
  it("종료 예정일까지 남은 일수를 오늘 포함으로 센다", () => {
    expect(remainingDays("2026-08-30", "2026-08-28")).toBe(2);
    expect(remainingDays("2026-08-28", "2026-08-28")).toBe(0);
    expect(remainingDays("2026-08-26", "2026-08-28")).toBe(-2);
  });

  it("기간이 없으면 null이다", () => {
    expect(remainingDays(undefined, "2026-08-28")).toBeNull();
  });
});
