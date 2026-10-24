// alm-backend REST 어댑터 — 프로젝트 실시간 스트림(`GET /api/alm/projects/{id}/stream`, SSE)
import type { ProjectStreamHandlers } from "../types";
import { toBackendId } from "../mapping";
import { StreamError, readEventStream } from "../eventStream";
import { mapProjectStreamFrame } from "../realtimeMapping";
import { sharedApiFetch } from "./http";

/**
 * fetch 스트리밍이라 Authorization 헤더가 실린다(EventSource는 못 싣는다). 401이면 `sharedApiFetch`가 refresh 후 한 번
 * 더 시도한다. 재연결은 마지막 SSE id를 `Last-Event-ID` 헤더로 보내 그 다음부터 재생받는다.
 * 서버가 닫으면 resolve(30분 — 새 토큰으로 다시 붙는다), 끊기면 reject — 재연결은 호출측(`useReconnectingStream`).
 */
export async function streamProject(projectId: string, handlers: ProjectStreamHandlers): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (handlers.lastEventId) headers["Last-Event-ID"] = handlers.lastEventId;
  let response: Response;
  try {
    response = await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/stream`, {
      headers,
      cache: "no-store",
      signal: handlers.signal,
    });
  } catch (e) {
    if (handlers.signal.aborted) throw e;
    throw new StreamError("network", null, e instanceof Error ? e.message : String(e));
  }
  await readEventStream(response, {
    signal: handlers.signal,
    onOpen: handlers.onOpen,
    onActivity: handlers.onActivity,
    onFrame: (frame) => {
      const event = mapProjectStreamFrame(frame, projectId);
      if (event) handlers.onEvent(event);
    },
  });
}
