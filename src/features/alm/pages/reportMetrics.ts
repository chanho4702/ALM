import type { Issue, IssueChange, Sprint, WorkflowStatus } from "../store/types";
import { statusCategory } from "../components/labels";

/**
 * 번다운·스프린트 리포트 집계. 변경 이력(`IssueChange`)을 시간순으로 재생해 "그 시점에 이 이슈가
 * 어느 스프린트에 있었고 어떤 상태였나"를 되살린다 — 현재 값만 보면 완료 시 이관된 이슈가 사라져
 * 지난 스프린트를 설명할 수 없다.
 *
 * 완료 판정(카테고리)은 워크플로 스킴을 가진 프론트가 하고, 서버는 상태 id만 준다.
 * 설계: docs/superpowers/specs/2026-08-29-sprint-report-burndown-design.md
 */

export type BurndownUnit = "hours" | "count";

export interface BurndownPoint {
  date: string; // "YYYY-MM-DD"
  /** 그날 끝의 잔여. 아직 오지 않은 날은 null (선을 잇지 않는다) */
  remaining: number | null;
  ideal: number;
}

export interface BurndownSeries {
  unit: BurndownUnit;
  started: boolean;
  total: number;
  /** 예상 시간이 없는 스프린트 이슈 수 — 시간 기준 합계에 빠지므로 화면이 경고한다 */
  missingEstimates: number;
  /** 창설 이력이 없어 재생 대신 현재 값을 쓴 이슈 수 — 선이 평평한 이유를 화면이 알린다 */
  historyMissing: number;
  /** 이 스프린트에 한 번이라도 담긴 이슈 수 — 0이면 차트를 그리지 않는다 */
  poolSize: number;
  points: BurndownPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 축이 무한히 늘어나지 않게 자른다 — 기간을 잘못 넣은 스프린트가 화면을 망치지 않게 */
const MAX_DAYS = 120;

/**
 * 날짜 경계는 전부 **사용자 달력(로컬)** 기준이다. UTC로 자르면 서울에서 새벽 1시 변경이
 * 전날 점에 붙어 계단이 하루 밀린다.
 */
function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayOf(iso: string): string {
  return localDay(new Date(iso));
}

function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** 그 로컬 날짜의 끝(23:59:59.999)을 ISO로 — 이력 비교는 ISO 문자열로 한다 */
function endOfLocalDay(day: string): string {
  const date = parseDay(day);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function startOfLocalDay(day: string): string {
  return parseDay(day).toISOString();
}

function addDays(day: string, count: number): string {
  return localDay(new Date(parseDay(day).getTime() + count * DAY_MS));
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);
}

/**
 * 해당 시각까지의 이력을 재생한 이슈 상태. 이력이 창설 기록부터 없으면 현재 값으로 대신한다.
 *
 * `ignoreSprintMovesAt`은 "완료 처리로 한꺼번에 옮긴 순간"을 재생에서 뺀다 — 완료된 스프린트
 * 리포트는 이관 직전의 소속으로 이슈를 세야 미완료 목록이 비지 않는다.
 */
function stateAt(
  issue: Issue,
  changes: IssueChange[],
  atExclusiveEnd: string,
  ignoreSprintMovesAt?: string,
) {
  const mine = changes.filter(
    (change) =>
      change.issueId === issue.id &&
      change.at <= atExclusiveEnd &&
      !(change.field === "sprint" && ignoreSprintMovesAt !== undefined && change.at === ignoreSprintMovesAt),
  );
  const creation = changes.find(
    (change) => change.issueId === issue.id && change.field === "status" && change.fromValue === null,
  );
  if (!creation) {
    // 이력이 없는 이슈(예: 기능 도입 전 데이터) — 현재 값을 그대로 쓴다. 선이 평평해지지만 거짓은 아니다.
    return { status: issue.status, sprintId: issue.sprintId, replayed: false };
  }
  let status = creation.toValue ?? issue.status;
  let sprintId: string | null = null;
  for (const change of mine) {
    if (change.field === "status") status = change.toValue ?? status;
    else sprintId = change.toValue;
  }
  return { status, sprintId, replayed: true };
}

/** 이력에 한 번이라도 이 스프린트가 등장한 이슈 + 현재 소속 이슈 */
function candidates(sprintId: string, issues: Issue[], changes: IssueChange[]): Issue[] {
  const touched = new Set(
    changes
      .filter(
        (change) =>
          change.sprintId === sprintId ||
          (change.field === "sprint" &&
            (change.fromValue === sprintId || change.toValue === sprintId)),
      )
      .map((change) => change.issueId),
  );
  return issues.filter((issue) => issue.sprintId === sprintId || touched.has(issue.id));
}

export function burndownSeries(input: {
  sprint: Sprint;
  issues: Issue[];
  changes: IssueChange[];
  statuses: WorkflowStatus[];
  unit: BurndownUnit;
  today: string;
}): BurndownSeries {
  const { sprint, issues, changes, statuses, unit, today } = input;
  const pool = candidates(sprint.id, issues, changes);
  const reference = sprint.completedAt ?? endOfLocalDay(today);
  // 완료된 스프린트의 미완료 이슈는 이미 다른 곳으로 옮겨졌다 — 이관 직전 소속으로 세야
  // "예상 미입력" 경고가 사라지지 않는다.
  const membersAtReference = pool.filter((issue) => {
    const state = stateAt(issue, changes, reference, sprint.completedAt);
    return state.replayed ? state.sprintId === sprint.id : issue.sprintId === sprint.id;
  });
  const missingEstimates = membersAtReference.filter((issue) => issue.estimateHours == null).length;
  const historyMissing = pool.filter(
    (issue) => !stateAt(issue, changes, reference).replayed,
  ).length;
  const base = { unit, missingEstimates, historyMissing, poolSize: pool.length };

  const startDay = sprint.plannedStart ?? (sprint.startedAt ? dayOf(sprint.startedAt) : null);
  if (!startDay || (sprint.state === "planned" && !sprint.startedAt)) {
    return { ...base, started: false, total: 0, points: [] };
  }

  // 예정 종료일을 넘겨 완료했으면 실제 완료일까지, 진행 중이면 오늘까지 늘린다 (설계 §3)
  let endDay = sprint.plannedEnd ?? today;
  const completedDay = sprint.completedAt ? dayOf(sprint.completedAt) : null;
  if (completedDay && completedDay > endDay) endDay = completedDay;
  if (!completedDay && today > endDay) endDay = today;
  if (endDay < startDay) endDay = startDay;

  const span = Math.min(daysBetween(startDay, endDay), MAX_DAYS - 1);
  const weight = (issue: Issue) => (unit === "hours" ? (issue.estimateHours ?? 0) : 1);

  const remainingAt = (at: string): number =>
    pool.reduce((sum, issue) => {
      const state = stateAt(issue, changes, at);
      const inSprint = state.replayed ? state.sprintId === sprint.id : issue.sprintId === sprint.id;
      if (!inSprint) return sum;
      return statusCategory(statuses, state.status) === "done" ? sum : sum + weight(issue);
    }, 0);

  // 총량(기준선의 출발점)은 첫날 변경 이전 = 실제 시작 시각 기준이다. 첫날 끝으로 재면
  // 당일 완료분이 총량에서 빠져 "하루 만에 끝난 스프린트"가 총량 0으로 보인다.
  const total = remainingAt(sprint.startedAt ?? startOfLocalDay(startDay));
  const points: BurndownPoint[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(startDay, offset);
    points.push({
      date,
      remaining: date <= today ? remainingAt(endOfLocalDay(date)) : null,
      ideal: span === 0 ? 0 : Math.round((total * (1 - offset / span)) * 100) / 100,
    });
  }
  return { ...base, started: true, total, points };
}

export interface UnfinishedRow {
  issue: Issue;
  /** 완료 처리로 옮겨간 곳. 진행 중 스프린트면 undefined */
  destination?: string;
}

export interface SprintReport {
  completed: Issue[];
  notCompleted: UnfinishedRow[];
  /** 시작 후 편입된 이슈 */
  added: Issue[];
  /** 시작 후 빠진 이슈 (완료 시 일괄 이관은 제외) */
  removed: Issue[];
}

export function sprintReport(input: {
  sprint: Sprint;
  issues: Issue[];
  changes: IssueChange[];
  statuses: WorkflowStatus[];
  sprints: Sprint[];
  now: string;
}): SprintReport {
  const { sprint, issues, changes, statuses, sprints, now } = input;
  const reference = sprint.completedAt ?? now;
  const pool = candidates(sprint.id, issues, changes);
  const startedAt = sprint.startedAt ?? sprint.plannedStart ?? null;

  const completed: Issue[] = [];
  const notCompleted: UnfinishedRow[] = [];
  for (const issue of pool) {
    const state = stateAt(issue, changes, reference, sprint.completedAt);
    const inSprint = state.replayed ? state.sprintId === sprint.id : issue.sprintId === sprint.id;
    if (!inSprint) continue;
    if (statusCategory(statuses, state.status) === "done") {
      completed.push(issue);
      continue;
    }
    const transfer = changes.find(
      (change) =>
        change.issueId === issue.id &&
        change.field === "sprint" &&
        change.fromValue === sprint.id &&
        sprint.completedAt !== undefined &&
        change.at === sprint.completedAt,
    );
    const destination = transfer
      ? (sprints.find((s) => s.id === transfer.toValue)?.name ?? "백로그")
      : undefined;
    notCompleted.push({ issue, destination });
  }

  // 스코프 변경은 전이 하나하나가 아니라 **순효과**로 센다 — 여러 번 오간 이슈가 두 묶음에
  // 동시에 들어가거나 같은 줄이 중복되지 않게.
  const added: Issue[] = [];
  const removed: Issue[] = [];
  if (startedAt !== null) {
    for (const issue of pool) {
      const atStart = stateAt(issue, changes, startedAt);
      const atEnd = stateAt(issue, changes, reference, sprint.completedAt);
      const inAtStart = atStart.replayed
        ? atStart.sprintId === sprint.id
        : issue.sprintId === sprint.id;
      const inAtEnd = atEnd.replayed ? atEnd.sprintId === sprint.id : issue.sprintId === sprint.id;
      if (!inAtStart && inAtEnd) added.push(issue);
      if (inAtStart && !inAtEnd) removed.push(issue);
    }
  }

  return { completed, notCompleted, added, removed };
}
