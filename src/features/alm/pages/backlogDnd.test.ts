import { describe, expect, it } from "vitest";
import { resolveBacklogMove } from "./backlogDnd";

// 패널: 백로그 [b1,b2,b3] / 스프린트 s1 [s1a,s1b]
const panels = {
  backlog: ["b1", "b2", "b3"],
  s1: ["s1a", "s1b"],
};

describe("resolveBacklogMove", () => {
  it("패널 영역 드롭 → 맨 끝 (sprintId 매핑: backlog=null)", () => {
    expect(resolveBacklogMove("b1", "s1", panels)).toEqual({ sprintId: "s1" });
    expect(resolveBacklogMove("s1a", "backlog", panels)).toEqual({ sprintId: null });
  });

  it("이미 그 패널 맨 끝이면 null", () => {
    expect(resolveBacklogMove("b3", "backlog", panels)).toBeNull();
    expect(resolveBacklogMove("s1b", "s1", panels)).toBeNull();
  });

  it("같은 패널에서 위로 → over 행 앞", () => {
    expect(resolveBacklogMove("b3", "b1", panels)).toEqual({ sprintId: null, beforeId: "b1" });
  });

  it("같은 패널에서 아래로 → over 다음 행 앞 (맨 끝이면 beforeId 없음)", () => {
    expect(resolveBacklogMove("b1", "b2", panels)).toEqual({ sprintId: null, beforeId: "b3" });
    expect(resolveBacklogMove("b1", "b3", panels)).toEqual({ sprintId: null, beforeId: undefined });
  });

  it("패널 간 행 위 드롭 → 그 행 앞", () => {
    expect(resolveBacklogMove("b1", "s1b", panels)).toEqual({ sprintId: "s1", beforeId: "s1b" });
    expect(resolveBacklogMove("s1a", "b2", panels)).toEqual({ sprintId: null, beforeId: "b2" });
  });

  it("자기 자신/미지의 대상 → null", () => {
    expect(resolveBacklogMove("b1", "b1", panels)).toBeNull();
    expect(resolveBacklogMove("b1", "ghost", panels)).toBeNull();
  });
});
