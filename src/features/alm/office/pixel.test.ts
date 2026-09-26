import { describe, expect, it } from "vitest";
import { AVATAR_STAND } from "./matrices";
import * as M from "./matrices";
import { avatarMatrix, avatarPaths, avatarVars, breathe, fnv1a32, matrixToPaths, overlay, roomGeometry } from "./pixel";

/** 스펙 §2.6 "완성 예" — FRONTEND 서기 프레임 A를 규칙대로 변환한 정본 */
const SPEC_FRONTEND_STAND_A: Record<string, string> = {
  P: "M5 18h6v1h-6zM5 19h6v1h-6zM5 20h2v1h-2zM9 20h2v1h-2zM5 21h1v1h-1zM10 21h1v1h-1z",
  p: "M6 21h1v1h-1zM9 21h1v1h-1z",
  C: "M5 12h2v1h-2zM9 12h2v1h-2zM4 13h8v1h-8zM3 14h1v1h-1zM5 14h6v1h-6zM12 14h1v1h-1zM3 15h1v1h-1zM5 15h6v1h-6zM12 15h1v1h-1zM5 16h6v1h-6z",
  c: "M3 16h1v1h-1zM12 16h1v1h-1zM5 17h6v1h-6z",
  S: "M5 6h6v1h-6zM4 7h8v1h-8zM4 8h1v1h-1zM6 8h4v1h-4zM11 8h1v1h-1zM3 9h2v1h-2zM6 9h4v1h-4zM11 9h2v1h-2zM3 10h4v1h-4zM9 10h4v1h-4zM4 11h8v1h-8zM3 17h1v1h-1zM12 17h1v1h-1z",
  s: "M7 10h2v1h-2zM7 12h2v1h-2z",
  H: "M5 2h6v1h-6zM3 3h10v1h-10zM3 4h9v1h-9zM3 5h9v1h-9zM4 6h1v1h-1zM11 6h1v1h-1z",
  h: "M12 4h1v1h-1zM12 5h1v1h-1z",
  A: "M4 1h1v1h-1zM11 1h1v1h-1zM3 2h1v1h-1zM12 2h1v1h-1zM2 6h1v1h-1zM13 6h1v1h-1zM2 7h1v1h-1zM13 7h1v1h-1z",
  a: "M5 1h6v1h-6zM2 8h1v1h-1zM13 8h1v1h-1z",
  K: "M4 0h8v1h-8zM3 1h1v1h-1zM12 1h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM11 2h1v1h-1zM13 2h1v1h-1zM2 3h1v1h-1zM13 3h1v1h-1zM2 4h1v1h-1zM13 4h1v1h-1zM2 5h1v1h-1zM13 5h1v1h-1zM1 6h1v1h-1zM3 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM3 8h1v1h-1zM5 8h1v1h-1zM10 8h1v1h-1zM12 8h1v1h-1zM14 8h1v1h-1zM2 9h1v1h-1zM5 9h1v1h-1zM10 9h1v1h-1zM13 9h1v1h-1zM2 10h1v1h-1zM13 10h1v1h-1zM3 11h1v1h-1zM12 11h1v1h-1zM4 12h1v1h-1zM11 12h1v1h-1zM3 13h1v1h-1zM12 13h1v1h-1zM2 14h1v1h-1zM4 14h1v1h-1zM11 14h1v1h-1zM13 14h1v1h-1zM2 15h1v1h-1zM4 15h1v1h-1zM11 15h1v1h-1zM13 15h1v1h-1zM2 16h1v1h-1zM4 16h1v1h-1zM11 16h1v1h-1zM13 16h1v1h-1zM2 17h1v1h-1zM4 17h1v1h-1zM11 17h1v1h-1zM13 17h1v1h-1zM3 18h2v1h-2zM11 18h2v1h-2zM4 19h1v1h-1zM11 19h1v1h-1zM4 20h1v1h-1zM7 20h2v1h-2zM11 20h1v1h-1zM4 21h1v1h-1zM7 21h2v1h-2zM11 21h1v1h-1zM3 22h4v1h-4zM9 22h4v1h-4z",
};

