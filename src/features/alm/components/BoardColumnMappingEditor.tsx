import { Button, Radio, RadioGroup, Select, TextField } from "@chanho/react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type { BoardColumn, BoardColumnMode, WorkflowStatus } from "../store/types";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";
import "./board-workflow.css";

/** Select 센티널 — 빈 문자열 금지 */
const PICK = "__pick__";

/** 편집 초안 — 매핑 형식의 열(상태 형식은 상태별 이름·WIP 덮어쓰기) */
export interface ColumnDraft {
  id?: string;
  name: string;
  statuses: string[];
  wipLimit: number | null;
}

export interface BoardColumnMappingEditorProps {
  mode: BoardColumnMode;
  onModeChange: (mode: BoardColumnMode) => void;
  /** 상태 형식 초안 — 상태마다 한 행 */
  statusColumns: BoardColumn[];
  onStatusColumnsChange: (columns: BoardColumn[]) => void;
  /** 매핑 형식 초안 */
  mappedColumns: ColumnDraft[];
  onMappedColumnsChange: (columns: ColumnDraft[]) => void;
  /** 프로젝트 워크플로 상태(order 순) */
  statuses: WorkflowStatus[];
}

/**
 * 보드 열 구성(C4) — 지라 보드 설정의 "열" 화면. 상태 형식(상태 = 열, 이름·WIP만 바꿈)과 매핑 형식(열 하나에 여러 상태,
 * 어느 열에도 없는 상태는 "미매핑 상태" 칸)을 오간다. 지라는 끌어다 놓지만 여기서는 버튼·선택으로 같은 일을 한다
 * (키보드로 끝까지 할 수 있게 — 드래그만 되는 편집은 두지 않는다).
 */
