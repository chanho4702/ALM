import type { Issue, User, WorkflowStatus } from "../store/types";
import {
  statusKind,
} from "../components/labels";

/**
 * 요약 화면이 쓰는 순수 집계. 화면에서 계산 로직을 빼둬 단위 테스트로 고정한다
 * (backlogDnd.ts와 같은 패턴). 날짜는 전부 "YYYY-MM-DD" 문자열로 다룬다 —
 * 자정 경계·타임존 때문에 Date 산술을 화면에 두지 않는다.
 */

export interface WorkProgress {
  total: number;
  done: number;
  /** 0~100 정수 — 이슈가 없으면 0 */
  percent: number;
}

export function workProgress(issues: Issue[], statuses: WorkflowStatus[]): WorkProgress {
  const total = issues.length;
  const done = issues.filter((issue) => statusKind(statuses, issue.status) === "complete").length;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export interface DueRow {
  issue: Issue;
  /** 남은 일수 — 음수면 지난 마감 */
  daysLeft: number;
  overdue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * 마감 위험 목록 — 지난 마감이 먼저, 그다음 임박한 순.
 * 완료된 이슈와 창(window) 밖 마감은 제외한다.
 *
 * 기본으로 자르지 않는다 — 화면 배지가 "지연 N건"을 세는 원천이라 상한을 걸면 수치가 거짓이 된다.
 * 목록 표시용 상한은 호출자가 slice로 정한다.
 */
export function dueRows(
  issues: Issue[],
  statuses: WorkflowStatus[],
  today: string,
  options: { windowDays?: number; limit?: number } = {},
): DueRow[] {
  const { windowDays = 7, limit } = options;
  return issues
    .filter((issue) => issue.dueDate && statusKind(statuses, issue.status) !== "complete")
    .map((issue) => {
      const daysLeft = dayDiff(today, issue.dueDate as string);
      return { issue, daysLeft, overdue: daysLeft < 0 };
    })
    .filter((row) => row.daysLeft <= windowDays)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.issue.key.localeCompare(b.issue.key))
    .slice(0, limit ?? undefined);
}

export interface CountRow {
  id: string;
  name: string;
  count: number;
}

export interface StatusCountRow extends CountRow {
  statusId: string;
}

/** 워크플로 상태 순서를 유지한 분포 — 0건 상태도 남긴다(구성이 그대로 읽히게) */
export function statusDistribution(
  issues: Issue[],
  statuses: WorkflowStatus[],
): StatusCountRow[] {
  const counts = new Map<string, number>(statuses.map((status) => [status.id, 0]));
  for (const issue of issues) {
    counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
  }
  return [...statuses]
    .sort((a, b) => a.order - b.order)
    .map((status) => ({
      id: status.id,
      statusId: status.id,
      name: status.name,
      count: counts.get(status.id) ?? 0,
    }));
}

/**
 * 담당자별 작업량 — 많은 순, 미지정은 항상 마지막. 상한을 넘으면 "기타 N명"으로 접는다.
 * 0건 담당자는 신호가 없어 뺀다(기존 화면은 전원을 보여줘 잡음이 컸다).
 */
export function assigneeDistribution(
  issues: Issue[],
  users: User[],
  options: { limit?: number } = {},
): CountRow[] {
  const { limit = 8 } = options;
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const issue of issues) {
    if (issue.assigneeId == null) unassigned += 1;
    else counts.set(issue.assigneeId, (counts.get(issue.assigneeId) ?? 0) + 1);
  }

  const named = [...counts.entries()]
    .map(([id, count]) => ({ id, name: users.find((u) => u.id === id)?.name ?? `사용자 #${id}`, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const shown = named.slice(0, limit);
  const rest = named.slice(limit);
  const rows: CountRow[] = [...shown];
  if (rest.length > 0) {
    rows.push({
      id: "others",
      name: `기타 ${rest.length}명`,
      count: rest.reduce((sum, row) => sum + row.count, 0),
    });
  }
  if (unassigned > 0) rows.push({ id: "unassigned", name: "미지정", count: unassigned });
  return rows;
}

export function recentlyUpdated(issues: Issue[], limit = 5): Issue[] {
  return [...issues]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/** 종료 예정일까지 남은 일수 — 오늘이면 0, 지났으면 음수. 기간 미설정이면 null */
export function remainingDays(plannedEnd: string | undefined, today: string): number | null {
  if (!plannedEnd) return null;
  return dayDiff(today, plannedEnd);
}

/** 오늘 날짜 "YYYY-MM-DD" — 로컬 자정 기준 */
export function todayKey(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
