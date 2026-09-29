/**
 * AI 사무실 도트 매트릭스 원본 — 디자인 스펙(2026-09-26-p3a-office-design) 부록 A를 그대로 옮긴 것.
 * 한 글자 = 아트 픽셀 1개, `.` = 투명. 문자 → 색은 계열별 표(`pixel.ts`의 FAMILY_FILLS)가 정한다.
 * 도트는 전부 오리지널 — 매트릭스를 고치면 스펙 부록 A와 sprites.py도 함께 고친다.
 */

/** AVATAR_STAND — 16×24 */
export const AVATAR_STAND: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
  "..KcKCCCCCCKcK..",
  "..KSKccccccKSK..",
  "...KKPPPPPPKK...",
  "....KPPPPPPK....",
  "....KPPKKPPK....",
  "....KPpKKpPK....",
  "...KKKK..KKKK...",
  "................",
];

/** AVATAR_SEAT_SLUMP — 16×16 */
export const AVATAR_SEAT_SLUMP: readonly string[] = [
  "................",
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSSSSSSSSHK..",
  "..KSKKSSSSKKSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
];

/** ACC.PLANNER — 16×10 */
export const ACC_PLANNER: readonly string[] = [
  "......KKKK......",
  "......KHHK......",
  "................",
  "................",
  "................",
  ".............KK.",
  ".............KAK",
  ".............KAK",
  ".............KaK",
  "..............K.",
];

/** ACC.DESIGNER — 16×6 */
export const ACC_DESIGNER: readonly string[] = [
  ".......KK.......",
  "....KKKAAKKKK...",
  "..KKAAAAAAAAAKK.",
  ".KAAAAAAAAAAAAK.",
  ".KaaaaaaaaaaaK..",
  "..KK.......KK...",
];

/** ACC.FRONTEND — 16×10 */
export const ACC_FRONTEND: readonly string[] = [
  "....KKKKKKKK....",
  "...KAaaaaaaAK...",
  "..KA........AK..",
  "................",
  "................",
  "................",
  ".KAK........KAK.",
  ".KAK........KAK.",
  ".KaK........KaK.",
  "..K..........K..",
];

/** ACC.BACKEND — 16×6 */
export const ACC_BACKEND: readonly string[] = [
  ".......KK.......",
  ".....KKAAKK.....",
  "...KKAAAAAAKK...",
  "..KAAAAAAAAAAK..",
  "..KaAaAaAaAaAK..",
  "..KKKKKKKKKKKK..",
];

/** ACC.OPS — 16×7 */
export const ACC_OPS: readonly string[] = [
  "......KKKK......",
  "....KKAAAAKK....",
  "...KAAAaAAAAK...",
  "..KAAAAaAAAAAK..",
  ".KKKKKKKKKKKKKK.",
  ".KaaaaaaaaaaaaK.",
  "..KKKKKKKKKKKK..",
];

/** ACC.REVIEWER — 16×11 */
export const ACC_REVIEWER: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...KKKK..KKKK...",
  "...K..KKKK..K...",
  "...K..K..K..K...",
  "...KKKK..KKKK...",
];

/** DESK — 40×16 */
export const DESK: readonly string[] = [
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWKKKKKKKKKKKKKWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWKMmMmMmMmMmMKWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWKKKKKKKKKKKKKWWWWWWWWWWWWK",
  "KwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxKKKKKKKKKKKKxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxKxxxxKKxxxxKxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxKxxxxxxxxxxKxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxKKKKKKKKKKKKxK",
  "KyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  ".KyK................................KyK.",
  ".KKK................................KKK.",
];

/** MONITOR_OFF — 12×14 */
export const MONITOR_OFF: readonly string[] = [
  "KKKKKKKKKKKK",
  "KmmmmmmmmmmK",
  "KmOOOOOOOOmK",
  "KmOOOOOOOOmK",
  "KmOOOOOOOOmK",
  "KmOOOOOOOOmK",
  "KmOOOOOOOOmK",
  "KmmmmmmmmmmK",
  "KKKKKKKKKKKK",
  "....KMMK....",
  "....KMMK....",
  "..KKKKKKKK..",
  "..KMMMMMMK..",
  "..KKKKKKKK..",
];

/** MONITOR_ON_A — 12×14 */
export const MONITOR_ON_A: readonly string[] = [
  "KKKKKKKKKKKK",
  "KmmmmmmmmmmK",
  "KmGGGGGGGGmK",
  "KmGgggGgGGmK",
  "KmGGGGGGGGmK",
  "KmGggGgggGmK",
  "KmGGGGGGGGmK",
  "KmmmmmmmmmmK",
  "KKKKKKKKKKKK",
  "....KMMK....",
  "....KMMK....",
  "..KKKKKKKK..",
  "..KMMMMMMK..",
  "..KKKKKKKK..",
];

/** MONITOR_ON_B — 12×14 */
export const MONITOR_ON_B: readonly string[] = [
  "KKKKKKKKKKKK",
  "KmmmmmmmmmmK",
  "KmGGGGGGGGmK",
  "KmGggGggGGmK",
  "KmGGGGGGGGmK",
  "KmGgggGgGGmK",
  "KmGggGGGGGmK",
  "KmmmmmmmmmmK",
  "KKKKKKKKKKKK",
  "....KMMK....",
  "....KMMK....",
  "..KKKKKKKK..",
  "..KMMMMMMK..",
  "..KKKKKKKK..",
];

/** CHAIR — 14×12 */
export const CHAIR: readonly string[] = [
  "..KKKKKKKKKK..",
  ".KFFFFFFFFFFK.",
  "KFFFFFFFFFFFFK",
  "KFffffffffffFK",
  "KFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFK",
  "KffffffffffffK",
  ".KKKKKKKKKKKK.",
  ".....KMMK.....",
  ".....KMMK.....",
  ".....KKKK.....",
];

/** HAND — 4×3 */
export const HAND: readonly string[] = [
  ".KK.",
  "KSSK",
  ".KK.",
];

