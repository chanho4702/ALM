import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as store from "../store/jiraStore";
import { OfficeStreamError } from "../store/officeStream";
import type { OfficeStreamHandlers } from "../store/types";
import {
  STREAM_DEAD_AFTER_MS,
  STREAM_RATE_LIMIT_RETRY_MS,
  STREAM_SIGNAL_THROTTLE_MS,
  streamBackoffMs,
  useOfficeStream,
} from "./useOfficeStream";

interface Conn {
  projectId: string | undefined;
  h: OfficeStreamHandlers;
  end: () => void;
  fail: (e: unknown) => void;
}

/** 연결마다 핸들러를 잡아 두고, 테스트가 열기·신호·끊기를 직접 일으킨다 */
function fakeStreams() {
  const conns: Conn[] = [];
  const spy = vi.spyOn(store, "streamOffice").mockImplementation(
    (projectId, h) =>
      new Promise<void>((resolve, reject) => {
        h.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        conns.push({ projectId, h, end: resolve, fail: reject });
      }),
  );
  return { spy, conns };
}

/** 지터 없이 기준값 그대로(50~100% 중 100%) */
const noJitter = () => 1;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

describe("streamBackoffMs — 1초 → 30초, 지터 50~100%", () => {
  it("지수로 늘고 30초에서 멈춘다", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => streamBackoffMs(a, () => 1))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(streamBackoffMs(0, () => 0)).toBe(500);
    expect(streamBackoffMs(9, () => 0)).toBe(15000);
  });
});

describe("useOfficeStream — 연결·신호·재연결·폴백", () => {
  it("열리면 live, 신호는 즉시 1회 + 1초 창 안의 나머지는 뒤끝 1회로 모은다", async () => {
    const { conns } = fakeStreams();
    const onSignal = vi.fn();
    const { result } = renderHook(() => useOfficeStream("p1", onSignal, { random: noJitter }));
    expect(conns).toHaveLength(1);
    expect(conns[0].projectId).toBe("p1");
    expect(result.current).toBe("polling");

    act(() => conns[0].h.onOpen());
    expect(result.current).toBe("live");
    // 첫 연결은 재조회하지 않는다(사무실이 방금 첫 조회를 했다)
    expect(onSignal).not.toHaveBeenCalled();

    act(() => {
      conns[0].h.onEvent({ reason: "audit", projectId: null, at: null });
      conns[0].h.onEvent({ reason: "audit", projectId: null, at: null });
      conns[0].h.onEvent({ reason: "run", projectId: "1", at: null });
    });
    expect(onSignal).toHaveBeenCalledTimes(1);
    await advance(STREAM_SIGNAL_THROTTLE_MS - 1);
    expect(onSignal).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(onSignal).toHaveBeenCalledTimes(2);
    // 창이 지나면 다시 즉시
    await advance(STREAM_SIGNAL_THROTTLE_MS);
    act(() => conns[0].h.onEvent({ reason: "gate", projectId: null, at: null }));
    expect(onSignal).toHaveBeenCalledTimes(3);
  });

  it("끊기면 polling + 백오프(1초 → 2초)로 다시 붙고, 다시 열리면 놓친 신호 대신 1회 재조회 + 백오프 초기화", async () => {
    const { conns } = fakeStreams();
    const onSignal = vi.fn();
    const { result } = renderHook(() => useOfficeStream("p1", onSignal, { random: noJitter }));
    act(() => conns[0].h.onOpen());

    await act(async () => conns[0].fail(new OfficeStreamError("network", 502)));
    expect(result.current).toBe("polling");
    await advance(999);
    expect(conns).toHaveLength(1);
    await advance(1);
    expect(conns).toHaveLength(2);

    await act(async () => conns[1].fail(new TypeError("Failed to fetch")));
    await advance(1999);
    expect(conns).toHaveLength(2);
    await advance(1);
    expect(conns).toHaveLength(3);

    act(() => conns[2].h.onOpen());
    expect(result.current).toBe("live");
    expect(onSignal).toHaveBeenCalledTimes(1);

    // 서버가 정상으로 닫아도(30분 타임아웃) 다시 붙는다 — 백오프는 처음(1초)부터
    await act(async () => conns[2].end());
    expect(result.current).toBe("polling");
    await advance(1000);
    expect(conns).toHaveLength(4);
  });

  it("429면 폴링으로 두고 60초 뒤에야 다시 시도한다", async () => {
    const { conns } = fakeStreams();
    const { result } = renderHook(() => useOfficeStream("p1", vi.fn(), { random: noJitter }));
    await act(async () => conns[0].fail(new OfficeStreamError("rate-limited", 429)));
    expect(result.current).toBe("polling");
    await advance(STREAM_RATE_LIMIT_RETRY_MS - 1);
    expect(conns).toHaveLength(1);
    await advance(1);
    expect(conns).toHaveLength(2);
  });

  it.each(["unauthorized", "unsupported"] as const)("%s면 다시 붙지 않는다(폴링만)", async (kind) => {
    const { conns } = fakeStreams();
    const { result } = renderHook(() => useOfficeStream("p1", vi.fn(), { random: noJitter }));
    await act(async () => conns[0].fail(new OfficeStreamError(kind, kind === "unauthorized" ? 401 : 404)));
    await advance(10 * 60_000);
    expect(conns).toHaveLength(1);
    expect(result.current).toBe("polling");
  });

  it("45초 동안 바이트가 없으면 죽은 연결로 끊고 다시 붙는다 — 바이트(heartbeat)가 오면 타이머가 늘어난다", async () => {
    const { conns } = fakeStreams();
    const { result } = renderHook(() => useOfficeStream("p1", vi.fn(), { random: noJitter }));
    act(() => conns[0].h.onOpen());
    await advance(STREAM_DEAD_AFTER_MS - 1000);
    act(() => conns[0].h.onActivity());
    await advance(STREAM_DEAD_AFTER_MS - 1000);
    expect(conns[0].h.signal.aborted).toBe(false);
    expect(result.current).toBe("live");

    await advance(1000);
    expect(conns[0].h.signal.aborted).toBe(true);
    expect(result.current).toBe("polling");
    await advance(1000);
    expect(conns).toHaveLength(2);
  });

  it("탭이 숨으면 닫고, 다시 보이면 곧바로 연다(백오프 없이). 언마운트하면 닫고 더 붙지 않는다", async () => {
    const { conns } = fakeStreams();
    const onSignal = vi.fn();
    const { result, unmount } = renderHook(() => useOfficeStream("p1", onSignal, { random: noJitter }));
    act(() => conns[0].h.onOpen());

    act(() => setHidden(true));
    expect(conns[0].h.signal.aborted).toBe(true);
    expect(result.current).toBe("polling");
    await advance(5 * 60_000);
    expect(conns).toHaveLength(1);

    act(() => setHidden(false));
    expect(conns).toHaveLength(2);
    act(() => conns[1].h.onOpen());
    expect(result.current).toBe("live");
    expect(onSignal).toHaveBeenCalledTimes(1);

    unmount();
    expect(conns[1].h.signal.aborted).toBe(true);
    await advance(5 * 60_000);
    expect(conns).toHaveLength(2);
  });

  it("숨은 채로 마운트되면 열지 않다가 보이면 연다", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const { conns } = fakeStreams();
    renderHook(() => useOfficeStream("p1", vi.fn(), { random: noJitter }));
    expect(conns).toHaveLength(0);
    act(() => setHidden(false));
    expect(conns).toHaveLength(1);
  });
});