export function BoardColumnMappingEditor({
  mode,
  onModeChange,
  statusColumns,
  onStatusColumnsChange,
  mappedColumns,
  onMappedColumnsChange,
  statuses,
}: BoardColumnMappingEditorProps) {
  const nameOf = (id: string) => statuses.find((s) => s.id === id)?.name ?? id;
  const placed = new Set(mappedColumns.flatMap((c) => c.statuses));
  const unmapped = statuses.filter((s) => !placed.has(s.id));

  const updateColumn = (index: number, patch: Partial<ColumnDraft>) =>
    onMappedColumnsChange(mappedColumns.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const moveColumn = (index: number, delta: -1 | 1) => {
    const next = [...mappedColumns];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onMappedColumnsChange(next);
  };
  const addStatus = (index: number, statusId: string) =>
    onMappedColumnsChange(
      mappedColumns.map((c, i) => (i === index ? { ...c, statuses: [...c.statuses, statusId] } : c)),
    );
  const removeStatus = (index: number, statusId: string) =>
    updateColumn(index, { statuses: mappedColumns[index].statuses.filter((id) => id !== statusId) });

  return (
    <fieldset className="board-settings-fieldset board-column-mapping">
      <legend>열</legend>
      <RadioGroup
        value={mode}
        onValueChange={(value) => onModeChange(value as BoardColumnMode)}
        aria-label="열 구성"
        className="board-column-mode board-column-mode"
      >
        <Radio value="status" label="상태마다 한 열" />
        <Radio value="mapped" label="열에 상태 묶기(지라 열 매핑)" />
      </RadioGroup>
      {mode === "status" ? (
        <>
          <p className="board-column-mapping-hint">상태가 곧 열입니다. 이름과 WIP 제한(비우면 무제한)만 바꿉니다.</p>
          {statusColumns.map((column, index) => (
            <div key={column.status} className="board-settings-column-row">
              <TextField
                label={`${nameOf(column.status)} 컬럼 이름`}
                value={column.name}
                onChange={(e) =>
                  onStatusColumnsChange(statusColumns.map((c, i) => (i === index ? { ...c, name: e.target.value } : c)))
                }
              />
              <TextField
                label={`${nameOf(column.status)} WIP`}
                type="number"
                min={1}
                value={column.wipLimit === null ? "" : String(column.wipLimit)}
                onChange={(e) =>
                  onStatusColumnsChange(
                    statusColumns.map((c, i) =>
                      i === index ? { ...c, wipLimit: e.target.value === "" ? null : Number(e.target.value) } : c,
                    ),
                  )
                }
              />
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="board-column-mapping-hint">
            열 하나에 상태를 여러 개 넣을 수 있습니다. 카드를 그 열에 놓으면 넣은 순서대로 갈 수 있는 첫 상태로 옮겨집니다.
          </p>
          <ol className="board-column-mapping-list" aria-label="열 목록">
            {mappedColumns.map((column, index) => (
              <li key={column.id ?? `new-${index}`} className="board-column-mapping-item">
                <div className="board-column-mapping-head">
                  <TextField
                    label={`${index + 1}번째 열 이름`}
                    value={column.name}
                    onChange={(e) => updateColumn(index, { name: e.target.value })}
                  />
                  <TextField
                    label={`${column.name || `${index + 1}번째 열`} WIP`}
                    type="number"
                    min={1}
                    value={column.wipLimit === null ? "" : String(column.wipLimit)}
                    onChange={(e) => updateColumn(index, { wipLimit: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <div className="board-column-mapping-actions">
                    <Button
                      type="button"
                      size="small"
                      variant="subtle"
                      iconOnly
                      aria-label={`${column.name} 열을 왼쪽으로`}
                      disabled={index === 0}
                      onClick={() => moveColumn(index, -1)}
                    >
                      <ArrowUp size={14} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="subtle"
                      iconOnly
                      aria-label={`${column.name} 열을 오른쪽으로`}
                      disabled={index === mappedColumns.length - 1}
                      onClick={() => moveColumn(index, 1)}
                    >
                      <ArrowDown size={14} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="subtle"
                      iconOnly
                      aria-label={`${column.name} 열 삭제`}
                      disabled={mappedColumns.length <= 1}
                      onClick={() => onMappedColumnsChange(mappedColumns.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </div>
                </div>
                <ul className="board-column-mapping-statuses" aria-label={`${column.name} 열의 상태`}>
                  {column.statuses.length === 0 ? <li className="board-column-mapping-empty">상태 없음 — 이 열은 비어 있게 됩니다</li> : null}
                  {column.statuses.map((statusId) => (
                    <li key={statusId} className="board-column-mapping-status">
                      <ValueWithIcon icon={<StatusGlyph status={statusId} statuses={statuses} variant="icon" />}>
                        {nameOf(statusId)}
                      </ValueWithIcon>
                      <Button
                        type="button"
                        size="small"
                        variant="subtle"
                        iconOnly
                        aria-label={`${column.name} 열에서 ${nameOf(statusId)} 빼기`}
                        onClick={() => removeStatus(index, statusId)}
                      >
                        <X size={12} aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                {unmapped.length > 0 ? (
                  <Select
                    label={`${column.name || `${index + 1}번째 열`}에 상태 넣기`}
                    className="board-column-mapping-add"
                    value={PICK}
                    options={[
                      { value: PICK, label: "상태 넣기…", disabled: true },
                      ...unmapped.map((s) => ({
                        value: s.id,
                        label: s.name,
                        icon: <StatusGlyph status={s.id} statuses={statuses} variant="icon" />,
                      })),
                    ]}
                    onValueChange={(value) => {
                      if (value !== PICK) addStatus(index, value);
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ol>
          <Button
            type="button"
            size="small"
            variant="secondary"
            iconBefore={<Plus size={14} aria-hidden />}
            onClick={() => onMappedColumnsChange([...mappedColumns, { name: `열 ${mappedColumns.length + 1}`, statuses: [], wipLimit: null }])}
          >
            열 추가
          </Button>
          <section className="board-column-unmapped" aria-label="미매핑 상태">
            <h4 className="board-column-unmapped-title">미매핑 상태</h4>
            {unmapped.length === 0 ? (
              <p className="board-column-mapping-hint">모든 상태가 열에 들어 있습니다.</p>
            ) : (
              <>
                <p className="board-column-mapping-hint">어느 열에도 없는 상태의 이슈는 이 보드에 보이지 않습니다.</p>
                <ul className="board-column-mapping-statuses">
                  {unmapped.map((s) => (
                    <li key={s.id} className="board-column-mapping-status">
                      <ValueWithIcon icon={<StatusGlyph status={s.id} statuses={statuses} variant="icon" />}>{s.name}</ValueWithIcon>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </fieldset>
  );
}
