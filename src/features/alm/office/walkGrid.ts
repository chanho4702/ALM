/**
 * 사람 아바타 이동(P3g §2.2~2.4 구현 계약) — 16ap 타일 그리드, 가구 좌표로 계산하는 보행 맵, 4방향 A*, 대화 위치.
 * 전부 순수 함수다. 맵은 인원·방 높이가 바뀔 때만 다시 만든다(화면이 memo). 부록 D 덤프가 단위 테스트 기대값이다.
 */
import type { AgentPersonaState } from "../components/AgentGlyphs";
import { PARTITION_X, ROOM_W } from "./pixel";

/** 가로 타일 수 — ROOM_W 464 / 16 */
export const COLS = ROOM_W / 16;
/** 입구 발판(32×12)이 놓이는 x — 입장 타일 열은 7 */
export const DOORMAT_X = 112;
export const SPAWN_TX = 7;
/** 회의실 문 앞 타일 열 — 칸막이(tx 22) 바로 왼쪽 */
export const DOOR_FRONT_TX = 21;

export interface Tile {
  tx: number;
  ty: number;
}

/** 사람이 보는 방향 — 사람만 옆모습이 있다(봇은 정면/뒷모습) */
export type Facing = "down" | "up" | "left" | "right";

// ── 방 배치(P3a §1.4·P3e §1.2) — 캔버스·보행 맵·대화 위치가 같은 좌표를 쓴다 ──

/** 책상 셀 원점 — 4열 */
export const cellOf = (i: number): { x0: number; y0: number } => ({ x0: 64 * (i % 4), y0: 40 + 64 * Math.floor(i / 4) });

/** 유휴 자리(휴게 구역) — 3열 */
export const idleSpot = (i: number): { x: number; y: number } => ({ x: 270 + 24 * (i % 3), y: 52 + 32 * Math.floor(i / 3) });

/** 아바타 좌상단(아트 픽셀) — 앉음은 자기 책상, 대기열은 책상 옆, 유휴는 휴게 구역의 고정 자리(k = i) */
export function avatarPosition(state: AgentPersonaState, i: number): { x: number; y: number } | null {
  const { x0, y0 } = cellOf(i);
  switch (state) {
    case "RUNNING":
    case "WAITING_APPROVAL":
    case "BLOCKED":
      return { x: x0 + 16, y: y0 };
    case "QUEUED":
      return { x: x0 + 44, y: y0 + 10 };
    case "IDLE":
      return idleSpot(i);
    default:
      return null;
  }
}

// ── 보행 맵 ──

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 바닥 장애물 발자국(x, y, w, h) — 책상은 비활성 페르소나 몫도 늘 있다 */
function obstacles(personaCount: number, h: number): Box[] {
  const out: Box[] = [];
  for (let i = 0; i < personaCount; i += 1) {
    const { x0, y0 } = cellOf(i);
    out.push({ x: x0 + 4, y: y0 + 16, w: 40, h: 16 });
    out.push({ x: x0 + 17, y: y0 + 6, w: 14, h: 12 });
  }
  out.push(
    { x: 4, y: h - 32, w: 12, h: 18 },
    { x: 242, y: 156, w: 12, h: 18 },
    { x: 448, y: h - 22, w: 12, h: 18 },
    { x: 280, y: h - 28, w: 48, h: 18 },
    { x: 360, y: 98, w: 100, h: 26 },
    { x: 403, y: 82, w: 14, h: 14 },
  );
  for (const sx of [362, 382, 422, 442]) out.push({ x: sx + 1, y: 90, w: 14, h: 12 });
  for (const sx of [378, 402, 426]) out.push({ x: sx + 1, y: 124, w: 14, h: 7 });
  const gap0 = h - 58;
  const gap1 = h - 26;
  out.push({ x: PARTITION_X, y: 32, w: 4, h: gap0 - 32 }, { x: PARTITION_X, y: gap1, w: 4, h: h - gap1 });
  return out;
}

/** 타일의 발 상자(아래 반) — 이 상자가 장애물과 겹치면 막힘 */
function footBox(t: Tile) {
  return { x0: 16 * t.tx + 2, y0: 16 * t.ty + 8, x1: 16 * t.tx + 13, y1: 16 * t.ty + 15 };
}

function overlaps(box: ReturnType<typeof footBox>, o: Box): boolean {
  return !(box.x1 < o.x || o.x + o.w - 1 < box.x0 || box.y1 < o.y || o.y + o.h - 1 < box.y0);
}

