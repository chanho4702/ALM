/**
 * 도트 매트릭스 → SVG path 변환(스펙 §2.6 구현 계약).
 * 같은 문자의 가로 연속 구간 하나 = `M{x} {y}h{n}v1h-{n}z`, 문자별로 한 `d`에 이어 붙인다.
 * 색은 path의 클래스(`px-{계열}-{문자}`)가 `ai-office.css`에서 `var(--office-*)`로 칠한다.
 * 변환 결과는 모듈 수명 동안 memo — 폴링마다 다시 계산하지 않는다.
 */
import type { AgentRole } from "../store/types";
import * as M from "./matrices";
import * as P from "./avatarParts";
import type { ExtraAccessory, HairColor, HairStyle, ShirtColor, SkinTone } from "./avatarParts";

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
  | "cat"
  | "user"
  | "pin"
  | "mat"
  | "laptop"
  | "clock";

/** 계열별 칠 순서 — 밝은 면 먼저, 외곽선 `K`는 마지막(겹침이 없어 순서는 가독용이다) */
const PAINT_ORDER: Record<Family, string> = {
  char: "PpCcSsHhAaEeGK",
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
  user: "WwEJjUuRSsHhK",
  pin: "HRK",
  mat: "FfK",
  laptop: "GgOmMK",
  clock: "pMK",
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

/**
 * 레이어의 `.`은 아래를 유지하고 나머지 문자는 덮어쓴다(스펙 §2.6-5). dy = 레이어를 아래로 민 행 수.
 * skinOnly = 아래 칸이 피부(`S`/`s`)일 때만 덮는다(AGP-62 §2.5 — 안경·볼터치가 눈·머리카락을 가리지 않게).
 */
export function overlay(base: Matrix, layer: Matrix, dy = 0, skinOnly = false): string[] {
  return base.map((row, y) => {
    const lr = layer[y - dy];
    if (!lr) return row;
    let out = "";
    for (let x = 0; x < row.length; x += 1) {
      const l = lr[x];
      out += l && l !== "." && (!skinOnly || row[x] === "S" || row[x] === "s") ? l : row[x];
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
  MANAGER: P.ACC_MANAGER,
};

/**
 * 그릴 롤 — 7롤 모두 전용 도트가 있다(AGP-62 §4, MANAGER = 클립보드). 타입 밖 값(서버 신규 롤)이 와도
 * 매트릭스·팔레트가 비지 않게 기획으로 접는다(방어 폴백).
 */
export function drawnRole(role: AgentRole): AgentRole {
  return role in ACC ? role : "PLANNER";
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
function backAccessory(role: AgentRole): Matrix {
  if (role === "PLANNER") return M.ACC_BACK_PLANNER;
  if (role === "REVIEWER") return [];
  if (role === "MANAGER") return P.ACC_BACK_MANAGER;
  return ACC[role];
}

/** 다리 행(18~22)만 걷기 프레임의 것으로 바꾼다 — sprites_p3e.py `walk()`와 같은 행 교체 */
function withLegs(base: Matrix, walk: Matrix): string[] {
  return [...base.slice(0, 18), ...walk.slice(18, 23), ...base.slice(23)];
}

// ── AGP-62 파츠 합성 ─────────────────────────────────────────────

/**
 * 정규화된 외형(스펙 §5.2 결과) — 색 키는 CSS 변수 이름에만 쓰이고, 모양 키(머리·액세서리)는 매트릭스를 고른다.
 * shirtColor null = 롤 기본.
 */
export interface AvatarLook {
  skinTone: SkinTone;
  hairStyle: HairStyle;
  hairColor: HairColor;
  shirtColor: ShirtColor | null;
  accessory: ExtraAccessory;
  showEmoji: boolean;
}

/** 머리카락 칸(H/h)을 두피 S로 — 머리 외곽선 K는 그대로 두어 모든 머리 모양이 같은 실루엣을 공유한다(§3.1) */
function bald(frame: Matrix, lastRow = 11): string[] {
  return frame.map((row, i) => (i <= lastRow ? row.replace(/[Hh]/g, "S") : row));
}

/** `short` 머리 레이어 = 원본의 H/h 칸만 — 대머리 + short = 원본(픽셀 동일) */
function extractHair(frame: Matrix): string[] {
  return frame.slice(0, 12).map((row) => row.replace(/[^Hh]/g, "."));
}

const BALD_STAND = bald(M.AVATAR_STAND);
const BALD_BACK = bald(M.AVATAR_BACK);
const BALD_SLUMP = bald(M.AVATAR_SEAT_SLUMP, 12);
const BALD_WALK_A = bald(M.WALK_A);
const BALD_WALK_B = bald(M.WALK_B);

interface Layers {
  front: Matrix;
  back: Matrix;
}

const HAIR: Record<HairStyle, Layers> = {
  short: { front: extractHair(M.AVATAR_STAND), back: extractHair(M.AVATAR_BACK) },
  bob: { front: P.HAIR_BOB_FRONT, back: P.HAIR_BOB_BACK },
  long: { front: P.HAIR_LONG_FRONT, back: P.HAIR_LONG_BACK },
  bangs: { front: P.HAIR_BANGS_FRONT, back: P.HAIR_BANGS_BACK },
  curly: { front: P.HAIR_CURLY_FRONT, back: P.HAIR_CURLY_BACK },
  ponytail: { front: P.HAIR_PONYTAIL_FRONT, back: P.HAIR_PONYTAIL_BACK },
  buzz: { front: P.HAIR_BUZZ_FRONT, back: P.HAIR_BUZZ_BACK },
};

const EXTRA: Record<ExtraAccessory, Layers> = {
  none: { front: [], back: [] },
  glasses: { front: P.EXTRA_GLASSES_FRONT, back: P.EXTRA_GLASSES_BACK },
  scarf: { front: P.EXTRA_SCARF_FRONT, back: P.EXTRA_SCARF_BACK },
  bowtie: { front: P.EXTRA_BOWTIE_FRONT, back: P.EXTRA_BOWTIE_BACK },
  cap: { front: P.EXTRA_CAP_FRONT, back: P.EXTRA_CAP_BACK },
  flower: { front: P.EXTRA_FLOWER_FRONT, back: P.EXTRA_FLOWER_BACK },
  blush: { front: P.EXTRA_BLUSH_FRONT, back: P.EXTRA_BLUSH_BACK },
};

/** 추가 액세서리가 롤 표식 자리와 겹치면 그 롤에서 쓸 수 없다(§2.5 가용성 규칙) */
export function extraAllowed(role: AgentRole, accessory: ExtraAccessory): boolean {
  const taken = P.ROLE_SLOTS[drawnRole(role)];
  return !P.EXTRA_SLOTS[accessory].some((slot) => taken.includes(slot));
}

/** 모양만 — 색은 CSS 변수라 합성·memo 키에 들어가지 않는다 */
export type AvatarShape = Pick<AvatarLook, "hairStyle" | "accessory">;

const DEFAULT_SHAPE: AvatarShape = { hairStyle: "short", accessory: "none" };

/** 실제로 그릴 모양 — 롤에서 못 쓰는 액세서리는 그리지 않는다(저장값은 건드리지 않음, §5.2-5) */
function drawnShape(role: AgentRole, shape: AvatarShape | undefined): AvatarShape {
  if (!shape) return DEFAULT_SHAPE;
  const hairStyle = shape.hairStyle in HAIR ? shape.hairStyle : "short";
  const known = shape.accessory in EXTRA ? shape.accessory : "none";
  const accessory = known !== "none" && extraAllowed(role, known) ? known : "none";
  return { hairStyle, accessory };
}

/** 합성 순서(§3.3): 대머리 기본 → 머리 → 추가 액세서리 → 롤 액세서리(항상 맨 위). 모든 레이어에 같은 dy */
function compose(base: Matrix, view: keyof Layers, dy: number, role: AgentRole, shape: AvatarShape): string[] {
  let m = overlay(base, HAIR[shape.hairStyle][view], dy);
  if (shape.accessory !== "none") {
    m = overlay(m, EXTRA[shape.accessory][view], dy, P.EXTRA_SKIN_ONLY.has(shape.accessory));
  }
  return overlay(m, view === "front" ? ACC[role] : backAccessory(role), dy);
}

export function avatarMatrix(role: AgentRole, frame: AvatarFrame, shape?: AvatarShape): string[] {
  const drawn = drawnRole(role);
  const s = drawnShape(drawn, shape);
  switch (frame) {
    case "standA":
      return compose(BALD_STAND, "front", 0, drawn, s);
    case "standB":
      return compose(breathe(BALD_STAND), "front", 1, drawn, s);
    case "seat":
      return compose(BALD_STAND.slice(0, 16), "front", 0, drawn, s);
    case "slump":
      return compose(BALD_SLUMP, "front", 1, drawn, s);
    case "seatFar":
      return compose(BALD_STAND.slice(0, 14), "front", 0, drawn, s);
    case "seatBack":
      return compose(BALD_BACK.slice(0, 16), "back", 0, drawn, s);
    case "back":
      return compose(BALD_BACK, "back", 0, drawn, s);
    case "walkA":
      return compose(BALD_WALK_A, "front", 0, drawn, s);
    case "walkB":
      return compose(BALD_WALK_B, "front", 0, drawn, s);
    case "walkBackA":
      return compose(withLegs(BALD_BACK, M.WALK_A), "back", 0, drawn, s);
    case "walkBackB":
      return compose(withLegs(BALD_BACK, M.WALK_B), "back", 0, drawn, s);
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

/** memo 키 `av:{role}:{hairStyle}:{accessory}:{frame}` — 방에 있는 직원 × 쓰이는 프레임만 lazy로 만든다(§3.3) */
export function avatarPaths(role: AgentRole, frame: AvatarFrame, shape?: AvatarShape): PixelPath[] {
  const drawn = drawnRole(role);
  const s = drawnShape(drawn, shape);
  return cached(`av:${drawn}:${s.hairStyle}:${s.accessory}:${frame}`, () =>
    matrixToPaths(avatarMatrix(drawn, frame, s), "char"),
  );
}

/** 머리 모양 스와치 썸네일(AGP-62 §6.4) — 앉음 0~12행에 머리 레이어만, 롤 액세서리 없이(16×13) */
export function hairThumbPaths(hairStyle: HairStyle): PixelPath[] {
  const style = hairStyle in HAIR ? hairStyle : "short";
  return cached(`hair-thumb:${style}`, () => matrixToPaths(overlay(BALD_STAND.slice(0, 13), HAIR[style].front), "char"));
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

/**
 * 설정 없는 직원의 외형 — 피부·머리색은 기존 slug 해시 공식 그대로(3톤·4색). 팔레트가 늘어도 공식을 넓히지 않는다
 * (넓히면 기존 직원 전원의 얼굴이 하루아침에 바뀐다, §5.1).
 */
export function defaultLook(slug: string): AvatarLook {
  const h = fnv1a32(slug);
  return {
    skinTone: SKINS[h % 3],
    hairStyle: "short",
    hairColor: String((h >>> 2) % 4) as HairColor,
    shirtColor: null,
    accessory: "none",
    showEmoji: false,
  };
}

const ROLE_SHIRTS: ReadonlySet<string> = new Set(["planner", "designer", "frontend", "backend", "ops", "reviewer", "manager"]);

/** 셔츠 슬롯 변수 — 롤 기본이면 롤 색, 롤 색 키면 `--office-role-{키}`, 그 외 `--office-shirt-{키}`(§3.4) */
function shirtVar(role: string, shirt: ShirtColor | null): string {
  if (!shirt) return `--office-role-${role}`;
  return ROLE_SHIRTS.has(shirt) ? `--office-role-${shirt}` : `--office-shirt-${shirt}`;
}

/** 아바타 `<g>`에 꽂는 슬롯 변수(색 hex가 아니라 --office-* 참조) — 8슬롯 + 추가 액세서리 2슬롯(§3.4) */
export function avatarVars(slug: string, role: AgentRole, look?: AvatarLook): Record<string, string> {
  const l = look ?? defaultLook(slug);
  const drawn = drawnRole(role);
  const r = drawn.toLowerCase();
  const shirt = shirtVar(r, l.shirtColor);
  const vars: Record<string, string> = {
    "--av-skin": `var(--office-skin-${l.skinTone})`,
    "--av-skin2": `var(--office-skin-${l.skinTone}2)`,
    "--av-hair": `var(--office-hair-${l.hairColor})`,
    "--av-hair2": `var(--office-hair-${l.hairColor}2)`,
    "--av-shirt": `var(${shirt})`,
    "--av-shirt2": `var(${shirt}2)`,
    "--av-acc": `var(--office-acc-${r})`,
    "--av-acc2": `var(--office-acc-${r}2)`,
  };
  const accessory = drawnShape(drawn, l).accessory;
  if (accessory !== "none") {
    vars["--av-extra"] = `var(--office-extra-${accessory})`;
    vars["--av-extra2"] = `var(--office-extra-${accessory}2)`;
  }
  return vars;
}

// ── P3g 사람 아바타·대화 장면(AGP-65) ─────────────────────────────

/** 사람 아바타 프레임 — 4방향 × (서기·걷기 A·B). 왼쪽은 오른쪽 옆모습의 좌우 반전, 옆 걷기 B = 옆 서기 */
export type UserFrame = "stand" | "walkA" | "walkB";

const mirrorRows = (m: Matrix): string[] => m.map((row) => [...row].reverse().join(""));

export function userMatrix(facing: "down" | "up" | "left" | "right", frame: UserFrame): readonly string[] {
  if (facing === "down") return frame === "walkA" ? M.USER_FRONT_WALK_A : frame === "walkB" ? M.USER_FRONT_WALK_B : M.USER_FRONT;
  if (facing === "up") return frame === "walkA" ? M.USER_BACK_WALK_A : frame === "walkB" ? M.USER_BACK_WALK_B : M.USER_BACK;
  const right = frame === "walkA" ? M.USER_SIDE_WALK_A : M.USER_SIDE_R;
  return facing === "right" ? right : mirrorRows(right);
}

export function userPaths(facing: "down" | "up" | "left" | "right", frame: UserFrame): PixelPath[] {
  return cached(`user:${facing}:${frame}`, () => matrixToPaths(userMatrix(facing, frame), "user"));
}

/** 사람 아바타 `<g>`에 꽂는 슬롯 — 8슬롯 중 피부·머리 4개만(나머지는 --office-user-* 고정색). 배정식은 봇과 같다 */
export function userVars(userId: string | null): Record<string, string> {
  const h = userId ? fnv1a32(userId) : 0;
  const skin = userId ? SKINS[h % 3] : "a";
  const hair = userId ? (h >>> 2) % 4 : 0;
  return {
    "--av-skin": `var(--office-skin-${skin})`,
    "--av-skin2": `var(--office-skin-${skin}2)`,
    "--av-hair": `var(--office-hair-${hair})`,
    "--av-hair2": `var(--office-hair-${hair}2)`,
  };
}

/** 봇 표정(§4.6) — 평소·생각 중·기쁨·곤란 + 깜빡임 */
export type FaceExpression = "NORMAL" | "THINKING" | "HAPPY" | "TROUBLED" | "BLINK";

const BALD_FACES: Record<FaceExpression, string[]> = {
  NORMAL: bald(M.FACE_NORMAL),
  THINKING: bald(M.FACE_THINKING),
  HAPPY: bald(M.FACE_HAPPY),
  TROUBLED: bald(M.FACE_TROUBLED),
  BLINK: bald(M.FACE_BLINK),
};

/** 표정 프레임 — 앉음 기본 + 표정 패치를 서기·앉음과 같은 합성 규칙으로. 리뷰 안경은 눈 위에 덮이고 입·효과로 구분된다 */
export function faceMatrix(role: AgentRole, expression: FaceExpression, shape?: AvatarShape): string[] {
  const drawn = drawnRole(role);
  return compose(BALD_FACES[expression], "front", 0, drawn, drawnShape(drawn, shape));
}

/** 대화 장면(P3g §4.2)·편집 미리보기가 확대해 그린다 — memo 키 `face:{role}:{hairStyle}:{accessory}:{expression}` */
export function facePaths(role: AgentRole, expression: FaceExpression, shape?: AvatarShape): PixelPath[] {
  const drawn = drawnRole(role);
  const s = drawnShape(drawn, shape);
  return cached(`face:${drawn}:${s.hairStyle}:${s.accessory}:${expression}`, () =>
    matrixToPaths(faceMatrix(drawn, expression, s), "char"),
  );
}

/** 대화 장면 격자(§4.2) — 156×70 장면 px */
export const SCENE_W = 156;
export const SCENE_H = 70;

/**
 * 대화 장면의 정적 배경(벽·바닥·창·벽시계·화분·러그·봇 의자) — 테마 무관(색은 CSS 변수)이라 모듈 memo 1벌.
 * 벽은 P3a WALL을 y=−12에 반복해 걸레받이가 벽 아래쪽에 오게 한다. 창밖 이펙트는 넣지 않는다(장면은 정적).
 */
export function sceneBackgroundPaths(): PixelPath[] {
  return cached("scene-bg", () => {
    const out: PixelPath[] = [];
    const floor = new Map<string, string[]>();
    for (let ty = 0; ty < 4; ty += 1) {
      for (let tx = 0; tx < 10; tx += 1) {
        const tile = (tx + ty) % 2 === 0 ? M.FLOOR_A : M.FLOOR_B;
        for (const [ch, list] of runs(tile, tx * 16, 20 + ty * 16)) floor.set(ch, [...(floor.get(ch) ?? []), ...list]);
      }
    }
    for (const ch of ["a", "l"]) {
      const list = floor.get(ch);
      if (list) out.push({ cls: `px-floor-${ch}`, d: list.join("") });
    }
    const wall = new Map<string, string[]>();
    for (let tx = 0; tx < 10; tx += 1) {
      for (const [ch, list] of runs(M.WALL.slice(12), tx * 16, 0)) wall.set(ch, [...(wall.get(ch) ?? []), ...list]);
    }
    for (const ch of ["w", "v", "t", "K"]) {
      const list = wall.get(ch);
      if (list) out.push({ cls: `px-wall-${ch}`, d: list.join("") });
    }
    out.push(...matrixToPaths(M.WINDOW, "window", 54, 1));
    out.push(...matrixToPaths(M.WALL_CLOCK, "clock", 30, 8));
    out.push(...matrixToPaths(M.PLANT, "plant", 6, 12));
    const [rx, ry, rw, rh] = [18, 44, 116, 26];
    out.push({ cls: "px-rug-ol", d: rectPath(rx, ry, rw, rh) });
    out.push({ cls: "px-rug-fill", d: rectPath(rx + 1, ry + 1, rw - 2, rh - 2) });
    out.push({ cls: "px-rug-line", d: rectPath(rx + 3, ry + 3, rw - 6, rh - 6) });
    out.push({ cls: "px-rug-fill", d: rectPath(rx + 4, ry + 4, rw - 8, rh - 8) });
    out.push(...matrixToPaths(M.CHAIR, "furn", 65, 28));
    return out;
  });
}
