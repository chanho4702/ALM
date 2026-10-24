import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { mapProjectStreamFrame } from "../../store/realtimeMapping";
import type { IssueStreamEvent } from "../../store/types";
import { StreamError } from "../../store/eventStream";
import { decideIssueEvent, isDevelopmentOnlyEvent } from "./ProjectRealtime";
import { useReconnectingStream } from "../useReconnectingStream";
import type { StreamConnection } from "../useReconnectingStream";

const issueEvent = (patch: Partial<IssueStreamEvent> = {}): IssueStreamEvent => ({
  kind: "issue",
  type: "issue.updated",
  projectId: "7",
  issueId: "123",
  issueKey: "ALM-12",
  version: 5,
  changedFields: ["assignee"],
  sprintId: null,
  actorId: "42",
  at: null,
  eventId: "1-0",
  ...patch,
});

describe("프로젝트 스트림 프레임 매핑(README 형식)", () => {
  it("issue·sprint·ready·reset·revoked — id는 문자열, SSE id를 싣는다", () => {
    const issue = mapProjectStreamFrame(
      {
        event: "issue",
        id: "1729760001234-0",
        data: '{"type":"issue.updated","projectId":7,"issueId":123,"issueKey":"ALM-12","version":5,"changedFields":["assignee","storyPoints"],"actorId":42,"at":"2026-10-24T03:00:01.234Z"}',
      },
      "7",
    );
    expect(issue).toEqual({
      kind: "issue",
      type: "issue.updated",
      projectId: "7",
      issueId: "123",
      issueKey: "ALM-12",
      version: 5,
      changedFields: ["assignee", "storyPoints"],
      sprintId: null,
      actorId: "42",
      at: "2026-10-24T03:00:01.234Z",
      eventId: "1729760001234-0",
    });
    expect(mapProjectStreamFrame({ event: "issue", data: '{"type":"issue.ranked","issueId":124,"sprintId":12,"version":3,"actorId":42}' }, "7")).toMatchObject({
      type: "issue.ranked",
      sprintId: "12",
    });
    expect(mapProjectStreamFrame({ event: "sprint", data: '{"type":"sprint.completed","projectId":7,"sprintId":12,"version":3,"actorId":42}' }, "7")).toMatchObject({
      kind: "sprint",
      type: "sprint.completed",
      sprintId: "12",
    });
    expect(mapProjectStreamFrame({ event: "ready", data: '{"projectId":7,"replayed":3,"reset":false,"heartbeatSeconds":15}' }, "7")).toMatchObject({
      kind: "ready",
      replayed: 3,
      reset: false,
    });
    expect(mapProjectStreamFrame({ event: "reset", data: '{"projectId":7,"reason":"gap"}' }, "7")).toMatchObject({ kind: "reset", reason: "gap" });
    expect(mapProjectStreamFrame({ event: "revoked", data: '{"projectId":7}' }, "7")).toEqual({ kind: "revoked", projectId: "7" });
  });

  it("모양이 낯선 issue 프레임은 reset으로 접고(전체 재조회), 모르는 event는 버린다", () => {
    expect(mapProjectStreamFrame({ event: "issue", data: "not json" }, "7")).toMatchObject({ kind: "reset", reason: "malformed" });
    expect(mapProjectStreamFrame({ event: "issue", data: '{"type":"issue.exploded","issueId":1}' }, "7")).toMatchObject({ kind: "reset" });
    expect(mapProjectStreamFrame({ event: "presence", data: "{}" }, "7")).toBeNull();
  });
});

describe("이슈 신호 판정 — 버전 비교로 중복·역순·자기 변경 무시", () => {
  it("내 변경의 메아리(같은 version 이상을 이미 가짐)는 무시, 더 새 version이면 다시 읽는다", () => {
    expect(decideIssueEvent(issueEvent({ actorId: "me", version: 5 }), 5, "me")).toBe("ignore");
    expect(decideIssueEvent(issueEvent({ actorId: "me", version: 6 }), 5, "me")).toBe("refetch");
  });

  it("남의 변경 — 늦게 온 옛 신호(역순)는 무시, 같은 version은 다시 읽는다(version을 안 올리는 변경)", () => {
    expect(decideIssueEvent(issueEvent({ version: 4 }), 5, "me")).toBe("ignore");
    expect(decideIssueEvent(issueEvent({ version: 5 }), 5, "me")).toBe("refetch");
    expect(decideIssueEvent(issueEvent({ version: 6 }), 5, "me")).toBe("refetch");
    expect(decideIssueEvent(issueEvent({ version: 6 }), undefined, "me")).toBe("refetch");
  });

  it("삭제·보관은 빼고, 순서만 바뀜은 다시 읽는다(내 랭크는 이미 반영)", () => {
    expect(decideIssueEvent(issueEvent({ type: "issue.deleted", version: null }), 5, "me")).toBe("remove");
    expect(decideIssueEvent(issueEvent({ type: "issue.archived", version: null }), 5, "me")).toBe("remove");
    expect(decideIssueEvent(issueEvent({ type: "issue.ranked" }), 5, "me")).toBe("reload");
    expect(decideIssueEvent(issueEvent({ type: "issue.ranked", actorId: "me" }), 5, "me")).toBe("ignore");
  });
});

