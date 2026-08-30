import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import type { Connection, Edge, Node, NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button, Lozenge, Select } from "@chanho/react";
import type { WorkflowLayout, WorkflowStatus, WorkflowTransition } from "../store/types";
import { WORKFLOW_ANY_NODE } from "../store/types";
import { statusAppearance } from "./labels";
import { computeAutoLayout } from "./workflowLayout";

const ANY = "any"; // "모든 상태" 센티널 — Select는 빈 문자열 value를 쓰지 않는다

export interface WorkflowCanvasProps {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  /** 저장된 노드 위치 — 없는 노드는 자동 배치(dagre) */
  layout?: WorkflowLayout;
  /** 읽기 전용이면 캔버스는 보기만, 목록 편집도 숨긴다(스킴 사용 중인 프로젝트) */
  readOnly?: boolean;
  onChange?: (transitions: WorkflowTransition[]) => void;
  onLayoutChange?: (layout: WorkflowLayout) => void;
}

let transitionSeq = 0;
const newTransitionId = () => `tr-${Date.now()}-${++transitionSeq}`;

/**
 * 워크플로 전이 편집기 — 상태가 노드, 전이가 엣지다. 캔버스는 `@xyflow/react`(MIT)가 그리고
 * 배치는 `@dagrejs/dagre`(MIT)가 왼쪽→오른쪽으로 잡는다.
 *
 * 캔버스에서는 **노드를 끌어 배치하고(저장됨), 손잡이를 이어 전이를 만들고, 선을 골라 Delete로
 * 지운다.** 캔버스 아래의 목록은 같은 데이터의 접근 가능한 표현이다 — 드래그로만 편집하게 두면
 * 키보드 사용자와 테스트가 기능에 닿지 못한다(간트·번다운과 같은 원칙).
 */
