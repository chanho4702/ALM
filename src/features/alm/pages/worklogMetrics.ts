import type { ProjectWorklogRow, User } from "../store/types";

export interface WorklogSummary {
  total: number;
  byAuthor: { userId: string; name: string; hours: number }[];
  byDay: { day: string; hours: number }[];
}

const round = (value: number) => Math.round(value * 100) / 100;

/** 워크로그 합산 — 사람별(많은 순), 날짜별(오름차순). 이름은 디렉터리, 없으면 "사용자 N" */
export function worklogSummary(rows: ProjectWorklogRow[], users: User[]): WorklogSummary {
  const byAuthor = new Map<string, number>();
  const byDay = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    total += row.hours;
    byAuthor.set(row.authorId, (byAuthor.get(row.authorId) ?? 0) + row.hours);
    byDay.set(row.workedOn, (byDay.get(row.workedOn) ?? 0) + row.hours);
  }
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? `사용자 ${id}`;
  return {
    total: round(total),
    byAuthor: [...byAuthor.entries()]
      .map(([userId, hours]) => ({ userId, name: nameOf(userId), hours: round(hours) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
    byDay: [...byDay.entries()]
      .map(([day, hours]) => ({ day, hours: round(hours) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** 오늘 기준 최근 N일 범위 — "YYYY-MM-DD" */
export function recentRange(days: number, today = new Date()): { since: string; until: string } {
  const until = localDay(today);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { since: localDay(start), until };
}

function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