/** ALERT — 8×11 */
export const ALERT: readonly string[] = [
  "..KKKK..",
  ".KYYYYK.",
  "KYYKKYYK",
  "KYYKKYYK",
  "KYYKKYYK",
  "KYYKKYYK",
  "KyYYYYyK",
  "KYYKKYYK",
  ".KyyyyK.",
  "..KKKK..",
  "...KK...",
];

/** ZZ — 12×12 */
export const ZZ: readonly string[] = [
  "......KKKKKK",
  "......KZZZZK",
  "......KKKZKK",
  ".......KZK..",
  "......KZKKK.",
  "KKKKKKKZZZZK",
  "KZZZZZKKKKKK",
  "KKKKZZK.....",
  "..KZZKK.....",
  ".KZZKKKK....",
  "KZZZZZZK....",
  "KKKKKKKK....",
];

/** HOURGLASS — 7×9 */
export const HOURGLASS: readonly string[] = [
  "KKKKKKK",
  "KMMMMMK",
  ".KYYYK.",
  "..KYK..",
  "...K...",
  "..KYK..",
  ".KYYYK.",
  "KMMMMMK",
  "KKKKKKK",
];

/** MAGNIFIER — 9×9 */
export const MAGNIFIER: readonly string[] = [
  ".KKKK....",
  "KGGGGK...",
  "KGHGGK...",
  "KGGGGK...",
  "KGGGGK...",
  ".KKKKKK..",
  ".....KMK.",
  "......KMK",
  ".......KK",
];

/**
 * REMOTE_SIGNAL_A — 9×8, 원격 접속(외부 MCP, AGP-63). 전파 두 겹(glass) + 가운데 점(hi) — 계열 `ovl`.
 * 머리 오른쪽 위(❗ 자리)에 두고, 프레임 B(바깥 전파 꺼짐)와 번갈아 "송수신" 깜빡임을 낸다.
 */
export const REMOTE_SIGNAL_A: readonly string[] = [
  "..KKKKK..",
  ".KGGGGGK.",
  "KGKKKKKGK",
  "KK.KKK.KK",
  "..KGGGK..",
  "...KKK...",
  "...KHK...",
  "...KKK...",
];

/** REMOTE_SIGNAL_B — 9×8, 바깥 전파가 꺼진 프레임(reduced-motion에선 보이지 않는다) — 계열 `ovl` */
export const REMOTE_SIGNAL_B: readonly string[] = [
  ".........",
  ".........",
  ".........",
  "...KKK...",
  "..KGGGK..",
  "...KKK...",
  "...KHK...",
  "...KKK...",
];

/**
 * HOUSE — 7×6, 내 PC 러너에서 도는 run(P4a D-P4-4). 모니터 화면 안(원점 기준 +3,+2)에 겹쳐 그리는 작은 집 —
 * 지붕(red)·벽(hi)·문(wood) — 계열 `ovl`. 정지 1프레임이라 reduced-motion에서도 같다.
 */
export const HOUSE: readonly string[] = [
  "...K...",
  "..KRK..",
  ".KRRRK.",
  "KKHHHKK",
  ".KHMHK.",
  ".KKKKK.",
];

/**
 * ENVELOPE — 9×7, 아직 워커에게 전달되지 않은 사람 지시(P4b AGP-67). 책상 위에 놓인 편지 — 봉투(hi)·접힌 선(outline)·
 * 모서리 알림 점(red) — 계열 `ovl`. 2프레임 통통(프레임 B는 1ap 위)이고 reduced-motion이면 A 정지.
 */
export const ENVELOPE: readonly string[] = [
  "......KKK",
  "KKKKKKKRK",
  "KKHHHHKKK",
  "KHKHHKHK.",
  "KHHKKHHK.",
  "KHHHHHHK.",
  "KKKKKKKK.",
];

/** RED_MARK — 7×7 */
export const RED_MARK: readonly string[] = [
  ".KKKKK.",
  "KRRRRRK",
  "KRKRKRK",
  "KRRKRRK",
  "KRKRKRK",
  "KRRRRRK",
  ".KKKKK.",
];

/** FLOOR_A — 16×16 */
export const FLOOR_A: readonly string[] = [
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "llllllllllllllll",
  "aaaaaaaaaaalaaaa",
  "aaaaaaaaaaalaaaa",
  "aaaaaaaaaaalaaaa",
  "aaaaaaaaaaalaaaa",
  "aaaaaaaaaaalaaaa",
  "aaaaaaaaaaalaaaa",
  "aaaaaaaaaaalaaaa",
  "llllllllllllllll",
];

/** FLOOR_B — 16×16 */
export const FLOOR_B: readonly string[] = [
  "aaalaaaaaaaaaaaa",
  "aaalaaaaaaaaaaaa",
  "aaalaaaaaaaaaaaa",
  "aaalaaaaaaaaaaaa",
  "aaalaaaaaaaaaaaa",
  "aaalaaaaaaaaaaaa",
  "aaalaaaaaaaaaaaa",
  "llllllllllllllll",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "llllllllllllllll",
];

/** WALL — 16×32 */
export const WALL: readonly string[] = [
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "vwwwwwwwwwwwwwwv",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "vvvvvvvvvvvvvvvv",
  "vvvvvvvvvvvvvvvv",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "KKKKKKKKKKKKKKKK",
  "tttttttttttttttt",
  "tttttttttttttttt",
];

/** WINDOW — 32×16 */
export const WINDOW: readonly string[] = [
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
  "KMkkkkkkkkkkkkkKKkkkkkkkkkkkkkMK",
  "KMkqkkkkkkkkkkkKKkkkkkkkkkkkkkMK",
  "KMkkqkkkkkkkkkkKKkkkkkkkqkkkkkMK",
  "KMkkkkkkkkkkkkkKKkkkkkkkkqkkkkMK",
  "KMkkkkkkkkkkkkkKKkkkkkkkkkkkkkMK",
  "KMKKKKKKKKKKKKKKKKKKKKKKKKKKKKMK",
  "KMkkkkkkkkkkkkkKKkkkkkkkkkkkkkMK",
  "KMkkkkkkkqkkkkkKKkkkkkkkkkkkkkMK",
  "KMkkkkkkkkkkkkkKKkkkqkkkkkkkkkMK",
  "KMkkkkkkkkkkkkkKKkkkkkkkkkkkkkMK",
  "KMkkkkkkkkkkkkkKKkkkkkkkkkkkkkMK",
  "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "................................",
];

