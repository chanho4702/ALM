/**
 * 표시 옵션(D1)의 순수 로직 — 하위 이슈 거르기 · 정렬 · 그룹/하위 그룹 묶기.
 * 화면(`IssueGroupedView`)은 여기서 나온 그룹을 그리기만 한다.
 *
 * 규칙(Linear Display options + 지라 목록 그룹을 따른다):
 * - 값이 없는 그룹("미지정"·"백로그"·"라벨 없음"…)은 언제나 맨 뒤.
 * - 라벨·컴포넌트는 값이 여럿이라 이슈가 그 수만큼 여러 그룹에 나온다(지라 라벨 스윔레인과 같다).
 * - 날짜·추정 정렬에서 빈 값은 방향과 무관하게 맨 뒤(null-last).
 */
import type {
  Component,
  Issue,
  IssueTypeDef,
  PriorityDef,
  ProjectVersion,
  Sprint,
  User,
  ViewDisplay,
  ViewGroupBy,
  ViewOrderBy,
  WorkflowStatus,
} from "../../store/types";
import { KIND_ORDER, priorityName, priorityRank, statusKind, statusName, typeLevel, typeName } from "../labels";

export interface GroupingContext {
  statuses: WorkflowStatus[];
  priorities: PriorityDef[];
  types: IssueTypeDef[];
  users: User[];
  sprints: Sprint[];
  versions: ProjectVersion[];
  components: Component[];
  /** 부모·에픽을 찾는 표 — 결과 밖의 이슈(필터에 안 걸린 에픽 등)도 들어 있을 수 있다 */
  issuesById: Map<string, Issue>;
  /** 빈 그룹 표시용 프로젝트 라벨 전체 */
  labels?: string[];
}

export interface IssueGroup {
  /** React key·접힘 상태 키 — `${kind}:${value ?? "none"}` */
  key: string;
  kind: ViewGroupBy;
  /** 그룹 값(상태 id·사용자 id…). 값 없음 그룹이면 null */
  value: string | null;
  label: string;
  count: number;
  /** 스토리 포인트 합(미추정은 0) */
  storyPoints: number;
  issues: Issue[];
  /** 하위 그룹(subGroupBy가 none이 아니면) */
  subGroups?: IssueGroup[];
}

/** 그룹 기준 한국어 이름 — 표시 옵션 Select와 그룹 머리글이 함께 쓴다 */
export const GROUP_LABELS: Record<ViewGroupBy, string> = {
  none: "없음",
  status: "상태",
  assignee: "담당자",
  priority: "우선순위",
  sprint: "스프린트",
  epic: "에픽",
  label: "라벨",
  type: "타입",
  component: "컴포넌트",
  fixVersion: "수정 버전",
};

export const ORDER_LABELS: Record<ViewOrderBy, string> = {
  manual: "수동(랭크)",
  priority: "우선순위",
  status: "상태",
  updated: "수정일",
  created: "생성일",
  due: "마감일",
  startDate: "시작일",
  storyPoints: "스토리 포인트",
  estimate: "예상 시간",
  title: "제목",
  key: "키",
};

/** 값 없음 그룹의 이름 */
const EMPTY_LABELS: Record<ViewGroupBy, string> = {
  none: "전체",
  status: "상태 없음",
  assignee: "미지정",
  priority: "우선순위 없음",
  sprint: "백로그",
  epic: "에픽 없음",
  label: "라벨 없음",
  type: "타입 없음",
  component: "컴포넌트 없음",
  fixVersion: "버전 없음",
};

/** "ALM-12" → 12 (키 숫자 정렬) */
export function keyNumber(key: string): number {
  const match = /(\d+)$/.exec(key);
  return match ? Number(match[1]) : 0;
}

/** 하위 이슈 표시를 끄면 하위 작업 계층 타입을 뺀다 */
export function filterSubIssues(issues: Issue[], showSubIssues: boolean, types: IssueTypeDef[]): Issue[] {
  if (showSubIssues) return issues;
  return issues.filter((issue) => typeLevel(types, issue.type) !== "subtask");
}

function statusRank(ctx: Pick<GroupingContext, "statuses">, statusId: string): number {
  const found = ctx.statuses.find((s) => s.id === statusId);
  return KIND_ORDER[statusKind(ctx.statuses, statusId)] * 1000 + (found?.order ?? 999);
}

const byKey = (a: Issue, b: Issue) => keyNumber(a.key) - keyNumber(b.key);

/** 빈 값은 방향과 무관하게 뒤로 — 값이 있는 것끼리만 방향을 탄다 */
function nullLast<T>(get: (issue: Issue) => T | null | undefined, cmp: (a: T, b: T) => number, dir: number) {
  return (a: Issue, b: Issue) => {
    const va = get(a);
    const vb = get(b);
    const aEmpty = va === null || va === undefined;
    const bEmpty = vb === null || vb === undefined;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return cmp(va as T, vb as T) * dir;
  };
}

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const compareNumbers = (a: number, b: number) => a - b;

