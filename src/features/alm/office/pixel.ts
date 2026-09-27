/**
 * 도트 매트릭스 → SVG path 변환(스펙 §2.6 구현 계약).
 * 같은 문자의 가로 연속 구간 하나 = `M{x} {y}h{n}v1h-{n}z`, 문자별로 한 `d`에 이어 붙인다.
 * 색은 path의 클래스(`px-{계열}-{문자}`)가 `ai-office.css`에서 `var(--office-*)`로 칠한다.
 * 변환 결과는 모듈 수명 동안 memo — 폴링마다 다시 계산하지 않는다.
 */
import type { AgentRole } from "../store/types";
import * as M from "./matrices";

export type Family =
  | "char"
  | "furn"
  | "ovl"
  | "board"
  | "wall"
  | "window"
  | "floor"
  | "plant"
  | "coffee"
  | "furn2"
  | "wb"
  | "lamp"
  | "note"
  | "carpet"
  | "mb"
  | "puff"
  | "fx"
  | "item"
  | "sky"
  | "cat";

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
  furn2: "WwxypqcMmFfAK",
  wb: "HmMFRYLK",
  lamp: "HRmMK",
  note: "YyK",
  carpet: "ab",
  mb: "BpGHYLRFMK",
  puff: "BK",
  fx: "HGYFMK",
  item: "pHcK",
  sky: "WwqH",
  cat: "WPOoK",
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

/** 도트 시안이 있는 6롤 — 액세서리 매트릭스와 `--office-role-*`·`--office-acc-*` 팔레트가 이 키로만 있다 */
type DrawnRole = Exclude<AgentRole, "MANAGER">;

const ACC: Record<DrawnRole, Matrix> = {
  PLANNER: M.ACC_PLANNER,
  DESIGNER: M.ACC_DESIGNER,
  FRONTEND: M.ACC_FRONTEND,
  BACKEND: M.ACC_BACKEND,
  OPS: M.ACC_OPS,
  REVIEWER: M.ACC_REVIEWER,
};

/**
 * 그릴 롤 — MANAGER는 전용 도트가 아직 없어 기획 아바타(연필)를 빌려 쓰고, 명판·카드·패널의 롤 라벨("매니저")로
 * 구분한다(D-P3c-5). 시안 밖 값이 와도 매트릭스·팔레트가 비지 않게 기획으로 접는다.
 */
export function drawnRole(role: AgentRole): DrawnRole {
  return role in ACC ? (role as DrawnRole) : "PLANNER";
}

/**
 * 걷기·뒷모습 프레임(P3e) — `seatFar`는 회의 테이블이 가리는 14~15행을 뺀 앉음(아바타 한 레이어로 테이블 위에 칠해도
 * 테이블 뒤에 앉은 것처럼 보인다), `seatBack`은 가까운 쪽 좌석의 뒷모습 0~15행.
 */
export type AvatarFrame =
  | "standA"
  | "standB"
  | "seat"
  | "slump"
  | "seatFar"
  | "seatBack"
  | "back"
  | "walkA"
  | "walkB"
  | "walkBackA"
  | "walkBackB";

/** 뒷모습 액세서리 — 좌우 대칭 모자는 앞모습 레이어 그대로, 기획 연필은 거울, 리뷰 안경은 뒤에서 안 보인다(스펙 부록 B) */
function backAccessory(role: DrawnRole): Matrix {
  if (role === "PLANNER") return M.ACC_BACK_PLANNER;
  if (role === "REVIEWER") return [];
  return ACC[role];
}

/** 다리 행(18~22)만 걷기 프레임의 것으로 바꾼다 — sprites_p3e.py `walk()`와 같은 행 교체 */
function withLegs(base: Matrix, walk: Matrix): string[] {
  return [...base.slice(0, 18), ...walk.slice(18, 23), ...base.slice(23)];
}