/** BOARD — 64×22 */
export const BOARD: readonly string[] = [
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccxK",
  "KxcccccccccKcccccccccccccccccccccccccccccccKccccccccccccccccccxK",
  "KxcccKKKKKKRKKKKKccccccccccKcccccccccKKKKKKBKKKKKcccccccccccccxK",
  "KxcccKppppppppppKccccKKKKKKYKKKKKccccKppppppppppKcccccccccccccxK",
  "KxcccKpKKKKKKKKpKccccKppppppppppKccccKpKKKKKKKKpKcccKKKKKKKcccxK",
  "KxcccKppppppppppKccccKpKKKKKKKppKccccKppppppppppKcccKYYYYYKcccxK",
  "KxcccKpKKKKKKpppKccccKppppppppppKccccKpKKKKKKKKpKcccKYKKKYKcccxK",
  "KxcccKppppppppppKccccKpKKKKKKKKpKccccKppppppppppKcccKYYYYYKcccxK",
  "KxcccKpKKKKKKKKpKccccKppppppppppKccccKpKKKKKKpppKcccKYYYYYKcccxK",
  "KxcccKppppppppppKccccKpKKKKKppppKccccKppppppppppKcccKKKKKKKcccxK",
  "KxcccKpKKKKpppppKccccKppppppppppKccccKpKKKppppppKcccccccccccccxK",
  "KxcccKppppppppppKccccKpKKKKKKKKpKccccKppppppppppKcccccccccccccxK",
  "KxcccKpKKKKKKKppKccccKppppppppppKccccKpKKKKKKKppKcccccccccccccxK",
  "KxcccKqqqqqqqqqqKccccKqqqqqqqqqqKccccKqqqqqqqqqqKcccccccccccccxK",
  "KxcccKKKKKKKKKKKKccccKKKKKKKKKKKKccccKKKKKKKKKKKKcccccccccccccxK",
  "KxddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "............KK....................................KK............",
  "............KK....................................KK............",
];

/** PLANT — 12×18 */
export const PLANT: readonly string[] = [
  "....KK......",
  "...KLLK.KK..",
  "..KLLlK.KLK.",
  ".KKLlLKKLLK.",
  "KLLKLLKLLlK.",
  "KLlLKLLLlKKK",
  ".KLLLKLLKLLK",
  "..KLlLLLLLlK",
  "...KLLlLLKK.",
  "....KKLLK...",
  "...KKKKKKK..",
  "..KOOOOOOOK.",
  "..KOOOOOOOK.",
  "..KoOOOOOoK.",
  "...KOOOOOK..",
  "...KoOOOoK..",
  "....KKKKK...",
  "............",
];

/** SOFA — 48×18 */
export const SOFA: readonly string[] = [
  "...KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...",
  "..KFFFFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFFFFK..",
  "..KFFFFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFFFFK..",
  "..KFFFFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFFFFK..",
  "..KFFFFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFFFFK..",
  "KKKKKKFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFKKKKKK",
  "KFFFFKFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFKFFFFK",
  "KFFFFKfffffffffffffffffKKfffffffffffffffffKFFFFK",
  "KFFFFKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKFFFFK",
  "KFFFFKFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFKFFFFK",
  "KFFFFKFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFKFFFFK",
  "KFFFFKFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFKFFFFK",
  "KFFFFKFFFFFFFFFFFFFFFFFKKFFFFFFFFFFFFFFFFFKFFFFK",
  "KffffKfffffffffffffffffKKfffffffffffffffffKffffK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "..KMK......................................KMK..",
  "..KKK......................................KKK..",
  "................................................",
];

/** COFFEE — 16×20 */
export const COFFEE: readonly string[] = [
  "KKKKKKKKKKKKKKKK",
  "KmmmmmmmmmmmmmmK",
  "KmKKKKmmmmmmmmmK",
  "KmKGGKmmmRmmmmmK",
  "KmKKKKmmmmmmmmmK",
  "KMMMMMMMMMMMMMMK",
  "KKKKKKKKKKKKKKKK",
  "KmK..........KmK",
  "KmK...KMMK...KmK",
  "KmK...KMMK...KmK",
  "KmK..........KmK",
  "KmK...KKKK...KmK",
  "KmK..KWWWWK..KmK",
  "KmK..KWWWWKK.KmK",
  "KmK..KwwwwK..KmK",
  "KmK...KKKK...KmK",
  "KMMMMMMMMMMMMMMK",
  "KmmmmmmmmmmmmmmK",
  "KKKKKKKKKKKKKKKK",
  "................",
];

// ── P3e 신규 매트릭스 — 스펙(2026-09-27-p3e-office-liveliness) 부록 B, sprites_p3e.py에서 스크립트로 추출 ──
// 손으로 고치지 않는다 — sprites_p3e.py를 고치고 다시 뽑는다.

/** AVATAR_BACK — 16×24 — 계열 char · 뒷모습 서기 16×24 — 회의 앞줄(0~15행)·위로 걷기·커피 따르기 */
export const AVATAR_BACK: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KSHHHHHHHHSK..",
  "..KShHHHHHHhSK..",
  "...KhhhhhhhhK...",
  "....KKSSSSKK....",
  "....KCCCCCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCccCCKCK..",
  "..KcKCCccCCKcK..",
  "..KSKccccccKSK..",
  "...KKPPPPPPKK...",
  "....KPPPPPPK....",
  "....KPPKKPPK....",
  "....KPpKKpPK....",
  "...KKKK..KKKK...",
  "................",
];

/** ACC_BACK_PLANNER — 16×10 — 계열 char · 뒷모습 액세서리 — 연필이 왼쪽(거울). DESIGNER/FRONTEND/BACKEND/OPS는 앞모습 레이어 그대로, REVIEWER는 없음 */
export const ACC_BACK_PLANNER: readonly string[] = [
  "......KKKK......",
  "......KHHK......",
  "................",
  "................",
  "................",
  ".KK.............",
  "KAK.............",
  "KAK.............",
  "KaK.............",
  ".K..............",
];

