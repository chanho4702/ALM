import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, Lozenge, Select, TextField, useToast } from "@chanho/react";
import type { StatusCategory, StatusDef, WorkflowStatus } from "../store/types";
import {
  createStatusDef,
  deleteStatusDef,
  listStatusCategories,
  listStatusDefs,
  statusDefUsage,
  updateStatusDef,
} from "../store/jiraStore";
import { KIND_LABELS } from "./labels";
import { StatusGlyph } from "./StatusGlyph";
import { STATUS_ICON_OPTIONS } from "./typeIcons";

/** Select는 빈 문자열 value를 못 쓴다 — "카테고리 기본 아이콘"(icon === "")의 센티널 */
const ICON_DEFAULT = "__category__";
const ICON_OPTIONS = [{ value: ICON_DEFAULT, label: "카테고리 기본" }, ...STATUS_ICON_OPTIONS];

/** 레지스트리 항목 + 카테고리 → 글리프가 읽는 해석된 상태 (미리보기 전용, 저장되지 않는다) */
function toWorkflowStatus(def: StatusDef, category: StatusCategory | undefined): WorkflowStatus {
  return {
    id: def.id,
    name: def.name,
    category: def.categoryId,
    order: 0,
    kind: category?.kind,
    color: category?.color,
    icon: def.icon,
  };
}

/**
 * 전역 관리 → 상태. 워크플로가 골라 쓰는 **상태 레지스트리** — 이름·카테고리를 여기서 바꾸면
 * 그 상태를 쓰는 모든 스킴·프로젝트에 즉시 반영된다. 워크플로가 쓰는 동안은 지울 수 없다.
 */
export function StatusRegistryPanel() {
  const toast = useToast();
  const [defs, setDefs] = useState<StatusDef[]>([]);
  const [categories, setCategories] = useState<StatusCategory[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("todo");
  const [newIcon, setNewIcon] = useState(ICON_DEFAULT);

  const reload = useCallback(async () => {
    const [list, cats, used] = await Promise.all([
      listStatusDefs(),
      listStatusCategories(),
      statusDefUsage(),
    ]);
    setDefs(list);
    setCategories(cats);
    setUsage(used);
    setDrafts(Object.fromEntries(list.map((d) => [d.id, d.name])));
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
    void run("상태 추가 실패", async () => {
      await createStatusDef({
        name: newName,
        categoryId: newCategory,
        icon: newIcon === ICON_DEFAULT ? "" : newIcon,
      });
      setNewName("");
      toast({ title: "상태를 추가했습니다", appearance: "success" });
    });
  };

  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: `${c.name} (${KIND_LABELS[c.kind]})`,
  }));

  const commitName = (def: StatusDef) => {
    const name = (drafts[def.id] ?? "").trim();
    if (!name || name === def.name) return;
    void run("이름 변경 실패", () => updateStatusDef(def.id, { name }));
  };

  return (
    <Card padding="lg" title="상태">
      <p className="admin-scheme-note">
        워크플로 스킴과 프로젝트 커스텀이 이 목록에서 상태를 골라 씁니다. 이름·카테고리를 바꾸면 쓰는
        곳 전부에 반영되고, 쓰는 워크플로가 있으면 지울 수 없습니다.
      </p>

      <form className="status-editor-add status-editor-add--4" onSubmit={handleCreate}>
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
        <Select
          label="새 상태 아이콘"
          value={newIcon}
          options={ICON_OPTIONS}
          onValueChange={setNewIcon}
        />
        <Button type="submit" variant="secondary" disabled={!newName.trim()}>
          상태 추가
        </Button>
      </form>

      <ul className="status-editor-list" aria-label="상태 목록">
        {defs.map((def) => {
          const category = categoryOf(def.categoryId);
          const used = usage[def.id] ?? 0;
          return (
            <li key={def.id} className="status-editor-row status-editor-row--registry">
              <span className="status-cell">
                <StatusGlyph status={def.id} statuses={[toWorkflowStatus(def, category)]} size={16} />
                <Lozenge appearance={category?.color ?? "neutral"}>
                  {category?.name ?? def.categoryId}
                </Lozenge>
              </span>
              <TextField
                label={`${def.name} 이름`}
                value={drafts[def.id] ?? def.name}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))}
                onBlur={() => commitName(def)}
              />
              <Select
                label={`${def.name} 카테고리`}
                value={def.categoryId}
                options={categoryOptions}
                onValueChange={(v) =>
                  void run("카테고리 변경 실패", () => updateStatusDef(def.id, { categoryId: v }))
                }
              />
              <Select
                label={`${def.name} 아이콘`}
                value={def.icon ? def.icon : ICON_DEFAULT}
                options={ICON_OPTIONS}
                onValueChange={(v) =>
                  void run("아이콘 변경 실패", () =>
                    updateStatusDef(def.id, { icon: v === ICON_DEFAULT ? "" : v }),
                  )
                }
              />
              <span className="status-editor-usage">워크플로 {used}개</span>
              <div className="status-editor-row-actions">
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 삭제`}
                  disabled={used > 0}
                  onClick={() => void run("상태 삭제 실패", () => deleteStatusDef(def.id))}
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
