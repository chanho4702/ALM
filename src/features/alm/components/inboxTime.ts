/**
 * 인박스 미루기 프리셋(Linear Inbox "Snooze") — 지금 기준 미래 시각, 사용자의 로컬 시간.
 * - 1시간 뒤
 * - 내일 아침 9시
 * - 다음 주 월요일 9시(오늘이 월요일이어도 7일 뒤)
 * 직접 고르기는 화면이 `datetime-local` 값을 `fromLocalInput`으로 바꾼다.
 */
export interface SnoozePreset {
  id: "hour" | "tomorrow" | "next-week";
  label: string;
  at: Date;
}

export function snoozePresets(now: Date = new Date()): SnoozePreset[] {
  const hour = new Date(now.getTime() + 60 * 60 * 1000);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  // 일(0)·월(1)…토(6) — 다음 월요일까지 남은 날(월요일 당일이면 7)
  const days = (8 - now.getDay()) % 7 || 7;
  monday.setDate(now.getDate() + days);
  monday.setHours(9, 0, 0, 0);
  return [
    { id: "hour", label: "1시간 뒤", at: hour },
    { id: "tomorrow", label: "내일 아침 9시", at: tomorrow },
    { id: "next-week", label: "다음 주 월요일 9시", at: monday },
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `<input type="datetime-local">` 값 — 로컬 시각 "YYYY-MM-DDTHH:mm" */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local 값 → Date. 형식이 틀리면 null */
export function fromLocalInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "10월 25일 (토) 09:00" — 로케일 API를 쓰지 않는다(환경별 표기 흔들림 방지, labels.ts와 같은 방침) */
export function formatSnoozeUntil(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = "일월화수목금토"[date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${day}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
