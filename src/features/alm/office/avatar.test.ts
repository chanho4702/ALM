import { describe, expect, it } from "vitest";
import type { AgentRole } from "../store/types";
import * as M from "./matrices";
import * as P from "./avatarParts";
import fixture from "./avatarParts.fixture.json";
import {
  avatarMatrix,
  avatarPaths,
  avatarVars,
  breathe,
  defaultLook,
  extraAllowed,
  faceMatrix,
  facePaths,
  overlay,
  type AvatarFrame,
  type AvatarLook,
  type FaceExpression,
} from "./pixel";
import { avatarConfigPatch, parseAvatarConfig, randomLook, sameLook, serializeAvatarConfig } from "./avatarConfig";

const ROLES: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS", "REVIEWER", "MANAGER"];
const LEGACY_ROLES = ROLES.filter((r) => r !== "MANAGER");
const FRAMES: readonly AvatarFrame[] = [
  "standA", "standB", "seat", "slump", "seatFar", "seatBack", "back", "walkA", "walkB", "walkBackA", "walkBackB",
];
const FACES: readonly FaceExpression[] = ["NORMAL", "THINKING", "HAPPY", "TROUBLED", "BLINK"];
/** 스크립트(parts_agp62.py) 프레임 이름 → 프론트 호출 */
const FACE_FRAME: Record<string, FaceExpression> = {
  faceNormal: "NORMAL", faceThinking: "THINKING", faceHappy: "HAPPY", faceTroubled: "TROUBLED", faceBlink: "BLINK",
};

const LEGACY_ACC: Record<string, readonly string[]> = {
  PLANNER: M.ACC_PLANNER, DESIGNER: M.ACC_DESIGNER, FRONTEND: M.ACC_FRONTEND,
  BACKEND: M.ACC_BACKEND, OPS: M.ACC_OPS, REVIEWER: M.ACC_REVIEWER,
};
const LEGACY_BACK: Record<string, readonly string[]> = {
  ...LEGACY_ACC, PLANNER: M.ACC_BACK_PLANNER, REVIEWER: [],
};
const legs = (base: readonly string[], walk: readonly string[]) => [...base.slice(0, 18), ...walk.slice(18, 23), ...base.slice(23)];

/** AGP-62 이전 운영 합성(머리카락이 몸 매트릭스에 박힌 원본 + 롤 액세서리) — 회귀 기준 */
function legacy(role: string, frame: AvatarFrame | FaceExpression): string[] {
  const a = LEGACY_ACC[role];
  const b = LEGACY_BACK[role];
  const table: Record<string, [readonly string[], readonly string[], number]> = {
    standA: [M.AVATAR_STAND, a, 0], standB: [breathe(M.AVATAR_STAND), a, 1], seat: [M.AVATAR_STAND.slice(0, 16), a, 0],
    slump: [M.AVATAR_SEAT_SLUMP, a, 1], seatFar: [M.AVATAR_STAND.slice(0, 14), a, 0], seatBack: [M.AVATAR_BACK.slice(0, 16), b, 0],
    back: [M.AVATAR_BACK, b, 0], walkA: [M.WALK_A, a, 0], walkB: [M.WALK_B, a, 0],
    walkBackA: [legs(M.AVATAR_BACK, M.WALK_A), b, 0], walkBackB: [legs(M.AVATAR_BACK, M.WALK_B), b, 0],
    NORMAL: [M.FACE_NORMAL, a, 0], THINKING: [M.FACE_THINKING, a, 0], HAPPY: [M.FACE_HAPPY, a, 0],
    TROUBLED: [M.FACE_TROUBLED, a, 0], BLINK: [M.FACE_BLINK, a, 0],
  };
  const [base, layer, dy] = table[frame];
  return overlay(base, layer, dy);
}

describe("AGP-62 합성 — 설정 없는 직원은 현 운영 도트와 픽셀 동일(회귀 기준)", () => {
  it("6롤 × 16프레임(서기 A/B·앉음·엎드림·먼 좌석·뒷좌석·뒷모습·걷기 4·표정 5)이 옛 합성과 같다", () => {
    for (const role of LEGACY_ROLES) {
      for (const frame of FRAMES) {
        expect(avatarMatrix(role, frame), `${role}:${frame}`).toEqual(legacy(role, frame));
        expect(avatarMatrix(role, frame, { hairStyle: "short", accessory: "none" }), `${role}:${frame}`).toEqual(legacy(role, frame));
      }
      for (const face of FACES) {
        expect(faceMatrix(role, face), `${role}:${face}`).toEqual(legacy(role, face));
      }
    }
  });

  it("설정 없음과 기본 외형은 같은 memo 항목을 쓴다 — 폴링마다 새 path를 만들지 않는다", () => {
    expect(avatarPaths("OPS", "seat", { hairStyle: "short", accessory: "none" })).toBe(avatarPaths("OPS", "seat"));
    expect(facePaths("DESIGNER", "HAPPY", defaultLook("x"))).toBe(facePaths("DESIGNER", "HAPPY"));
  });

  it("설정 없는 직원의 색 슬롯은 옛 8슬롯 그대로(slug 해시 3톤·4색) — 추가 액세서리 슬롯은 없다", () => {
    const v = avatarVars("backend-bot", "BACKEND");
    expect(Object.keys(v)).toHaveLength(8);
    expect(v["--av-skin"]).toMatch(/^var\(--office-skin-[abc]\)$/);
    expect(v["--av-hair"]).toMatch(/^var\(--office-hair-[0-3]\)$/);
    expect(avatarVars("backend-bot", "BACKEND", parseAvatarConfig(null, "backend-bot"))).toEqual(v);
  });
});

