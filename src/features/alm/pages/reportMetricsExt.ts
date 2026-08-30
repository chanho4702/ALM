import type { Issue, IssueChange, Sprint, WorkflowStatus } from "../store/types";
import { statusKind } from "../components/labels";
import {
  addDays,
  candidates,
  dayOf,
  daysBetween,
  endOfLocalDay,
  startOfLocalDay,
  stateAt,
  type BurndownUnit,
} from "./reportMetrics";

/**
 * 리포트 확장 — 번업·벨로시티·누적 흐름도·컨트롤 차트. 번다운과 같은 이력 재생(`stateAt`) 위에
 * 서서, "그 시점에 어디에 있었나"를 현재 값이 아니라 변경 이력으로 되살린다.
 */

const MAX_DAYS = 120;
const weightOf = (unit: BurndownUnit) => (issue: Issue) =>
  unit === "hours" ? (issue.estimateHours ?? 0) : 1;

// ── 번업 ─────────────────────────────────────────────────

export interface BurnupPoint {
  date: string;
  /** 그날 끝 스프린트 범위(총량). 아직 오지 않은 날은 null */
  scope: number | null;
  completed: number | null;
}

export interface BurnupSeries {
  unit: BurndownUnit;
  started: boolean;
  points: BurnupPoint[];
}

/** 범위선(편입·이탈로 오르내림)과 완료선(완료 누적) — 번다운이 못 보여주는 "범위가 늘었나"를 보여준다 */
export function burnupSeries(input: {
  sprint: Sprint;
  issues: Issue[];
  changes: IssueChange[];
  statuses: WorkflowStatus[];
  unit: BurndownUnit;
  today: string;
}): BurnupSeries {
  const { sprint, issues, changes, statuses, unit, today } = input;
  const pool = candidates(sprint.id, issues, changes);
  const startDay = sprint.plannedStart ?? (sprint.startedAt ? dayOf(sprint.startedAt) : null);
  if (!startDay || (sprint.state === "planned" && !sprint.startedAt)) {
    return { unit, started: false, points: [] };
  }
  let endDay = sprint.plannedEnd ?? today;
  const completedDay = sprint.completedAt ? dayOf(sprint.completedAt) : null;
  if (completedDay && completedDay > endDay) endDay = completedDay;
  if (!completedDay && today > endDay) endDay = today;
  if (endDay < startDay) endDay = startDay;
  const span = Math.min(daysBetween(startDay, endDay), MAX_DAYS - 1);
  const weight = weightOf(unit);

  const measure = (at: string) => {
    let scope = 0;
    let completed = 0;
    for (const issue of pool) {
      const state = stateAt(issue, changes, at);
      const inSprint = state.replayed ? state.sprintId === sprint.id : issue.sprintId === sprint.id;
      if (!inSprint) continue;
      scope += weight(issue);
      if (statusKind(statuses, state.status) === "complete") completed += weight(issue);
    }
    return { scope, completed };
  };

  const points: BurnupPoint[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(startDay, offset);
    if (date > today) {
      points.push({ date, scope: null, completed: null });
      continue;
    }
    const { scope, completed } = measure(endOfLocalDay(date));
    points.push({ date, scope, completed });
  }
  return { unit, started: true, points };
}

// ── 벨로시티 ─────────────────────────────────────────────

export interface VelocityRow {
  sprintId: string;
  name: string;
  /** 시작 시점 총량(약속) */
  committed: number;
  /** 완료 시점에 스프린트 안에서 끝난 양 */
  completed: number;
}

