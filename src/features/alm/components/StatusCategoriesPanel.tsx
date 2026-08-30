import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, Lozenge, Select, TextField, useToast } from "@chanho/react";
import type { StatusCategory, StatusColor, StatusDef, StatusKind } from "../store/types";
import {
  createStatusCategory,
  deleteStatusCategory,
  listStatusCategories,
  listStatusDefs,
  moveStatusCategory,
  updateStatusCategory,
} from "../store/jiraStore";
import { COLOR_LABELS, KIND_LABELS, STATUS_COLORS, STATUS_KINDS } from "./labels";

const KIND_OPTIONS = STATUS_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));
const COLOR_OPTIONS = STATUS_COLORS.map((color) => ({ value: color, label: COLOR_LABELS[color] }));

/**
 * 전역 관리 → 상태 카테고리. 카테고리는 상태의 **의미**(할 일/진행 중/완료)와 색을 정한다 —
 * 완료 판정·번다운·보드 정렬은 전부 의미에서 나오므로, 기본 3개는 의미를 바꾸거나 지울 수 없다.
 */
export function StatusCategoriesPanel() {
  const toast = useToast();
  const [categories, setCategories] = useState<StatusCategory[]>([]);
  const [defs, setDefs] = useState<StatusDef[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<StatusKind>("active");
  const [newColor, setNewColor] = useState<StatusColor>("info");

  const reload = useCallback(async () => {
    const [list, defList] = await Promise.all([listStatusCategories(), listStatusDefs()]);
    setCategories(list);
    setDefs(defList);
    setDrafts(Object.fromEntries(list.map((c) => [c.id, c.name])));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (failTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("카테고리 추가 실패", async () => {
      await createStatusCategory({ name: newName, kind: newKind, color: newColor });
      setNewName("");
      toast({ title: "카테고리를 추가했습니다", appearance: "success" });
    });
  };

  const usageOf = (categoryId: string) => defs.filter((d) => d.categoryId === categoryId).length;

  const commitName = (category: StatusCategory) => {
    const name = (drafts[category.id] ?? "").trim();
    if (!name || name === category.name) return;
    void run("이름 변경 실패", () => updateStatusCategory(category.id, { name }));
  };

  return (
    <Card padding="lg" title="상태 카테고리">
      <p className="admin-scheme-note">
        카테고리는 상태의 의미(할 일/진행 중/완료)와 색을 정합니다. 완료 판정·번다운·보드 정렬은 의미에서
        나오므로 기본 3개의 의미는 바꿀 수 없습니다.
      </p>

      <form className="status-editor-add status-editor-add--3" onSubmit={handleCreate}>
        <TextField
          label="새 카테고리 이름"
          placeholder="예: 검토"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Select
          label="새 카테고리 의미"
          value={newKind}
          options={KIND_OPTIONS}
          onValueChange={(v) => setNewKind(v as StatusKind)}
        />
        <Select
          label="새 카테고리 색"
          value={newColor}
          options={COLOR_OPTIONS}
          onValueChange={(v) => setNewColor(v as StatusColor)}
        />
        <Button type="submit" variant="secondary" disabled={!newName.trim()}>
          카테고리 추가
        </Button>
      </form>

      <ul className="status-editor-list" aria-label="카테고리 목록">
        {categories.map((category, index) => {
          const used = usageOf(category.id);
          return (
            <li key={category.id} className="status-editor-row status-editor-row--category">
              <Lozenge appearance={category.color}>{category.name}</Lozenge>
              <TextField
                label={`${category.name} 이름`}
                value={drafts[category.id] ?? category.name}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [category.id]: e.target.value }))}
                onBlur={() => commitName(category)}
              />
              <Select
                label={`${category.name} 의미`}
                value={category.kind}
                options={KIND_OPTIONS}
                disabled={category.builtIn}
                onValueChange={(v) =>
                  void run("의미 변경 실패", () =>
                    updateStatusCategory(category.id, { kind: v as StatusKind }),
                  )
                }
              />
              <Select
                label={`${category.name} 색`}
                value={category.color}
                options={COLOR_OPTIONS}
                onValueChange={(v) =>
                  void run("색 변경 실패", () =>
                    updateStatusCategory(category.id, { color: v as StatusColor }),
                  )
                }
              />
              <span className="status-editor-usage">상태 {used}개</span>
              <div className="status-editor-row-actions">
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${category.name} 위로`}
                  disabled={index === 0}
                  onClick={() => void run("순서 변경 실패", () => moveStatusCategory(category.id, -1))}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${category.name} 아래로`}
                  disabled={index === categories.length - 1}
                  onClick={() => void run("순서 변경 실패", () => moveStatusCategory(category.id, 1))}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${category.name} 삭제`}
                  disabled={category.builtIn || used > 0}
                  onClick={() => void run("카테고리 삭제 실패", () => deleteStatusCategory(category.id))}
                >
                  삭제
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
