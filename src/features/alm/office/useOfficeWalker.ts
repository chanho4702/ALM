import { useCallback, useEffect, useRef, useState } from "react";
import {
  facingOf,
  findPath,
  isReachable,
  resolveTarget,
  stepTile,
  type Facing,
  type Tile,
  type WalkGrid,
} from "./walkGrid";

/** 1타일 걷기 — CSS `steps(8)`(2ap씩)과 같은 값 */
export const TILE_MS = 250;
/** 12타일을 넘는 경로는 두 배 속도 — 최장 경로도 3초 안팎 */
export const FAST_TILE_MS = 125;
export const FAST_AFTER_TILES = 12;
/** 입장 연출 지연 — 첫 렌더(방 밖 타일)를 그린 뒤 한 칸 걸어 들어온다 */
const ENTER_DELAY_MS = 16;

export interface WalkerState {
  /** 지금 그려지는 타일(걷는 중이면 향하는 타일) */
  tile: Tile;
  facing: Facing;
  /** 한 칸 전이가 진행 중 */
  moving: boolean;
  /** 지금 칸의 걷기 시간 — 다리 루프 주기와 같다 */
  stepMs: number;
  /** 목적지 핀 — 도착하면 즉시 사라진다 */
  pin: Tile | null;
  /** 도착 뒤 봇 쪽 축을 맞추는 반걸음(ap) */
  alignX: number;
  /** 걷기 건너뛰기 "뽁" — 바뀔 때마다 퍼프 1프레임 */
  puff: number;
  /** 입장 연출을 마쳤다 */
  entered: boolean;
}

export interface WalkOptions {
  /** 서 있는 봇 발 타일 — A* 비용 +4, 목적지로 쓰지 않는다 */
  soft?: ReadonlySet<string>;
  /** 도착하면 볼 방향 */
  face?: Facing;
  alignX?: number;
  onArrive?: () => void;
}

export interface OfficeWalker extends WalkerState {
  /** 목적지로 걸어간다 — 걷는 중이면 핀은 즉시 옮기고, 지금 향하던 타일에 도착한 뒤 새 경로를 탄다 */
  walkTo: (goal: Tile, options?: WalkOptions) => void;
  /** 남은 걸음을 건너뛰고 바로 옮긴다(같은 봇 재클릭·Enter 한 번 더) */
  jumpTo: (goal: Tile, options?: WalkOptions) => void;
  /** 방향키 한 칸 — 막힌 방향이면 그쪽을 보기만 한다. 걷는 중이면 무시(키 반복을 250ms로 조절) */
  step: (facing: Facing) => void;
  face: (facing: Facing) => void;
  /** 가던 길·도착 콜백을 버린다(지금 칸 전이는 마저 끝난다) */
  cancel: () => void;
}

function systemReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

interface Pending {
  goal: Tile;
  options: WalkOptions;
}

/**
 * 사람 아바타 이동(P3g §2.3·§7.2) — 디렉터가 아니라 이 훅이 관리한다. 타이머 1개, rAF 없음: 칸마다 CSS 전이(250ms·steps(8))를
 * 걸고 같은 길이의 타이머로 다음 칸으로 넘어간다. 반 타일 좌표를 만들지 않도록 재경로는 늘 칸 경계에서만 한다.
 * reduced-motion이면 순간 이동(경로 계산은 그대로, 핀 없음). 라우트를 떠나면 초기화 — 저장소에 두지 않는다.
 */
