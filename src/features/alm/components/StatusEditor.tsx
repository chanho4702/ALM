import { useState } from "react";
import { Button, Lozenge, Select, TextField } from "@chanho/react";
import type { IssueStatus, WorkflowStatus } from "../store/types";
import { STATUS_APPEARANCE, STATUS_LABELS } from "./labels";

const CATEGORY_OPTIONS = (["todo", "inprogress", "done"] as const).map((c) => ({
  value: c,
  label: STATUS_LABELS[c],
}));

// 새 상태 id — 스킴/커스텀 합집합 안에서 유일하면 충분하다
let fallbackSeq = 0;
const newStatusId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `st-${crypto.randomUUID().slice(0, 8)}`
    : `st-${Date.now()}-${++fallbackSeq}`;

export interface StatusEditorProps {
  /** 표시 순서대로의 상태 목록 (order 오름차순) */
  value: WorkflowStatus[];
  /** 모든 변경(추가/이름/카테고리/순서/삭제) — order는 1부터 재부여돼 온다 */
  onChange: (next: WorkflowStatus[]) => void;
}

/**
 * 워크플로 상태 편집기 — 전역 스킴 편집과 프로젝트 커스텀 편집이 공유한다.
 * 초안만 다루고 저장은 부모가 한다 (updateScheme / updateProjectCustomSettings).
 */
export function StatusEditor({ value, onChange }: StatusEditorProps) {
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<IssueStatus>("todo");

  const commit = (list: WorkflowStatus[]) =>
    onChange(list.map((s, i) => ({ ...s, order: i + 1 })));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const patch = (index: number, changes: Partial<WorkflowStatus>) =>
    commit(value.map((s, i) => (i === index ? { ...s, ...changes } : s)));

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    commit([...value, { id: newStatusId(), name, category: newCategory, order: value.length + 1 }]);
    setNewName("");
    setNewCategory("todo");
  };

  // 검증기(카테고리마다 최소 1개)와 동일한 가드 — 마지막 남은 카테고리 상태는 삭제 불가
  const isLastOfCategory = (status: WorkflowStatus) =>
    value.filter((s) => s.category === status.category).length <= 1;

  return (
    <div className="status-editor" data-testid="status-editor">
      <ul className="status-editor-list">
        {value.map((status, index) => (
          <li key={status.id} className="status-editor-row">
            <Lozenge appearance={STATUS_APPEARANCE[status.category]}>
              {STATUS_LABELS[status.category]}
            </Lozenge>
            <TextField
              label={`${index + 1}번 상태 이름`}
              value={status.name}
              onChange={(e) => patch(index, { name: e.target.value })}
            />
            <Select
              label={`${index + 1}번 상태 카테고리`}
              value={status.category}
              options={CATEGORY_OPTIONS}
              onValueChange={(v) => patch(index, { category: v as IssueStatus })}
            />
            <div className="status-editor-row-actions">
              <Button
                type="button"
                size="small"
                variant="ghost"
                aria-label={`${status.name} 위로`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="small"
                variant="ghost"
                aria-label={`${status.name} 아래로`}
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </Button>
              <Button
                type="button"
                size="small"
                variant="ghost"
                aria-label={`${status.name} 삭제`}
                disabled={isLastOfCategory(status)}
                onClick={() => commit(value.filter((_, i) => i !== index))}
              >
                삭제
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="status-editor-add">
        <TextField
          label="새 상태 이름"
          placeholder="예: 코드 리뷰"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Select
          label="새 상태 카테고리"
          value={newCategory}
          options={CATEGORY_OPTIONS}
          onValueChange={(v) => setNewCategory(v as IssueStatus)}
        />
        <Button type="button" variant="secondary" disabled={!newName.trim()} onClick={add}>
          상태 추가
        </Button>
      </div>

      <p className="admin-scheme-note">
        상태를 삭제하거나 저장에서 빠지면 그 상태의 이슈는 같은 카테고리의 첫 상태로 이관됩니다.
        카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다.
      </p>
    </div>
  );
}
