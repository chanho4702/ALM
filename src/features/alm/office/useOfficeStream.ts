import { useCallback, useEffect, useRef } from "react";
import { streamOffice } from "../store/jiraStore";
import type { OfficeStreamEvent } from "../store/types";
import { useReconnectingStream } from "../components/useReconnectingStream";
import type { StreamConnection } from "../components/useReconnectingStream";

/**
 * 사무실 무효화 스트림 클라이언트(P4c D-P4c-2 · agent-service §15). 신호에는 데이터가 없다 — 받으면 `onSignal`로
 * 사무실을 다시 조회하게 하고, 스트림이 건강한지(`live`)만 알려 준다(폴링 주기는 `useOfficeData`가 정한다).
 *
 * 재연결 규칙(백오프·429 60초·45초 무응답·탭 숨김 닫기·401/404 멈춤)은 공용 `useReconnectingStream`이 맡는다 —
 * 프로젝트 실시간 스트림과 같은 부품이다. 여기는 사무실 고유 규칙만:
 * - 신호 재조회는 1초에 1번까지(감사 신호가 도구 호출마다 온다) — 창 안 신호는 뒤끝(trailing) 1회로 모은다.
 * - 재연결로 다시 열리면 놓친 신호가 있을 수 있어 1회 재조회한다(사무실 스트림은 재생이 없다).
 */
export type OfficeStreamMode = "live" | "polling";

export {
  STREAM_BACKOFF_MIN_MS,
  STREAM_BACKOFF_MAX_MS,
  STREAM_RATE_LIMIT_RETRY_MS,
  STREAM_DEAD_AFTER_MS,
  streamBackoffMs,
} from "../components/useReconnectingStream";
export const STREAM_SIGNAL_THROTTLE_MS = 1_000;

export interface OfficeStreamOptions {
  /** 지터 난수(테스트 주입용) */
  random?: () => number;
}

export function useOfficeStream(
  projectId: string,
  onSignal: () => void,
  { random = Math.random }: OfficeStreamOptions = {},
): OfficeStreamMode {
  const signalRef = useRef(onSignal);
  useEffect(() => {
    signalRef.current = onSignal;
  }, [onSignal]);

  const throttle = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({
    last: Number.NEGATIVE_INFINITY,
    timer: null,
  });
  // 프로젝트가 바뀌거나 화면을 떠나면 뒤끝 재조회를 버린다
  useEffect(
    () => () => {
      const state = throttle.current;
      if (state.timer !== null) clearTimeout(state.timer);
      state.timer = null;
      state.last = Number.NEGATIVE_INFINITY;
    },
    [projectId],
  );

  const signal = useCallback(() => {
    const state = throttle.current;
    if (state.timer !== null) return;
    const fire = () => {
      state.last = Date.now();
      signalRef.current();
    };
    const wait = state.last + STREAM_SIGNAL_THROTTLE_MS - Date.now();
    if (wait <= 0) fire();
    else
      state.timer = setTimeout(() => {
        state.timer = null;
        fire();
      }, wait);
  }, []);

  const connect = useCallback(
    ({ signal: abort, onOpen, onActivity, onEvent }: StreamConnection<OfficeStreamEvent>) =>
      streamOffice(projectId || undefined, { signal: abort, onOpen, onActivity, onEvent }),
    [projectId],
  );

  const state = useReconnectingStream<OfficeStreamEvent>({
    key: `office:${projectId}`,
    connect,
    onEvent: () => signal(),
    onReopen: () => signal(),
    random,
  });

  return state === "live" ? "live" : "polling";
}
