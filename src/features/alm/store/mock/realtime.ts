// localStorage 목업 스토어 — 프로젝트 실시간 스트림 대역(서버 README "실시간 동기화")
//
// 목업은 한 사람(u1)이라 "남의 변경"이 생기지 않는다. 그래서 신호는 테스트·개발 훅(`__emitProjectStreamEvent`,
// `__simulateRemoteIssueChange`)으로만 흐른다. 연결 자체는 서버처럼 열려 있고 15초마다 heartbeat를 낸다.
import type { Issue, ProjectStreamEvent, ProjectStreamHandlers } from "../types";
import { StreamError } from "../eventStream";
import { ApiError } from "../mapping";
import { clone, load, persist } from "./db";

type Listener = { projectId: string; handlers: ProjectStreamHandlers };
const listeners = new Set<Listener>();
let enabled = true;
let seq = 0;

const nextEventId = () => `${Date.now()}-${seq++}`;

export async function streamProject(projectId: string, handlers: ProjectStreamHandlers): Promise<void> {
  if (!enabled) throw new StreamError("unsupported", 404);
  const { signal } = handlers;
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
  handlers.onOpen();
  handlers.onActivity();
  const listener: Listener = { projectId, handlers };
  listeners.add(listener);
  handlers.onEvent({ kind: "ready", projectId, replayed: 0, reset: false, eventId: nextEventId() });
  const heartbeat = setInterval(() => handlers.onActivity(), 15_000);
  try {
    await new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  } finally {
    clearInterval(heartbeat);
    listeners.delete(listener);
  }
}

/** 테스트·개발 — 신호 하나를 그 프로젝트 구독자에게(서버처럼 커밋 뒤 다음 틱) */
export function __emitProjectStreamEvent(event: ProjectStreamEvent): void {
  const withId = "eventId" in event && !event.eventId ? { ...event, eventId: nextEventId() } : event;
  setTimeout(() => {
    for (const listener of listeners) {
      if (listener.projectId !== event.projectId) continue;
      listener.handlers.onActivity();
      listener.handlers.onEvent(withId);
    }
  }, 0);
}

/**
 * 테스트·개발 — "다른 사람"이 이슈를 바꾼 것처럼: 저장소의 이슈를 고치고 version을 올린 뒤 issue.updated
 * (상태가 바뀌면 issue.transitioned) 신호를 낸다. 화면 데모(실시간 하이라이트 캡처)도 이걸 쓴다.
 */
export function __simulateRemoteIssueChange(
  issueKey: string,
  patch: Partial<Pick<Issue, "title" | "status" | "priority" | "assigneeId" | "storyPoints" | "labels">>,
  actorId = "u2",
): Issue {
  const data = load();
  const issue = data.issues.find((i) => i.key === issueKey);
  if (!issue) throw new ApiError(404, `이슈를 찾을 수 없습니다: ${issueKey}`);
  const changedFields = Object.keys(patch);
  Object.assign(issue, patch);
  issue.version += 1;
  issue.updatedAt = new Date().toISOString();
  persist();
  __emitProjectStreamEvent({
    kind: "issue",
    type: changedFields.includes("status") ? "issue.transitioned" : "issue.updated",
    projectId: issue.projectId,
    issueId: issue.id,
    issueKey: issue.key,
    version: issue.version,
    changedFields: changedFields.map((f) => (f === "assigneeId" ? "assignee" : f)),
    sprintId: null,
    actorId,
    at: issue.updatedAt,
    eventId: null,
  });
  return clone(issue);
}

/** 테스트 — 스트림을 끄면 연결이 unsupported(404)로 거절된다 */
export function __setMockProjectStream(on: boolean): void {
  enabled = on;
}

/** `__resetForTest` — 구독자를 비우고 켠다 */
export function resetMockProjectStream(): void {
  listeners.clear();
  enabled = true;
}

export function mockProjectStreamListenerCount(projectId?: string): number {
  return [...listeners].filter((l) => !projectId || l.projectId === projectId).length;
}