/** WALK_A — 16×24 — 계열 char · 걷기 A — AVATAR_STAND의 18~22행만 교체(왼발 디딤) */
export const WALK_A: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
  "..KcKCCCCCCKcK..",
  "..KSKccccccKSK..",
  "...KKPPPPPPKK...",
  "....KPPPPPPK....",
  "....KPPKKPPK....",
  "....KPpK.KKK....",
  "...KKKK.........",
  "................",
];

/** WALK_B — 16×24 — 계열 char · 걷기 B — 오른발 디딤. 뒷모습 걷기는 AVATAR_BACK에 같은 다리 행을 덮는다 */
export const WALK_B: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
  "..KcKCCCCCCKcK..",
  "..KSKccccccKSK..",
  "...KKPPPPPPKK...",
  "....KPPPPPPK....",
  "....KPPKKPPK....",
  "....KKK.KpPK....",
  ".........KKKK...",
  "................",
];

/** MEETING_TABLE — 100×26 — 계열 furn2 · 회의 테이블 100×26 — 먼 쪽 5석 앞 서류·머그 2 */
export const MEETING_TABLE: readonly string[] = [
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWK",
  "KWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWK",
  "KWWWWWWKpKKKpKWWWWWWWWWWWWWKpKKKpKWWWWWWWWWWWWWKpKKKpKWWWWWWWWWWWWWKpKKKpKWWWWWWWWWWWWWKpKKKpKWWWWWK",
  "KWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWWWWWWWWWKpppppKWWWWWK",
  "KWWWWWWKqqqqqKWWWWWWWWWWWWWKqqqqqKWWWWWWWWWWWWWKqqqqqKWWWWWWWWWWWWWKqqqqqKWWWWWWWWWWWWWKqqqqqKWWWWWK",
  "KWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWWWWWWWWWKKKKKKKWWWWWK",
  "KWWWWWWWWWWWWWWWWWWKKKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKKKKWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWKccKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKccKKWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWKppKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKppKKWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWKppKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKppKWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKKWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "..KMK..........................................................................................KMK..",
];

/** CHAIR_HOST — 14×14 — 계열 furn2 · 진행자 의자 14×14 — 높은 등받이 + 금색 테두리(A) */
export const CHAIR_HOST: readonly string[] = [
  "..KKKKKKKKKK..",
  ".KAAAAAAAAAAK.",
  "KAFFFFFFFFFFAK",
  "KAFFFFFFFFFFAK",
  "KAFffffffffFAK",
  "KAFFFFFFFFFFAK",
  "KAFFFFFFFFFFAK",
  "KAFFFFFFFFFFAK",
  "KAffffffffffAK",
  "KAAAAAAAAAAAAK",
  ".KKKKKKKKKKKK.",
  ".....KMMK.....",
  ".....KMMK.....",
  ".....KKKK.....",
];

/** CHAIR_BACK — 14×7 — 계열 furn2 · 앞줄 의자 등받이(뒤에서 본 모습) 14×7 — 아바타 위에 칠한다 */
export const CHAIR_BACK: readonly string[] = [
  ".KKKKKKKKKKKK.",
  "KFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFK",
  "KFFFFFFFFFFFFK",
  "KffffffffffffK",
  ".KKKKKKKKKKKK.",
  ".....KMMK.....",
];

/** WHITEBOARD_IDLE — 48×22 — 계열 wb · 화이트보드 48×22 — 회의 없을 때(옅은 줄) */
export const WHITEBOARD_IDLE: readonly string[] = [
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHmmmmmmmmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHmmmmmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHmmmmmmmmmHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "......KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  ".....KMMMMFFMMRRMMMMMMMMMMMMMMMMMMMMMMMMMMK.....",
  ".....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.....",
];

/** WHITEBOARD_ACTIVE — 48×22 — 계열 wb · 화이트보드 — 회의 중(글줄 + 막대 차트) */
export const WHITEBOARD_ACTIVE: readonly string[] = [
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHFFFFFFFFFFFFHHHHHHHHHHHHHHHHHHHHHHHRRHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHYYHHHRRHHHHHmK",
  "KmHHFFFFFFFFHHHHHHHHHHHHHHHHHHHHHHYYHHHRRHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHFFFFFFFFFFHHHHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHFFFFFFFFFFFFFHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHFFFFFFHHHHHHHHHHHHHHHHHHHLLHHHYYHHHRRHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHFFFFFFFFFFFFFFHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHmK",
  "KmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "......KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  ".....KMMMMFFMMRRMMMMMMMMMMMMMMMMMMMMMMMMMMK.....",
  ".....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.....",
];

/** MEETING_LAMP_ON — 8×7 — 계열 lamp · 회의 중 램프 8×7(빨강). OFF는 R·H → m */
export const MEETING_LAMP_ON: readonly string[] = [
  ".KKKKKK.",
  "KRRRRRRK",
  "KRHRRRRK",
  "KRRRRRRK",
  ".KKKKKK.",
  "...KK...",
  "..KMMK..",
];

/** MEETING_LAMP_OFF — 8×7 — 계열 lamp · 회의 없음(R·H → m) */
export const MEETING_LAMP_OFF: readonly string[] = [
  ".KKKKKK.",
  "KmmmmmmK",
  "KmmmmmmK",
  "KmmmmmmK",
  ".KKKKKK.",
  "...KK...",
  "..KMMK..",
];

/** POSTIT — 5×5 — 계열 note · 빈 책상 모니터의 '회의 중' 포스트잇 5×5 */
export const POSTIT: readonly string[] = [
  "KKKKK",
  "KYYYK",
  "KyyYK",
  "KYYYK",
  "KKKKK",
];

/** FLOOR_CARPET — 16×16 — 계열 carpet · 회의실 카펫 타일 16×16 */
export const FLOOR_CARPET: readonly string[] = [
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aabaaaaaaabaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaabaaaaaaaba",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aabaaaaaaabaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaabaaaaaaaba",
  "aaaaaaaaaaaaaaaa",
];

