import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button, Lozenge, Select } from "@chanho/react";
import type { StatusKind, WorkflowStatus, WorkflowTransition } from "../store/types";
import { statusAppearance } from "./labels";

/** 의미(할 일/진행 중/완료)별 열 — 왼쪽에서 오른쪽으로 진행 방향을 그린다 */
const COLUMN_X: Record<StatusKind, number> = { new: 0, active: 240, complete: 480 };
const ROW_HEIGHT = 88;
const ANY = "any"; // "모든 상태" 센티널 — Select는 빈 문자열 value를 쓰지 않는다

export interface WorkflowCanvasProps {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  /** 읽기 전용이면 캔버스만 보여준다(스킴 사용 중인 프로젝트) */
  readOnly?: boolean;
  onChange?: (transitions: WorkflowTransition[]) => void;
}

/**
 * 워크플로 전이 편집기 — 상태가 노드, 전이가 엣지다. 캔버스는 `@xyflow/react`(MIT)가 그린다.
 *
 * 캔버스 아래의 목록이 **같은 데이터의 접근 가능한 표현**이다. 드래그로만 편집하게 두면
 * 키보드 사용자와 테스트가 기능에 닿지 못한다(간트·번다운과 같은 원칙).
 */
export function WorkflowCanvas({
  statuses,
  transitions,
  readOnly = false,
  onChange,
}: WorkflowCanvasProps) {
  const [fromDraft, setFromDraft] = useState<string>(ANY);
  const [toDraft, setToDraft] = useState<string>(statuses[0]?.id ?? ANY);

  const sorted = useMemo(() => [...statuses].sort((a, b) => a.order - b.order), [statuses]);

  // 상태 편집기에서 고른 상태가 지워질 수 있다. 사라진 id를 그대로 두면 저장은 성공했다고
  // 하면서 정리 단계에서 조용히 버려진다 — 화면 값을 실재하는 상태로 되돌린다.
  const exists = (id: string) => sorted.some((status) => status.id === id);
  const from = fromDraft === ANY || exists(fromDraft) ? fromDraft : ANY;
  const to = exists(toDraft) ? toDraft : (sorted[0]?.id ?? ANY);
  const nameOf = (id: string) => sorted.find((status) => status.id === id)?.name ?? id;

  const nodes = useMemo<Node[]>(() => {
    const perColumn: Record<StatusKind, number> = { new: 0, active: 0, complete: 0 };
    return sorted.map((status) => {
      const kind = status.kind ?? "new";
      const row = perColumn[kind]++;
      return {
        id: status.id,
        position: { x: COLUMN_X[kind], y: row * ROW_HEIGHT },
        data: { label: status.name },
        // 캔버스는 보기 전용이다 — 편집은 아래 목록에서 한다(규칙이 한 곳에만 있게)
        draggable: false,
        connectable: false,
        className: `workflow-node is-${kind}`,
      };
    });
  }, [sorted]);

  const edges = useMemo<Edge[]>(
    () =>
      transitions.flatMap((transition) => {
        const sources = transition.from.length > 0 ? transition.from : sorted.map((s) => s.id);
        return sources
          .filter((source) => source !== transition.to)
          .map((source) => ({
            id: `${transition.id}:${source}`,
            source,
            target: transition.to,
            label: transition.name,
            animated: transition.from.length === 0,
          }));
      }),
    [transitions, sorted],
  );

  const addTransition = () => {
    if (!onChange || to === ANY) return;
    const sources = from === ANY ? [] : [from];
    const name = from === ANY ? `${nameOf(to)}로` : `${nameOf(from)} → ${nameOf(to)}`;
    onChange([
      ...transitions,
      { id: `tr-${Date.now()}-${transitions.length}`, name, from: sources, to },
    ]);
  };

  const duplicate = transitions.some(
    (transition) =>
      transition.to === to &&
      (from === ANY
        ? transition.from.length === 0
        : transition.from.includes(from) || transition.from.length === 0),
  );

  return (
    <div className="workflow-canvas">
      {/* 보기 전용 캔버스 — inert로 탭 순서와 접근성 트리에서 함께 뺀다.
          aria-hidden만 주면 React Flow의 줌·핏 버튼이 탭에 걸려 낭독 없는 컨트롤이 된다. */}
      <div className="workflow-flow" inert>
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: false }}>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <ul className="workflow-transitions" aria-label="전이 목록">
        {transitions.length === 0 ? (
          <li className="dash-empty">
            전이를 정하지 않으면 모든 상태로 자유롭게 이동합니다.
          </li>
        ) : null}
        {transitions.map((transition) => (
          <li key={transition.id} className="workflow-transition-row">
            <span className="workflow-transition-from">
              {transition.from.length === 0 ? (
                <Lozenge appearance="info">모든 상태</Lozenge>
              ) : (
                transition.from.map((id) => (
                  <Lozenge
                    key={id}
                    appearance={statusAppearance(sorted, id)}
                  >
                    {nameOf(id)}
                  </Lozenge>
                ))
              )}
            </span>
            <span aria-hidden>→</span>
            <Lozenge
              appearance={statusAppearance(sorted, transition.to)}
            >
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
          <Button disabled={duplicate || from === to || to === ANY} onClick={addTransition}>
            전이 추가
          </Button>
        </div>
      )}
    </div>
  );
}