describe("개발 정보만 바뀐 신호(V41 커밋 연결)", () => {
  it("issue.updated + changedFields [development]만 — 다른 필드가 섞이거나 종류가 다르면 아니다", () => {
    expect(isDevelopmentOnlyEvent(issueEvent({ changedFields: ["development"] }))).toBe(true);
    expect(isDevelopmentOnlyEvent(issueEvent({ changedFields: ["development", "title"] }))).toBe(false);
    expect(isDevelopmentOnlyEvent(issueEvent({ changedFields: [] }))).toBe(false);
    expect(isDevelopmentOnlyEvent(issueEvent({ type: "issue.transitioned", changedFields: ["development"] }))).toBe(false);
  });
});

describe("useReconnectingStream — 재연결·Last-Event-ID·멈춤", () => {
  afterEach(() => vi.useRealTimers());

  /** 연결 하나를 손으로 열고 닫는 가짜 connect */
  function fakeConnect() {
    const conns: { conn: StreamConnection<{ id: string; stop?: boolean }>; fail: (e: unknown) => void; end: () => void }[] = [];
    const connect = (conn: StreamConnection<{ id: string; stop?: boolean }>) =>
      new Promise<void>((resolve, reject) => {
        conns.push({ conn, fail: reject, end: resolve });
      });
    return { conns, connect };
  }

  it("받은 마지막 id를 다시 붙을 때 넘기고, 다시 열리면 onReopen(resumedFrom)", async () => {
    vi.useFakeTimers();
    const { conns, connect } = fakeConnect();
    const reopen = vi.fn();
    const events: string[] = [];
    const { result } = renderHook(() =>
      useReconnectingStream<{ id: string }>({
        key: "p1",
        connect,
        eventIdOf: (e) => e.id,
        onEvent: (e) => {
          events.push(e.id);
        },
        onReopen: reopen,
        random: () => 0,
      }),
    );
    expect(conns).toHaveLength(1);
    expect(conns[0].conn.lastEventId).toBeNull();
    act(() => {
      conns[0].conn.onOpen();
      conns[0].conn.onEvent({ id: "1-0" });
      conns[0].conn.onEvent({ id: "2-0" });
    });
    expect(result.current).toBe("live");
    expect(events).toEqual(["1-0", "2-0"]);
    await act(async () => conns[0].fail(new StreamError("network", 502)));
    expect(result.current).toBe("offline");
    await act(async () => vi.advanceTimersByTime(500)); // 백오프 0번째 = 0.5초(random 0)
    expect(conns).toHaveLength(2);
    expect(conns[1].conn.lastEventId).toBe("2-0");
    act(() => conns[1].conn.onOpen());
    expect(reopen).toHaveBeenCalledWith({ resumedFrom: "2-0" });
    expect(result.current).toBe("live");
  });

  it("onEvent가 stop이면(권한 잃음) 닫고 다시 붙지 않는다 · 403은 stopped · 404는 unsupported", async () => {
    vi.useFakeTimers();
    const { conns, connect } = fakeConnect();
    const { result } = renderHook(() =>
      useReconnectingStream<{ id: string; stop?: boolean }>({
        key: "p1",
        connect,
        onEvent: (e) => (e.stop ? "stop" : undefined),
        random: () => 0,
      }),
    );
    act(() => {
      conns[0].conn.onOpen();
      conns[0].conn.onEvent({ id: "x", stop: true });
    });
    expect(result.current).toBe("stopped");
    expect(conns[0].conn.signal.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(conns).toHaveLength(1);

    const second = fakeConnect();
    const forbidden = renderHook(() => useReconnectingStream({ key: "p2", connect: second.connect, onEvent: () => undefined }));
    await act(async () => second.conns[0].fail(new StreamError("unauthorized", 403)));
    expect(forbidden.result.current).toBe("stopped");

    const third = fakeConnect();
    const missing = renderHook(() => useReconnectingStream({ key: "p3", connect: third.connect, onEvent: () => undefined }));
    await act(async () => third.conns[0].fail(new StreamError("unsupported", 404)));
    expect(missing.result.current).toBe("unsupported");
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(third.conns).toHaveLength(1);
  });

  it("45초 동안 바이트가 없으면 끊고 다시 붙는다 · 429는 60초 뒤", async () => {
    vi.useFakeTimers();
    const { conns, connect } = fakeConnect();
    renderHook(() => useReconnectingStream({ key: "p1", connect, onEvent: () => undefined, random: () => 0 }));
    act(() => conns[0].conn.onOpen());
    await act(async () => vi.advanceTimersByTime(45_000));
    expect(conns[0].conn.signal.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTime(500));
    expect(conns).toHaveLength(2);
    await act(async () => conns[1].fail(new StreamError("rate-limited", 429)));
    await act(async () => vi.advanceTimersByTime(59_000));
    expect(conns).toHaveLength(2);
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(conns).toHaveLength(3);
  });
});