/** 회의실 문 타일 줄 — 칸막이 열 중 발 상자 y가 문 틈 [h−58, h−26) 안에 드는 줄 */
export function doorRows(h: number): number[] {
  const gap0 = h - 58;
  const gap1 = h - 26;
  const rows: number[] = [];
  for (let ty = 0; ty < h / 16; ty += 1) if (gap0 <= 16 * ty + 8 && 16 * ty + 15 < gap1) rows.push(ty);
  return rows;
}

export interface WalkGrid {
  cols: number;
  rows: number;
  height: number;
  /** [ty][tx] — 걸을 수 있음(벽·장애물 아님) */
  walkable: boolean[][];
  /** 입장 위치에서 닿는 타일 키(`tx,ty`) */
  reachable: Set<string>;
  doorRows: number[];
  spawn: Tile;
}

export const tileKey = (t: Tile) => `${t.tx},${t.ty}`;

export function walkGrid(personaCount: number, roomHeight: number): WalkGrid {
  const rows = roomHeight / 16;
  const obs = obstacles(personaCount, roomHeight);
  const walkable: boolean[][] = [];
  for (let ty = 0; ty < rows; ty += 1) {
    const row: boolean[] = [];
    for (let tx = 0; tx < COLS; tx += 1) {
      const box = footBox({ tx, ty });
      row.push(ty >= 2 && !obs.some((o) => overlaps(box, o)));
    }
    walkable.push(row);
  }
  const spawn = { tx: SPAWN_TX, ty: rows - 1 };
  const grid: WalkGrid = { cols: COLS, rows, height: roomHeight, walkable, reachable: new Set(), doorRows: doorRows(roomHeight), spawn };
  grid.reachable = flood(grid, spawn);
  return grid;
}

export function isWalkable(grid: WalkGrid, t: Tile): boolean {
  return t.ty >= 0 && t.ty < grid.rows && t.tx >= 0 && t.tx < grid.cols && grid.walkable[t.ty][t.tx];
}

export function isReachable(grid: WalkGrid, t: Tile): boolean {
  return grid.reachable.has(tileKey(t));
}

const DIRS: readonly { dx: number; dy: number; facing: Facing }[] = [
  { dx: 1, dy: 0, facing: "right" },
  { dx: -1, dy: 0, facing: "left" },
  { dx: 0, dy: 1, facing: "down" },
  { dx: 0, dy: -1, facing: "up" },
];

function flood(grid: WalkGrid, start: Tile): Set<string> {
  const seen = new Set<string>();
  if (!isWalkable(grid, start)) return seen;
  seen.add(tileKey(start));
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const d of DIRS) {
      const next = { tx: cur.tx + d.dx, ty: cur.ty + d.dy };
      if (isWalkable(grid, next) && !seen.has(tileKey(next))) {
        seen.add(tileKey(next));
        stack.push(next);
      }
    }
  }
  return seen;
}

/**
 * 부록 D 형식 덤프 — `#` 막힘 · `x` 걸을 수 있지만 닿지 않음 · `.` 닿음 · `D` 회의실 문 · `@` 입장 위치.
 * 첫 줄은 열 번호(한 자리) 머리글.
 */
export function dumpWalkGrid(grid: WalkGrid): string {
  const head = "   " + Array.from({ length: grid.cols }, (_, i) => String(i % 10)).join("");
  const lines = [head];
  for (let ty = 0; ty < grid.rows; ty += 1) {
    let row = "";
    for (let tx = 0; tx < grid.cols; tx += 1) {
      const t = { tx, ty };
      if (!grid.walkable[ty][tx]) row += "#";
      else if (tx === grid.spawn.tx && ty === grid.spawn.ty) row += "@";
      else if (tx === DOOR_FRONT_TX + 1 && grid.doorRows.includes(ty)) row += "D";
      else row += isReachable(grid, t) ? "." : "x";
    }
    lines.push(`${String(ty).padStart(2, " ")} ${row}`);
  }
  return lines.join("\n");
}

/** 방향 — 한 칸 이동의 보는 방향 */
export function facingOf(from: Tile, to: Tile): Facing {
  if (to.tx > from.tx) return "right";
  if (to.tx < from.tx) return "left";
  if (to.ty > from.ty) return "down";
  return "up";
}

export function stepTile(t: Tile, facing: Facing): Tile {
  const d = DIRS.find((x) => x.facing === facing)!;
  return { tx: t.tx + d.dx, ty: t.ty + d.dy };
}

/** 이진 힙 — (f, cost, tx, ty, 방향 순번) 사전순. layout_p3g.py의 heapq 튜플 순서와 같은 동률 규칙 */
type Node = { f: number; cost: number; tile: Tile; dir: number };