/** MB_FRAME — 14×11 — 계열 mb · 미니 말풍선 틀 14×11 — 글리프 10×7을 (2,1)에 덮어씀 */
export const MB_FRAME: readonly string[] = [
  "..KKKKKKKKKK..",
  ".KBBBBBBBBBBK.",
  "KBBBBBBBBBBBBK",
  "KBBBBBBBBBBBBK",
  "KBBBBBBBBBBBBK",
  "KBBBBBBBBBBBBK",
  "KBBBBBBBBBBBBK",
  ".KBBBBBBBBBBK.",
  "..KBBKKKKKKK..",
  "..KBK.........",
  "..KK..........",
];

/** MB_DOTS — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_DOTS: readonly string[] = [
  "..........",
  "..........",
  ".KK.KK.KK.",
  ".KK.KK.KK.",
  "..........",
  "..........",
  "..........",
];

/** MB_BULB — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_BULB: readonly string[] = [
  "...KKKK...",
  "..KYYYYK..",
  "..KYHYYK..",
  "..KYYYYK..",
  "...KYYK...",
  "...KMMK...",
  "....KK....",
];

/** MB_QUESTION — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_QUESTION: readonly string[] = [
  "...KKKK...",
  "..KK..KK..",
  "......KK..",
  "....KKK...",
  "....KK....",
  "..........",
  "....KK....",
];

/** MB_CHECK — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_CHECK: readonly string[] = [
  "..........",
  ".......LL.",
  "......LL..",
  ".LL..LL...",
  "..LLLL....",
  "...LL.....",
  "..........",
];

/** MB_CHART — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_CHART: readonly string[] = [
  "..........",
  ".......RR.",
  "....YY.RR.",
  "....YY.RR.",
  ".FF.YY.RR.",
  ".FF.YY.RR.",
  ".KKKKKKKK.",
];

/** MB_STAR — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_STAR: readonly string[] = [
  ".....K....",
  "....KYK...",
  ".KKKYYYKKK",
  "..KYYYYYK.",
  "...KYYYK..",
  "..KYK.KYK.",
  "..KK...KK.",
];

/** MB_DOC — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_DOC: readonly string[] = [
  "..........",
  "...KKKKK..",
  "...KpppKK.",
  "...KpKKpK.",
  "...KppppK.",
  "...KKKKKK.",
  "..........",
];

/** MB_SWEAT — 10×7 — 계열 mb · 미니 말풍선 글리프 10×7 */
export const MB_SWEAT: readonly string[] = [
  ".....K....",
  "....KGK...",
  "...KGGGK..",
  "...KGHGK..",
  "....KKK...",
  "..........",
  "..........",
];

/** MB_PUFF — 7×7 — 계열 puff · 뽁 퍼프 7×7 — 말풍선 등장·소멸 1프레임 */
export const MB_PUFF: readonly string[] = [
  ".K...K.",
  "K.....K",
  "...B...",
  "..BBB..",
  "...B...",
  "K.....K",
  ".K...K.",
];

/** FX_SWEAT — 4×5 — 계열 fx · 땀방울 4×5 — 재시도(attempt≥2) 작업 중에 주로 */
export const FX_SWEAT: readonly string[] = [
  ".K..",
  "KGK.",
  "KGGK",
  "KHGK",
  ".KK.",
];

/** FX_BULB — 7×8 — 계열 fx · 전구 7×8 */
export const FX_BULB: readonly string[] = [
  ".KKKKK.",
  "KYYYYYK",
  "KYHYYYK",
  "KYYYYYK",
  ".KYYYK.",
  "..KMK..",
  "..KMK..",
  "...K...",
];

/** FX_NOTE — 7×8 — 계열 fx · 음표 7×8(흥얼) */
export const FX_NOTE: readonly string[] = [
  "...KKKK",
  "...KFFK",
  "...K..K",
  "...K...",
  ".KKK...",
  "KFFK...",
  "KFFK...",
  ".KK....",
];

/** CUP — 5×5 — 계열 item · 커피 컵 5×5 — 손에 든 채 복귀 */
export const CUP: readonly string[] = [
  "KKKK.",
  "KccKK",
  "KppKK",
  "KppK.",
  ".KK..",
];

/** STEAM_A — 5×6 — 계열 item · 김 5×6 프레임 A(커피 머신 위) */
export const STEAM_A: readonly string[] = [
  ".H...",
  "..H..",
  ".H...",
  "..H.H",
  ".H.H.",
  "..H..",
];

/** STEAM_B — 5×6 — 계열 item · 김 프레임 B */
export const STEAM_B: readonly string[] = [
  "..H..",
  ".H...",
  "..H.H",
  ".H.H.",
  "..H..",
  ".H...",
];

/** CLOUD — 12×5 — 계열 sky · 구름 12×5 — 라이트 창밖 */
export const CLOUD: readonly string[] = [
  "....WWW.....",
  "..WWWWWWW...",
  ".WWWWWWWWWW.",
  "WWWWWWWWWWWW",
  ".wwwwwwwwww.",
];

/** METEOR — 7×3 — 계열 sky · 별똥별 7×3 — 다크 창밖 */
export const METEOR: readonly string[] = [
  ".....qq",
  "..qqq..",
  "HH.....",
];

/** PLANT_SWAY — 12×18 — 계열 plant · 화분 흔들림 프레임 — PLANT 0~4행을 1ap 오른쪽으로 */
export const PLANT_SWAY: readonly string[] = [
  ".....KK.....",
  "....KLLK.KK.",
  "...KLLlK.KLK",
  "..KKLlLKKLLK",
  ".KLLKLLKLLlK",
  "KLlLKLLLlKKK",
  ".KLLLKLLKLLK",
  "..KLlLLLLLlK",
  "...KLLlLLKK.",
  "....KKLLK...",
  "...KKKKKKK..",
  "..KOOOOOOOK.",
  "..KOOOOOOOK.",
  "..KoOOOOOoK.",
  "...KOOOOOK..",
  "...KoOOOoK..",
  "....KKKKK...",
  "............",
];

