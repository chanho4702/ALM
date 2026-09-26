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

