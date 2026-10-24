import { describe, expect, it } from "vitest";
import type { IssueTransitionOption } from "../store/types";
import { combineAvailability } from "./statusAvailability";

const option = (to: string, available = true, reason: string | null = null): IssueTransitionOption => ({
  id: `t-${to}`,
  name: to,
  to,
  toName: to,
  toKind: null,
  toIcon: null,
  isGlobal: false,
  available,
  unavailableReason: available ? null : reason,
  hasScreen: false,
  screenFields: [],
  requiredFields: [],
  missingFields: [],
});

describe("가용 전환 메뉴 — 단건·다건 결합", () => {
  it("단건은 서버 목록 그대로 — 못 하는 전환은 이유와 함께 남는다", () => {
    const map = combineAvailability([{ key: "A-1", status: "todo" }], [[option("doing"), option("done", false, "담당자만")]]);
    expect([...map.entries()]).toEqual([
      ["doing", { available: true, reason: null }],
      ["done", { available: false, reason: "담당자만" }],
    ]);
  });

  it("같은 상태로 가는 전환이 여럿이면 하나라도 가능하면 가능", () => {
    const map = combineAvailability([{ key: "A-1", status: "todo" }], [[option("done", false, "x"), { ...option("done"), id: "t2" }]]);
    expect(map.get("done")).toEqual({ available: true, reason: null });
  });

  it("다건은 공통 가능 전환만 고를 수 있고, 일부만 되는 상태는 막힌 이슈와 이유를 보여 준다", () => {
    const map = combineAvailability(
      [
        { key: "A-1", status: "todo" },
        { key: "A-2", status: "todo" },
      ],
      [
        [option("doing"), option("done")],
        [option("doing"), option("done", false, "하위 작업이 남았습니다")],
      ],
    );
    expect(map.get("doing")).toEqual({ available: true, reason: null });
    expect(map.get("done")).toEqual({ available: false, reason: "1개 이슈는 갈 수 없습니다 — A-2: 하위 작업이 남았습니다" });
  });

  it("다건 중 이미 그 상태인 이슈는 막힌 것으로 세지 않는다", () => {
    const map = combineAvailability(
      [
        { key: "A-1", status: "doing" },
        { key: "A-2", status: "todo" },
      ],
      [[option("done")], [option("doing"), option("done")]],
    );
    expect(map.get("doing")).toEqual({ available: true, reason: null });
    expect(map.get("done")).toEqual({ available: true, reason: null });
  });

  it("한 이슈의 목록에만 있는 상태는 다른 이슈의 이유(전환 없음)로 막힌다", () => {
    const map = combineAvailability(
      [
        { key: "A-1", status: "todo" },
        { key: "A-2", status: "todo" },
      ],
      [[option("review")], []],
    );
    expect(map.get("review")).toEqual({ available: false, reason: "1개 이슈는 갈 수 없습니다 — A-2: 갈 수 있는 전환이 없습니다" });
  });
});