/** CAT_SLEEP_A — 16×12 — 계열 cat · (제안) 고양이 자는 중 A 16×12 */
export const CAT_SLEEP_A: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "..K...K.........",
  ".KOK.KOK........",
  ".KOOKOOOKKKKKK..",
  "KOOOOOOOOOOOOOK.",
  "KOKKOKKOOOoOOoK.",
  "KOOOPOOOOoOOoOK.",
  ".KWWWKOOOOOOOK..",
  "..KKKKKKKKKKK...",
];

/** CAT_SLEEP_B — 16×12 — 계열 cat · (제안) 자는 중 B — 숨쉬기(등 1ap 아래) */
export const CAT_SLEEP_B: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "..K...K.........",
  ".KOK.KOKKKKKK...",
  "KOOOKOOOOOOOOKK.",
  "KOKKOKKOOOoOOoK.",
  "KOOOPOOOOoOOoOK.",
  ".KWWWKOOOOOOOK..",
  "..KKKKKKKKKKK...",
];

/** CAT_STRETCH — 16×12 — 계열 cat · (제안) 기지개 */
export const CAT_STRETCH: readonly string[] = [
  "................",
  "................",
  "............KK..",
  "...........KOOK.",
  "..........KOoOK.",
  "..K...K..KOOOK..",
  ".KOK.KOKKOOOOK..",
  "KOOOKOOOOOoOK...",
  "KOKOOKOKOOOOK...",
  "KOOOPOOKKOOOK...",
  "KWWKWWK..KOOK...",
  "KKKKKKK..KKKK...",
];

/** CAT_AWAKE — 16×12 — 계열 cat · (제안) 깸 — 클릭 시 '야옹'과 함께 */
export const CAT_AWAKE: readonly string[] = [
  "................",
  "....K...K.......",
  "...KOK.KOK......",
  "...KOOKOOK......",
  "..KOOOOOOOK.....",
  "..KOKOOOKOK.....",
  "..KOOOPOOOK.....",
  "...KOWWWOK......",
  "...KOWWWOK..K...",
  "..KOOWWWOOK.KOK.",
  "..KOOOOOOOKKOK..",
  "...KKKKKKKKKK...",
];

// ── P3g(AGP-65) — sprites_p3g.py ASSETS에서 스크립트로 추출(손으로 고치지 말 것) ──

/** 사람 정면 서기 16×24 — 아호게(0~1행)·옆가르마·후드·사원증(14~16행)·청바지·흰 운동화, 봇보다 1ap 큼(발 23행) — 계열 `user`, 16×24 */
export const USER_FRONT: readonly string[] = [
  ".........KK.....",
  ".....KKKKHK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHSSSShK..",
  "..KHHSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "...KUuRssRuUK...",
  "...KUUURRUUUK...",
  "..KUKUUWWUUKUK..",
  "..KUKUUwWUUKUK..",
  "..KuKUUWWUUKuK..",
  "..KSKuuuuuuKSK..",
  "...KKJJJJJJKK...",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "....KJjKKjJK....",
  "...KEEK..KEEK...",
  "...KKKK..KKKK...",
];

/** 사람 뒷모습 16×24 — 목 뒤 후드(11~13행) — 계열 `user`, 16×24 */
export const USER_BACK: readonly string[] = [
  ".........KK.....",
  ".....KKKKHK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KSHHHHHHHHSK..",
  "..KShHHHHHHhSK..",
  "...KhhhhhhhhK...",
  "....KUUUUUUK....",
  "...KUuUUUUuUK...",
  "..KUKUuuuuUKUK..",
  "..KUKUUUUUUKUK..",
  "..KUKUUUUUUKUK..",
  "..KuKUUUUUUKuK..",
  "..KSKuuuuuuKSK..",
  "...KKJJJJJJKK...",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "....KJjKKjJK....",
  "...KEEK..KEEK...",
  "...KKKK..KKKK...",
];

/** 사람 옆모습(오른쪽) 16×24 — 왼쪽은 좌우 반전. 사람만 옆모습이 있다(봇은 P3e 규칙대로 정면/뒷모습) — 계열 `user`, 16×24 */
export const USER_SIDE_R: readonly string[] = [
  "........KK......",
  "......KKKHK.....",
  "....KKHHHHHK....",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHSK..",
  "...KHHHHHHSSSK..",
  "...KHhsSSSKSSK..",
  "...KHhsSSSKSSSK.",
  "...KhSSSSSSSSK..",
  "....KKSSSSSSK...",
  "....KUUUssK.....",
  "...KUUUUURRK....",
  "...KUKuuKUWK....",
  "...KUKuuKUwK....",
  "...KuKuuKUWK....",
  "...KuKSSKuuK....",
  "....KJJJJJJK....",
  "....KJJJJJJK....",
  ".....KJJjJK.....",
  ".....KJJjJK.....",
  ".....KEEEEEK....",
  ".....KKKKKKK....",
];

/** 정면 걷기 A(18~23행만 다름) — 계열 `user`, 16×24 */
export const USER_FRONT_WALK_A: readonly string[] = [
  ".........KK.....",
  ".....KKKKHK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHSSSShK..",
  "..KHHSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "...KUuRssRuUK...",
  "...KUUURRUUUK...",
  "..KUKUUWWUUKUK..",
  "..KUKUUwWUUKUK..",
  "..KuKUUWWUUKuK..",
  "..KSKuuuuuuKSK..",
  "...KKJJJJJJKK...",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "....KJjK.KEEK...",
  "...KEEK..KKKK...",
  "...KKKK.........",
];

/** 정면 걷기 B — 계열 `user`, 16×24 */
export const USER_FRONT_WALK_B: readonly string[] = [
  ".........KK.....",
  ".....KKKKHK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHSSSShK..",
  "..KHHSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "...KUuRssRuUK...",
  "...KUUURRUUUK...",
  "..KUKUUWWUUKUK..",
  "..KUKUUwWUUKUK..",
  "..KuKUUWWUUKuK..",
  "..KSKuuuuuuKSK..",
  "...KKJJJJJJKK...",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "...KEEK.KjJK....",
  "...KKKK..KEEK...",
  ".........KKKK...",
];

