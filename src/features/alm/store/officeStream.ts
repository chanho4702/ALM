/**
 * 사무실 무효화 스트림(P4c §15) 공용 부품 — 응답 본문을 읽어 SSE 프레임으로 풀고, 연결 실패를 종류별 오류로 올린다.
 * REST 어댑터(`jiraApi.streamOffice`)가 쓰고, 재연결·폴백 판단은 화면 훅(`useOfficeStream`)이 오류 종류로 한다.
 */
import type { OfficeStreamHandlers } from "./types";
import { mapOfficeStreamEvent } from "./agentMapping";
import { createSseParser } from "./sse";

/**
 * - `unauthorized`: 401(refresh 재시도까지 실패)·403 — 다시 붙지 않는다.
 * - `rate-limited`: 429(사용자당 연결 상한) — 폴링으로 두고 60초 뒤 다시 시도.
 * - `unsupported`: 스트림이 없는 환경(구 백엔드 404·목업 테스트) — 폴링만.
 * - `network`: 그 밖(5xx·끊김·본문 없음) — 백오프로 재연결.
 */
export type OfficeStreamFailure = "unauthorized" | "rate-limited" | "unsupported" | "network";

export class OfficeStreamError extends Error {
  readonly kind: OfficeStreamFailure;
  readonly status: number | null;

  constructor(kind: OfficeStreamFailure, status: number | null = null, message?: string) {
    super(message ?? `사무실 스트림 ${kind}${status !== null ? `(${status})` : ""}`);
    this.name = "OfficeStreamError";
    this.kind = kind;
    this.status = status;
  }
}

export function streamFailureOf(status: number): OfficeStreamFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate-limited";
  if (status === 404 || status === 405) return "unsupported";
  return "network";
}

/**
 * 200 응답 본문을 끝까지 읽는다 — 서버가 스트림을 닫으면(30분 타임아웃 등) 정상 종료로 resolve, 끊기면 reject.
 * 중단(`signal`)은 fetch/reader가 AbortError로 reject한다.
 */
export async function readOfficeStream(response: Response, handlers: OfficeStreamHandlers): Promise<void> {
  if (!response.ok) throw new OfficeStreamError(streamFailureOf(response.status), response.status);
  if (!response.body) throw new OfficeStreamError("network", response.status, "사무실 스트림 본문이 없습니다");
  handlers.onOpen();
  const parser = createSseParser((frame) => {
    if (frame.event !== "office") return;
    // 모양이 낯선 신호도 "뭔가 바뀌었다"로 본다 — 재조회가 정본이라 손해가 없다
    handlers.onEvent(mapOfficeStreamEvent(frame.data) ?? { reason: null, projectId: null, at: null });
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const abort = () => void reader.cancel().catch(() => undefined);
  handlers.signal.addEventListener("abort", abort);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (handlers.signal.aborted) throw new DOMException("aborted", "AbortError");
      if (done) break;
      handlers.onActivity();
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    handlers.signal.removeEventListener("abort", abort);
  }
}
