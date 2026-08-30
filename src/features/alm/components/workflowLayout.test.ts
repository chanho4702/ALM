import { describe, expect, it } from "vitest";
import type { WorkflowStatus, WorkflowTransition } from "../store/types";
import { WORKFLOW_ANY_NODE } from "../store/types";
import { computeAutoLayout } from "./workflowLayout";

const statuses: WorkflowStatus[] = [
  { id: "todo", name: "할 일", category: "todo", order: 1, kind: "new", color: "neutral" },
  { id: "review", name: "리뷰", category: "inprogress", order: 3, kind: "active", color: "info" },
  { id: "inprogress", name: "진행 중", category: "inprogress", order: 2, kind: "active", color: "info" },
  { id: "done", name: "완료", category: "done", order: 4, kind: "complete", color: "success" },
];

describe("워크플로 자동 배치", () => {
  it("전이가 있으면 흐름 방향(왼쪽 → 오른쪽)으로 열이 나뉜다", () => {
    const transitions: WorkflowTransition[] = [
      { id: "t1", name: "시작", from: ["todo"], to: "inprogress" },
      { id: "t2", name: "리뷰 요청", from: ["inprogress"], to: "review" },
      { id: "t3", name: "완료", from: ["review"], to: "done" },
    ];
    const layout = computeAutoLayout(statuses, transitions);
    expect(layout.todo.x).toBeLessThan(layout.inprogress.x);
    expect(layout.inprogress.x).toBeLessThan(layout.review.x);
    expect(layout.review.x).toBeLessThan(layout.done.x);
    expect(layout[WORKFLOW_ANY_NODE]).toBeUndefined(); // 전역 전이가 없으면 가상 노드도 없다
  });

  it("전이가 없으면 의미(할 일/진행 중/완료) 순서로 열을 나누고 같은 의미는 아래로 쌓는다", () => {
    const layout = computeAutoLayout(statuses, []);
    expect(layout.todo.x).toBeLessThan(layout.inprogress.x);
    expect(layout.inprogress.x).toBe(layout.review.x);
    expect(layout.inprogress.y).toBeLessThan(layout.review.y);
    expect(layout.review.x).toBeLessThan(layout.done.x);
  });

  it("전역 전이('모든 상태')는 가상 노드에서 출발한다", () => {
    const layout = computeAutoLayout(statuses, [
      { id: "t1", name: "완료로", from: [], to: "done" },
    ]);
    expect(layout[WORKFLOW_ANY_NODE]).toBeDefined();
    expect(layout[WORKFLOW_ANY_NODE].x).toBeLessThan(layout.done.x);
  });
});
