import { useEffect, useState } from "react";
import { Button, useToast } from "@chanho/react";
import { Eye, EyeOff } from "lucide-react";
import type { WatchersView } from "../store/jiraStore";
import { listWatchers, unwatchIssue, watchIssue } from "../store/jiraStore";

/**
 * 관심 등록 토글 — 눌러 워처가 되면 상태 변경·코멘트 알림을 받는다. 숫자는 워처 수,
 * 제목(title)에 워처 이름을 나열해 누가 보고 있는지 알 수 있다.
 */
export function WatchButton({
  issueId,
  userNames,
}: {
  issueId: string;
  userNames: Record<string, string>;
}) {
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
  const count = view?.watchers.length ?? 0;
  const names = view?.watchers.map((w) => userNames[w.userId] ?? w.userId).join(", ") ?? "";

  return (
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
  );
}
