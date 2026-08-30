import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, Lozenge, TextField, useToast } from "@chanho/react";
import type { LinkTypeDef } from "../store/types";
import {
  createLinkType,
  deleteLinkType,
  linkTypeUsage,
  listLinkTypes,
  moveLinkType,
  updateLinkType,
} from "../store/jiraStore";

type Field = "name" | "outward" | "inward";

/**
 * 전역 관리 → 링크 타입(지라 "업무 항목 연결"). 나가는 문구/들어오는 문구가 링크 양 끝의 제목이 되고,
 * 둘이 같으면 대칭(양방향) 링크다. 쓰이는 타입은 대칭 여부를 못 바꾸고 지울 수 없다.
 */
export function LinkTypesPanel() {
  const toast = useToast();
  const [types, setTypes] = useState<LinkTypeDef[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Record<Field, string>>>({});
  const [draft, setDraft] = useState<Record<Field, string>>({ name: "", outward: "", inward: "" });

  const reload = useCallback(async () => {
    const [list, used] = await Promise.all([listLinkTypes(), linkTypeUsage()]);
    setTypes(list);
    setUsage(used);
    setDrafts(Object.fromEntries(list.map((t) => [t.id, { name: t.name, outward: t.outward, inward: t.inward }])));
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
    void run("링크 타입 추가 실패", async () => {
      await createLinkType(draft);
      setDraft({ name: "", outward: "", inward: "" });
      toast({ title: "링크 타입을 추가했습니다", appearance: "success" });
    });
  };

  const commit = (def: LinkTypeDef, field: Field) => {
    const value = (drafts[def.id]?.[field] ?? "").trim();
    if (!value || value === def[field]) return;
    void run("변경 실패", () => updateLinkType(def.id, { [field]: value }));
  };

  return (
    <Card padding="lg" title="링크 타입">
      <p className="admin-scheme-note">
        나가는 문구는 링크를 건 쪽에서, 들어오는 문구는 걸린 쪽에서 보이는 제목입니다(차단함 / 차단됨). 두 문구가
        같으면 방향 없는 양방향 링크(관련됨)입니다. 기본 5종은 지울 수 없습니다.
      </p>

      <form className="status-editor-add status-editor-add--3" onSubmit={handleCreate}>
        <TextField
          label="새 타입 이름"
          placeholder="예: 의존"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <TextField
          label="나가는 문구"
          placeholder="예: 의존함"
          value={draft.outward}
          onChange={(e) => setDraft((d) => ({ ...d, outward: e.target.value }))}
        />
        <TextField
          label="들어오는 문구"
          placeholder="예: 의존됨"
          value={draft.inward}
          onChange={(e) => setDraft((d) => ({ ...d, inward: e.target.value }))}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={!draft.name.trim() || !draft.outward.trim() || !draft.inward.trim()}
        >
          링크 타입 추가
        </Button>
      </form>

      <ul className="status-editor-list" aria-label="링크 타입 목록">
        {types.map((def, index) => {
          const used = usage[def.id] ?? 0;
          const symmetric = def.outward === def.inward;
          return (
            <li key={def.id} className="status-editor-row status-editor-row--type">
              <span className="status-editor-glyph">
                <Lozenge appearance={symmetric ? "neutral" : "info"}>{symmetric ? "양방향" : "방향"}</Lozenge>
              </span>
              {(["name", "outward", "inward"] as Field[]).map((field) => (
                <TextField
                  key={field}
                  label={`${def.name} ${field === "name" ? "이름" : field === "outward" ? "나가는 문구" : "들어오는 문구"}`}
                  value={drafts[def.id]?.[field] ?? def[field]}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [def.id]: { ...prev[def.id], [field]: e.target.value } }))
                  }
                  onBlur={() => commit(def, field)}
                />
              ))}
              <span className="status-editor-usage">링크 {used}개</span>
              <div className="status-editor-row-actions">
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 위로`}
                  disabled={index === 0}
                  onClick={() => void run("순서 변경 실패", () => moveLinkType(def.id, -1))}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 아래로`}
                  disabled={index === types.length - 1}
                  onClick={() => void run("순서 변경 실패", () => moveLinkType(def.id, 1))}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`${def.name} 삭제`}
                  disabled={def.builtIn || used > 0}
                  onClick={() => void run("링크 타입 삭제 실패", () => deleteLinkType(def.id))}
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
