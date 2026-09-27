import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, Spinner } from "@chanho/react";
import { formatDateTime, relTime } from "../components/time";

/** AI 팀 설정 구획 공용 — 조회 상태·재시도·시각 표기(AiTeamSettings·실행 위치/러너 카드) */

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 서버가 준 시각이 없거나 깨졌으면 "—" — "Invalid Date"를 그리지 않는다 */
export function When({ iso, format = relTime }: { iso: string | null; format?: (iso: string) => string }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return <span className="ai-team-subtle">—</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {format(iso)}
    </time>
  );
}

export type Load<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

/** 한 번 조회 + 수동 재조회. 프로젝트가 바뀌면 늦게 온 이전 응답을 버린다 */
export function useLoad<T>(loader: (() => Promise<T>) | null): [Load<T>, () => Promise<void>] {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!loader) return;
    const mine = ++generation.current;
    try {
      const data = await loader();
      if (mine === generation.current) setState({ status: "ready", data });
    } catch (error) {
      if (mine === generation.current) setState({ status: "error", error: errorText(error) });
    }
  }, [loader]);
  useEffect(() => {
    setState({ status: "loading" });
    void reload();
  }, [reload]);
  return [state, reload];
}

export function LoadState({ load, label, errorTitle, onRetry }: {
  load: Load<unknown>;
  label: string;
  errorTitle: string;
  onRetry: () => void;
}) {
  if (load.status === "loading") return <Spinner label={label} />;
  if (load.status === "error") {
    return (
      <EmptyState
        title={errorTitle}
        description={`agent-service 연결을 확인하세요 — ${load.error}`}
        primaryAction={{ label: "다시 시도", onClick: onRetry }}
      />
    );
  }
  return null;
}
