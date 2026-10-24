import { describe, expect, it } from "vitest";
import type { Board, Issue, IssueTransitionOption, WorkflowStatus } from "../store/types";
import { applyOptimisticMove, boardColumnsOf, columnAvailability, columnIssueIds } from "./boardColumns";

const STATUSES: WorkflowStatus[] = [
  { id: "todo", name: "할 일", category: "todo", order: 1 },
  { id: "inprogress", name: "진행 중", category: "inprogress", order: 2 },
  { id: "review", name: "검토", category: "inprogress", order: 3 },
  { id: "done", name: "완료", category: "done", order: 4 },
];

const board = (over: Partial<Board>): Board => ({
  id: "b1",
  projectId: "p1",
  name: "보드",
  type: "kanban",
  filter: { assigneeIds: [], types: [], labels: [] },
  columns: [],
  swimlane: "none",
  isDefault: true,
  createdAt: "x",
  columnMode: "status",
  resolvedColumns: [],
  unmappedStatuses: [],
  ...over,
});

const option = (to: string, available = true, extra: Partial<IssueTransitionOption> = {}): IssueTransitionOption => ({
  id: `t-${to}`,
  name: to,
  to,
  toName: to,
  toKind: null,
  toIcon: null,
  isGlobal: false,
  available,
  unavailableReason: available ? null : `${to} 막힘`,
  hasScreen: false,
  screenFields: [],
  requiredFields: [],
  missingFields: [],
  ...extra,
});

const issue = (id: string, status: string): Issue => ({ id, status } as Issue);

describe("boardColumnsOf", () => {
  it("서버가 준 resolvedColumns가 정본 — 워크플로에서 빠진 상태는 버린다", () => {
    const columns = boardColumnsOf(
      board({ resolvedColumns: [{ id: "col-a", name: "진행", statuses: ["inprogress", "review", "gone"], wipLimit: 3 }] }),
      STATUSES,
    );
    expect(columns).toEqual([{ id: "col-a", name: "진행", statuses: ["inprogress", "review"], wipLimit: 3 }]);
  });

  it("구 서버(resolvedColumns 없음)는 상태 1:1 열 + 이름·WIP 덮어쓰기", () => {
    const columns = boardColumnsOf(board({ columns: [{ status: "review", name: "QA", wipLimit: 2 }] }), STATUSES);
    expect(columns.map((c) => [c.id, c.name, c.wipLimit])).toEqual([
      ["todo", "할 일", null],
      ["inprogress", "진행 중", null],
      ["review", "QA", 2],
      ["done", "완료", null],
    ]);
  });
});

describe("columnAvailability — 드래그 중 열 흐림과 놓을 때 고를 전환 (A3·C4)", () => {
  const column = { id: "col-v", name: "검증", statuses: ["review", "done"], wipLimit: null };

  it("열에 지금 상태가 있으면 순서 변경(전환 없음)", () => {
    expect(columnAvailability(column, { status: "review" }, [])).toEqual({ allowed: true, option: null });
  });

  it("열에 넣은 순서대로 가용 전환 중 첫 번째를 고른다", () => {
    const result = columnAvailability(column, { status: "inprogress" }, [option("done"), option("review", false)]);
    expect(result).toEqual({ allowed: true, option: expect.objectContaining({ to: "done" }) });
  });

  it("하나도 못 가면 첫 후보의 이유로 막는다, 후보가 없으면 기본 문구", () => {
    expect(columnAvailability(column, { status: "todo" }, [option("review", false), option("done", false)])).toEqual({
      allowed: false,
      reason: "review 막힘",
    });
    expect(columnAvailability(column, { status: "todo" }, [option("inprogress")])).toEqual({
      allowed: false,
      reason: "이 열로 옮길 수 있는 전환이 없습니다",
    });
  });
});

describe("낙관적 이동", () => {
  const issues = [issue("a", "todo"), issue("b", "inprogress"), issue("c", "inprogress"), issue("d", "done")];

  it("대상 상태로 바꾸고 beforeId 앞에 끼운다", () => {
    const next = applyOptimisticMove(issues, "a", "inprogress", "c", ["inprogress"]);
    expect(next.map((i) => `${i.id}:${i.status}`)).toEqual(["b:inprogress", "a:inprogress", "c:inprogress", "d:done"]);
  });

  it("beforeId가 없으면 그 열 맨 끝", () => {
    const next = applyOptimisticMove(issues, "d", "inprogress", undefined, ["inprogress"]);
    expect(next.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(next.find((i) => i.id === "d")?.status).toBe("inprogress");
  });

  it("원본 배열은 바꾸지 않는다(실패하면 되돌릴 수 있게)", () => {
    applyOptimisticMove(issues, "a", "done", undefined, ["done"]);
    expect(issues[0].status).toBe("todo");
  });

  it("열 id → 이슈 id 목록은 열의 상태들로 묶는다", () => {
    expect(columnIssueIds([{ id: "x", name: "x", statuses: ["inprogress", "done"], wipLimit: null }], issues)).toEqual({
      x: ["b", "c", "d"],
    });
  });
});
