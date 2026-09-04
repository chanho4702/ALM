/**
 * 시간 표기 공용 유틸 — 화면마다 toLocaleDateString/toLocaleString/ISO가 섞이던 것을 한 곳으로.
 * 표기 규칙: 날짜 `2026-09-04`, 일시 `2026-09-04 14:03`, 상대 시간 `3시간 전`.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** `yyyy-mm-dd` — ISO 문자열이나 `yyyy-mm-dd`(마감일) 모두 받는다. 파싱 실패면 원문 반환 */
export function formatDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `yyyy-mm-dd HH:MM` */
export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDate(value)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3시간 전" 식 상대 시간 — 지라 홈의 시간 표기. 일주일이 넘으면 날짜로 */
export function relTime(iso: string, now: number = Date.now()): string {
  const stamp = Date.parse(iso);
  if (Number.isNaN(stamp)) return iso;
  const diff = now - stamp;
  const minute = 60_000;
  const hour = 3_600_000;
  if (diff < minute) return "방금 전";
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}시간 전`;
  const days = Math.floor(diff / (24 * hour));
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return formatDate(iso);
}