/** 뒷모습 걷기 A — 다리 행은 정면과 같다 — 계열 `user`, 16×24 */
export const USER_BACK_WALK_A: readonly string[] = [
  ".........KK.....",
  ".....KKKKHK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KSHHHHHHHHSK..",
  "..KShHHHHHHhSK..",
  "...KhhhhhhhhK...",
  "....KUUUUUUK....",
  "...KUuUUUUuUK...",
  "..KUKUuuuuUKUK..",
  "..KUKUUUUUUKUK..",
  "..KUKUUUUUUKUK..",
  "..KuKUUUUUUKuK..",
  "..KSKuuuuuuKSK..",
  "...KKJJJJJJKK...",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "....KJjK.KEEK...",
  "...KEEK..KKKK...",
  "...KKKK.........",
];

/** 뒷모습 걷기 B — 계열 `user`, 16×24 */
export const USER_BACK_WALK_B: readonly string[] = [
  ".........KK.....",
  ".....KKKKHK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KSHHHHHHHHSK..",
  "..KShHHHHHHhSK..",
  "...KhhhhhhhhK...",
  "....KUUUUUUK....",
  "...KUuUUUUuUK...",
  "..KUKUuuuuUKUK..",
  "..KUKUUUUUUKUK..",
  "..KUKUUUUUUKUK..",
  "..KuKUUUUUUKuK..",
  "..KSKuuuuuuKSK..",
  "...KKJJJJJJKK...",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "...KEEK.KjJK....",
  "...KKKK..KEEK...",
  ".........KKKK...",
];

/** 옆 걷기 A(다리 벌림). B = USER_SIDE_R 그대로(다리 모음) — 계열 `user`, 16×24 */
export const USER_SIDE_WALK_A: readonly string[] = [
  "........KK......",
  "......KKKHK.....",
  "....KKHHHHHK....",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHSK..",
  "...KHHHHHHSSSK..",
  "...KHhsSSSKSSK..",
  "...KHhsSSSKSSSK.",
  "...KhSSSSSSSSK..",
  "....KKSSSSSSK...",
  "....KUUUssK.....",
  "...KUUUUURRK....",
  "...KUKuuKUWK....",
  "...KUKuuKUwK....",
  "...KuKuuKUWK....",
  "...KuKSSKuuK....",
  "....KJJJJJJK....",
  "....KJJJJJJK....",
  "....KJJKKJJK....",
  "...KJJK..KJJK...",
  "..KEEEK..KEEEK..",
  "..KKKKK..KKKKK..",
];

/** 대화 장면 전경 — 사람 뒷모습 상반신 30×26(어깨 너머 구도). 아래는 대화창이 가린다 — 계열 `user`, 30×26 */
export const USER_BACK_BUST: readonly string[] = [
  "...............KK.............",
  "...........KKKKHK.............",
  ".........KKHHHHHHKK...........",
  "........KHHHHHHHHHHK..........",
  ".......KHHHHHHHHHHHHK.........",
  "......KHHHHHHHHHHHHHHK........",
  "......KHHHHHHHHHHHHHhK........",
  "......KHHHHHHHHHHHHHhK........",
  "......KHHHHHHHHHHHHHhK........",
  "....KsKHHHHHHHHHHHHHhKsK......",
  "....KsKHHHHHHHHHHHHHhKsK......",
  ".....KKhHHHHHHHHHHHhhKK.......",
  "......KhhhhhhhhhhhhhhK........",
  ".......KRSSSSSSSSSSRK.........",
  ".....KKUUUUUUUUUUUUUUKK.......",
  "....KUUuUUUUUUUUUUUUuUUK......",
  "...KUUUuuUUUUUUUUUUuuUUUK.....",
  "..KUUUUUuuuuuuuuuuuuUUUUUK....",
  ".KUUUUUUUUUUUUUUUUUUUUUUUK....",
  "KUUUUUUUUUUUUUUUUUUUUUUUUUK...",
  "KUUUUUUUUUUUUUUUUUUUUUUUUUuK..",
  "KUUUUUUUUUUUUUUUUUUUUUUUUUuK..",
  "KUUUUUUUUUUUUUUUUUUUUUUUUuuK..",
  "KUUUUUUUUUUUUUUUUUUUUUUUUuuK..",
  "KUUUUUUUUUUUUUUUUUUUUUUUuuuK..",
  "KUUUUUUUUUUUUUUUUUUUUUUUuuuK..",
];

/** 봇 표정: 평소 = P3a 앉음 프레임 그대로 — 계열 `char`, 16×16 */
export const FACE_NORMAL: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
];

/** 봇 표정: 생각 중 — 눈 1px 위·오른쪽(8~9행). 장면에서 머리 오른쪽 위에 P3e `MB_DOTS` 말풍선 — 계열 `char`, 16×16 */
export const FACE_THINKING: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSSKSSSSKHK..",
  "..KSSSSSSSSSSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
];

/** 봇 표정: 기쁨 — ^ ^ 눈(8~9행) + ∪ 웃는 입(10~11행, 코 음영 생략) — 계열 `char`, 16×16 */
export const FACE_HAPPY: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSKSSSSKSHK..",
  "..KSKSKSSKSKSK..",
  "..KSSSKSSKSSSK..",
  "...KSSSKKSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
];

/** 봇 표정: 곤란 — 내리깐 1px 눈(8행 비움) + 넓은 일자 입(11행). 장면에서 P3e `FX_SWEAT` — 계열 `char`, 16×16 */
export const FACE_TROUBLED: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSSSSSSSSHK..",
  "..KSSKSSSSKSSK..",
  "..KSSSSssSSSSK..",
  "...KSSKKKKSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
];

/** 평소 표정의 눈 깜빡임 프레임(8~9행) — 계열 `char`, 16×16 */
export const FACE_BLINK: readonly string[] = [
  "................",
  ".....KKKKKK.....",
  "...KKHHHHHHKK...",
  "..KHHHHHHHHHHK..",
  "..KHHHHHHHHHhK..",
  "..KHHHHHHHHHhK..",
  "..KHHSSSSSSHhK..",
  "..KHSSSSSSSSHK..",
  "..KHSSSSSSSSHK..",
  "..KSKKSSSSKKSK..",
  "..KSSSSssSSSSK..",
  "...KSSSSSSSSK...",
  "....KCCssCCK....",
  "...KCCCCCCCCK...",
  "..KCKCCCCCCKCK..",
  "..KCKCCCCCCKCK..",
];

