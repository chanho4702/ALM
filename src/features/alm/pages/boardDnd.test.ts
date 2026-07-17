import { describe, expect, it } from "vitest";
import { resolveMove } from "./boardDnd";

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
