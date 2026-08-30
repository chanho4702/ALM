import dagre from "@dagrejs/dagre";
import type { StatusKind, WorkflowLayout, WorkflowStatus, WorkflowTransition } from "../store/types";
import { WORKFLOW_ANY_NODE } from "../store/types";

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 40;

/** 전이가 없을 때의 열 — 흐름 방향(할 일 → 진행 중 → 완료)만이라도 보이게 */
const KIND_COLUMN_X: Record<StatusKind, number> = { new: 0, active: 260, complete: 520 };

/**
 * 워크플로 자동 배치 — 전이를 방향 그래프로 보고 dagre(MIT)가 왼쪽→오른쪽 랭크를 정한다.
 * 전역 전이(`from: []`)는 가상 노드(`WORKFLOW_ANY_NODE`)에서 출발하고, 전이가 하나도 없으면
 * 의미 순서로 열을 나눈다. 반환값은 저장된 `layout`이 없는 노드의 기본 위치로 쓰인다.
 */
export function computeAutoLayout(
  statuses: WorkflowStatus[],
  transitions: WorkflowTransition[],
): WorkflowLayout {
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  const valid = new Set(sorted.map((s) => s.id));
  const specific = transitions.filter((t) => t.from.length > 0 && valid.has(t.to));
  const hasGlobal = transitions.some((t) => t.from.length === 0 && valid.has(t.to));

  if (specific.length === 0 && !hasGlobal) {
    const perKind: Record<StatusKind, number> = { new: 0, active: 0, complete: 0 };
    return Object.fromEntries(
      sorted.map((status) => {
        const kind = status.kind ?? "new";
        const row = perKind[kind]++;
        return [status.id, { x: KIND_COLUMN_X[kind] + 16, y: row * 72 + 16 }];
      }),
    );
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 96, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const status of sorted) {
    graph.setNode(status.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  if (hasGlobal) graph.setNode(WORKFLOW_ANY_NODE, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const transition of specific) {
    for (const from of transition.from) {
      if (valid.has(from) && from !== transition.to) graph.setEdge(from, transition.to);
    }
  }
  for (const transition of transitions) {
    if (transition.from.length === 0 && valid.has(transition.to)) {
      graph.setEdge(WORKFLOW_ANY_NODE, transition.to);
    }
  }
  dagre.layout(graph);

  const layout: WorkflowLayout = {};
  for (const id of graph.nodes()) {
    const node = graph.node(id);
    // dagre는 중심 좌표, React Flow는 좌상단 좌표
    layout[id] = { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 };
  }
  return layout;
}
