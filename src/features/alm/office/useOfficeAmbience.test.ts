import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  BREW_MS,
  BUBBLE_LIFE_MS,
  BUBBLE_MAX,
  COFFEE_SPOT,
  CORRIDOR_Y,
  HOLD_CUP_MS,
  STROLL_GAP_MIN_MS,
  useOfficeAmbience,
  type AmbienceSnapshot,
} from "./useOfficeAmbience";

/**
 * 앰비언트 디렉터(P3e §5.2) — 가짜 타이머 + 주입한 난수로 결정적으로 본다.
 * rng 0이면 모든 간격이 최솟값(말풍선 600ms·산책 60초·이펙트 8초·고양이 45초)이다.
 */

const QUIET: AmbienceSnapshot = {
  meeting: null,
  strollCandidates: [],
  idleIds: [],
  effectTargets: [],
  killSwitch: false,
};

const MEETING: AmbienceSnapshot = {
  ...QUIET,
  meeting: { type: "MEETING", hostId: "1", seatedIds: ["1", "2", "3", "4", "5"] },
};

/** 고정 수열을 돌려 쓰는 난수 */
function sequence(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("미니 말풍선 스케줄러(§2.5)", () => {
  it("600~1400ms 간격으로 뜨고, 동시 3개를 넘지 않으며, 같은 사람에게 연달아 뜨지 않는다", async () => {
    const { result } = renderHook(() =>
      useOfficeAmbience({ snapshot: MEETING, rng: sequence([0, 0.1, 0.7, 0.3, 0.9, 0.5]), reducedMotion: false }),
    );
    let maxAlive = 0;
    const targets: string[] = [];
    let seen = new Set<number>();
    for (let t = 0; t < 12_000; t += 100) {
      await advance(100);
      const alive = result.current.bubbles;
      maxAlive = Math.max(maxAlive, alive.length);
      for (const b of alive) {
        if (!seen.has(b.id)) {
          targets.push(b.personaId);
          seen = new Set([...seen, b.id]);
        }
      }
    }
    expect(maxAlive).toBe(BUBBLE_MAX);
    expect(targets.length).toBeGreaterThan(5);
    for (let i = 1; i < targets.length; i += 1) expect(targets[i]).not.toBe(targets[i - 1]);
    // 글리프는 착수/계획 풀(느낌표 없음)
    expect(result.current.bubbles.every((b) => ["DOTS", "BULB", "QUESTION", "CHART"].includes(b.glyph))).toBe(true);
  });

  it("한 개의 수명은 2000ms — 회의가 끝나면(스냅샷 null) 떠 있던 말풍선을 즉시 걷는다", async () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: AmbienceSnapshot }) => useOfficeAmbience({ snapshot, rng: () => 0, reducedMotion: false }),
      { initialProps: { snapshot: MEETING } },
    );
    await advance(600);
    expect(result.current.bubbles).toHaveLength(1);
    const first = result.current.bubbles[0].id;
    await advance(BUBBLE_LIFE_MS - 1);
    expect(result.current.bubbles.some((b) => b.id === first)).toBe(true);
    await advance(1);
    expect(result.current.bubbles.some((b) => b.id === first)).toBe(false);

    rerender({ snapshot: QUIET });
    expect(result.current.bubbles).toHaveLength(0);
    await advance(5000);
    expect(result.current.bubbles).toHaveLength(0);
  });

  it("참석 1명(매니저 보고)은 연속 금지 예외 — 같은 사람에게 계속 뜬다", async () => {
    const solo: AmbienceSnapshot = { ...QUIET, meeting: { type: "MANAGER", hostId: "7", seatedIds: ["7"] } };
    const { result } = renderHook(() => useOfficeAmbience({ snapshot: solo, rng: () => 0, reducedMotion: false }));
    await advance(600);
    expect(result.current.bubbles.map((b) => b.personaId)).toEqual(["7"]);
    expect(["CHECK", "DOC"]).toContain(result.current.bubbles[0].glyph);
    const first = result.current.bubbles[0].id;
    // 떠 있는 동안(600~2600)은 그 사람에게 겹쳐 띄우지 않고, 사라진 뒤 첫 스폰(3000)에 다시 뜬다
    await advance(2000);
    expect(result.current.bubbles).toHaveLength(0);
    await advance(400);
    expect(result.current.bubbles.map((b) => b.personaId)).toEqual(["7"]);
    expect(result.current.bubbles[0].id).not.toBe(first);
  });

  it("reduced-motion이면 디렉터가 시작하지 않는다 — 말풍선·산책 0", async () => {
    const snapshot: AmbienceSnapshot = { ...MEETING, strollCandidates: [{ id: "9", x: 270, y: 52 }], idleIds: ["9"] };
    const { result } = renderHook(() => useOfficeAmbience({ snapshot, rng: () => 0, reducedMotion: true }));
    await advance(STROLL_GAP_MIN_MS * 2);
    expect(result.current.active).toBe(false);
    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.bubbles).toHaveLength(0);
    expect(result.current.stroll).toBeNull();
  });
});

