import { describe, expect, it } from "vitest";
import { roomGeometry } from "./pixel";
import {
  dumpWalkGrid,
  findPath,
  isReachable,
  isWalkable,
  personaPlace,
  resolveTarget,
  talkSpot,
  tileKey,
  walkGrid,
  zoneName,
  type PersonaPlace,
  type Tile,
} from "./walkGrid";
import type { AgentPersonaState } from "../components/AgentGlyphs";

/** 스펙 부록 D(walkgrid_n7.txt·walkgrid_n12.txt) 그대로 — 가구 좌표가 바뀌면 layout_p3g.py를 다시 돌려 갱신한다 */
const N7 = `   01234567890123456789012345678
 0 #############################
 1 #############################
 2 x#...#...#...#........#xxxxxx
 3 ###.###.###.###.......#xxxxxx
 4 ......................#xxxxxx
 5 ......................#######
 6 .#...#...#............#######
 7 ###.###.###...........#######
 8 ......................#......
 9 ...............#......D......
10 ...............#......D......
11 #................####.#.....#
12 .......@..............#.....#`;

const N12 = `   01234567890123456789012345678
 0 #############################
 1 #############################
 2 x#...#...#...#........#xxxxxx
 3 ###.###.###.###.......#xxxxxx
 4 ......................#xxxxxx
 5 ......................#######
 6 .#...#...#...#........#######
 7 ###.###.###.###.......#######
 8 ......................#......
 9 ...............#......#......
10 .#...#...#...#.#......#......
11 ###.###.###.###.......#......
12 ......................D......
13 ......................D......
14 #................####.#.....#
15 .......@..............#.....#`;

const grid7 = walkGrid(7, roomGeometry(7).height);
const grid12 = walkGrid(12, roomGeometry(12).height);

const t = (tx: number, ty: number): Tile => ({ tx, ty });

function assertValidPath(path: Tile[], grid: ReturnType<typeof walkGrid>) {
  for (let i = 0; i < path.length; i += 1) {
    expect(isWalkable(grid, path[i])).toBe(true);
    if (i > 0) {
      const d = Math.abs(path[i].tx - path[i - 1].tx) + Math.abs(path[i].ty - path[i - 1].ty);
      expect(d).toBe(1);
    }
  }
}

describe("보행 맵 — 부록 D 덤프와 일치(가구 좌표에서 계산, 하드코딩 맵 없음)", () => {
  it("7명(464×208)", () => {
    expect(grid7.height).toBe(208);
    expect(dumpWalkGrid(grid7)).toBe(N7);
    expect(grid7.doorRows).toEqual([9, 10]);
  });

  it("12명(464×256)", () => {
    expect(grid12.height).toBe(256);
    expect(dumpWalkGrid(grid12)).toBe(N12);
    expect(grid12.doorRows).toEqual([12, 13]);
  });
});

describe("A* — 4방향·장애물·도달 불가", () => {
  it("입장 위치에서 회의실 안쪽까지 문으로 지나가는 4방향 경로", () => {
    const path = findPath(grid7, grid7.spawn, t(26, 9))!;
    expect(path[0]).toEqual(grid7.spawn);
    expect(path[path.length - 1]).toEqual(t(26, 9));
    assertValidPath(path, grid7);
    // 칸막이는 문 타일(22, 9·10)로만 지난다
    expect(path.filter((p) => p.tx === 22).every((p) => grid7.doorRows.includes(p.ty))).toBe(true);
    // 맨해튼 최단(돌아가지 않는다): |26−7| + |12−9| = 22
    expect(path.length - 1).toBe(22);
  });

  it("책상은 돌아간다 — 책상 셀 사이 통로 열로 위아래를 오간다", () => {
    const path = findPath(grid7, t(0, 4), t(0, 8))!;
    assertValidPath(path, grid7);
    expect(path.some((p) => p.tx === 3)).toBe(true);
    expect(path.every((p) => !(p.tx === 0 && p.ty === 7))).toBe(true);
  });

  it("꺾임이 적은 직선을 고른다 — 같은 길이의 계단 경로보다 L자", () => {
    const path = findPath(grid7, t(0, 4), t(6, 5))!;
    expect(path.length - 1).toBe(7);
    let turns = 0;
    for (let i = 2; i < path.length; i += 1) {
      const a = { dx: path[i - 1].tx - path[i - 2].tx, dy: path[i - 1].ty - path[i - 2].ty };
      const b = { dx: path[i].tx - path[i - 1].tx, dy: path[i].ty - path[i - 1].ty };
      if (a.dx !== b.dx || a.dy !== b.dy) turns += 1;
    }
    expect(turns).toBe(1);
  });

  it("서 있는 봇 발 타일은 비용 +4 — 우회로가 있으면 돌아간다", () => {
    const soft = new Set([tileKey(t(10, 4))]);
    const direct = findPath(grid7, t(5, 4), t(15, 4))!;
    expect(direct.some((p) => tileKey(p) === "10,4")).toBe(true);
    const around = findPath(grid7, t(5, 4), t(15, 4), soft)!;
    assertValidPath(around, grid7);
    expect(around.some((p) => tileKey(p) === "10,4")).toBe(false);
  });

  it("막힌 타일·닿지 않는 섬은 경로 없음(null)", () => {
    expect(findPath(grid7, grid7.spawn, t(1, 3))).toBeNull();
    // 회의실 위쪽 띠(ty 2~4, tx 23~28)는 걸을 수 있지만 닿지 않는다
    expect(isWalkable(grid7, t(25, 3))).toBe(true);
    expect(isReachable(grid7, t(25, 3))).toBe(false);
    expect(findPath(grid7, grid7.spawn, t(25, 3))).toBeNull();
  });
});

