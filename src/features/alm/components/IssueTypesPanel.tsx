import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, Select, TextField, useToast } from "@chanho/react";
import type { IssueTypeDef, IssueTypeLevel, StatusColor } from "../store/types";
import {
  createIssueType,
  deleteIssueType,
  issueTypeUsage,
  listIssueTypes,
  moveIssueType,
  updateIssueType,
} from "../store/jiraStore";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { COLOR_LABELS, STATUS_COLORS, TYPE_LEVELS, TYPE_LEVEL_LABELS } from "./labels";
import { TYPE_ICON_OPTIONS } from "./typeIcons";

const LEVEL_OPTIONS = TYPE_LEVELS.map((level) => ({ value: level, label: TYPE_LEVEL_LABELS[level] }));
const COLOR_OPTIONS = STATUS_COLORS.map((color) => ({ value: color, label: COLOR_LABELS[color] }));

/**
 * 전역 관리 → 이슈 타입. 타입의 이름·계층(상위/일반/하위)·아이콘·색을 여기서 정하고,
 * 스킴/프로젝트는 이 목록에서 켤 타입만 고른다. 계층은 부모-자식 규칙의 근거라 쓰는 이슈가
 * 있으면 바꿀 수 없고, 기본 5종은 지울 수 없다.
 */
export function IssueTypesPanel() {
  const toast = useToast();
  const [types, setTypes] = useState<IssueTypeDef[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<IssueTypeLevel>("standard");
  const [newIcon, setNewIcon] = useState("lightbulb");
  const [newColor, setNewColor] = useState<StatusColor>("info");

  const reload = useCallback(async () => {
    const [list, used] = await Promise.all([listIssueTypes(), issueTypeUsage()]);
    setTypes(list);
    setUsage(used);
    setDrafts(Object.fromEntries(list.map((t) => [t.id, t.name])));
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
    void run("이슈 타입 추가 실패", async () => {
      await createIssueType({ name: newName, level: newLevel, icon: newIcon, color: newColor });
      setNewName("");
      toast({ title: "이슈 타입을 추가했습니다", appearance: "success" });
    });
  };

  const commitName = (def: IssueTypeDef) => {
    const name = (drafts[def.id] ?? "").trim();
    if (!name || name === def.name) return;
    void run("이름 변경 실패", () => updateIssueType(def.id, { name }));
  };

  return (
    <Card padding="lg" title="이슈 타입">
      <p className="admin-scheme-note">
        타입의 계층이 부모-자식 규칙을 정합니다 — 상위(에픽)는 일반 이슈를, 일반 이슈는 하위 작업을
        품습니다. 스킴과 프로젝트는 이 목록에서 켤 타입만 고릅니다.
      </p>

      <form className="status-editor-add status-editor-add--4" onSubmit={handleCreate}>
        <TextField
          label="새 타입 이름"
          placeholder="예: 개선"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Select
          label="새 타입 계층"
          value={newLevel}
          options={LEVEL_OPTIONS}
          onValueChange={(v) => setNewLevel(v as IssueTypeLevel)}
        />
        <Select label="새 타입 아이콘" value={newIcon} options={TYPE_ICON_OPTIONS} onValueChange={setNewIcon} />
        <Select
          label="새 타입 색"
          value={newColor}
          options={COLOR_OPTIONS}
          onValueChange={(v) => setNewColor(v as StatusColor)}
        />
        <Button type="submit" variant="secondary" disabled={!newName.trim()}>
          타입 추가
        </Button>
      </form>

      <ul className="status-editor-list" aria-label="이슈 타입 목록">
        {types.map((def, index) => {
          const used = usage[def.id] ?? 0;
          return (
            <li key={def.id} className="status-editor-row status-editor-row--type">
              <span className="status-editor-glyph">
                <IssueTypeGlyph type={def.id} types={types} />
              </span>
              <TextField
                label={`${def.name} 이름`}
                value={drafts[def.id] ?? def.name}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))}
                onBlur={() => commitName(def)}
              />
              <Select
                label={`${def.name} 계층`}
                value={def.level}
                options={LEVEL_OPTIONS}
                disabled={def.builtIn || used > 0}
                onValueChange={(v) =>
                  void run("계층 변경 실패", () =>
                    updateIssueType(def.id, { level: v as IssueTypeLevel }),
                  )
                }
              />
              <Select
                label={`${def.name} 아이콘`}
                value={def.icon}
                options={TYPE_ICON_OPTIONS}
                onValueChange={(v) => void run("아이콘 변경 실패", () => updateIssueType(def.id, { icon: v }))}
              />
              <Select
                label={`${def.name} 색`}
                value={def.color}
                options={COLOR_OPTIONS}
                onValueChange={(v) =>
                  void run("색 변경 실패", () => updateIssueType(def.id, { color: v as StatusColor }))
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
                  onClick={() => void run("순서 변경 실패", () => moveIssueType(def.id, -1))}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 아래로`}
                  disabled={index === types.length - 1}
                  onClick={() => void run("순서 변경 실패", () => moveIssueType(def.id, 1))}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 삭제`}
                  disabled={def.builtIn || used > 0}
                  onClick={() => void run("이슈 타입 삭제 실패", () => deleteIssueType(def.id))}
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