function less(a: Node, b: Node): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.tile.tx !== b.tile.tx) return a.tile.tx < b.tile.tx;
  if (a.tile.ty !== b.tile.ty) return a.tile.ty < b.tile.ty;
  return a.dir < b.dir;
}

class Heap {
  private items: Node[] = [];
  get size() {
    return this.items.length;
  }
  push(node: Node) {
    const a = this.items;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** 서 있는 봇 발 타일 비용 — 가능하면 돌아간다 */
export const SOFT_TILE_COST = 4;
/** 방향을 꺾을 때마다 — 같은 길이면 꺾임이 적은 직선 경로(도트 게임답게 반듯하게) */
const TURN_COST = 0.01;

/**
 * 4방향 A* — 타일당 1 + 서 있는 봇 발 타일 +4 + 꺾을 때마다 +0.01, 휴리스틱 맨해튼. 경로는 시작 타일 포함.
 * 도달 불가면 null. (위치, 들어온 방향)을 상태로 둬야 꺾임 비용이 정확하다.
 */
export function findPath(grid: WalkGrid, start: Tile, goal: Tile, soft: ReadonlySet<string> = new Set()): Tile[] | null {
  if (!isWalkable(grid, start) || !isWalkable(grid, goal)) return null;
  const key = (t: Tile, dir: number) => `${t.tx},${t.ty},${dir}`;
  const open = new Heap();
  const best = new Map<string, number>();
  const came = new Map<string, { tile: Tile; dir: number }>();
  open.push({ f: 0, cost: 0, tile: start, dir: -1 });
  best.set(key(start, -1), 0);
  while (open.size > 0) {
    const cur = open.pop();
    if (cur.cost > (best.get(key(cur.tile, cur.dir)) ?? Infinity)) continue;
    if (cur.tile.tx === goal.tx && cur.tile.ty === goal.ty) {
      const path: Tile[] = [cur.tile];
      let k = key(cur.tile, cur.dir);
      while (came.has(k)) {
        const prev = came.get(k)!;
        path.push(prev.tile);
        k = key(prev.tile, prev.dir);
      }
      return path.reverse();
    }
    DIRS.forEach((d, dirIndex) => {
      const next = { tx: cur.tile.tx + d.dx, ty: cur.tile.ty + d.dy };
      if (!isWalkable(grid, next)) return;
      const cost =
        cur.cost + 1 + (soft.has(tileKey(next)) ? SOFT_TILE_COST : 0) + (cur.dir >= 0 && cur.dir !== dirIndex ? TURN_COST : 0);
      const k = key(next, dirIndex);
      if (cost < (best.get(k) ?? Infinity)) {
        best.set(k, cost);
        came.set(k, { tile: cur.tile, dir: cur.dir });
        const h = Math.abs(goal.tx - next.tx) + Math.abs(goal.ty - next.ty);
        open.push({ f: cost + h, cost, tile: next, dir: dirIndex });
      }
    });
  }
  return null;
}

/**
 * 클릭 목적지 해석 — 닿는 타일이면 그대로, 막혔거나 닿지 않으면 닿는 타일 중 맨해튼 거리 최소
 * (동률이면 y 작은 쪽 → x 작은 쪽). 예: 책상 위 → 책상 앞 통로, 회의실 위쪽 띠 → (21, 3).
 */
export function resolveTarget(grid: WalkGrid, tile: Tile, exclude: ReadonlySet<string> = new Set()): Tile | null {
  if (isReachable(grid, tile) && !exclude.has(tileKey(tile))) return tile;
  let best: Tile | null = null;
  let bestD = Infinity;
  for (const k of grid.reachable) {
    if (exclude.has(k)) continue;
    const [tx, ty] = k.split(",").map(Number);
    const d = Math.abs(tx - tile.tx) + Math.abs(ty - tile.ty);
    if (d < bestD || (d === bestD && best && (ty < best.ty || (ty === best.ty && tx < best.tx)))) {
      best = { tx, ty };
      bestD = d;
    }
  }
  return best;
}

/** 아트 픽셀 좌표 → 타일(방 밖이면 가장자리로 자른다) */
export function tileAt(grid: WalkGrid, x: number, y: number): Tile {
  return {
    tx: Math.min(grid.cols - 1, Math.max(0, Math.floor(x / 16))),
    ty: Math.min(grid.rows - 1, Math.max(0, Math.floor(y / 16))),
  };
}

/** 타일에 선 사람 스프라이트(16×24)의 왼쪽 위 — 발(23행)이 타일 맨 아래 줄에 닿는다 */
export const userSpriteXY = (t: Tile) => ({ x: 16 * t.tx, y: 16 * t.ty - 8 });

/** 서 있는 봇(16×24, 발 22행)의 발 타일 */
export const botFootTile = (pos: { x: number; y: number }): Tile => ({ tx: Math.floor((pos.x + 8) / 16), ty: Math.floor((pos.y + 22) / 16) });

/** 봇을 타일 위에 세울 때의 왼쪽 위 — 발(22행)이 타일 맨 아래 줄 */
export const botSpriteXY = (t: Tile) => ({ x: 16 * t.tx, y: 16 * t.ty - 7 });

// ── 대화 위치(§2.4) ──

/** 봇이 지금 어디에 있는가 — 책상 앉음 / 서 있음(유휴·대기열) / 회의실 좌석 / 그릴 곳 없음 */
export type PersonaPlace =
  | { kind: "desk"; index: number; x: number; y: number }
  | { kind: "stand"; index: number; x: number; y: number }
  | { kind: "meeting"; index: number }
  | { kind: "none"; index: number };

export function personaPlace(state: AgentPersonaState, index: number, inMeeting: boolean): PersonaPlace {
  if (inMeeting) return { kind: "meeting", index };
  const pos = avatarPosition(state, index);
  if (!pos) return { kind: "none", index };
  if (state === "QUEUED" || state === "IDLE") return { kind: "stand", index, ...pos };
  return { kind: "desk", index, ...pos };
}

/** 서 있는 봇들의 발 타일 — A* 비용 +4, 목적지로 쓰지 않는다 */
export function standingFeet(places: readonly PersonaPlace[]): Map<number, Tile> {
  const out = new Map<number, Tile>();
  for (const p of places) if (p.kind === "stand") out.set(p.index, botFootTile(p));
  return out;
}

export interface TalkSpot {
  tile: Tile;
  /** 사람이 보는 방향 */
  facing: Facing;
  /** 도착 뒤 봇 쪽 축을 맞추는 마지막 반걸음(ap, ≤8) — 위를 볼 때만 x를 봇 x에 */
  alignX: number;
}

/**
 * 대화 위치 — 책상: 책상 오른쪽 통로(같은 줄, 왼쪽 보기) · 서 있음: 발 타일의 아래 → 오른쪽 → 왼쪽 → 위 중 처음 맞는 것
 * (걸을 수 있음 + 닿음 + 다른 서 있는 봇 발 타일 아님) · 회의 좌석: 회의실 문 앞(문 아래 줄, 오른쪽 보기) · 없음: null.
 */
export function talkSpot(grid: WalkGrid, place: PersonaPlace, places: readonly PersonaPlace[]): TalkSpot | null {
  if (place.kind === "desk") {
    const { y0 } = cellOf(place.index);
    return { tile: { tx: 4 * (place.index % 4) + 3, ty: Math.floor((y0 + 8) / 16) }, facing: "left", alignX: 0 };
  }
  if (place.kind === "meeting") {
    return { tile: { tx: DOOR_FRONT_TX, ty: Math.max(...grid.doorRows) }, facing: "right", alignX: 0 };
  }
  if (place.kind !== "stand") return null;
  const feet = standingFeet(places);
  const foot = feet.get(place.index)!;
  const others = new Set([...feet].filter(([i]) => i !== place.index).map(([, t]) => tileKey(t)));
  const order: readonly { dx: number; dy: number; facing: Facing }[] = [
    { dx: 0, dy: 1, facing: "up" },
    { dx: 1, dy: 0, facing: "left" },
    { dx: -1, dy: 0, facing: "right" },
    { dx: 0, dy: -1, facing: "down" },
  ];
  for (const o of order) {
    const t = { tx: foot.tx + o.dx, ty: foot.ty + o.dy };
    if (isWalkable(grid, t) && isReachable(grid, t) && !others.has(tileKey(t))) {
      const alignX = o.facing === "up" ? Math.max(-8, Math.min(8, place.x - 16 * t.tx)) : 0;
      return { tile: t, facing: o.facing, alignX };
    }
  }
  return null;
}

/** 키보드 "나"의 구역 이름(§2.6) — 구역이 바뀔 때만 읽는다 */
export function zoneName(grid: WalkGrid, t: Tile): string {
  if (t.ty === grid.rows - 1 && t.tx >= 6 && t.tx <= 9) return "입구";
  if (t.tx === DOOR_FRONT_TX && grid.doorRows.includes(t.ty)) return "회의실 앞";
  if (t.tx >= 23) return "회의실";
  const x = 16 * t.tx;
  if (x < 256) return "업무 구역";
  return "휴게 구역";
}