/** 입구 발판 32×12 — 방 맨 아래 타일 줄, 사람 입장 위치 — 계열 `mat`, 32×12 */
export const DOORMAT: readonly string[] = [
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "KffffffffffffffffffffffffffffffK",
  "KfFFFFFFFFFFFFFFFFFFFFFFFFFFFFfK",
  "KfFFFFFFFFFFFFFFFFFFFFFFFFFFFFfK",
  "KfFffffffffffffffffffffffffffFfK",
  "KfFFFFFFFFFFFFFFFFFFFFFFFFFFFFfK",
  "KfFFFFFFFFFFFFFFFFFFFFFFFFFFFFfK",
  "KfFffffffffffffffffffffffffffFfK",
  "KfFFFFFFFFFFFFFFFFFFFFFFFFFFFFfK",
  "KfFFFFFFFFFFFFFFFFFFFFFFFFFFFFfK",
  "KffffffffffffffffffffffffffffffK",
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
];

/** 목적지 핀 7×10 프레임 A — 계열 `pin`, 7×10 */
export const PIN_A: readonly string[] = [
  ".KKKKK.",
  "KRRRRRK",
  "KRHRRRK",
  "KRRRRRK",
  ".KRRRK.",
  "..KRK..",
  "..KRK..",
  "...K...",
  ".KK.KK.",
  "..KKK..",
];

/** 목적지 핀 프레임 B — 핀만 1ap 위(바닥 고리는 그대로) — 계열 `pin`, 7×10 */
export const PIN_B: readonly string[] = [
  "KRRRRRK",
  "KRHRRRK",
  "KRRRRRK",
  ".KRRRK.",
  "..KRK..",
  "..KRK..",
  "...K...",
  ".......",
  ".KK.KK.",
  "..KKK..",
];

/** 갈 수 없음 표시 7×7(600ms) — 계열 `pin`, 7×7 */
export const PIN_NO: readonly string[] = [
  "KK...KK",
  "KRK.KRK",
  ".KRKRK.",
  "..KRK..",
  ".KRKRK.",
  "KRK.KRK",
  "KK...KK",
];

/** 대화 중 표시 9×7 — 봇 머리 위(유니코드 💬 대신) — 계열 `mb`, 9×7 */
export const TALK_MARK: readonly string[] = [
  ".KKKKKKK.",
  "KBBBBBBBK",
  "KBKBKBKBK",
  "KBBBBBBBK",
  ".KBBKKKK.",
  ".KBK.....",
  ".KK......",
];

/** 대화 장면 작은 테이블 56×18(장면 px) — 계열 `furn2`, 56×18 */
export const TABLE_SMALL: readonly string[] = [
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
  "KwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK",
  "KyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "..KMK..............................................KMK..",
  "..KMK..............................................KMK..",
];

/** 대화 장면 봇의 노트북 14×11 — 작업 없음 — 계열 `laptop`, 14×11 */
export const LAPTOP_OFF: readonly string[] = [
  "KKKKKKKKKKKK..",
  "KmmmmmmmmmmK..",
  "KmOOOOOOOOmK..",
  "KmOOOOOOOOmK..",
  "KmOOOOOOOOmK..",
  "KmOOOOOOOOmK..",
  "KmmmmmmmmmmK..",
  ".KKKKKKKKKKKKK",
  "KMmMmMmMmMmMmK",
  "KMMMMMMMMMMMMK",
  "KKKKKKKKKKKKKK",
];

/** 노트북 켜짐 A — 봇의 run이 RUNNING이면 대화 중에도 켜져 있다(연출≠실제 분리의 표지) — 계열 `laptop`, 14×11 */
export const LAPTOP_ON_A: readonly string[] = [
  "KKKKKKKKKKKK..",
  "KmmmmmmmmmmK..",
  "KmGGGGGGGGmK..",
  "KmGggGgggGmK..",
  "KmGGGGGGGGmK..",
  "KmGgggGGGGmK..",
  "KmmmmmmmmmmK..",
  ".KKKKKKKKKKKKK",
  "KMmMmMmMmMmMmK",
  "KMMMMMMMMMMMMK",
  "KKKKKKKKKKKKKK",
];

/** 노트북 켜짐 B — 계열 `laptop`, 14×11 */
export const LAPTOP_ON_B: readonly string[] = [
  "KKKKKKKKKKKK..",
  "KmmmmmmmmmmK..",
  "KmGGGGGGGGmK..",
  "KmGgggGggGmK..",
  "KmGGGGGGGGmK..",
  "KmGggGgggGmK..",
  "KmmmmmmmmmmK..",
  ".KKKKKKKKKKKKK",
  "KMmMmMmMmMmMmK",
  "KMMMMMMMMMMMMK",
  "KKKKKKKKKKKKKK",
];

/** 대화 장면 벽시계 10×10(장식) — 계열 `clock`, 10×10 */
export const WALL_CLOCK: readonly string[] = [
  "...KKKK...",
  ".KKMMMMKK.",
  ".KMppppMK.",
  "KMpppKppMK",
  "KMpppKppMK",
  "KMpppKKKMK",
  "KMppppppMK",
  ".KMppppMK.",
  ".KKMMMMKK.",
  "...KKKK...",
];

/** 선택지 커서 ▶ 5×7(HTML 인라인 SVG) — 계열 `mb`, 5×7 */
export const CHOICE_CURSOR: readonly string[] = [
  "K....",
  "KK...",
  "KBK..",
  "KBBK.",
  "KBK..",
  "KK...",
  "K....",
];

/** 대화창 넘김 ▼ 7×4(HTML 인라인 SVG) — 계열 `mb`, 7×4 */
export const NEXT_ARROW: readonly string[] = [
  "KKKKKKK",
  ".KBBBK.",
  "..KBK..",
  "...K...",
];