describe("매트릭스 → SVG path 변환(스펙 §2.6 구현 계약)", () => {
  it("FRONTEND 서기 A가 스펙의 완성 예와 문자별로 정확히 같다", () => {
    const paths = avatarPaths("FRONTEND", "standA");
    const byChar = Object.fromEntries(paths.map((p) => [p.cls.replace("px-char-", ""), p.d]));
    expect(byChar).toEqual(SPEC_FRONTEND_STAND_A);
  });

  it("외곽선 K는 마지막에 칠한다", () => {
    const paths = avatarPaths("FRONTEND", "standA");
    expect(paths[paths.length - 1].cls).toBe("px-char-K");
  });

  it("같은 입력은 memo된 같은 배열을 돌려준다(폴링마다 재계산 없음)", () => {
    expect(avatarPaths("OPS", "seat")).toBe(avatarPaths("OPS", "seat"));
  });

  it("오프셋은 정수 좌표로 더해진다", () => {
    expect(matrixToPaths(["K."], "ovl", 10, 20)).toEqual([{ cls: "px-ovl-K", d: "M10 20h1v1h-1z" }]);
  });
});

describe("프레임 합성", () => {
  it("레이어의 `.`은 아래를 유지하고 dy만큼 밀어 덮는다", () => {
    expect(overlay(["abc", "def"], ["x.y"], 1)).toEqual(["abc", "xey"]);
  });

  it("숨쉬기 B는 0~16행을 1ap 내리고 다리(18~23행)는 그대로 둔다", () => {
    const b = breathe(AVATAR_STAND);
    expect(b).toHaveLength(24);
    expect(b[0]).toBe("................");
    expect(b[1]).toBe(AVATAR_STAND[0]);
    expect(b[17]).toBe(AVATAR_STAND[16]);
    expect(b.slice(18)).toEqual(AVATAR_STAND.slice(18));
  });

  it("앉음은 서기의 0~15행(16×16), 엎드림도 16행이다", () => {
    expect(avatarMatrix("PLANNER", "seat")).toHaveLength(16);
    expect(avatarMatrix("PLANNER", "slump")).toHaveLength(16);
  });

  it("모든 스프라이트 행 길이가 선언한 폭과 같다", () => {
    for (const [name, matrix] of Object.entries(M)) {
      const width = matrix[0].length;
      expect(matrix.every((row) => row.length === width), name).toBe(true);
    }
  });
});

describe("방 크기(스펙 §1.4)", () => {
  it("6명은 기본 352×192", () => {
    expect(roomGeometry(6)).toEqual({ width: 352, height: 192, rugHeight: 96 });
  });

  it("7~8명은 유휴 자리 3행이 되어 공식대로 208로 늘어난다(스펙 확장 공식이 정본)", () => {
    expect(roomGeometry(8).height).toBe(208);
  });

  it("9명 이상이면 책상·유휴 자리 행만큼 16 단위로 늘어난다", () => {
    const geo = roomGeometry(9);
    expect(geo.height).toBe(256);
    expect(geo.height % 16).toBe(0);
    expect(geo.rugHeight).toBe(100);
  });
});

describe("피부·머리 배정", () => {
  it("FNV-1a 32비트 표준값", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
  });

  it("slug로 결정적이고, 셔츠·액세서리는 롤 변수를 가리킨다", () => {
    const a = avatarVars("backend-bot", "BACKEND");
    expect(avatarVars("backend-bot", "BACKEND")).toEqual(a);
    expect(a["--av-shirt"]).toBe("var(--office-role-backend)");
    expect(a["--av-acc2"]).toBe("var(--office-acc-backend2)");
    expect(a["--av-skin"]).toMatch(/^var\(--office-skin-[abc]\)$/);
    expect(a["--av-hair2"]).toMatch(/^var\(--office-hair-[0-3]2\)$/);
  });
});
