/**
 * AGP-62 캐릭터 커스텀 파츠 — 디자인 스펙(2026-09-27-agp62-character-custom) 부록 E의 코드 사본.
 * 이 파일은 손으로 고치지 않는다: 정본 `assets/2026-09-27-agp62/parts_agp62.py`에서 추출 스크립트로 생성했다.
 * `short` 머리 레이어와 대머리 기본 프레임은 `matrices.ts` 원본에서 런타임에 만든다(`avatar.ts`) — 운영 도트와 어긋날 수 없다.
 */

/** 머리 `bob` 앞 */
export const HAIR_BOB_FRONT: readonly string[] = [
  "................",
  "................",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHSSSSHHhhK.",
  ".KHHSSSSSSSSHhK.",
  ".KHH........HhK.",
  ".KHH........HhK.",
  ".KHh........hhK.",
  ".KhK........KhK.",
  "..KK........KK..",
];

/** 머리 `bob` 뒤 */
export const HAIR_BOB_BACK: readonly string[] = [
  "................",
  "................",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KhhhhhhhhhhhhK.",
  "..KKKKKKKKKKKK..",
];

/** 머리 `long` 앞 */
export const HAIR_LONG_FRONT: readonly string[] = [
  "................",
  "................",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHSSSSHHhhK.",
  ".KHHSSSSSSSSHhK.",
  ".KHH........HhK.",
  ".KHH........HhK.",
  ".KHh........hhK.",
  ".KHK........KHK.",
  ".KHHK......KHHK.",
  ".KHHK......KHHK.",
  ".KHhK......KhHK.",
  "..KKK......KKK..",
];

/** 머리 `long` 뒤 */
export const HAIR_LONG_BACK: readonly string[] = [
  "................",
  "................",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KHHHHHHHHHHhhK.",
  ".KhhhhhhhhhhhhK.",
  "..KHHHHHHHHHhK..",
  "...KHHHHHHHhK...",
  "...KHHHHHHHhK...",
  "...KhHHHHHhhK...",
  "....KKKKKKKK....",
];

/** 머리 `bangs` 앞 */
export const HAIR_BANGS_FRONT: readonly string[] = [
  "................",
  "................",
  ".....HHHHHH.....",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHh...",
  "...HHHHHHHHHh...",
  "...HHHHHHHHHh...",
  "...H..H..H..H...",
  "...H........H...",
  "................",
  "................",
  "................",
];

/** 머리 `bangs` 뒤 */
export const HAIR_BANGS_BACK: readonly string[] = [
  "................",
  "................",
  ".....HHHHHH.....",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHh...",
  "...HHHHHHHHHh...",
  "...HHHHHHHHHh...",
  "....HHHHHHHH....",
  "....hHHHHHHh....",
  "....hhhhhhhh....",
  "................",
];

/** 머리 `curly` 앞 */
export const HAIR_CURLY_FRONT: readonly string[] = [
  "................",
  "...KKKKKKKKKK...",
  "..KHHhHHHHhHHK..",
  ".KHhHHHhHHHHhHK.",
  ".KHHHhHHHhHHhhK.",
  ".KHhHHHHHHHhHhK.",
  ".KHHHhSSSShHHhK.",
  ".KHhSSSSSSSShHK.",
  ".KHH........HhK.",
  "..Kh........hK..",
];

/** 머리 `curly` 뒤 */
export const HAIR_CURLY_BACK: readonly string[] = [
  "................",
  "...KKKKKKKKKK...",
  "..KHHhHHHHhHHK..",
  ".KHhHHHhHHHHhHK.",
  ".KHHHhHHHhHHhhK.",
  ".KHhHHHHHhHHhHK.",
  ".KHHHhHHhHHhHhK.",
  ".KHhHHHHHHhHHhK.",
  ".KHHhHHhHHHHhhK.",
  "..KhHHhHHhHHhK..",
  "...KhhhhhhhhK...",
];

/** 머리 `ponytail` 앞 */
export const HAIR_PONYTAIL_FRONT: readonly string[] = [
  "................",
  "................",
  ".....HHHHHH.....",
  "...HHHHHHHHHH...",
  "KK.HHHHHHHHHh...",
  "KhKHHHHHHHHHh...",
  "KHKHH......Hh...",
  "KHKH........H...",
  "KhKH........H...",
  ".KK.............",
  "................",
  "................",
];