/** 정렬 — 같은 값이면 키 숫자 오름차순으로 고정한다(새로고침마다 순서가 흔들리지 않게) */
export function sortIssues(
  issues: Issue[],
  orderBy: ViewOrderBy,
  direction: "asc" | "desc",
  ctx: Pick<GroupingContext, "statuses" | "priorities">,
): Issue[] {
  const dir = direction === "desc" ? -1 : 1;
  let primary: (a: Issue, b: Issue) => number;
  switch (orderBy) {
    case "manual":
      primary = (a, b) => (a.order - b.order) * dir;
      break;
    case "priority":
      primary = (a, b) => (priorityRank(ctx.priorities, a.priority) - priorityRank(ctx.priorities, b.priority)) * dir;
      break;
    case "status":
      primary = (a, b) => (statusRank(ctx, a.status) - statusRank(ctx, b.status)) * dir;
      break;
    case "updated":
      primary = (a, b) => compareStrings(a.updatedAt, b.updatedAt) * dir;
      break;
    case "created":
      primary = (a, b) => compareStrings(a.createdAt, b.createdAt) * dir;
      break;
    case "due":
      primary = nullLast((i) => i.dueDate, compareStrings, dir);
      break;
    case "startDate":
      primary = nullLast((i) => i.startDate, compareStrings, dir);
      break;
    case "storyPoints":
      primary = nullLast((i) => i.storyPoints, compareNumbers, dir);
      break;
    case "estimate":
      primary = nullLast((i) => i.estimateHours, compareNumbers, dir);
      break;
    case "title":
      primary = (a, b) => a.title.localeCompare(b.title, "ko") * dir;
      break;
    case "key":
      primary = (a, b) => byKey(a, b) * dir;
      break;
  }
  return [...issues].sort((a, b) => primary(a, b) || byKey(a, b));
}

/** 이슈가 속한 에픽 — 가장 가까운 에픽 계층 조상. 에픽 자신은 에픽 없음 */
export function epicOf(issue: Issue, ctx: Pick<GroupingContext, "issuesById" | "types">): Issue | null {
  let parentId = issue.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = ctx.issuesById.get(parentId);
    if (!parent) return null;
    if (typeLevel(ctx.types, parent.type) === "epic") return parent;
    parentId = parent.parentId;
  }
  return null;
}

/** 이슈 → 그 기준의 값들(값 없음은 [null]) */
function valuesOf(issue: Issue, kind: ViewGroupBy, ctx: GroupingContext): (string | null)[] {
  switch (kind) {
    case "none":
      return ["all"];
    case "status":
      return [issue.status];
    case "assignee":
      return [issue.assigneeId];
    case "priority":
      return [issue.priority ?? null];
    case "sprint":
      return [issue.sprintId];
    case "epic":
      return [epicOf(issue, ctx)?.id ?? null];
    case "label":
      return issue.labels.length > 0 ? [...new Set(issue.labels)] : [null];
    case "type":
      return [issue.type];
    case "component": {
      const ids = issue.componentIds ?? [];
      return ids.length > 0 ? [...new Set(ids)] : [null];
    }
    case "fixVersion":
      return [issue.fixVersionId];
  }
}

/** 열거 가능한 값 전체(빈 그룹 표시) — 정렬 순서까지 이 목록이 정한다 */
function enumerate(kind: ViewGroupBy, ctx: GroupingContext): string[] {
  switch (kind) {
    case "status":
      return [...ctx.statuses].sort((a, b) => statusRank(ctx, a.id) - statusRank(ctx, b.id)).map((s) => s.id);
    case "assignee":
      return [...ctx.users].sort((a, b) => a.name.localeCompare(b.name, "ko")).map((u) => u.id);
    case "priority":
      return [...ctx.priorities].sort((a, b) => a.order - b.order).map((p) => p.id);
    case "sprint":
      return sprintOrder(ctx.sprints.filter((s) => s.state !== "done")).map((s) => s.id);
    case "epic":
      return [...ctx.issuesById.values()]
        .filter((i) => typeLevel(ctx.types, i.type) === "epic" && !i.archivedAt)
        .sort(byKey)
        .map((i) => i.id);
    case "label":
      return [...(ctx.labels ?? [])].sort((a, b) => a.localeCompare(b, "ko"));
    case "type":
      return [...ctx.types].sort((a, b) => a.order - b.order).map((t) => t.id);
    case "component":
      return [...ctx.components].sort((a, b) => a.name.localeCompare(b.name, "ko")).map((c) => c.id);
    case "fixVersion":
      return ctx.versions.map((v) => v.id);
    case "none":
      return [];
  }
}

const SPRINT_STATE_ORDER: Record<Sprint["state"], number> = { active: 0, planned: 1, done: 2 };
function sprintOrder(sprints: Sprint[]): Sprint[] {
  return sprints
    .map((s, index) => ({ s, index }))
    .sort((a, b) => SPRINT_STATE_ORDER[a.s.state] - SPRINT_STATE_ORDER[b.s.state] || a.index - b.index)
    .map(({ s }) => s);
}