describe("AGP-62 합성 — 정본 스크립트(parts_agp62.py compose)와 같은 결과", () => {
  for (const combo of fixture as { role: AgentRole; hairStyle: AvatarLook["hairStyle"]; accessory: AvatarLook["accessory"]; frames: Record<string, string[]> }[]) {
    it(`${combo.role} · ${combo.hairStyle} · ${combo.accessory} — 16프레임`, () => {
      const shape = { hairStyle: combo.hairStyle, accessory: combo.accessory };
      for (const [frame, rows] of Object.entries(combo.frames)) {
        const face = FACE_FRAME[frame];
        const got = face ? faceMatrix(combo.role, face, shape) : avatarMatrix(combo.role, frame as AvatarFrame, shape);
        expect(got, frame).toEqual(rows);
      }
    });
  }
});

describe("AGP-62 합성 — 전 조합", () => {
  it("7롤 × 머리 7 × 액세서리 7 × 16프레임이 모두 폭 16으로 그려진다(크래시·빈 매트릭스 없음)", () => {
    for (const role of ROLES) {
      for (const hairStyle of P.HAIR_STYLE_ORDER) {
        for (const accessory of P.EXTRA_ORDER) {
          const shape = { hairStyle, accessory };
          for (const frame of FRAMES) {
            const m = avatarMatrix(role, frame, shape);
            expect(m.every((row) => row.length === 16)).toBe(true);
            expect(m.join("")).toMatch(/K/);
          }
          for (const face of FACES) expect(faceMatrix(role, face, shape)).toHaveLength(16);
        }
      }
    }
  });

  it("생성된 파츠 매트릭스는 전부 폭 16", () => {
    for (const [name, value] of Object.entries(P)) {
      if (!/_(FRONT|BACK)$|^ACC_/.test(name) || !Array.isArray(value)) continue;
      expect((value as string[]).every((row) => row.length === 16), name).toBe(true);
    }
  });

  it("롤 충돌 — 롤 표식 자리와 겹치는 액세서리는 그 롤에서 선택 불가(스펙 §2.5 표의 '쓸 수 없는 롤')", () => {
    const blocked = (accessory: AvatarLook["accessory"]) => ROLES.filter((r) => !extraAllowed(r, accessory));
    expect(blocked("glasses")).toEqual(["REVIEWER"]);
    expect(blocked("scarf")).toEqual([]);
    expect(blocked("bowtie")).toEqual([]);
    expect(blocked("cap")).toEqual(["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS"]);
    expect(blocked("flower")).toEqual(["DESIGNER", "BACKEND", "OPS"]);
    expect(blocked("blush")).toEqual([]);
  });

  it("선택 불가 액세서리는 그리지 않는다 — 저장값이 남아 있어도 기본 합성과 같고 추가 슬롯 변수도 없다", () => {
    expect(avatarMatrix("DESIGNER", "standA", { hairStyle: "short", accessory: "cap" })).toEqual(avatarMatrix("DESIGNER", "standA"));
    const look = parseAvatarConfig('{"v":1,"accessory":"glasses"}', "reviewer-bot");
    expect(look.accessory).toBe("glasses");
    expect(avatarVars("reviewer-bot", "REVIEWER", look)["--av-extra"]).toBeUndefined();
  });

  it("안경은 피부 위에만 — 기쁨 표정의 눈(K)이 안경 너머로 그대로 보인다", () => {
    const plain = faceMatrix("PLANNER", "HAPPY");
    const glasses = faceMatrix("PLANNER", "HAPPY", { hairStyle: "short", accessory: "glasses" });
    for (let y = 7; y <= 10; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (plain[y][x] === "K") expect(glasses[y][x]).toBe("K");
      }
    }
    expect(glasses.join("")).toMatch(/[Ee]/);
  });

  it("롤 액세서리는 항상 맨 위 — 포니테일 꼬리 위에 헤드폰 이어컵이 칠해진다", () => {
    const pony = avatarMatrix("FRONTEND", "standA", { hairStyle: "ponytail", accessory: "none" });
    const acc = M.ACC_FRONTEND;
    acc.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== ".") expect(pony[y][x]).toBe(ch);
      });
    });
  });

  it("추가 액세서리 색 슬롯 — 그릴 때만 --av-extra/--av-extra2를 넣는다", () => {
    const look: AvatarLook = { ...defaultLook("a"), accessory: "scarf" };
    const v = avatarVars("a", "OPS", look);
    expect(v["--av-extra"]).toBe("var(--office-extra-scarf)");
    expect(v["--av-extra2"]).toBe("var(--office-extra-scarf2)");
  });

  it("셔츠 — 롤 기본·다른 롤 색·자유 색이 각각 맞는 변수를 가리킨다", () => {
    const base = defaultLook("x");
    expect(avatarVars("x", "OPS", base)["--av-shirt"]).toBe("var(--office-role-ops)");
    expect(avatarVars("x", "OPS", { ...base, shirtColor: "manager" })["--av-shirt2"]).toBe("var(--office-role-manager2)");
    expect(avatarVars("x", "OPS", { ...base, shirtColor: "sky" })["--av-shirt"]).toBe("var(--office-shirt-sky)");
  });
});

