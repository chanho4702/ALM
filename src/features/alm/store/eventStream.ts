/**
 * fetch 스트리밍 SSE 공용 부품 — 사무실 스트림(P4c)과 프로젝트 실시간 스트림(Linear식, 2026-10-24)이 같이 쓴다.
 * EventSource는 Authorization 헤더를 못 실어서, 인증 fetch(`sharedApiFetch`)로 받은 본문을 SSE 파서로 푼다.
 * 재연결·폴백 판단은 화면 훅(`useReconnectingStream`)이 오류 종류로 한다.
 */
import { createSseParser, type SseFrame } from "./sse";

/**
 * - `unauthorized`: 401(refresh 재시도까지 실패)·403(볼 권한 없음) — 다시 붙지 않는다.
 * - `rate-limited`: 429(사용자당 연결 상한) — 60초 뒤 다시 시도.
 * - `unsupported`: 스트림이 없는 환경(구 백엔드 404·405·목업 끔) — 붙지 않는다.
 * - `network`: 그 밖(5xx·끊김·본문 없음) — 백오프로 재연결.
 */
export type StreamFailure = "unauthorized" | "rate-limited" | "unsupported" | "network";

export class StreamError extends Error {
  readonly kind: StreamFailure;
  readonly status: number | null;

  constructor(kind: StreamFailure, status: number | null = null, message?: string) {
    super(message ?? `스트림 ${kind}${status !== null ? `(${status})` : ""}`);
    this.name = "StreamError";
    this.kind = kind;
    this.status = status;
  }
}

export function streamFailureOf(status: number): StreamFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate-limited";
  if (status === 404 || status === 405) return "unsupported";
  return "network";
}

export interface EventStreamReader {
  signal: AbortSignal;
  /** 200 응답을 받았다 */
  onOpen: () => void;
  /** 바이트가 왔다(heartbeat 주석 포함) — 생존 판정 */
  onActivity: () => void;
  onFrame: (frame: SseFrame) => void;
}

/**
 * 200 응답 본문을 끝까지 읽는다 — 서버가 스트림을 닫으면(30분 타임아웃 등) 정상 종료로 resolve, 끊기면 reject.
 * 중단(`signal`)은 fetch/reader가 AbortError로 reject한다. 실패 응답은 `makeError`로 종류별 오류를 만든다.
 */
export async function readEventStream(
  response: Response,
  reader: EventStreamReader,
  makeError: (kind: StreamFailure, status: number | null, message?: string) => Error = (kind, status, message) =>
    new StreamError(kind, status, message),
): Promise<void> {
  if (!response.ok) throw makeError(streamFailureOf(response.status), response.status);
  if (!response.body) throw makeError("network", response.status, "스트림 본문이 없습니다");
  reader.onOpen();
  const parser = createSseParser(reader.onFrame);
  const body = response.body.getReader();
  const decoder = new TextDecoder();
  const abort = () => void body.cancel().catch(() => undefined);
  reader.signal.addEventListener("abort", abort);
  try {
    for (;;) {
      const { done, value } = await body.read();
      if (reader.signal.aborted) throw new DOMException("aborted", "AbortError");
      if (done) break;
      reader.onActivity();
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    reader.signal.removeEventListener("abort", abort);
  }
}
