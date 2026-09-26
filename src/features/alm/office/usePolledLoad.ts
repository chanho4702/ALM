import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadStatus } from "./useOfficeData";

/** 감독 화면(run 목록·상세·게이트 인박스) 폴링 주기 — 사무실(10초)보다 느긋하게 */
export const SUPERVISION_POLL_MS = 30_000;

export interface PolledLoad<T> {
  data: T | null;
  /** 첫 조회 상태 — error면 보여 줄 데이터가 없다 */
  status: LoadStatus;
  /** 첫 조회 실패 사유(오류 상태 문구) */
  error: string | null;
  /** 첫 로드 이후 조회가 실패했다 — 마지막 데이터를 유지하고 배너로 알린다 */
  stale: boolean;
  refreshing: boolean;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
}

/**
 * `load`를 즉시 한 번, 그 뒤 `intervalMs`마다 다시 부른다(`useOfficeData`와 같은 규칙: 탭이 숨으면 멈추고
 * 다시 보이면 즉시 1회 후 재개, 실패는 삼키지 않고 첫 로드면 error·이후면 stale).
 * `load`가 바뀌면(필터 등) 처음부터 다시 조회한다 — 호출측은 useCallback으로 고정한다.
 */
export function usePolledLoad<T>(load: () => Promise<T>, intervalMs = SUPERVISION_POLL_MS): PolledLoad<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const hasDataRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const tick = useCallback(async () => {
    const generation = generationRef.current;
    clearTimer();
    setRefreshing(true);
    try {
      const next = await load();
      if (generation !== generationRef.current) return;
      hasDataRef.current = true;
      setData(next);
      setStatus("ready");
      setError(null);
      setStale(false);
      setLastUpdated(Date.now());
    } catch (e) {
      if (generation !== generationRef.current) return;
      if (hasDataRef.current) setStale(true);
      else {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setRefreshing(false);
    if (!document.hidden) timerRef.current = setTimeout(() => void tick(), intervalMs);
  }, [load, intervalMs]);

  useEffect(() => {
    generationRef.current += 1;
    void tick();
    const onVisibility = () => {
      if (document.hidden) clearTimer();
      else void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generationRef.current += 1;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick]);

  return { data, status, error, stale, refreshing, lastUpdated, refresh: tick };
}
