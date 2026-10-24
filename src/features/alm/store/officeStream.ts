/**
 * 사무실 무효화 스트림(P4c §15) — 응답 본문을 읽어 `office` 프레임만 신호로 올린다. 읽기·오류 분류는 공용
 * `eventStream`(프로젝트 실시간 스트림과 같은 부품)이고, 재연결·폴백 판단은 화면 훅(`useOfficeStream`)이 오류 종류로 한다.
 */
import type { OfficeStreamHandlers } from "./types";
import { mapOfficeStreamEvent } from "./agentMapping";
import { StreamError, readEventStream, streamFailureOf as sharedFailureOf } from "./eventStream";
import type { StreamFailure } from "./eventStream";

/**
 * - `unauthorized`: 401(refresh 재시도까지 실패)·403 — 다시 붙지 않는다.
 * - `rate-limited`: 429(사용자당 연결 상한) — 폴링으로 두고 60초 뒤 다시 시도.
 * - `unsupported`: 스트림이 없는 환경(구 백엔드 404·목업 테스트) — 폴링만.
 * - `network`: 그 밖(5xx·끊김·본문 없음) — 백오프로 재연결.
 */
export type OfficeStreamFailure = StreamFailure;

/** 공용 StreamError의 사무실판 — 문구만 다르다(재연결 훅은 StreamError로 종류를 본다) */
export class OfficeStreamError extends StreamError {
  constructor(kind: OfficeStreamFailure, status: number | null = null, message?: string) {
    super(kind, status, message ?? `사무실 스트림 ${kind}${status !== null ? `(${status})` : ""}`);
    this.name = "OfficeStreamError";
  }
}

export const streamFailureOf = sharedFailureOf;

/**
 * 200 응답 본문을 끝까지 읽는다 — 서버가 스트림을 닫으면(30분 타임아웃 등) 정상 종료로 resolve, 끊기면 reject.
 * 중단(`signal`)은 fetch/reader가 AbortError로 reject한다.
 */
export async function readOfficeStream(response: Response, handlers: OfficeStreamHandlers): Promise<void> {
  await readEventStream(
    response,
    {
      signal: handlers.signal,
      onOpen: handlers.onOpen,
      onActivity: handlers.onActivity,
      onFrame: (frame) => {
        if (frame.event !== "office") return;
        // 모양이 낯선 신호도 "뭔가 바뀌었다"로 본다 — 재조회가 정본이라 손해가 없다
        handlers.onEvent(mapOfficeStreamEvent(frame.data) ?? { reason: null, projectId: null, at: null });
      },
    },
    (kind, status, message) =>
      new OfficeStreamError(kind, status, message === "스트림 본문이 없습니다" ? "사무실 스트림 본문이 없습니다" : message),
  );
}
