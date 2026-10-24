import { describe, expect, it } from "vitest";
import type { AutomationRule } from "../store/types";
import {
  actionSummary,
  blankAction,
  blankTrigger,
  cronSummary,
  duplicateInput,
  moveItem,
  ruleToInput,
  triggerSummary,
} from "./automationLabels";

const names = {
  statusName: (id: string) => ({ todo: "할 일", done: "완료" })[id] ?? id,
  userName: (id: string) => ({ u2: "이영희" })[id] ?? id,
  priorityName: (id: string) => ({ high: "높음" })[id] ?? id,
};

const rule: AutomationRule = {
  id: "r1",
  projectId: "p1",
  name: "끝나면 막힘 해제",
  description: "",
  enabled: true,
  disabledReason: null,
  trigger: { type: "ISSUE_TRANSITIONED", fromStatuses: [], toStatuses: ["done"] },
  condition: "flagged = true",
  actions: [{ type: "SET_FIELD", field: "flagged", value: false }],
  allowRuleTrigger: false,
  actorId: "u1",
  createdBy: "u1",
  nextRunAt: null,
  lastRunAt: null,
  consecutiveFailures: 0,
  version: 3,
  createdAt: "2026-10-24T00:00:00Z",
  updatedAt: "2026-10-24T00:00:00Z",
};

describe("자동화 표기", () => {
  it("트리거 요약 — 비운 상태 목록은 '아무 상태', 필드·cron 프리셋은 한국어", () => {
    expect(triggerSummary(rule.trigger, names.statusName)).toBe("상태 전환됨: 아무 상태 → 완료");
    expect(triggerSummary({ type: "FIELD_CHANGED", fields: ["storyPoints", "assignee"] }, names.statusName)).toBe(
      "필드 값 변경됨: 스토리 포인트, 담당자",
    );
    expect(triggerSummary({ type: "SCHEDULED", cron: "0 9 * * MON-FRI" }, names.statusName)).toBe("예약 실행: 평일 오전 9시");
    expect(triggerSummary({ type: "ISSUE_CREATED" }, names.statusName)).toBe("이슈 생성됨");
  });

  it("cron 요약 — 프리셋이 아니면 식을 그대로, 공백은 정규화", () => {
    expect(cronSummary(" 0  9 * * * ")).toBe("매일 오전 9시");
    expect(cronSummary("30 8 * * *")).toBe("cron 30 8 * * *");
    expect(cronSummary("")).toBe("시각 미정");
  });

  it("액션 요약 — id를 이름으로 푼다", () => {
    expect(actionSummary({ type: "SET_FIELD", field: "priority", value: "high" }, names)).toBe("우선순위 → 높음");
    expect(actionSummary({ type: "SET_FIELD", field: "flagged", value: false }, names)).toBe("플래그 → 끄기");
    expect(actionSummary({ type: "SET_FIELD", field: "dueDate", value: null }, names)).toBe("마감일 → 비우기");
    expect(actionSummary({ type: "ASSIGN", assignee: "user", userId: "u2" }, names)).toBe("담당자 → 이영희");
    expect(actionSummary({ type: "ASSIGN", assignee: "unassigned" }, names)).toBe("담당자 비우기");
    expect(actionSummary({ type: "TRANSITION", toStatus: "done" }, names)).toBe("상태 → 완료");
    expect(actionSummary({ type: "LABELS", add: ["a"], remove: ["b", "c"] }, names)).toBe("라벨 +a -b, -c");
    expect(actionSummary({ type: "NOTIFY", recipients: ["assignee", "watchers"], userIds: ["u2"], message: "x" }, names)).toBe(
      "알림 → 담당자, 지켜보는 사람, 이영희",
    );
    expect(actionSummary({ type: "COMMENT", body: "a".repeat(60) }, names)).toBe(`코멘트: ${"a".repeat(39)}…`);
  });

  it("빈 초안 — 종류별 기본값, 트리거를 바꾸면 다른 종류의 항목은 버린다", () => {
    expect(blankAction("NOTIFY")).toEqual({ type: "NOTIFY", recipients: ["assignee"], userIds: [], message: "" });
    expect(blankTrigger("SCHEDULED")).toEqual({ type: "SCHEDULED", cron: "0 9 * * *" });
    expect(blankTrigger("ISSUE_CREATED")).toEqual({ type: "ISSUE_CREATED" });
  });

  it("규칙 → 입력, 복제본은 꺼진 채 '(복사본)'을 붙이고 80자를 넘지 않는다", () => {
    expect(ruleToInput(rule)).toMatchObject({ name: rule.name, condition: "flagged = true", enabled: true });
    expect(duplicateInput(rule)).toMatchObject({ name: "끝나면 막힘 해제 (복사본)", enabled: false });
    expect(duplicateInput({ ...rule, name: "가".repeat(80) }).name).toHaveLength(80);
  });

  it("순서 바꾸기 — 범위를 벗어나면 그대로", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