describe("목적지 해석 — 닿는 타일 중 맨해튼 최소(동률 y → x)", () => {
  it("책상 위 클릭은 책상 앞 통로, 회의실 위쪽 띠는 (21, 3)", () => {
    expect(resolveTarget(grid7, t(1, 3))).toEqual(t(1, 4));
    // 동률 — (2,3) 책상 위는 (2,2)·(2,4)가 둘 다 거리 1 → y 작은 쪽
    expect(resolveTarget(grid7, t(2, 3))).toEqual(t(2, 2));
    expect(resolveTarget(grid7, t(25, 3))).toEqual(t(21, 3));
    expect(resolveTarget(grid7, t(10, 9))).toEqual(t(10, 9));
  });
});

describe("대화 위치(§2.4)", () => {
  const states7: AgentPersonaState[] = ["RUNNING", "QUEUED", "WAITING_APPROVAL", "BLOCKED", "IDLE", "RUNNING", "IDLE"];
  const places = (states: AgentPersonaState[], meeting: number[] = []): PersonaPlace[] =>
    states.map((s, i) => personaPlace(s, i, meeting.includes(i)));

  it("책상 봇 — 책상 오른쪽 통로(같은 줄), 왼쪽 보기", () => {
    const ps = places(states7);
    expect(talkSpot(grid7, ps[0], ps)).toEqual({ tile: t(3, 3), facing: "left", alignX: 0 });
    expect(talkSpot(grid7, ps[5], ps)).toEqual({ tile: t(7, 7), facing: "left", alignX: 0 });
  });

  it("서 있는 봇 — 아래가 1순위(위 보기), 유휴 자리 x에 반걸음 정렬", () => {
    const ps = places(states7);
    // 유휴 #4: (294, 84) → 발 타일 (18, 6) → 아래 (18, 7)
    const idle = talkSpot(grid7, ps[4], ps)!;
    expect(idle.tile).toEqual(t(18, 7));
    expect(idle.facing).toBe("up");
    expect(idle.alignX).toBe(294 - 16 * 18);
    // 대기열 #1: (108, 50) → 발 (7, 4) → 아래 (7, 5)
    expect(talkSpot(grid7, ps[1], ps)).toMatchObject({ tile: t(7, 5), facing: "up" });
  });

  it("회의 참석 봇 — 회의실 문 앞(문 아래 줄), 오른쪽 보기", () => {
    const ps = places(states7, [0, 4]);
    expect(talkSpot(grid7, ps[0], ps)).toEqual({ tile: t(21, 10), facing: "right", alignX: 0 });
    const ps12 = places(Array.from({ length: 12 }, () => "IDLE" as AgentPersonaState), [3]);
    expect(talkSpot(grid12, ps12[3], ps12)!.tile).toEqual(t(21, 13));
  });

  it("6·7·8·12명 × 전원 유휴/작업/대기열 — 전원의 대화 위치가 걸을 수 있고·닿고·다른 봇 발밑이 아니다", () => {
    for (const n of [6, 7, 8, 12]) {
      const grid = walkGrid(n, roomGeometry(n).height);
      for (const s of ["IDLE", "RUNNING", "QUEUED"] as AgentPersonaState[]) {
        const ps = places(Array.from({ length: n }, () => s));
        const feet = new Set(ps.filter((p) => p.kind === "stand").map((p) => tileKey({ tx: Math.floor(((p as { x: number }).x + 8) / 16), ty: Math.floor(((p as { y: number }).y + 22) / 16) })));
        for (const p of ps) {
          const spot = talkSpot(grid, p, ps);
          expect(spot, `n=${n} ${s} #${p.index}`).not.toBeNull();
          expect(isReachable(grid, spot!.tile)).toBe(true);
          expect(feet.has(tileKey(spot!.tile))).toBe(false);
          expect(findPath(grid, grid.spawn, spot!.tile)).not.toBeNull();
        }
      }
    }
  });

  it("비활성은 대화 위치 없음", () => {
    const ps = places(["INACTIVE"]);
    expect(talkSpot(grid7, ps[0], ps)).toBeNull();
  });
});

describe("구역 이름(§2.6)", () => {
  it("입구·업무·휴게·회의실 앞·회의실", () => {
    expect(zoneName(grid7, grid7.spawn)).toBe("입구");
    expect(zoneName(grid7, t(3, 4))).toBe("업무 구역");
    expect(zoneName(grid7, t(18, 7))).toBe("휴게 구역");
    expect(zoneName(grid7, t(21, 9))).toBe("회의실 앞");
    expect(zoneName(grid7, t(25, 9))).toBe("회의실");
  });
});