/** 머리 `ponytail` 뒤 */
export const HAIR_PONYTAIL_BACK: readonly string[] = [
  "................",
  "................",
  ".....HHHHHH.....",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHh...",
  "...HHHHHHHHHh...",
  "...HHHHHHHHHh...",
  "....HHHHHHHH....",
  "...hHHHhhHHHh...",
  "...KhhhKKhhhK...",
  "......KhhK......",
  "......KHHK......",
  "......KHHK......",
  "......KHhK......",
  ".......KK.......",
];

/** 머리 `buzz` 앞 */
export const HAIR_BUZZ_FRONT: readonly string[] = [
  "................",
  "................",
  "...KKhhhhhhKK...",
  "..KhhhhhhhhhhK..",
  "..KhhhhhhhhhhK..",
  "...h........h...",
];

/** 머리 `buzz` 뒤 */
export const HAIR_BUZZ_BACK: readonly string[] = [
  "................",
  "................",
  ".....hhhhhh.....",
  "...hhhhhhhhhh...",
  "...hhhhhhhhhh...",
  "...hhhhhhhhhh...",
  "...hhhhhhhhhh...",
  "...hhhhhhhhhh...",
  "....hhhhhhhh....",
  "....hhhhhhhh....",
  "....hhhhhhhh....",
  "................",
];

/** 추가 액세서리 `glasses` 앞 */
export const EXTRA_GLASSES_FRONT: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....eee..eee....",
  "...eEEEeeEEEe...",
  "...eEEE..EEEe...",
  "....eee..eee....",
];

/** 추가 액세서리 `glasses` 뒤 */
export const EXTRA_GLASSES_BACK: readonly string[] = [
];

/** 추가 액세서리 `scarf` 앞 */
export const EXTRA_SCARF_FRONT: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...KEEEEEEEEK...",
  "..KeEEEEEEEEeK..",
  "....KEeK........",
  "....KEeK........",
  ".....KK.........",
];

/** 추가 액세서리 `scarf` 뒤 */
export const EXTRA_SCARF_BACK: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...KEEEEEEEEK...",
  "..KeeeeeeeeeeK..",
];

/** 추가 액세서리 `bowtie` 앞 */
export const EXTRA_BOWTIE_FRONT: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....KEEKKEEK....",
  "....KEe..eEK....",
];

/** 추가 액세서리 `bowtie` 뒤 */
export const EXTRA_BOWTIE_BACK: readonly string[] = [
];

/** 추가 액세서리 `cap` 앞 */
export const EXTRA_CAP_FRONT: readonly string[] = [
  "......KKKK......",
  "....KKEEEEKK....",
  "...KEEEEEEEeK...",
  "..KEEEEEEEEEeK..",
  "..KEEEEEEEEEeK..",
  "..KKeeeeeeeeKK..",
  "...KKKKKKKKKK...",
];

/** 추가 액세서리 `cap` 뒤 */
export const EXTRA_CAP_BACK: readonly string[] = [
  "......KKKK......",
  "....KKEEEEKK....",
  "...KEEEEEEEeK...",
  "..KEEEEEEEEEeK..",
  "..KEEEEEEEEEeK..",
  "..KEEEK..KEEeK..",
  "..KKKKK..KKKKK..",
];

/** 추가 액세서리 `flower` 앞 */
export const EXTRA_FLOWER_FRONT: readonly string[] = [
  "................",
  "................",
  "................",
  "....E...........",
  "...EeE..........",
  "....E...........",
];

/** 추가 액세서리 `flower` 뒤 */
export const EXTRA_FLOWER_BACK: readonly string[] = [
  "................",
  "................",
  "................",
  "...........E....",
  "..........EeE...",
  "...........E....",
];

/** 추가 액세서리 `blush` 앞 */
export const EXTRA_BLUSH_FRONT: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...EE......EE...",
];

/** 추가 액세서리 `blush` 뒤 */
export const EXTRA_BLUSH_BACK: readonly string[] = [
];

/** MANAGER 롤 액세서리 — 클립보드(왼쪽 어깨) */
export const ACC_MANAGER: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..K.............",
  "KKKKK...........",
  "KAAAK...........",
  "KAaaK...........",
  "KAAAK...........",
  "KAaaK...........",
  "KKKKK...........",
];

/** MANAGER 뒷모습 — 보드 뒷면이 오른쪽 가장자리로 비친다 */
export const ACC_BACK_MANAGER: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "............KKKK",
  "............KaaK",
  "............KaaK",
  "............KaaK",
  "............KaaK",
  "............KKKK",
];