/** 완료된 스프린트만, 완료 순서대로 — 평균은 화면이 낸다 */
export function velocitySeries(input: {
  sprints: Sprint[];
  issues: Issue[];
  changes: IssueChange[];
  statuses: WorkflowStatus[];
  unit: BurndownUnit;
}): VelocityRow[] {
  const { sprints, issues, changes, statuses, unit } = input;
  const weight = weightOf(unit);
  return sprints
    .filter((sprint): sprint is Sprint & { completedAt: string } => sprint.state === "done" && !!sprint.completedAt)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((sprint) => {
      const pool = candidates(sprint.id, issues, changes);
      const startedAt = sprint.startedAt ?? (sprint.plannedStart ? startOfLocalDay(sprint.plannedStart) : sprint.completedAt);
      let committed = 0;
      let completed = 0;
      for (const issue of pool) {
        const atStart = stateAt(issue, changes, startedAt);
        const inAtStart = atStart.replayed ? atStart.sprintId === sprint.id : issue.sprintId === sprint.id;
        if (inAtStart) committed += weight(issue);
        // 완료 처리로 옮겨간 순간은 빼고 본다 — 이관 직전 소속이 이 스프린트의 결과다
        const atEnd = stateAt(issue, changes, sprint.completedAt, sprint.completedAt);
        const inAtEnd = atEnd.replayed ? atEnd.sprintId === sprint.id : issue.sprintId === sprint.id;
        if (inAtEnd && statusKind(statuses, atEnd.status) === "complete") completed += weight(issue);
      }
      return { sprintId: sprint.id, name: sprint.name, committed, completed };
    });
}

// ── 누적 흐름도 ───────────────────────────────────────────

export interface FlowPoint {
  date: string;
  new: number;
  active: number;
  complete: number;
}

/** 날짜마다 의미별 이슈 수 — 프로젝트 전체, 생성 이전 이슈는 세지 않는다 */
export function cumulativeFlow(input: {
  issues: Issue[];
  changes: IssueChange[];
  statuses: WorkflowStatus[];
  from: string;
  to: string;
}): FlowPoint[] {
  const { issues, changes, statuses, from, to } = input;
  const span = Math.min(Math.max(daysBetween(from, to), 0), MAX_DAYS - 1);
  const points: FlowPoint[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(from, offset);
    const at = endOfLocalDay(date);
    const point: FlowPoint = { date, new: 0, active: 0, complete: 0 };
    for (const issue of issues) {
      if (issue.createdAt > at) continue;
      const state = stateAt(issue, changes, at);
      point[statusKind(statuses, state.status)] += 1;
    }
    points.push(point);
  }
  return points;
}

// ── 컨트롤 차트 ──────────────────────────────────────────

export interface CycleTimePoint {
  issueId: string;
  key: string;
  completedDate: string;
  /** 진행 시작(없으면 생성)부터 마지막 완료까지, 일 단위 소수 한 자리 */
  cycleDays: number;
}

export interface ControlChart {
  points: CycleTimePoint[];
  averageDays: number | null;
}

/** 기간 안에 완료된 이슈의 사이클 타임 — 진행 의미에 처음 들어간 시각부터 마지막 완료 시각까지 */
export function controlChart(input: {
  issues: Issue[];
  changes: IssueChange[];
  statuses: WorkflowStatus[];
  from: string;
  to: string;
}): ControlChart {
  const { issues, changes, statuses, from, to } = input;
  const fromAt = startOfLocalDay(from);
  const toAt = endOfLocalDay(to);
  const points: CycleTimePoint[] = [];
  for (const issue of issues) {
    if (statusKind(statuses, issue.status) !== "complete") continue;
    const mine = changes
      .filter((change) => change.issueId === issue.id && change.field === "status")
      .sort((a, b) => a.at.localeCompare(b.at));
    const completedAt = [...mine].reverse().find(
      (change) => statusKind(statuses, change.toValue ?? "") === "complete",
    )?.at;
    if (!completedAt || completedAt < fromAt || completedAt > toAt) continue;
    const startedAt =
      mine.find(
        (change) => change.fromValue !== null && statusKind(statuses, change.toValue ?? "") === "active",
      )?.at ?? issue.createdAt;
    const days = Math.max(0, (Date.parse(completedAt) - Date.parse(startedAt)) / (24 * 60 * 60 * 1000));
    points.push({
      issueId: issue.id,
      key: issue.key,
      completedDate: dayOf(completedAt),
      cycleDays: Math.round(days * 10) / 10,
    });
  }
  points.sort((a, b) => a.completedDate.localeCompare(b.completedDate) || a.key.localeCompare(b.key));
  const averageDays =
    points.length === 0
      ? null
      : Math.round((points.reduce((sum, p) => sum + p.cycleDays, 0) / points.length) * 10) / 10;
  return { points, averageDays };
}