describe("커피 산책(§4.1)", () => {
  const idle: AmbienceSnapshot = {
    ...QUIET,
    strollCandidates: [
      { id: "5", x: 318, y: 52 },
      { id: "6", x: 270, y: 84 },
    ],
    idleIds: ["5", "6"],
  };

  it("60초 뒤 한 명만 나가서 위 → 옆 → 위(뒷모습)로 커피 머신 앞, 1.6초 뒤 컵 들고 복귀, 8초 들고 있다가 끝", async () => {
    const { result } = renderHook(() => useOfficeAmbience({ snapshot: idle, rng: () => 0, reducedMotion: false }));
    await advance(STROLL_GAP_MIN_MS - 1);
    expect(result.current.stroll).toBeNull();
    await advance(1);
    const s0 = result.current.stroll!;
    expect(s0).toMatchObject({ personaId: "5", leg: 0, x: 318, y: CORRIDOR_Y, facing: "back", walking: true, cup: false });
    // 26ap = 1625ms, 2ap당 한 계단
    expect(s0.legMs).toBe(1625);
    expect(s0.steps).toBe(13);
    await advance(s0.legMs);
    expect(result.current.stroll).toMatchObject({ leg: 1, x: COFFEE_SPOT.x, y: CORRIDOR_Y, facing: "front" });
    await advance(result.current.stroll!.legMs);
    expect(result.current.stroll).toMatchObject({ leg: 2, ...COFFEE_SPOT, facing: "back" });
    await advance(result.current.stroll!.legMs);
    expect(result.current.stroll).toMatchObject({ leg: 3, walking: false, facing: "back", cup: false });
    await advance(BREW_MS);
    expect(result.current.stroll).toMatchObject({ leg: 4, cup: true, facing: "front" });
    await advance(result.current.stroll!.legMs);
    await advance(result.current.stroll!.legMs);
    await advance(result.current.stroll!.legMs);
    expect(result.current.stroll).toMatchObject({ leg: 7, x: 318, y: 52, walking: false, cup: true });
    await advance(HOLD_CUP_MS);
    expect(result.current.stroll).toBeNull();
    // 다음 산책은 60초 뒤, 직전 산책자는 빼고 고른다
    await advance(STROLL_GAP_MIN_MS);
    expect(result.current.stroll?.personaId).toBe("6");
  });

  it("산책 도중 그 봇이 IDLE이 아니게 되면(폴링) 즉시 취소", async () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: AmbienceSnapshot }) => useOfficeAmbience({ snapshot, rng: () => 0, reducedMotion: false }),
      { initialProps: { snapshot: idle } },
    );
    await advance(STROLL_GAP_MIN_MS + 2000);
    expect(result.current.stroll?.personaId).toBe("5");
    rerender({ snapshot: { ...idle, strollCandidates: idle.strollCandidates.slice(1), idleIds: ["6"] } });
    expect(result.current.stroll).toBeNull();
  });

  it("킬 스위치면 산책하지 않는다(멈춘 사무실)", async () => {
    const { result } = renderHook(() =>
      useOfficeAmbience({ snapshot: { ...idle, killSwitch: true }, rng: () => 0, reducedMotion: false }),
    );
    await advance(STROLL_GAP_MIN_MS * 3);
    expect(result.current.stroll).toBeNull();
  });

  it("탭이 숨으면 정지하고 떠 있던 장식을 걷는다 — 다시 보이면 새 간격부터", async () => {
    const { result } = renderHook(() =>
      useOfficeAmbience({ snapshot: { ...idle, meeting: MEETING.meeting }, rng: () => 0, reducedMotion: false }),
    );
    await advance(STROLL_GAP_MIN_MS + 100);
    expect(result.current.stroll).not.toBeNull();
    expect(result.current.bubbles.length).toBeGreaterThan(0);

    act(() => setHidden(true));
    expect(result.current.active).toBe(false);
    expect(result.current.stroll).toBeNull();
    expect(result.current.bubbles).toHaveLength(0);
    await advance(STROLL_GAP_MIN_MS * 2);
    expect(result.current.stroll).toBeNull();
    expect(result.current.bubbles).toHaveLength(0);

    act(() => setHidden(false));
    expect(result.current.active).toBe(true);
    await advance(599);
    expect(result.current.bubbles).toHaveLength(0);
    await advance(1);
    expect(result.current.bubbles).toHaveLength(1);
  });
});

describe("작업 이펙트·고양이 기지개(§4.5·§4.6)", () => {
  it("RUNNING 봇 머리 옆에 8초 뒤 1.6초 — 재시도(attempt ≥ 2)면 땀방울 가중 70%", async () => {
    const snapshot: AmbienceSnapshot = { ...QUIET, effectTargets: [{ id: "3", attempt: 2 }] };
    // rng 0.5: 대상 0번 · 종류 가중치 0.5×100 = 50 → SWEAT(0~70)
    const { result } = renderHook(() => useOfficeAmbience({ snapshot, rng: () => 0.5, reducedMotion: false }));
    await advance(8000 + 3500);
    expect(result.current.effect).toMatchObject({ personaId: "3", kind: "SWEAT" });
    await advance(1600);
    expect(result.current.effect).toBeNull();
  });

  it("고양이는 45초마다 1.2초 기지개", async () => {
    const { result } = renderHook(() => useOfficeAmbience({ snapshot: QUIET, rng: () => 0, reducedMotion: false }));
    await advance(45_000);
    expect(result.current.catStretch).toBe(true);
    await advance(1200);
    expect(result.current.catStretch).toBe(false);
  });
});