export type SkinTone = "d" | "a" | "e" | "b" | "f" | "c";
export type HairStyle = "short" | "bob" | "long" | "bangs" | "curly" | "ponytail" | "buzz";
export type HairColor = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
export type ShirtColor = "planner" | "designer" | "frontend" | "backend" | "ops" | "reviewer" | "manager" | "ivory" | "charcoal" | "sky";
export type ExtraAccessory = "none" | "glasses" | "scarf" | "bowtie" | "cap" | "flower" | "blush";
export type AvatarSlot = "CHEEKS" | "EARS" | "EAR_R" | "EYES" | "HAIR_SIDE" | "HAND_L" | "HEAD_TOP" | "NECK";

/** 칩 순서(밝기순 — 키 순서가 아니다) */
export const SKIN_ORDER: readonly SkinTone[] = ["d", "a", "e", "b", "f", "c"];
export const HAIR_STYLE_ORDER: readonly HairStyle[] = ["short", "bob", "long", "bangs", "curly", "ponytail", "buzz"];
export const HAIR_COLOR_ORDER: readonly HairColor[] = ["0", "1", "2", "3", "4", "5", "6", "7"];
export const SHIRT_ORDER: readonly ShirtColor[] = ["planner", "designer", "frontend", "backend", "ops", "reviewer", "manager", "ivory", "charcoal", "sky"];
export const EXTRA_ORDER: readonly ExtraAccessory[] = ["none", "glasses", "scarf", "bowtie", "cap", "flower", "blush"];

/** 피부톤 이름(칩 텍스트) */
export const SKIN_LABEL: Record<SkinTone, string> = {
  "d": "연한 분홍빛",
  "a": "밝은 살구",
  "e": "올리브 베이지",
  "b": "황갈",
  "f": "구릿빛",
  "c": "갈색",
};

/** 머리 모양 이름 */
export const HAIR_STYLE_LABEL: Record<HairStyle, string> = {
  "short": "짧은 머리",
  "bob": "단발",
  "long": "긴 머리",
  "bangs": "일자 앞머리",
  "curly": "곱슬",
  "ponytail": "포니테일",
  "buzz": "짧게 민 머리",
};

/** 머리색 이름 */
export const HAIR_COLOR_LABEL: Record<HairColor, string> = {
  "0": "흑갈",
  "1": "밤색",
  "2": "금발",
  "3": "남흑",
  "4": "적갈",
  "5": "은회",
  "6": "벚꽃",
  "7": "청록",
};

/** 셔츠색 이름 */
export const SHIRT_LABEL: Record<ShirtColor, string> = {
  "planner": "호박",
  "designer": "자홍",
  "frontend": "청록",
  "backend": "남색",
  "ops": "초록",
  "reviewer": "진홍",
  "manager": "보라",
  "ivory": "아이보리",
  "charcoal": "차콜",
  "sky": "하늘",
};

/** 추가 액세서리 이름 */
export const EXTRA_LABEL: Record<ExtraAccessory, string> = {
  "none": "없음",
  "glasses": "빨간 테 안경",
  "scarf": "목도리",
  "bowtie": "나비 리본",
  "cap": "캡모자",
  "flower": "꽃핀",
  "blush": "볼터치",
};

/** 롤 액세서리가 차지하는 자리(스펙 §2.5 정본) */
export const ROLE_SLOTS: Record<"PLANNER" | "DESIGNER" | "FRONTEND" | "BACKEND" | "OPS" | "REVIEWER" | "MANAGER", readonly AvatarSlot[]> = {
  PLANNER: ["EAR_R", "HEAD_TOP"],
  DESIGNER: ["HAIR_SIDE", "HEAD_TOP"],
  FRONTEND: ["EARS", "HEAD_TOP"],
  BACKEND: ["HAIR_SIDE", "HEAD_TOP"],
  OPS: ["HAIR_SIDE", "HEAD_TOP"],
  REVIEWER: ["EYES"],
  MANAGER: ["HAND_L"],
};

/** 추가 액세서리가 차지하는 자리 */
export const EXTRA_SLOTS: Record<ExtraAccessory, readonly AvatarSlot[]> = {
  none: [],
  glasses: ["EYES"],
  scarf: ["NECK"],
  bowtie: ["NECK"],
  cap: ["HAIR_SIDE", "HEAD_TOP"],
  flower: ["HAIR_SIDE"],
  blush: ["CHEEKS"],
};

/** "피부 위에만" 합성 — 아래 칸이 S/s일 때만 덮는다(표정이 안경 너머로 보인다) */
export const EXTRA_SKIN_ONLY: ReadonlySet<ExtraAccessory> = new Set<ExtraAccessory>(["blush", "glasses"]);
