import { useEffect, useState } from "react";
import { Button, Lozenge, Select, TextField, useToast } from "@chanho/react";
import type { StatusCategory, StatusDef, StatusKind, WorkflowStatus } from "../store/types";
import { createStatusDef, listStatusCategories, listStatusDefs } from "../store/jiraStore";
import { categoryAsStatus, KIND_LABELS, statusDefAsStatus } from "./labels";
import { StatusGlyph } from "./StatusGlyph";

const NONE = "none"; // Select는 빈 문자열 value를 쓰지 않는다

export interface StatusEditorProps {
  /** 표시 순서대로의 워크플로 상태 목록 (order 오름차순) */
  value: WorkflowStatus[];
  /** 모든 변경(추가/순서/제외) — order는 1부터 재부여돼 온다 */
  onChange: (next: WorkflowStatus[]) => void;
}

/**
 * 워크플로 상태 편집기 — 전역 스킴 편집과 프로젝트 커스텀 편집이 공유한다.
 * 상태 자체(이름·카테고리)는 전역 레지스트리(설정 → 상태)가 관리하고, 여기서는 **어떤 상태를 어떤
 * 순서로 쓸지**만 정한다. 새 상태를 만들면 레지스트리에 즉시 등록되고 이 워크플로에 붙는다.
 * 초안만 다루고 저장은 부모가 한다 (updateScheme / updateProjectCustomSettings).
 */
export function StatusEditor({ value, onChange }: StatusEditorProps) {
  const toast = useToast();
  const [defs, setDefs] = useState<StatusDef[]>([]);
  const [categories, setCategories] = useState<StatusCategory[]>([]);
  const [pickId, setPickId] = useState(NONE);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("todo");

  const reload = () =>
    Promise.all([listStatusDefs(), listStatusCategories()]).then(([d, c]) => {
      setDefs(d);
      setCategories(c);
    });

  useEffect(() => {
    void reload();
  }, []);

  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const kindOf = (status: WorkflowStatus): StatusKind =>
    status.kind ?? categoryOf(status.category)?.kind ?? "new";

  const commit = (list: WorkflowStatus[]) =>
    onChange(list.map((s, i) => ({ ...s, order: i + 1 })));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  /** 레지스트리 상태 → 워크플로 항목 (해석 필드까지 채워 저장 전에도 색·의미가 맞다) */
  const toEntry = (def: StatusDef): WorkflowStatus => {
    const category = categoryOf(def.categoryId);
    return {
      id: def.id,
      name: def.name,
      category: def.categoryId,
      order: value.length + 1,
      kind: category?.kind,
      color: category?.color,
      icon: def.icon,
    };
  };

  const addExisting = () => {
    const def = defs.find((d) => d.id === pickId);
    if (!def) return;
    commit([...value, toEntry(def)]);
    setPickId(NONE);
  };

  const addNew = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const def = await createStatusDef({ name, categoryId: newCategory });
      commit([...value, toEntry(def)]);
      setNewName("");
      await reload();
    } catch (error) {
      toast({
        title: "상태 만들기 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  // 검증기(의미마다 최소 1개)와 동일한 가드 — 마지막 남은 의미의 상태는 뺄 수 없다
  const isLastOfKind = (status: WorkflowStatus) =>
    value.filter((s) => kindOf(s) === kindOf(status)).length <= 1;

  const available = defs.filter((d) => !value.some((s) => s.id === d.id));
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: `${c.name} (${KIND_LABELS[c.kind]})`,
    icon: <StatusGlyph status={c.id} statuses={[categoryAsStatus(c)]} variant="icon" />,
  }));

  return (
    <div className="status-editor" data-testid="status-editor">
      <ul className="status-editor-list" aria-label="워크플로 상태">
        {value.map((status, index) => {
          const category = categoryOf(status.category);
          return (
            <li key={status.id} className="status-editor-row">
              <span className="status-cell">
                <StatusGlyph status={status.id} statuses={[status]} size={16} variant="icon" />
                <Lozenge appearance={status.color ?? category?.color ?? "neutral"}>
                  {category?.name ?? status.category}
                </Lozenge>
              </span>
              <span className="status-editor-name">{status.name}</span>
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
                  disabled={isLastOfKind(status)}
                  onClick={() => commit(value.filter((_, i) => i !== index))}
                >
                  빼기
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {available.length > 0 ? (
        <div className="status-editor-add">
          <Select
            label="기존 상태 추가"
            value={pickId}
            options={[
              { value: NONE, label: "상태 선택" },
              ...available.map((d) => ({
                value: d.id,
                label: `${d.name} · ${categoryOf(d.categoryId)?.name ?? d.categoryId}`,
                icon: (
                  <StatusGlyph
                    status={d.id}
                    statuses={[statusDefAsStatus(d, categoryOf(d.categoryId))]}
                    variant="icon"
                  />
                ),
              })),
            ]}
            onValueChange={setPickId}
          />
          <span />
          <Button type="button" variant="secondary" disabled={pickId === NONE} onClick={addExisting}>
            추가
          </Button>
        </div>
      ) : null}

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
          options={categoryOptions}
          onValueChange={setNewCategory}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!newName.trim()}
          onClick={() => void addNew()}
        >
          상태 추가
        </Button>
      </div>

      <p className="admin-scheme-note">
        상태 이름·카테고리는 전역 관리 → 상태에서 바꿉니다. 여기서 뺀 상태의 이슈는 같은 카테고리의
        첫 상태로 이관됩니다. 의미(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다.
      </p>
    </div>
  );
}
