import { describe, expect, it } from "vitest";
import { mergeColumnOrder } from "./useTablePrefs";

const ALL = ["select", "type", "key", "title", "status", "dueDate"];

describe("mergeColumnOrder — 숨긴 열의 자리 보존", () => {
  it("저장 순서가 없으면 기본 순서에서 보이는 열 자리만 바꾼다", () => {
    // dueDate를 숨긴 채 title을 key 앞으로 옮겼다
    expect(mergeColumnOrder(undefined, ALL, ["select", "type", "title", "key", "status"])).toEqual([
      "select", "type", "title", "key", "status", "dueDate",
    ]);
  });

  it("숨긴 열은 저장된 자리에 그대로 남는다", () => {
    const saved = ["select", "dueDate", "type", "key", "title", "status"];
    // dueDate를 숨긴 상태에서 status를 맨 앞(선택 다음)으로
    expect(mergeColumnOrder(saved, ALL, ["select", "status", "type", "key", "title"])).toEqual([
      "select", "dueDate", "status", "type", "key", "title",
    ]);
  });

  it("숨긴 열이 없으면 표가 준 순서 그대로다", () => {
    const order = ["select", "key", "type", "title", "status", "dueDate"];
    expect(mergeColumnOrder(undefined, ALL, order)).toEqual(order);
  });
});