describe("avatarConfig 읽기(§5.2)", () => {
  const slug = "designer-bot";
  const base = defaultLook(slug);

  it("null·빈 문자열·깨진 JSON·객체 아님 → 전 필드 기본값", () => {
    for (const raw of [null, undefined, "", "{", "[1,2]", "42", "null", '"x"']) {
      expect(parseAvatarConfig(raw, slug)).toEqual(base);
    }
  });

  it("필드마다 허용값 밖이면 그 필드만 기본값, 모르는 키 무시, v>1도 아는 필드는 읽는다", () => {
    const look = parseAvatarConfig(
      '{"v":2,"skinTone":"z","hairStyle":"bob","hairColor":4,"shirtColor":"sky","accessory":"flower","showEmoji":1,"wings":"x"}',
      slug,
    );
    expect(look).toEqual({ ...base, hairStyle: "bob", shirtColor: "sky", accessory: "flower", showEmoji: true });
  });

  it("showEmoji는 숫자 1일 때만 켠다", () => {
    expect(parseAvatarConfig('{"showEmoji":"1"}', slug).showEmoji).toBe(false);
    expect(parseAvatarConfig('{"showEmoji":true}', slug).showEmoji).toBe(false);
  });

  it("같은 원문은 memo — 폴링마다 다시 파싱하지 않는다", () => {
    const raw = '{"v":1,"hairStyle":"curly"}';
    expect(parseAvatarConfig(raw, slug)).toBe(parseAvatarConfig(raw, slug));
  });
});

describe("avatarConfig 쓰기(§5.3)", () => {
  const slug = "ops-bot";
  const base = defaultLook(slug);

  it("현재 상태 전체를 표 순서로 — shirtColor는 롤 기본이 아닐 때만, showEmoji는 1일 때만", () => {
    expect(serializeAvatarConfig({ ...base, hairStyle: "bob", skinTone: "d", hairColor: "4", accessory: "flower" })).toBe(
      '{"v":1,"skinTone":"d","hairStyle":"bob","hairColor":"4","accessory":"flower"}',
    );
    expect(serializeAvatarConfig({ ...base, shirtColor: "ivory", showEmoji: true })).toBe(
      `{"v":1,"skinTone":"${base.skinTone}","hairStyle":"short","hairColor":"${base.hairColor}","shirtColor":"ivory","accessory":"none","showEmoji":1}`,
    );
  });

  it("안 바뀌면 생략(undefined), 기본 외형으로 돌아가면 빈 문자열(지움)", () => {
    const custom = parseAvatarConfig('{"v":1,"hairStyle":"buzz"}', slug);
    expect(avatarConfigPatch(custom, custom, slug)).toBeUndefined();
    expect(avatarConfigPatch(base, custom, slug)).toBe("");
    expect(avatarConfigPatch({ ...base, hairStyle: "long" }, base, slug)).toBe(
      serializeAvatarConfig({ ...base, hairStyle: "long" }),
    );
    // 저장값이 롤에서 못 쓰는 액세서리였다면 'none' 정규화 자체가 변경이다(기준값에는 저장값이 남아 있다)
    const blocked = parseAvatarConfig('{"v":1,"accessory":"cap"}', slug);
    expect(avatarConfigPatch({ ...blocked, accessory: "none" }, blocked, slug)).toBe("");
  });

  it("랜덤 — 롤에서 가능한 액세서리만, showEmoji는 그대로, 셔츠는 롤 기본 또는 10색", () => {
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 200; i += 1) {
      const look = randomLook("DESIGNER", { ...base, showEmoji: true }, rng);
      expect(extraAllowed("DESIGNER", look.accessory)).toBe(true);
      expect(look.showEmoji).toBe(true);
      expect(look.shirtColor === null || P.SHIRT_ORDER.includes(look.shirtColor)).toBe(true);
    }
    expect(sameLook(randomLook("OPS", base, () => 0), randomLook("OPS", base, () => 0))).toBe(true);
  });
});
