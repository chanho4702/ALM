import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { roomGeometry } from "./pixel";
import { walkGrid } from "./walkGrid";
import { FAST_TILE_MS, TILE_MS, useOfficeWalker } from "./useOfficeWalker";

const grid = walkGrid(7, roomGeometry(7).height);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function entered(reduced = false) {
  const hook = renderHook(() => useOfficeWalker(grid, () => reduced));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20 + TILE_MS);
  });
  return hook;
}

describe("입장(§2.1)", () => {
  it("방 밖 (7, H)에서 발판 (7, H−1)까지 뒷모습으로 한 칸 걸어 들어온다", async () => {
    const { result } = renderHook(() => useOfficeWalker(grid, () => false));
    expect(result.current.entered).toBe(true);
    expect(result.current.tile).toEqual({ tx: 7, ty: 13 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.tile).toEqual({ tx: 7, ty: 12 });
    expect(result.current.moving).toBe(true);
    expect(result.current.facing).toBe("up");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MS);
    });
    expect(result.current.moving).toBe(false);
  });

  it("reduced-motion이면 제자리에 바로 나타난다", () => {
    const { result } = renderHook(() => useOfficeWalker(grid, () => true));
    expect(result.current.tile).toEqual({ tx: 7, ty: 12 });
    expect(result.current.moving).toBe(false);
  });
});

describe("클릭 이동(§2.3)", () => {
  it("칸마다 250ms, 핀은 도착하면 사라지고 도착 방향·콜백을 적용한다", async () => {
    const { result } = await entered();
    const onArrive = vi.fn();
    act(() => result.current.walkTo({ tx: 7, ty: 9 }, { face: "left", onArrive }));
    expect(result.current.pin).toEqual({ tx: 7, ty: 9 });
    expect(result.current.tile).toEqual({ tx: 7, ty: 11 });
    expect(result.current.stepMs).toBe(TILE_MS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MS);
    });
    expect(result.current.tile).toEqual({ tx: 7, ty: 10 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MS * 2);
    });
    expect(result.current.tile).toEqual({ tx: 7, ty: 9 });
    expect(result.current.moving).toBe(false);
    expect(result.current.pin).toBeNull();
    expect(result.current.facing).toBe("left");
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it("12타일을 넘는 경로는 두 배 속도(125ms/타일)", async () => {
    const { result } = await entered();
    act(() => result.current.walkTo({ tx: 26, ty: 9 }));
    expect(result.current.stepMs).toBe(FAST_TILE_MS);
  });

  it("이동 중 다시 클릭 — 핀은 즉시 옮기고, 지금 향하던 타일에 도착한 다음 새 경로를 탄다", async () => {
    const { result } = await entered();
    const first = vi.fn();
    act(() => result.current.walkTo({ tx: 7, ty: 8 }, { onArrive: first }));
    expect(result.current.tile).toEqual({ tx: 7, ty: 11 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => result.current.walkTo({ tx: 10, ty: 11 }));
    expect(result.current.pin).toEqual({ tx: 10, ty: 11 });
    // 반 칸 좌표를 만들지 않는다 — (7, 11)에 도착한 뒤 오른쪽으로
    expect(result.current.tile).toEqual({ tx: 7, ty: 11 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.tile).toEqual({ tx: 8, ty: 11 });
    expect(result.current.facing).toBe("right");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MS * 3);
    });
    expect(result.current.tile).toEqual({ tx: 10, ty: 11 });
    expect(first).not.toHaveBeenCalled();
  });

  it("건너뛰기 — 남은 걸음 없이 바로 옮기고 '뽁'", async () => {
    const { result } = await entered();
    const onArrive = vi.fn();
    act(() => result.current.walkTo({ tx: 3, ty: 4 }, { onArrive }));
    act(() => result.current.jumpTo({ tx: 3, ty: 4 }, { face: "left", onArrive }));
    expect(result.current.tile).toEqual({ tx: 3, ty: 4 });
    expect(result.current.puff).toBe(1);
    expect(result.current.facing).toBe("left");
    expect(onArrive).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MS * 20);
    });
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it("reduced-motion이면 순간 이동(핀 없음)", async () => {
    const { result } = await entered(true);
    const onArrive = vi.fn();
    act(() => result.current.walkTo({ tx: 18, ty: 7 }, { face: "up", onArrive }));
    expect(result.current.tile).toEqual({ tx: 18, ty: 7 });
    expect(result.current.pin).toBeNull();
    expect(result.current.facing).toBe("up");
    expect(onArrive).toHaveBeenCalled();
  });
});

describe("방향키 한 칸(§2.6)", () => {
  it("막힌 방향이면 제자리에서 그쪽을 보기만 한다", async () => {
    const { result } = await entered();
    act(() => result.current.step("down"));
    expect(result.current.tile).toEqual({ tx: 7, ty: 12 });
    expect(result.current.facing).toBe("down");
    act(() => result.current.step("up"));
    expect(result.current.tile).toEqual({ tx: 7, ty: 11 });
    expect(result.current.moving).toBe(true);
    // 걷는 중 키 반복은 무시(250ms로 조절)
    act(() => result.current.step("up"));
    expect(result.current.tile).toEqual({ tx: 7, ty: 11 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TILE_MS);
    });
    act(() => result.current.step("up"));
    expect(result.current.tile).toEqual({ tx: 7, ty: 10 });
  });
});
