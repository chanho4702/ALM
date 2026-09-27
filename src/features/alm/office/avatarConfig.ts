/**
 * avatarConfig(AGP-62 §5) — 서버에 저장되는 버전드 JSON 문자열 ↔ 정규화 외형(`AvatarLook`).
 * 백엔드는 형태(객체·키 화이트리스트·스칼라·1KB)만 보고, 파츠 값의 의미는 이 파일과 `avatarParts.ts`가 정본이다.
 */
import type { AgentRole } from "../store/types";
import {
  EXTRA_ORDER,
  HAIR_COLOR_ORDER,
  HAIR_STYLE_ORDER,
  SHIRT_ORDER,
  SKIN_ORDER,
  type ExtraAccessory,
  type HairColor,
  type HairStyle,
  type ShirtColor,
  type SkinTone,
} from "./avatarParts";
import { defaultLook, extraAllowed, type AvatarLook } from "./pixel";

const pickKey = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

const memo = new Map<string, AvatarLook>();

/**
 * 읽기 규칙(§5.2): null·빈 값·깨진 JSON·객체 아님 → 전 필드 기본값(콘솔 경고 없음 — 폴링마다 찍히지 않게).
 * 필드마다 허용값 밖이면 그 필드만 기본값, 모르는 키 무시, `v > 1`이어도 아는 필드는 읽는다.
 * 롤에서 못 쓰는 액세서리도 여기서는 그대로 둔다 — 그리지 않는 건 합성(`pixel.ts`)이, 알리는 건 편집 UI가 한다.
 * 원문 문자열 단위 memo(폴링마다 다시 파싱하지 않음).
 */
export function parseAvatarConfig(raw: string | null | undefined, slug: string): AvatarLook {
  const key = `${slug}\u0000${raw ?? ""}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const base = defaultLook(slug);
  let obj: Record<string, unknown> | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
    } catch {
      obj = null;
    }
  }
  const look: AvatarLook = obj
    ? {
        skinTone: pickKey<SkinTone>(SKIN_ORDER, obj.skinTone) ?? base.skinTone,
        hairStyle: pickKey<HairStyle>(HAIR_STYLE_ORDER, obj.hairStyle) ?? base.hairStyle,
        hairColor: pickKey<HairColor>(HAIR_COLOR_ORDER, obj.hairColor) ?? base.hairColor,
        shirtColor: pickKey<ShirtColor>(SHIRT_ORDER, obj.shirtColor) ?? null,
        accessory: pickKey<ExtraAccessory>(EXTRA_ORDER, obj.accessory) ?? base.accessory,
        showEmoji: obj.showEmoji === 1,
      }
    : base;
  memo.set(key, look);
  return look;
}

/** 목록·사무실 페르소나의 외형 — `avatarConfig` 필드가 없는(구 백엔드) 응답도 기본 외형으로 */
export function personaLook(persona: { slug: string; avatarConfig?: string | null }): AvatarLook {
  return parseAvatarConfig(persona.avatarConfig ?? null, persona.slug);
}

export function sameLook(a: AvatarLook, b: AvatarLook): boolean {
  return (
    a.skinTone === b.skinTone &&
    a.hairStyle === b.hairStyle &&
    a.hairColor === b.hairColor &&
    a.shirtColor === b.shirtColor &&
    a.accessory === b.accessory &&
    a.showEmoji === b.showEmoji
  );
}

/**
 * 쓰기 규칙(§5.3) — 현재 편집 상태 전체를 명시한다: v·skinTone·hairStyle·hairColor·accessory 항상,
 * shirtColor는 롤 기본이 아닐 때만, showEmoji는 1일 때만. 키 순서는 스펙 표 순서(테스트 안정용).
 */
export function serializeAvatarConfig(look: AvatarLook): string {
  const out: Record<string, string | number> = {
    v: 1,
    skinTone: look.skinTone,
    hairStyle: look.hairStyle,
    hairColor: look.hairColor,
  };
  if (look.shirtColor) out.shirtColor = look.shirtColor;
  out.accessory = look.accessory;
  if (look.showEmoji) out.showEmoji = 1;
  return JSON.stringify(out);
}

/**
 * 저장할 avatarConfig 값 — 기본 외형과 같으면 `""`(지움 → 서버 null → 기본값 공식을 계속 따른다), 아니면 직렬화.
 * 바뀌지 않았으면 undefined(필드 생략 = 서버 그대로).
 */
export function avatarConfigPatch(look: AvatarLook, baseline: AvatarLook, slug: string): string | undefined {
  if (sameLook(look, baseline)) return undefined;
  return sameLook(look, defaultLook(slug)) ? "" : serializeAvatarConfig(look);
}

const pickRandom = <T>(list: readonly T[], rng: () => number): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/**
 * 랜덤(§6.3) — 피부·머리 모양·머리색·액세서리(그 롤에서 가능한 것 중)를 균등 무작위,
 * 셔츠는 50% 롤 기본 / 50% 10색 중 하나. showEmoji는 건드리지 않는다.
 */
export function randomLook(role: AgentRole, current: AvatarLook, rng: () => number = Math.random): AvatarLook {
  const allowed = EXTRA_ORDER.filter((a) => extraAllowed(role, a));
  return {
    skinTone: pickRandom(SKIN_ORDER, rng),
    hairStyle: pickRandom(HAIR_STYLE_ORDER, rng),
    hairColor: pickRandom(HAIR_COLOR_ORDER, rng),
    shirtColor: rng() < 0.5 ? null : pickRandom(SHIRT_ORDER, rng),
    accessory: pickRandom(allowed, rng),
    showEmoji: current.showEmoji,
  };
}