export function useOfficeWalker(grid: WalkGrid | null, reducedMotion: () => boolean = systemReducedMotion): OfficeWalker {
  const [state, setState] = useState<WalkerState>({
    tile: { tx: 7, ty: 0 },
    facing: "up",
    moving: false,
    stepMs: TILE_MS,
    pin: null,
    alignX: 0,
    puff: 0,
    entered: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const path = useRef<Tile[]>([]);
  const pending = useRef<Pending | null>(null);
  const current = useRef<WalkOptions>({});

  const set = useCallback((patch: Partial<WalkerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  }, []);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  const arrive = useCallback(() => {
    const options = current.current;
    current.current = {};
    set({
      moving: false,
      pin: null,
      facing: options.face ?? stateRef.current.facing,
      alignX: options.alignX ?? 0,
    });
    options.onArrive?.();
  }, [set]);

  const plan = useCallback((goal: Tile, options: WalkOptions): Tile[] | null => {
    const g = gridRef.current;
    if (!g) return null;
    return findPath(g, stateRef.current.tile, goal, options.soft);
  }, []);

  const advance = useCallback(() => {
    timer.current = null;
    if (pending.current) {
      const next = pending.current;
      pending.current = null;
      const route = plan(next.goal, next.options);
      current.current = next.options;
      if (!route) {
        arrive();
        return;
      }
      path.current = route.slice(1);
      set({ stepMs: route.length - 1 > FAST_AFTER_TILES ? FAST_TILE_MS : TILE_MS });
    }
    const next = path.current.shift();
    if (!next) {
      arrive();
      return;
    }
    const from = stateRef.current.tile;
    set({ tile: next, facing: facingOf(from, next), moving: true, alignX: 0 });
    timer.current = setTimeout(advance, stateRef.current.stepMs);
  }, [arrive, plan, set]);

  const walkTo = useCallback(
    (goal: Tile, options: WalkOptions = {}) => {
      const g = gridRef.current;
      if (!g) return;
      if (reducedRef.current()) {
        clearTimer();
        path.current = [];
        pending.current = null;
        const route = findPath(g, stateRef.current.tile, goal, options.soft);
        const last = route && route.length > 1 ? facingOf(route[route.length - 2], route[route.length - 1]) : stateRef.current.facing;
        current.current = options;
        set({ tile: route ? goal : stateRef.current.tile, facing: last, moving: false });
        arrive();
        return;
      }
      set({ pin: goal });
      pending.current = { goal, options };
      if (timer.current === null) advance();
    },
    [advance, arrive, set],
  );

  const jumpTo = useCallback(
    (goal: Tile, options: WalkOptions = {}) => {
      clearTimer();
      path.current = [];
      pending.current = null;
      current.current = options;
      set({ tile: goal, moving: false, puff: stateRef.current.puff + 1 });
      arrive();
    },
    [arrive, set],
  );

  const step = useCallback(
    (facing: Facing) => {
      const g = gridRef.current;
      if (!g || timer.current !== null) return;
      const next = stepTile(stateRef.current.tile, facing);
      if (!isReachable(g, next)) {
        set({ facing, alignX: 0 });
        return;
      }
      current.current = {};
      if (reducedRef.current()) {
        set({ tile: next, facing, moving: false, alignX: 0 });
        return;
      }
      path.current = [next];
      set({ stepMs: TILE_MS, pin: null });
      advance();
    },
    [advance, set],
  );

  const face = useCallback((facing: Facing) => set({ facing }), [set]);

  const cancel = useCallback(() => {
    path.current = [];
    pending.current = null;
    current.current = {};
    set({ pin: null });
  }, [set]);

  // 입장(§2.1) — 첫 맵이 오면 방 밖 (7, H)에서 (7, H−1)까지 뒷모습으로 한 칸. reduced-motion이면 제자리 등장
  const rows = grid?.rows ?? null;
  useEffect(() => {
    if (rows === null || stateRef.current.entered) return;
    const spawn = { tx: 7, ty: rows - 1 };
    if (reducedRef.current()) {
      set({ tile: spawn, facing: "up", entered: true });
      return;
    }
    set({ tile: { tx: 7, ty: rows }, facing: "up", entered: true });
    const t = setTimeout(() => {
      path.current = [spawn];
      set({ stepMs: TILE_MS });
      advance();
    }, ENTER_DELAY_MS);
    return () => clearTimeout(t);
  }, [rows, advance, set]);

  // 인원이 바뀌어 방이 달라지면 — 지금 타일이 닿지 않게 되었으면 가장 가까운 닿는 타일로 옮긴다
  useEffect(() => {
    if (!grid || !stateRef.current.entered || timer.current !== null) return;
    const tile = stateRef.current.tile;
    if (tile.ty >= grid.rows || isReachable(grid, tile)) return;
    const fixed = resolveTarget(grid, tile);
    if (fixed) set({ tile: fixed });
  }, [grid, set]);

  useEffect(() => clearTimer, []);

  return { ...state, walkTo, jumpTo, step, face, cancel };
}