/** 값 → 표시 이름 */
export function groupLabel(kind: ViewGroupBy, value: string | null, ctx: GroupingContext): string {
  if (value === null) return EMPTY_LABELS[kind];
  switch (kind) {
    case "none":
      return EMPTY_LABELS.none;
    case "status":
      return statusName(ctx.statuses, value);
    case "assignee":
      return ctx.users.find((u) => u.id === value)?.name ?? "알 수 없는 사용자";
    case "priority":
      return priorityName(ctx.priorities, value);
    case "sprint":
      return ctx.sprints.find((s) => s.id === value)?.name ?? "알 수 없는 스프린트";
    case "epic": {
      const epic = ctx.issuesById.get(value);
      return epic ? `${epic.key} ${epic.title}` : "알 수 없는 에픽";
    }
    case "label":
      return value;
    case "type":
      return typeName(ctx.types, value);
    case "component":
      return ctx.components.find((c) => c.id === value)?.name ?? "알 수 없는 컴포넌트";
    case "fixVersion":
      return ctx.versions.find((v) => v.id === value)?.name ?? "알 수 없는 버전";
  }
}

const sumPoints = (issues: Issue[]) =>
  Math.round(issues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0) * 10) / 10;

/** 한 단계 묶기 — 입력 순서(이미 정렬됨)를 그룹 안에서 유지한다 */
function groupOnce(issues: Issue[], kind: ViewGroupBy, showEmpty: boolean, ctx: GroupingContext): IssueGroup[] {
  if (kind === "none") {
    return [{ key: "none:all", kind, value: null, label: EMPTY_LABELS.none, count: issues.length, storyPoints: sumPoints(issues), issues }];
  }
  const buckets = new Map<string | null, Issue[]>();
  for (const issue of issues) {
    for (const value of valuesOf(issue, kind, ctx)) {
      const bucket = buckets.get(value);
      if (bucket) bucket.push(issue);
      else buckets.set(value, [issue]);
    }
  }
  const known = enumerate(kind, ctx);
  const order = new Map(known.map((value, index) => [value, index]));
  const values = new Set<string | null>(buckets.keys());
  if (showEmpty) for (const value of known) values.add(value);
  const sorted = [...values].sort((a, b) => {
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    const ia = order.get(a);
    const ib = order.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return groupLabel(kind, a, ctx).localeCompare(groupLabel(kind, b, ctx), "ko");
  });
  return sorted.map((value) => {
    const members = buckets.get(value) ?? [];
    return {
      key: `${kind}:${value ?? "none"}`,
      kind,
      value,
      label: groupLabel(kind, value, ctx),
      count: members.length,
      storyPoints: sumPoints(members),
      issues: members,
    };
  });
}

/**
 * 표시 옵션 전체 적용 — 하위 이슈 거르기 → 정렬 → 그룹(→ 하위 그룹).
 * 그룹 없음이면 그룹 하나("전체")를 돌려준다.
 */
export function groupIssues(issues: Issue[], display: ViewDisplay, ctx: GroupingContext): IssueGroup[] {
  const visible = filterSubIssues(issues, display.showSubIssues, ctx.types);
  const sorted = sortIssues(visible, display.orderBy, display.orderDirection, ctx);
  const groups = groupOnce(sorted, display.groupBy, display.showEmptyGroups, ctx);
  const sub = display.groupBy !== "none" && display.subGroupBy !== display.groupBy ? display.subGroupBy : "none";
  if (sub === "none") return groups;
  return groups.map((group) => ({
    ...group,
    // 하위 그룹의 빈 그룹까지 펼치면 그룹 × 값 수만큼 빈 칸이 생긴다 — 하위는 값이 있는 것만
    subGroups: groupOnce(group.issues, sub, false, ctx),
  }));
}

/** AQL에서 ORDER BY 앞(조건)만 — 정렬은 표시 옵션이 맡는다. 따옴표 안의 "order by"는 건드리지 않는다 */
export function aqlWhere(aql: string): string {
  let quote: string | null = null;
  for (let i = 0; i < aql.length; i += 1) {
    const ch = aql[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/^ORDER\s+BY\b/i.test(aql.slice(i)) && (i === 0 || /\s|\)/.test(aql[i - 1]))) {
      return aql.slice(0, i).trim();
    }
  }
  return aql.trim();
}

/** 보기의 질의 — 언제나 그 프로젝트로 좁히고 보기 조건을 괄호로 묶어 AND 한다 */
export function buildViewAql(projectKey: string, filterAql: string | null): string {
  const scope = `project = ${/^[A-Za-z][A-Za-z0-9_]*$/.test(projectKey) ? projectKey : JSON.stringify(projectKey)}`;
  const where = filterAql ? aqlWhere(filterAql) : "";
  return where ? `${scope} AND (${where})` : scope;
}