export function avatarMatrix(role: AgentRole, frame: AvatarFrame): string[] {
  const drawn = drawnRole(role);
  const acc = ACC[drawn];
  const accBack = backAccessory(drawn);
  switch (frame) {
    case "standA":
      return overlay(M.AVATAR_STAND, acc, 0);
    case "standB":
      return overlay(breathe(M.AVATAR_STAND), acc, 1);
    case "seat":
      return overlay(M.AVATAR_STAND.slice(0, 16), acc, 0);
    case "slump":
      return overlay(M.AVATAR_SEAT_SLUMP, acc, 1);
    case "seatFar":
      return overlay(M.AVATAR_STAND.slice(0, 14), acc, 0);
    case "seatBack":
      return overlay(M.AVATAR_BACK.slice(0, 16), accBack, 0);
    case "back":
      return overlay(M.AVATAR_BACK, accBack, 0);
    case "walkA":
      return overlay(M.WALK_A, acc, 0);
    case "walkB":
      return overlay(M.WALK_B, acc, 0);
    case "walkBackA":
      return overlay(withLegs(M.AVATAR_BACK, M.WALK_A), accBack, 0);
    case "walkBackB":
      return overlay(withLegs(M.AVATAR_BACK, M.WALK_B), accBack, 0);
  }
}

/** 미니 말풍선 글리프(스펙 §2.5) — 느낌표는 "승인 대기" 정보 전용이라 없다 */
export type MicroGlyph = "DOTS" | "BULB" | "QUESTION" | "CHART" | "STAR" | "CHECK" | "SWEAT" | "DOC";

const MB_GLYPHS: Record<MicroGlyph, Matrix> = {
  DOTS: M.MB_DOTS,
  BULB: M.MB_BULB,
  QUESTION: M.MB_QUESTION,
  CHART: M.MB_CHART,
  STAR: M.MB_STAR,
  CHECK: M.MB_CHECK,
  SWEAT: M.MB_SWEAT,
  DOC: M.MB_DOC,
};

/** 말풍선 틀 위에 글리프 10×7을 (2,1)부터 덮어쓴 완성형 */
export function microBubblePaths(glyph: MicroGlyph): PixelPath[] {
  return cached(`mb:${glyph}`, () => {
    const layer = ["", ...MB_GLYPHS[glyph].map((row) => `..${row}`)];
    return matrixToPaths(overlay(M.MB_FRAME, layer, 0), "mb");
  });
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
  const drawn = drawnRole(role);
  return cached(`av:${drawn}:${frame}`, () => matrixToPaths(avatarMatrix(drawn, frame), "char"));
}

/** 이름 붙은 스프라이트(가구·오버레이)의 원점 기준 path — memo */
export function spritePaths(name: keyof typeof M, family: Family): PixelPath[] {
  return cached(`sp:${name}:${family}`, () => matrixToPaths(M[name], family));
}

/** 방 폭(P3e §1.1) — 업무·휴게 352ap + 유리 칸막이 4 + 회의실 108 */
export const ROOM_W = 464;
/** 유리 칸막이 왼쪽 x — 그 오른쪽(356~463)이 회의실 */
export const PARTITION_X = 352;
/** 회의실 카펫이 시작하는 타일 열 */
const CARPET_TX = 22;
/** 창 두 개의 원점 — 하늘 이펙트(구름·별똥별)가 같은 좌표를 쓴다 */
export const WINDOWS: readonly { x: number; y: number }[] = [
  { x: 112, y: 6 },
  { x: 176, y: 6 },
];

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

/** 창 매트릭스를 유리(하늘) 문자와 틀 문자로 나눈다 — 그 사이에 하늘 이펙트를 칠한다(P3e §1.3) */
const WINDOW_GLASS = new Set(["px-window-k", "px-window-q"]);

/**
 * 방 바닥 쪽 배경(바닥·카펫 → 러그 → 벽 → 창 유리) — 칠 순서대로 path 목록. 높이별 memo.
 * 겹치는 스프라이트는 목록 순서가 곧 칠 순서다. 하늘 이펙트 → `backgroundTopPaths`가 이 위에 온다.
 */
