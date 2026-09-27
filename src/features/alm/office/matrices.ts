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
