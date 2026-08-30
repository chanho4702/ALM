import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, Lozenge, Select, TextField, useToast } from "@chanho/react";
import type { PriorityDef, StatusColor } from "../store/types";
import {
  createPriority,
  deletePriority,
  listPriorities,
  movePriority,
  priorityUsage,
  updatePriority,
} from "../store/jiraStore";
import { COLOR_LABELS, STATUS_COLORS } from "./labels";
import { TYPE_ICONS, TYPE_ICON_OPTIONS } from "./typeIcons";

const COLOR_OPTIONS = STATUS_COLORS.map((color) => ({ value: color, label: COLOR_LABELS[color] }));

/**
 * 전역 관리 → 우선순위(지라 "우선 순위"). 순서가 곧 위계(위가 높음)라 정렬·리포트의 근거가 된다.
 * 기본 5단계는 이름·아이콘·색만 바꿀 수 있고 지울 수 없다. 스킴/프로젝트는 이 목록에서 켤 것과 기본값을 고른다.
 */
export function PrioritiesPanel() {
  const toast = useToast();
  const [priorities, setPriorities] = useState<PriorityDef[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("flag");
  const [newColor, setNewColor] = useState<StatusColor>("danger");

  const reload = useCallback(async () => {
    const [list, used] = await Promise.all([listPriorities(), priorityUsage()]);
    setPriorities(list);
    setUsage(used);
    setDrafts(Object.fromEntries(list.map((p) => [p.id, p.name])));
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
    void run("우선순위 추가 실패", async () => {
      await createPriority({ name: newName, icon: newIcon, color: newColor });
      setNewName("");
      toast({ title: "우선순위를 추가했습니다", appearance: "success" });
    });
  };

  const commitName = (def: PriorityDef) => {
    const name = (drafts[def.id] ?? "").trim();
    if (!name || name === def.name) return;
    void run("이름 변경 실패", () => updatePriority(def.id, { name }));
  };

  return (
    <Card padding="lg" title="우선순위">
      <p className="admin-scheme-note">
        위에 있을수록 높은 우선순위입니다 — 목록·검색 정렬과 리포트가 이 순서를 씁니다. 스킴과
        프로젝트는 이 목록에서 켤 우선순위와 기본값을 고릅니다. 기본 5단계는 지울 수 없습니다.
      </p>

      <form className="status-editor-add status-editor-add--3" onSubmit={handleCreate}>
        <TextField
          label="새 우선순위 이름"
          placeholder="예: 긴급"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Select label="새 우선순위 아이콘" value={newIcon} options={TYPE_ICON_OPTIONS} onValueChange={setNewIcon} />
        <Select
          label="새 우선순위 색"
          value={newColor}
          options={COLOR_OPTIONS}
          onValueChange={(v) => setNewColor(v as StatusColor)}
        />
        <Button type="submit" variant="secondary" disabled={!newName.trim()}>
          우선순위 추가
        </Button>
      </form>

      <ul className="status-editor-list" aria-label="우선순위 목록">
        {priorities.map((def, index) => {
          const used = usage[def.id] ?? 0;
          const Icon = TYPE_ICONS[def.icon];
          return (
            <li key={def.id} className="status-editor-row status-editor-row--type">
              <span className="status-editor-glyph">
                <Lozenge appearance={def.color}>
                  {Icon ? <Icon size={12} aria-hidden /> : null} {def.name}
                </Lozenge>
              </span>
              <TextField
                label={`${def.name} 이름`}
                value={drafts[def.id] ?? def.name}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))}
                onBlur={() => commitName(def)}
              />
              <Select
                label={`${def.name} 아이콘`}
                value={def.icon}
                options={TYPE_ICON_OPTIONS}
                onValueChange={(v) => void run("아이콘 변경 실패", () => updatePriority(def.id, { icon: v }))}
              />
              <Select
                label={`${def.name} 색`}
                value={def.color}
                options={COLOR_OPTIONS}
                onValueChange={(v) =>
                  void run("색 변경 실패", () => updatePriority(def.id, { color: v as StatusColor }))
                }
              />
              <span className="status-editor-usage">이슈 {used}개</span>
              <div className="status-editor-row-actions">
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 위로`}
                  disabled={index === 0}
                  onClick={() => void run("순서 변경 실패", () => movePriority(def.id, -1))}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 아래로`}
                  disabled={index === priorities.length - 1}
                  onClick={() => void run("순서 변경 실패", () => movePriority(def.id, 1))}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 삭제`}
                  disabled={def.builtIn || used > 0}
                  onClick={() => void run("우선순위 삭제 실패", () => deletePriority(def.id))}
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
