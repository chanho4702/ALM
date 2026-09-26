/**
 * 도트 매트릭스 → SVG path 변환(스펙 §2.6 구현 계약).
 * 같은 문자의 가로 연속 구간 하나 = `M{x} {y}h{n}v1h-{n}z`, 문자별로 한 `d`에 이어 붙인다.
 * 색은 path의 클래스(`px-{계열}-{문자}`)가 `ai-office.css`에서 `var(--office-*)`로 칠한다.
 * 변환 결과는 모듈 수명 동안 memo — 폴링마다 다시 계산하지 않는다.
 */
import type { AgentRole } from "../store/types";
import * as M from "./matrices";

export type Family = "char" | "furn" | "ovl" | "board" | "wall" | "window" | "floor" | "plant" | "coffee";

/** 계열별 칠 순서 — 밝은 면 먼저, 외곽선 `K`는 마지막(겹침이 없어 순서는 가독용이다) */
const PAINT_ORDER: Record<Family, string> = {
  char: "PpCcSsHhAaGK",
  furn: "WwxyMmOGgFfK",
  ovl: "YyZMRGHK",
  board: "xcdpqRYBCK",
  wall: "wvtK",
  window: "MkqK",
  floor: "abl",
  plant: "LlOoK",
  coffee: "mMGRWwK",
};

export interface PixelPath {
  cls: string;
  d: string;
}

type Matrix = readonly string[];

function runs(matrix: Matrix, ox: number, oy: number): Map<string, string[]> {
  const byChar = new Map<string, string[]>();
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n += 1;
      if (ch !== ".") {
        const list = byChar.get(ch) ?? [];
        list.push(`M${ox + x} ${oy + y}h${n}v1h-${n}z`);
        byChar.set(ch, list);
      }
      x += n;
    }
  });
  return byChar;
}

/** 매트릭스 하나를 계열 클래스가 붙은 path 목록으로 */
export function matrixToPaths(matrix: Matrix, family: Family, ox = 0, oy = 0): PixelPath[] {
  const byChar = runs(matrix, ox, oy);
  const order = PAINT_ORDER[family];
  const chars = [...byChar.keys()].sort((a, b) => rank(order, a) - rank(order, b));
  return chars.map((ch) => ({ cls: `px-${family}-${ch}`, d: (byChar.get(ch) ?? []).join("") }));
}

function rank(order: string, ch: string): number {
  const i = order.indexOf(ch);
  return i < 0 ? order.length : i;
}

