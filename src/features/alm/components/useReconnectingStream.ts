import { useEffect, useRef, useState } from "react";
import { StreamError } from "../store/eventStream";

/**
 * 끊겨도 다시 붙는 fetch 스트림 훅 — 사무실 스트림(P4c)에서 일반화했다. 프로젝트 실시간 스트림도 같은 규칙을 쓴다.
 *
 * - 끊기면 1초 → 30초 지수 백오프(지터 = 기준의 50~100%)로 다시 붙는다. 연결되면 백오프를 처음부터.
 * - 401(refresh까지 실패)·403은 다시 붙지 않는다(`stopped`). 429(사용자당 상한)는 60초 뒤 다시 시도.
 *   스트림이 없는 환경(구 백엔드 404·목업 끔)도 붙지 않는다(`unsupported`).
 * - 45초 동안 바이트가 하나도 없으면(heartbeat 15초) 죽은 연결로 보고 끊은 뒤 다시 붙는다.
 * - 탭이 숨으면 닫고, 다시 보이면 곧바로 연다.
 * - 마지막으로 받은 SSE id를 기억해 재연결 때 넘긴다(`lastEventId`) — 서버가 그 다음부터 재생한다.
 * - 다시 열리면 `onReopen`(놓친 신호가 있을 수 있다 — id가 없었으면 호출측이 전체 재조회한다).
 * - `onEvent`가 `"stop"`을 돌려주면(권한 잃음 등) 닫고 다시 붙지 않는다.
 */
export type ReconnectingStreamState = "connecting" | "live" | "offline" | "unsupported" | "stopped";

export const STREAM_BACKOFF_MIN_MS = 1_000;
export const STREAM_BACKOFF_MAX_MS = 30_000;
export const STREAM_RATE_LIMIT_RETRY_MS = 60_000;
export const STREAM_DEAD_AFTER_MS = 45_000;

/** attempt번째(0부터) 재연결 대기 — 기준 min(30초, 1초·2^attempt)의 50~100% */
export function streamBackoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(STREAM_BACKOFF_MAX_MS, STREAM_BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + (random() * base) / 2);
}

export interface StreamConnection<E> {
  signal: AbortSignal;
  lastEventId: string | null;
  onOpen: () => void;
  onActivity: () => void;
  onEvent: (event: E) => void;
}

export interface UseReconnectingStreamOptions<E> {
  /** 바뀌면 다시 붙는다(프로젝트 id 등). null이면 붙지 않는다 */
  key: string | null;
  connect: (connection: StreamConnection<E>) => Promise<void>;
  onEvent: (event: E) => void | "stop";
  /** 이벤트의 SSE id — 재연결 위치로 기억한다 */
  eventIdOf?: (event: E) => string | null | undefined;
  /** 첫 연결이 아니라 다시 열렸을 때 */
  onReopen?: (info: { resumedFrom: string | null }) => void;
  /** 지터 난수(테스트 주입용) */
  random?: () => number;
}

export function useReconnectingStream<E>({
  key,
  connect,
  onEvent,
  eventIdOf,
  onReopen,
  random = Math.random,
}: UseReconnectingStreamOptions<E>): ReconnectingStreamState {
  const [state, setState] = useState<ReconnectingStreamState>("connecting");
  // 콜백·난수는 렌더마다 새로 와도 된다 — 연결은 key가 바뀔 때만 다시 맺는다
  const latest = useRef({ connect, onEvent, eventIdOf, onReopen, random });
  useEffect(() => {
    latest.current = { connect, onEvent, eventIdOf, onReopen, random };
  });

  useEffect(() => {
    if (key === null) {
      setState("unsupported");
      return;
    }
    setState("connecting");
    let disposed = false;
    /** 지금 살아 있는 연결 — 의도적으로 닫으면 null로 먼저 비워, 뒤늦은 reject를 실패로 세지 않는다 */
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let deadTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;
    let everOpened = false;
    let lastEventId: string | null = null;

    const clearDead = () => {
      if (deadTimer !== null) clearTimeout(deadTimer);
      deadTimer = null;
    };
    const clearRetry = () => {
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const failed = (ctrl: AbortController, error: unknown) => {
      if (controller !== ctrl) return;
      controller = null;
      clearDead();
      if (disposed) return;
      const kind = error instanceof StreamError ? error.kind : "network";
      if (kind === "unauthorized" || kind === "unsupported") {
        stopped = true;
        setState(kind === "unsupported" ? "unsupported" : "stopped");
        return;
      }
      setState("offline");
      const delay = kind === "rate-limited" ? STREAM_RATE_LIMIT_RETRY_MS : streamBackoffMs(attempt++, latest.current.random);
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        open();
      }, delay);
    };

    const armDead = (ctrl: AbortController) => {
      clearDead();
      deadTimer = setTimeout(() => {
        deadTimer = null;
        if (controller !== ctrl) return;
        ctrl.abort();
        failed(ctrl, new StreamError("network", null, "스트림 응답 없음(45초)"));
      }, STREAM_DEAD_AFTER_MS);
    };

    function open() {
      if (disposed || stopped || controller !== null || document.hidden) return;
      clearRetry();
      const ctrl = new AbortController();
      controller = ctrl;
      armDead(ctrl);
      const resumedFrom = lastEventId;
      latest.current
        .connect({
          signal: ctrl.signal,
          lastEventId,
          onOpen: () => {
            if (controller !== ctrl) return;
            attempt = 0;
            setState("live");
            if (everOpened) latest.current.onReopen?.({ resumedFrom });
            everOpened = true;
            armDead(ctrl);
          },
          onActivity: () => {
            if (controller === ctrl) armDead(ctrl);
          },
          onEvent: (event) => {
            if (controller !== ctrl) return;
            const id = latest.current.eventIdOf?.(event);
            if (id) lastEventId = id;
            if (latest.current.onEvent(event) === "stop") {
              stopped = true;
              controller = null;
              ctrl.abort();
              clearDead();
              setState("stopped");
            }
          },
        })
        .then(
          // 서버가 닫았다(30분 타임아웃 등) — 새 토큰으로 다시 붙는다
          () => failed(ctrl, new StreamError("network", null, "스트림 종료")),
          (error: unknown) => failed(ctrl, error),
        );
    }

    const close = () => {
      const ctrl = controller;
      controller = null;
      ctrl?.abort();
      clearDead();
      clearRetry();
    };

    const onVisibility = () => {
      if (document.hidden) {
        close();
        if (!stopped) setState("offline");
      } else {
        attempt = 0;
        open();
      }
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [key]);

  return state;
}