export function backgroundPaths(geo: RoomGeometry): PixelPath[] {
  return cached(`bg:${geo.height}`, () => {
    const out: PixelPath[] = [];
    const floorA = new Map<string, string[]>();
    const carpet = new Map<string, string[]>();
    for (let ty = 2; ty < geo.height / 16; ty += 1) {
      for (let tx = 0; tx < ROOM_W / 16; tx += 1) {
        const inMeeting = tx >= CARPET_TX;
        const tile = inMeeting ? M.FLOOR_CARPET : (tx + ty) % 2 === 0 ? M.FLOOR_A : M.FLOOR_B;
        const into = inMeeting ? carpet : floorA;
        for (const [ch, list] of runs(tile, tx * 16, ty * 16)) {
          into.set(ch, [...(into.get(ch) ?? []), ...list]);
        }
      }
    }
    for (const ch of ["a", "l"]) {
      const list = floorA.get(ch);
      if (list) out.push({ cls: `px-floor-${ch}`, d: list.join("") });
    }
    for (const ch of ["a", "b"]) {
      const list = carpet.get(ch);
      if (list) out.push({ cls: `px-carpet-${ch}`, d: list.join("") });
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
    for (const w of WINDOWS) {
      out.push(...matrixToPaths(M.WINDOW, "window", w.x, w.y).filter((p) => WINDOW_GLASS.has(p.cls)));
    }
    return out;
  });
}

/** 창틀 → 게시판 → 커피 머신(하늘 이펙트 위, 화이트보드·램프 전) — 높이 무관 */
export function backgroundTopPaths(): PixelPath[] {
  return cached("bg-top", () => {
    const out: PixelPath[] = [];
    for (const w of WINDOWS) {
      out.push(...matrixToPaths(M.WINDOW, "window", w.x, w.y).filter((p) => !WINDOW_GLASS.has(p.cls)));
    }
    out.push(...matrixToPaths(M.BOARD, "board", 258, 4));
    out.push(...matrixToPaths(M.COFFEE, "coffee", 328, 12));
    return out;
  });
}

/** 화분 자리 — 흔들림 주기가 서로 소수라 동시에 흔들리는 일이 드물다(P3e §4.3) */
export function plantSpots(geo: RoomGeometry): { x: number; y: number; periodS: number }[] {
  return [
    { x: 4, y: geo.height - 32, periodS: 23 },
    { x: 242, y: 156, periodS: 29 },
    { x: 448, y: geo.height - 22, periodS: 31 },
  ];
}

/**
 * 소파 → 유리 칸막이(화분 다음, 고양이·책상 전). 칸막이 4줄: 352 ol · 353 hi · 354 glass · 355 ol,
 * 문 틈 [h−58, h−26)은 비우고 틈 위아래 끝에 4×1 문설주.
 */
export function roomFurniturePaths(geo: RoomGeometry): PixelPath[] {
  return cached(`furn:${geo.height}`, () => {
    const h = geo.height;
    const gap0 = h - 58;
    const gap1 = h - 26;
    const column = (x: number) => rectPath(x, 32, 1, gap0 - 32) + rectPath(x, gap1, 1, h - gap1);
    // 안쪽 두 줄은 문설주 행을 비워 둔다 — 문설주(ol)가 가려지지 않게
    const inner = (x: number) => rectPath(x, 32, 1, gap0 - 33) + rectPath(x, gap1 + 1, 1, h - gap1 - 1);
    return [
      ...matrixToPaths(M.SOFA, "furn", 280, h - 28),
      {
        cls: "px-part-ol",
        d:
          column(PARTITION_X) +
          column(PARTITION_X + 3) +
          rectPath(PARTITION_X, gap0 - 1, 4, 1) +
          rectPath(PARTITION_X, gap1, 4, 1),
      },
      { cls: "px-part-hi", d: inner(PARTITION_X + 1) },
      { cls: "px-part-glass", d: inner(PARTITION_X + 2) },
    ];
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
  const r = drawnRole(role).toLowerCase();
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