export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({
  statuses,
  transitions,
  layout,
  readOnly = false,
  onChange,
  onLayoutChange,
}: WorkflowCanvasProps) {
  const { fitView } = useReactFlow();
  const [fromDraft, setFromDraft] = useState<string>(ANY);
  const [toDraft, setToDraft] = useState<string>(statuses[0]?.id ?? ANY);

  const sorted = useMemo(() => [...statuses].sort((a, b) => a.order - b.order), [statuses]);

  // 상태 편집기에서 고른 상태가 지워질 수 있다. 사라진 id를 그대로 두면 저장은 성공했다고
  // 하면서 정리 단계에서 조용히 버려진다 — 화면 값을 실재하는 상태로 되돌린다.
  const exists = useCallback((id: string) => sorted.some((status) => status.id === id), [sorted]);
  const from = fromDraft === ANY || exists(fromDraft) ? fromDraft : ANY;
  const to = exists(toDraft) ? toDraft : (sorted[0]?.id ?? ANY);
  const nameOf = (id: string) => sorted.find((status) => status.id === id)?.name ?? id;

  const hasGlobal = transitions.some((t) => t.from.length === 0);
  // 자동 배치는 열 때와 "자동 배치"를 눌렀을 때만 다시 계산한다 — 전이를 하나 이을 때마다
  // 노드가 튀면 방금 잡은 손잡이 위치가 어긋난다
  const [autoSeed, setAutoSeed] = useState(0);
  const latestTransitions = useRef(transitions);
  latestTransitions.current = transitions;
  const autoLayout = useMemo(
    () => computeAutoLayout(sorted, latestTransitions.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, autoSeed],
  );

  const buildNodes = useCallback((): Node[] => {
    const positionOf = (id: string) => layout?.[id] ?? autoLayout[id] ?? { x: 0, y: 0 };
    const nodes: Node[] = sorted.map((status) => ({
      id: status.id,
      position: positionOf(status.id),
      data: { label: status.name },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: !readOnly,
      connectable: !readOnly,
      className: `workflow-node is-${status.color ?? "neutral"}`,
    }));
    // 가상 "모든 상태" 노드 — 전역 전이의 출발점. 편집 중엔 항상 두어 여기서 선을 끌 수 있게 한다
    if (hasGlobal || !readOnly) {
      nodes.push({
        id: WORKFLOW_ANY_NODE,
        position: layout?.[WORKFLOW_ANY_NODE] ??
          autoLayout[WORKFLOW_ANY_NODE] ?? { x: 16, y: -72 },
        data: { label: "모든 상태" },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: !readOnly,
        connectable: !readOnly,
        className: "workflow-node workflow-node-any",
      });
    }
    return nodes;
  }, [sorted, layout, autoLayout, readOnly, hasGlobal]);

  // 노드는 드래그 중 부드럽게 움직여야 하므로 로컬 상태로 두고, 원천이 바뀌면 다시 만든다
  const [nodes, setNodes] = useState<Node[]>(buildNodes);
  useEffect(() => {
    setNodes(buildNodes());
  }, [buildNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      transitions.flatMap((transition) => {
        if (!exists(transition.to)) return [];
        const sources = transition.from.length > 0 ? transition.from : [WORKFLOW_ANY_NODE];
        return sources
          .filter(
            (source) =>
              source !== transition.to && (source === WORKFLOW_ANY_NODE || exists(source)),
          )
          .map((source) => ({
            id: `${transition.id}:${source}`,
            source,
            target: transition.to,
            type: "smoothstep",
            className: source === WORKFLOW_ANY_NODE ? "workflow-edge is-global" : "workflow-edge",
            animated: source === WORKFLOW_ANY_NODE,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            data: { transitionId: transition.id, source },
          }));
      }),
    [transitions, exists],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((prev) => applyNodeChanges(changes, prev)),
    [],
  );

  const handleDragStop = (_: unknown, node: Node) => {
    if (readOnly || !onLayoutChange) return;
    onLayoutChange({ ...(layout ?? {}), [node.id]: { x: node.position.x, y: node.position.y } });
  };

  const isDuplicate = (source: string, target: string) =>
    transitions.some(
      (transition) =>
        transition.to === target &&
        (source === ANY || source === WORKFLOW_ANY_NODE
          ? transition.from.length === 0
          : transition.from.includes(source) || transition.from.length === 0),
    );

  const addTransition = (source: string, target: string) => {
    if (!onChange || target === ANY || target === WORKFLOW_ANY_NODE) return;
    const global = source === ANY || source === WORKFLOW_ANY_NODE;
    if (!global && source === target) return;
    if (isDuplicate(source, target)) return;
    const name = global ? `${nameOf(target)}로` : `${nameOf(source)} → ${nameOf(target)}`;
    onChange([
      ...transitions,
      { id: newTransitionId(), name, from: global ? [] : [source], to: target },
    ]);
  };

  const handleConnect = (connection: Connection) => {
    if (readOnly || !connection.source || !connection.target) return;
    addTransition(connection.source, connection.target);
  };

  /** 선을 골라 Delete — 여러 출발을 가진 전이는 그 출발만 뺀다 */
  const handleEdgesDelete = (deleted: Edge[]) => {
    if (readOnly || !onChange) return;
    let next = transitions;
    for (const edge of deleted) {
      const { transitionId, source } = (edge.data ?? {}) as {
        transitionId?: string;
        source?: string;
      };
      next = next.flatMap((transition) => {
        if (transition.id !== transitionId) return [transition];
        if (transition.from.length <= 1 || !source) return [];
        return [{ ...transition, from: transition.from.filter((id) => id !== source) }];
      });
    }
    onChange(next);
  };

  const resetLayout = () => {
    onLayoutChange?.({});
    setAutoSeed((seed) => seed + 1);
    // 저장된 위치를 비우면 자동 배치로 돌아간다 — 다음 프레임에 화면을 맞춘다
    window.setTimeout(() => void fitView({ padding: 0.2 }), 0);
  };

  return (
    <div className="workflow-canvas">
      {readOnly ? null : (
        <div className="workflow-toolbar">
          <span className="workflow-hint">
            노드를 끌어 배치하고, 오른쪽 손잡이를 다른 노드에 이어 전이를 만듭니다. 선을 고르고
            Delete로 지웁니다.
          </span>
          <Button type="button" size="small" variant="subtle" onClick={resetLayout}>
            자동 배치
          </Button>
        </div>
      )}

      {/* 캔버스는 마우스 편집의 보조 경로 — 탭 순서에는 넣지 않는다(목록이 키보드 경로) */}
      <div className="workflow-flow" role="img" aria-label="워크플로 캔버스">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          nodesFocusable={false}
          edgesFocusable={false}
          deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
          onNodesChange={handleNodesChange}
          onNodeDragStop={handleDragStop}
          onConnect={handleConnect}
          onEdgesDelete={handleEdgesDelete}
          proOptions={{ hideAttribution: false }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <ul className="workflow-transitions" aria-label="전이 목록">
        {transitions.length === 0 ? (
          <li className="dash-empty">전이를 정하지 않으면 모든 상태로 자유롭게 이동합니다.</li>
        ) : null}
        {transitions.map((transition) => (
          <li key={transition.id} className="workflow-transition-row">
            <span className="workflow-transition-from">
              {transition.from.length === 0 ? (
                <Lozenge appearance="info">모든 상태</Lozenge>
              ) : (
                transition.from.map((id) => (
                  <Lozenge key={id} appearance={statusAppearance(sorted, id)}>
                    {nameOf(id)}
                  </Lozenge>
                ))
              )}
            </span>
            <span aria-hidden>→</span>
            <Lozenge appearance={statusAppearance(sorted, transition.to)}>
              {nameOf(transition.to)}
            </Lozenge>
            {readOnly ? null : (
              <Button
                variant="subtle"
                size="small"
                aria-label={`전이 ${transition.name} 삭제`}
                onClick={() => onChange?.(transitions.filter((t) => t.id !== transition.id))}
              >
                삭제
              </Button>
            )}
          </li>
        ))}
      </ul>

      {readOnly ? null : (
        <div className="workflow-add">
          <Select
            label="출발 상태"
            value={from}
            options={[
              { value: ANY, label: "모든 상태" },
              ...sorted.map((status) => ({ value: status.id, label: status.name })),
            ]}
            onValueChange={setFromDraft}
          />
          <Select
            label="도착 상태"
            value={to}
            options={sorted.map((status) => ({ value: status.id, label: status.name }))}
            onValueChange={setToDraft}
          />
          <Button
            disabled={isDuplicate(from, to) || from === to || to === ANY}
            onClick={() => addTransition(from, to)}
          >
            전이 추가
          </Button>
        </div>
      )}
    </div>
  );
}
