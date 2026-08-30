import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button, Card, TextField, useToast } from "@chanho/react";
import type { ProjectShortcut } from "../store/types";
import { addProjectShortcut, listProjectShortcuts, removeProjectShortcut } from "../store/jiraStore";

/** 프로젝트 헤더가 목록을 다시 읽도록 쏘는 이벤트 */
export const SHORTCUTS_CHANGED_EVENT = "alm:shortcuts-changed";

export interface ProjectShortcutsPanelProps {
  projectId: string;
  canManage: boolean;
}

/** 바로 가기(지라 프로젝트 사이드바 "바로 가기") — 위키·저장소·대시보드 같은 외부 링크 */
export function ProjectShortcutsPanel({ projectId, canManage }: ProjectShortcutsPanelProps) {
  const toast = useToast();
  const [shortcuts, setShortcuts] = useState<ProjectShortcut[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setShortcuts(await listProjectShortcuts(projectId));
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const notify = () => window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT));

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await addProjectShortcut(projectId, { name, url });
      setName("");
      setUrl("");
      await reload();
      notify();
      toast({ title: "바로 가기를 추가했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "추가 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (shortcut: ProjectShortcut) => {
    try {
      await removeProjectShortcut(shortcut.id);
      await reload();
      notify();
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Card padding="lg" title="바로 가기">
      <p className="settings-help">
        프로젝트 머리에 놓이는 외부 링크입니다 — 팀 위키, 저장소, 모니터링 대시보드처럼 자주 여는 곳.
      </p>
      {shortcuts.length === 0 ? (
        <p className="settings-empty">아직 바로 가기가 없습니다.</p>
      ) : (
        <ul className="shortcut-list" aria-label="바로 가기 목록">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.id} className="shortcut-row">
              <a href={shortcut.url} target="_blank" rel="noreferrer" className="shortcut-link">
                <ExternalLink size={14} aria-hidden />
                <span>{shortcut.name}</span>
                <span className="shortcut-url">{shortcut.url}</span>
              </a>
              {canManage ? (
                <Button
                  size="small"
                  variant="ghost"
                  iconOnly
                  aria-label={`${shortcut.name} 삭제`}
                  onClick={() => void handleRemove(shortcut)}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form className="shortcut-form" onSubmit={handleAdd}>
          <TextField label="바로 가기 이름" value={name} onChange={(e) => setName(e.target.value)} placeholder="팀 위키" />
          <TextField
            label="바로 가기 URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
          <Button type="submit" size="small" disabled={busy || !name.trim() || !url.trim()}>
            추가
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
