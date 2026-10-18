import { useEffect, useRef, useState } from "react";
import { streamOffice } from "../store/jiraStore";
import { OfficeStreamError } from "../store/officeStream";

/**
 * 사무실 무효화 스트림 클라이언트(P4c D-P4c-2 · agent-service §15). 신호에는 데이터가 없다 — 받으면 `onSignal`로
 * 사무실을 다시 조회하게 하고, 스트림이 건강한지(`live`)만 알려 준다(폴링 주기는 `useOfficeData`가 정한다).
 *
 * - 신호 재조회는 1초에 1번까지(감사 신호가 도구 호출마다 온다) — 창 안 신호는 뒤끝(trailing) 1회로 모은다.
 * - 끊기면 1초 → 30초 지수 백오프(지터 = 기준의 50~100%)로 다시 붙는다. 연결되면 백오프를 처음부터.
 * - 401(refresh까지 실패)·403은 다시 붙지 않는다. 429(사용자당 5개)는 폴링으로 두고 60초 뒤 다시 시도.
 *   스트림이 없는 환경(구 백엔드 404·목업 테스트)도 폴링만.
 * - 45초 동안 바이트가 하나도 없으면(heartbeat 15초) 죽은 연결로 보고 끊은 뒤 다시 붙는다.
 * - 탭이 숨으면 닫고, 다시 보이면 곧바로 연다. 재연결로 다시 열리면 놓친 신호가 있을 수 있어 1회 재조회한다.
 */
export type OfficeStreamMode = "live" | "polling";

export const STREAM_BACKOFF_MIN_MS = 1_000;
export const STREAM_BACKOFF_MAX_MS = 30_000;
export const STREAM_RATE_LIMIT_RETRY_MS = 60_000;
export const STREAM_DEAD_AFTER_MS = 45_000;
export const STREAM_SIGNAL_THROTTLE_MS = 1_000;

/** attempt번째(0부터) 재연결 대기 — 기준 min(30초, 1초·2^attempt)의 50~100% */
export function streamBackoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(STREAM_BACKOFF_MAX_MS, STREAM_BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + (random() * base) / 2);
}

export interface OfficeStreamOptions {
  /** 지터 난수(테스트 주입용) */
  random?: () => number;
}

export function useOfficeStream(
  projectId: string,
  onSignal: () => void,
  { random = Math.random }: OfficeStreamOptions = {},
): OfficeStreamMode {
  const [mode, setMode] = useState<OfficeStreamMode>("polling");
  const signalRef = useRef(onSignal);
  useEffect(() => {
    signalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    let disposed = false;
    /** 지금 살아 있는 연결 — 의도적으로 닫으면 null로 먼저 비워, 뒤늦은 reject를 실패로 세지 않는다 */
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let deadTimer: ReturnType<typeof setTimeout> | null = null;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    /** 다시 붙지 않는다(401·스트림 없음) */
    let stopped = false;
    let everOpened = false;
    let lastSignalAt = Number.NEGATIVE_INFINITY;

    const fire = () => {
      lastSignalAt = Date.now();
      signalRef.current();
    };
    const signal = () => {
      if (trailingTimer !== null) return;
      const wait = lastSignalAt + STREAM_SIGNAL_THROTTLE_MS - Date.now();
      if (wait <= 0) fire();
      else
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          if (!disposed) fire();
        }, wait);
    };

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
      setMode("polling");
      if (disposed) return;
      const kind = error instanceof OfficeStreamError ? error.kind : "network";
      if (kind === "unauthorized" || kind === "unsupported") {
        stopped = true;
        return;
      }
      const delay = kind === "rate-limited" ? STREAM_RATE_LIMIT_RETRY_MS : streamBackoffMs(attempt++, random);
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    const armDead = (ctrl: AbortController) => {
      clearDead();
      deadTimer = setTimeout(() => {
        deadTimer = null;
        if (controller !== ctrl) return;
        ctrl.abort();
        failed(ctrl, new OfficeStreamError("network", null, "사무실 스트림 응답 없음(45초)"));
      }, STREAM_DEAD_AFTER_MS);
    };

    function connect() {
      if (disposed || stopped || controller !== null || document.hidden) return;
      clearRetry();
      const ctrl = new AbortController();
      controller = ctrl;
      armDead(ctrl);
      streamOffice(projectId || undefined, {
        signal: ctrl.signal,
        onOpen: () => {
          if (controller !== ctrl) return;
          attempt = 0;
          setMode("live");
          if (everOpened) signal();
          everOpened = true;
          armDead(ctrl);
        },
        onActivity: () => {
          if (controller === ctrl) armDead(ctrl);
        },
        onEvent: () => {
          if (controller === ctrl) signal();
        },
      }).then(
        // 서버가 닫았다(30분 타임아웃 등) — 새 토큰으로 다시 붙는다
        () => failed(ctrl, new OfficeStreamError("network", null, "사무실 스트림 종료")),
        (error: unknown) => failed(ctrl, error),
      );
    }

    const close = () => {
      const ctrl = controller;
      controller = null;
      ctrl?.abort();
      clearDead();
      clearRetry();
      setMode("polling");
    };

    const onVisibility = () => {
      if (document.hidden) close();
      else {
        attempt = 0;
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      close();
      if (trailingTimer !== null) clearTimeout(trailingTimer);
    };
  }, [projectId, random]);

  return mode;
}
