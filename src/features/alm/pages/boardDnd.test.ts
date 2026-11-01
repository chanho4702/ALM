import { describe, expect, it } from "vitest";
import { adjacentColumnId, groupDropBefore, resolveMove } from "./boardDnd";

// status → order순 이슈 id 배열
const columns = {
  todo: ["a", "b", "c"],
  inprogress: ["d"],
  done: [] as string[],
};

describe("resolveMove — 드래그 결과를 moveIssue 파라미터로 변환", () => {
  it("같은 컬럼에서 위로 이동: over 카드 앞에 삽입", () => {
    expect(resolveMove("c", "a", columns)).toEqual({ status: "todo", beforeId: "a" });
  });

  it("같은 컬럼에서 아래로 이동: over 카드 다음 카드 앞에 삽입", () => {
    expect(resolveMove("a", "b", columns)).toEqual({ status: "todo", beforeId: "c" });
  });

  it("같은 컬럼 맨 아래로 이동: beforeId 없이 맨 끝 추가", () => {
    expect(resolveMove("a", "c", columns)).toEqual({ status: "todo", beforeId: undefined });
  });

  it("다른 컬럼의 카드 위에 드롭: 그 카드 앞에 삽입", () => {
    expect(resolveMove("a", "d", columns)).toEqual({ status: "inprogress", beforeId: "d" });
  });

  it("빈 컬럼 영역에 드롭: 해당 status로 맨 끝 추가", () => {
    expect(resolveMove("a", "done", columns)).toEqual({ status: "done" });
  });

  it("카드가 있는 다른 컬럼의 빈 영역에 드롭: 맨 끝 추가", () => {
    expect(resolveMove("a", "inprogress", columns)).toEqual({ status: "inprogress" });
  });

  it("자기 자신 위에 드롭하면 null (이동 없음)", () => {
    expect(resolveMove("a", "a", columns)).toBeNull();
  });

  it("이미 그 컬럼 맨 끝인 카드를 컬럼 영역에 드롭하면 null", () => {
    expect(resolveMove("c", "todo", columns)).toBeNull();
  });

  it("모르는 overId면 null", () => {
    expect(resolveMove("a", "unknown", columns)).toBeNull();
  });
});

describe("groupDropBefore — 다중 선택 드래그의 놓을 자리", () => {
  it("다른 열 카드 위: 그 카드 앞에", () => {
    expect(groupDropBefore("a", "d", columns, ["a", "b"])).toEqual({ status: "inprogress", beforeId: "d" });
  });

  it("열 영역: 그 열 맨 끝", () => {
    expect(groupDropBefore("a", "done", columns, ["a", "c"])).toEqual({ status: "done", beforeId: undefined });
  });

  it("앞 카드가 묶음이면 그 뒤 첫 비묶음 카드 앞(없으면 끝)", () => {
    expect(groupDropBefore("d", "a", columns, ["d", "a"])).toEqual({ status: "todo", beforeId: "b" });
    expect(groupDropBefore("d", "c", columns, ["d", "c"])).toEqual({ status: "todo", beforeId: undefined });
  });

  it("묶음이 이미 그 열 끝에 그 순서로 있으면 null", () => {
    expect(groupDropBefore("b", "todo", columns, ["b", "c"])).toBeNull();
  });
});

describe("adjacentColumnId — 키보드 이동 목적지", () => {
  const board = [
    { id: "todo", statuses: ["todo"] },
    { id: "doing", statuses: ["inprogress", "review"] },
    { id: "done", statuses: ["done"] },
  ];
  it("이웃 열, 끝이면 null, 보드에 없는 상태면 null", () => {
    expect(adjacentColumnId(board, "review", 1)).toBe("done");
    expect(adjacentColumnId(board, "review", -1)).toBe("todo");
    expect(adjacentColumnId(board, "done", 1)).toBeNull();
    expect(adjacentColumnId(board, "todo", -1)).toBeNull();
    expect(adjacentColumnId(board, "ghost", 1)).toBeNull();
  });
});
