import { useEffect, useState } from "react";
import { Button, Dropdown, useToast } from "@chanho/react";
import { Eye, EyeOff } from "lucide-react";
import type { WatchersView } from "../store/jiraStore";
import { listWatchers, unwatchIssue, watchIssue } from "../store/jiraStore";
import type { User } from "../store/types";
import { UserAvatar } from "./UserAvatar";

/** 스택에 얼굴로 보여주는 최대 인원 — 나머지는 `+n`으로 접는다(지라와 동일) */
const STACK_MAX = 3;

/**
 * 관심 등록 토글 + 워처 얼굴 스택 — 눌러 워처가 되면 상태 변경·코멘트 알림을 받는다.
 * 숫자는 토글 버튼 안의 워처 수이고, 왼쪽 아바타 스택(최대 3명 + `+n`)을 누르면
 * 전원 이름이 드롭다운으로 열린다. 스택 버튼의 접근 이름이 이름 목록을 그대로 읽어준다.
 */
export function WatchButton({ issueId, users }: { issueId: string; users: User[] }) {
  const toast = useToast();
  const [view, setView] = useState<WatchersView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    void listWatchers(issueId).then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const toggle = async () => {
    if (!view) return;
    setBusy(true);
    try {
      setView(view.watching ? await unwatchIssue(issueId) : await watchIssue(issueId));
    } catch (error) {
      toast({
        title: "관심 등록 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const watching = view?.watching ?? false;
  const watchers = view?.watchers ?? [];
  const count = watchers.length;
  const userOf = (id: string) => users.find((u) => u.id === id);
  const nameOf = (id: string) => userOf(id)?.name ?? id;
  const names = watchers.map((w) => nameOf(w.userId)).join(", ");
  const shown = watchers.slice(0, STACK_MAX);
  const hidden = count - shown.length;

  return (
    <div className="watch-control">
      {count > 0 ? (
        <Dropdown
          align="end"
          trigger={
            <button
              type="button"
              className="watcher-stack"
              aria-label={`관찰자 ${count}명: ${names}`}
              title={names}
            >
              {shown.map((w) => (
                <UserAvatar
                  key={w.userId}
                  className="watcher-stack-face"
                  user={userOf(w.userId)}
                  name={nameOf(w.userId)}
                  size="small"
                />
              ))}
              {hidden > 0 ? (
                <span className="watcher-stack-more" aria-hidden="true">
                  +{hidden}
                </span>
              ) : null}
            </button>
          }
          items={[
            { heading: `관찰자 ${count}명` },
            ...watchers.map((w) => ({
              label: nameOf(w.userId),
              icon: <UserAvatar user={userOf(w.userId)} name={nameOf(w.userId)} size="small" />,
            })),
          ]}
        />
      ) : null}
      <Button
        type="button"
        size="small"
        variant={watching ? "secondary" : "ghost"}
        aria-pressed={watching}
        aria-label={watching ? "관심 해제" : "관심 등록"}
        title={names ? `관심: ${names}` : "아직 관심 등록한 사람이 없습니다"}
        disabled={busy || view === null}
        onClick={() => void toggle()}
      >
        {watching ? <Eye size={16} /> : <EyeOff size={16} />}
        <span className="watch-button-count">{count}</span>
      </Button>
    </div>
  );
}