/** 사각형 한 개 path */
export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h-${w}z`;
}

/** 레이어의 `.`은 아래를 유지하고 나머지 문자는 덮어쓴다(스펙 §2.6-5). dy = 레이어를 아래로 민 행 수 */
export function overlay(base: Matrix, layer: Matrix, dy = 0): string[] {
  return base.map((row, y) => {
    const lr = layer[y - dy];
    if (!lr) return row;
    let out = "";
    for (let x = 0; x < row.length; x += 1) {
      const l = lr[x];
      out += l && l !== "." ? l : row[x];
    }
    return out;
  });
}

/** 숨쉬기 B — 0~16행을 1ap 아래로(맨 위 빈 행 삽입, 17행 버림), 18~23행(다리)은 그대로 */
export function breathe(frame: Matrix): string[] {
  const blank = ".".repeat(frame[0].length);
  return [blank, ...frame.slice(0, 17), ...frame.slice(18)];
}

/** 모니터 ON 프레임 — 이미 매트릭스로 있다 */
export const MONITOR = { off: M.MONITOR_OFF, onA: M.MONITOR_ON_A, onB: M.MONITOR_ON_B };

const ACC: Record<AgentRole, Matrix> = {
  PLANNER: M.ACC_PLANNER,
  DESIGNER: M.ACC_DESIGNER,
  FRONTEND: M.ACC_FRONTEND,
  BACKEND: M.ACC_BACKEND,
  OPS: M.ACC_OPS,
  REVIEWER: M.ACC_REVIEWER,
};

export type AvatarFrame = "standA" | "standB" | "seat" | "slump";

export function avatarMatrix(role: AgentRole, frame: AvatarFrame): string[] {
  const acc = ACC[role];
  switch (frame) {
    case "standA":
      return overlay(M.AVATAR_STAND, acc, 0);
    case "standB":
      return overlay(breathe(M.AVATAR_STAND), acc, 1);
    case "seat":
      return overlay(M.AVATAR_STAND.slice(0, 16), acc, 0);
    case "slump":
      return overlay(M.AVATAR_SEAT_SLUMP, acc, 1);
  }
}

const memo = new Map<string, PixelPath[]>();

function cached(key: string, build: () => PixelPath[]): PixelPath[] {
  let hit = memo.get(key);
  if (!hit) {
    hit = build();
    memo.set(key, hit);
  }
  return hit;
}

export function avatarPaths(role: AgentRole, frame: AvatarFrame): PixelPath[] {
  return cached(`av:${role}:${frame}`, () => matrixToPaths(avatarMatrix(role, frame), "char"));
}

/** 이름 붙은 스프라이트(가구·오버레이)의 원점 기준 path — memo */
export function spritePaths(name: keyof typeof M, family: Family): PixelPath[] {
  return cached(`sp:${name}:${family}`, () => matrixToPaths(M[name], family));
}

export const ROOM_W = 352;

const roundUp16 = (n: number) => Math.ceil(n / 16) * 16;

export interface RoomGeometry {
  width: number;
  height: number;
  rugHeight: number;
}

/** 방 크기(스펙 §1.4) — 페르소나 8명까지 기본 352×192, 그 이상은 책상 행·유휴 자리 행만큼 늘린다 */
export function roomGeometry(count: number): RoomGeometry {
  const deskRows = Math.max(1, Math.ceil(count / 4));
  const idleRows = Math.max(1, Math.ceil(count / 3));
  const height = roundUp16(Math.max(192, 40 + 64 * deskRows + 16, 52 + 32 * idleRows + 52));
  return { width: ROOM_W, height, rugHeight: Math.max(96, 32 * idleRows + 4) };
}

/**
 * 방 배경(바닥 → 러그 → 벽 → 벽 오브젝트 → 화분·소파) — 칠 순서대로 path 목록. 높이별 memo.
 * 겹치는 스프라이트는 목록 순서가 곧 칠 순서다.
 */
export function backgroundPaths(geo: RoomGeometry): PixelPath[] {
  return cached(`bg:${geo.height}`, () => {
    const out: PixelPath[] = [];
    const floorA = new Map<string, string[]>();
    for (let ty = 2; ty < geo.height / 16; ty += 1) {
      for (let tx = 0; tx < ROOM_W / 16; tx += 1) {
        const tile = (tx + ty) % 2 === 0 ? M.FLOOR_A : M.FLOOR_B;
        for (const [ch, list] of runs(tile, tx * 16, ty * 16)) {
          floorA.set(ch, [...(floorA.get(ch) ?? []), ...list]);
        }
      }
    }
    for (const ch of ["a", "l"]) {
      const list = floorA.get(ch);
      if (list) out.push({ cls: `px-floor-${ch}`, d: list.join("") });
    }
    // 러그: 외곽 1ap ol + 채움 rug + 안쪽(3ap 들여) 1ap rug2 테두리
    const rx = 266;
    const ry = 50;
    const rw = 80;
    const rh = geo.rugHeight;
    out.push({ cls: "px-rug-ol", d: rectPath(rx, ry, rw, rh) });
    out.push({ cls: "px-rug-fill", d: rectPath(rx + 1, ry + 1, rw - 2, rh - 2) });
    out.push({ cls: "px-rug-line", d: rectPath(rx + 3, ry + 3, rw - 6, rh - 6) });
    out.push({ cls: "px-rug-fill", d: rectPath(rx + 4, ry + 4, rw - 8, rh - 8) });

    const wall = new Map<string, string[]>();
    for (let tx = 0; tx < ROOM_W / 16; tx += 1) {
      for (const [ch, list] of runs(M.WALL, tx * 16, 0)) wall.set(ch, [...(wall.get(ch) ?? []), ...list]);
    }
    for (const ch of ["w", "v", "t", "K"]) {
      const list = wall.get(ch);
      if (list) out.push({ cls: `px-wall-${ch}`, d: list.join("") });
    }
    out.push(...matrixToPaths(M.WINDOW, "window", 112, 6));
    out.push(...matrixToPaths(M.WINDOW, "window", 176, 6));
    out.push(...matrixToPaths(M.BOARD, "board", 258, 4));
    out.push(...matrixToPaths(M.COFFEE, "coffee", 328, 12));
    out.push(...matrixToPaths(M.PLANT, "plant", 4, geo.height - 32));
    out.push(...matrixToPaths(M.PLANT, "plant", 242, 156));
    out.push(...matrixToPaths(M.SOFA, "furn", 280, geo.height - 28));
    return out;
  });
}

/** FNV-1a 32비트 — slug로 피부·머리 톤을 결정적으로 고른다(스펙 §2.4) */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SKINS = ["a", "b", "c"] as const;

/** 아바타 `<g>`에 꽂는 8개 슬롯 변수(색 hex가 아니라 --office-* 참조) */
export function avatarVars(slug: string, role: AgentRole): Record<string, string> {
  const h = fnv1a32(slug);
  const skin = SKINS[h % 3];
  const hair = (h >>> 2) % 4;
  const r = role.toLowerCase();
  return {
    "--av-skin": `var(--office-skin-${skin})`,
    "--av-skin2": `var(--office-skin-${skin}2)`,
    "--av-hair": `var(--office-hair-${hair})`,
    "--av-hair2": `var(--office-hair-${hair}2)`,
    "--av-shirt": `var(--office-role-${r})`,
    "--av-shirt2": `var(--office-role-${r}2)`,
    "--av-acc": `var(--office-acc-${r})`,
    "--av-acc2": `var(--office-acc-${r}2)`,
  };
}
