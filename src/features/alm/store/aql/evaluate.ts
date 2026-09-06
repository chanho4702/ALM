/**
 * AQL 목업 실행기 — 메모리 이슈 배열에 AST를 적용한다.
 *
 * 서버 `search/aql/AqlResolver` + `AqlSpecification`과 **같은 의미**여야 한다. 옮겨 온 규칙:
 * - 이름→id 해석과 그 실패 문구(`상태를 모릅니다: …`)를 그대로 쓴다.
 * - 부정 연산자(`!=`·`NOT IN`·`!~`)는 **빈 값을 제외**한다(JQL). 집합 여집합인 `NOT (…)`은 **포함**한다 —
 *   잎 술어가 2값이라 자연히 그렇게 된다.
 * - 보관은 `archived`를 한 번도 안 쓴 질의에서만 제외한다.
 * - 정렬은 요청이 없으면 `updated DESC`, 그리고 언제나 `id ASC`로 마무리한다.
 *
 * 날짜 경계는 서버와 같이 **Asia/Seoul**로 계산한다 — 브라우저 로컬 시간대를 쓰면 KST 밖에서 하루가 밀린다.
 */
import type { Issue } from "../types";
import { htmlToText } from "../richText";
import { valuePosition } from "./parser";
import {
  AqlError,
  findField,
  requireField,
  requireOperator,
  type AqlFieldDef,
  type AqlNode,
  type AqlOp,
  type AqlOrder,
  type AqlQuery,
  type AqlValue,
} from "./types";

export interface AqlEvalContext {
  currentUserId: string;
  users: { id: string; name: string; email?: string | null }[];
  projects: { id: string; key: string; name: string }[];
  /** 상태 레지스트리 — 이름 검색과 statusCategory 해석의 원천 */
  statuses: { id: string; name: string; categoryId: string }[];
  /** order가 작을수록 앞(할 일 → 진행 중 → 완료) */
  categories: { id: string; name: string; kind: string; order?: number }[];
  types: { id: string; name: string }[];
  /** order가 작을수록 중요하다(1 = 최상) */
  priorities: { id: string; name: string; order: number }[];
  sprints: { id: string; name: string; state: string }[];
  versions: { id: string; name: string }[];
  components: { id: string; name: string }[];
  /** 상대 날짜·함수의 기준 시각. 테스트가 고정한다 */
  now?: Date;
}

/** 해결(resolution) 값 — 서버 `IssueResolution` 이름과 한국어 별칭 */
const RESOLUTION_IDS = ["done", "wont_do", "duplicate", "cannot_reproduce"];
const RESOLUTION_ALIASES: Record<string, string> = {
  완료: "done",
  하지않음: "wont_do",
  안함: "wont_do",
  중복: "duplicate",
  재현불가: "cannot_reproduce",
};

const lower = (value: string) => value.trim().toLowerCase();
const isDigits = (text: string) => /^\d+$/.test(text);

/** 함수는 값이 아니다 — 여기서 걸러야 `status = currentUser()`를 조용히 넘기지 않는다 */
function text(value: AqlValue): string {
  if (value.type === "function") {
    throw new AqlError(
      `이 필드에는 함수를 쓸 수 없습니다: ${value.name}()`,
      valuePosition(value),
    );
  }
  return value.value;
}

const isFunction = (value: AqlValue, name: string) =>
  value.type === "function" && value.name.toLowerCase() === name.toLowerCase();

// ── 이름 → id 해석 (서버 AqlResolver와 같은 문구) ──────────────

function statusIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  const needle = lower(text(value));
  const ids = ctx.statuses.filter((s) => lower(s.id) === needle || lower(s.name) === needle).map((s) => s.id);
  if (ids.length === 0) throw new AqlError(`상태를 모릅니다: ${text(value)}`, valuePosition(value));
  return ids;
}

function statusIdsOfCategory(ctx: AqlEvalContext, value: AqlValue): string[] {
  const needle = lower(text(value));
  const categoryIds = ctx.categories
    .filter((c) => lower(c.kind) === needle || lower(c.id) === needle || lower(c.name) === needle)
    .map((c) => c.id);
  if (categoryIds.length === 0) {
    throw new AqlError(`상태분류를 모릅니다: ${text(value)}`, valuePosition(value), [
      "new",
      "active",
      "complete",
    ]);
  }
  // 분류는 있는데 상태가 하나도 없으면 "아무것도 아님"이다 — 조건이 전부 걸러내도록 둔다
  return ctx.statuses.filter((s) => categoryIds.includes(s.categoryId)).map((s) => s.id);
}

function typeIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  const needle = lower(text(value));
  const ids = ctx.types.filter((t) => lower(t.id) === needle || lower(t.name) === needle).map((t) => t.id);
  if (ids.length === 0) throw new AqlError(`이슈 타입을 모릅니다: ${text(value)}`, valuePosition(value));
  return ids;
}

function priorityDef(ctx: AqlEvalContext, value: AqlValue): { id: string; order: number } {
  const needle = lower(text(value));
  const def = ctx.priorities.find((p) => lower(p.id) === needle || lower(p.name) === needle);
  if (!def) throw new AqlError(`우선순위를 모릅니다: ${text(value)}`, valuePosition(value));
  return def;
}

function projectIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  const needle = lower(text(value));
  const ids = ctx.projects
    .filter((p) => lower(p.key) === needle || lower(p.name) === needle)
    .map((p) => p.id);
  if (ids.length === 0) {
    throw new AqlError(`프로젝트를 찾을 수 없습니다: ${text(value)}`, valuePosition(value));
  }
  return ids;
}

function componentIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  const raw = text(value);
  const needle = lower(raw);
  const ids: string[] = [];
  if (isDigits(raw) && ctx.components.some((c) => c.id === raw)) ids.push(raw);
  for (const component of ctx.components) {
    if (lower(component.name) === needle && !ids.includes(component.id)) ids.push(component.id);
  }
  if (ids.length === 0) throw new AqlError(`컴포넌트를 찾을 수 없습니다: ${raw}`, valuePosition(value));
  return ids;
}

function sprintIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  if (isFunction(value, "openSprints")) {
    return ctx.sprints.filter((s) => s.state === "active").map((s) => s.id);
  }
  const raw = text(value);
  const needle = lower(raw);
  const ids = ctx.sprints.filter((s) => s.id === raw || lower(s.name) === needle).map((s) => s.id);
  if (ids.length === 0) throw new AqlError(`스프린트를 찾을 수 없습니다: ${raw}`, valuePosition(value));
  return ids;
}

function versionIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  const raw = text(value);
  const needle = lower(raw);
  const ids = ctx.versions.filter((v) => v.id === raw || lower(v.name) === needle).map((v) => v.id);
  if (ids.length === 0) throw new AqlError(`버전을 찾을 수 없습니다: ${raw}`, valuePosition(value));
  return ids;
}

function resolutions(value: AqlValue): string[] {
  const raw = text(value);
  const normalized = raw.replace(/-/g, "_").replace(/\s/g, "").toLowerCase();
  if (RESOLUTION_IDS.includes(normalized)) return [normalized];
  const alias = RESOLUTION_ALIASES[raw.replace(/\s/g, "")];
  if (alias) return [alias];
  throw new AqlError(`해결 값을 모릅니다: ${raw}`, valuePosition(value), [
    "DONE",
    "WONT_DO",
    "DUPLICATE",
    "CANNOT_REPRODUCE",
  ]);
}

function parentIds(value: AqlValue, issues: Issue[]): string[] {
  const raw = text(value);
  if (isDigits(raw) && issues.some((i) => i.id === raw)) return [raw];
  const key = raw.toUpperCase();
  const found = issues.find((i) => i.key.toUpperCase() === key);
  if (!found) throw new AqlError(`이슈를 찾을 수 없습니다: ${raw}`, valuePosition(value));
  return [found.id];
}

/** 사람 — currentUser()·숫자 id·이메일·이메일 local-part·표시 이름. 여럿에 맞으면 전부 */
function userIds(ctx: AqlEvalContext, value: AqlValue): string[] {
  if (isFunction(value, "currentUser")) return [ctx.currentUserId];
  const raw = text(value);
  if (isDigits(raw) && ctx.users.some((u) => u.id === raw)) return [raw];
  const needle = lower(raw);
  const ids = ctx.users
    .filter((u) => {
      if (lower(u.name) === needle) return true;
      const email = u.email ? lower(u.email) : "";
      if (!email) return false;
      if (email === needle) return true;
      const at = email.indexOf("@");
      return at > 0 && email.slice(0, at) === needle;
    })
    .map((u) => u.id);
  if (ids.length === 0) throw new AqlError(`사용자를 찾을 수 없습니다: ${raw}`, valuePosition(value));
  return ids;
}

// ── 날짜·수·참거짓 ────────────────────────────────────────────

/**
 * 날짜 경계는 **Asia/Seoul** 고정이다(서버 `AqlResolver.ZONE`과 같다). 한국은 서머타임이 없어
 * 고정 오프셋으로 충분하다 — 브라우저 로컬 시간대를 쓰면 KST 밖에서 "오늘"이 하루 밀린다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 달력 기준으로 분해한 값 */
function kstParts(ms: number) {
  const at = new Date(ms + KST_OFFSET_MS);
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth(),
    day: at.getUTCDate(),
    weekday: at.getUTCDay(),
  };
}

/** KST 달력 값 → 순간(ms) */
function kstAt(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return Date.UTC(year, month, day, hour, minute, second) - KST_OFFSET_MS;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 그 순간의 KST 달력 날짜 — 마감일(LocalDate) 비교의 축 */
function kstDate(ms: number): string {
  const { year, month, day } = kstParts(ms);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * 한 순간. `dateOnly`면 그 날 하루를 뜻한다(`endExclusive`가 다음 날 0시).
 * `date`는 KST 달력 날짜 — 서버 `Moment.date()`와 같고 마감일 비교가 이걸 쓴다.
 */
interface Moment {
  start: number;
  endExclusive: number;
  dateOnly: boolean;
  date: string;
}

const RELATIVE_RE = /^([+-])(\d+)([dwMy])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * 달력에 실제로 있는 날짜인가 — 정규식만 보면 `2026-13-99`가 통과해 `Date`가 다음 해로 굴러간다.
 * 서버 `LocalDate.parse`는 그걸 거절하므로 여기서도 거절해야 같은 오류가 난다.
 */
function inRange(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const instant = (ms: number): Moment => ({
  start: ms,
  endExclusive: ms,
  dateOnly: false,
  date: kstDate(ms),
});

function moment(ctx: AqlEvalContext, value: AqlValue): Moment {
  const base = (ctx.now ? new Date(ctx.now) : new Date()).getTime();
  if (value.type === "function") return functionMoment(value, base);

  const raw = value.value;
  const relative = RELATIVE_RE.exec(raw);
  if (relative) {
    // 상대 날짜는 "지금 기준 정확한 순간"이지 날짜 경계가 아니다
    const amount = (relative[1] === "-" ? -1 : 1) * Number(relative[2]);
    const { year, month, day } = kstParts(base);
    const clock = base - kstAt(year, month, day);
    switch (relative[3]) {
      case "d":
        return instant(kstAt(year, month, day + amount) + clock);
      case "w":
        return instant(kstAt(year, month, day + amount * 7) + clock);
      case "M":
        return instant(kstAt(year, month + amount, day) + clock);
      default:
        return instant(kstAt(year + amount, month, day) + clock);
    }
  }

  const date = DATE_RE.exec(raw);
  if (date && inRange(Number(date[1]), Number(date[2]), Number(date[3]))) {
    const [year, month, day] = [Number(date[1]), Number(date[2]) - 1, Number(date[3])];
    const start = kstAt(year, month, day);
    return { start, endExclusive: kstAt(year, month, day + 1), dateOnly: true, date: raw };
  }
  const stamp = DATETIME_RE.exec(raw);
  if (
    stamp &&
    inRange(Number(stamp[1]), Number(stamp[2]), Number(stamp[3])) &&
    Number(stamp[4]) < 24 &&
    Number(stamp[5]) < 60 &&
    Number(stamp[6] ?? 0) < 60
  ) {
    return instant(
      kstAt(
        Number(stamp[1]),
        Number(stamp[2]) - 1,
        Number(stamp[3]),
        Number(stamp[4]),
        Number(stamp[5]),
        Number(stamp[6] ?? 0),
      ),
    );
  }
  throw new AqlError(`날짜 형식이 아닙니다: ${raw}`, valuePosition(value), [
    "2026-09-06",
    '"2026-09-06 14:00"',
    "-7d",
    "startOfWeek()",
  ]);
}

function functionMoment(value: AqlValue & { type: "function" }, base: number): Moment {
  const offset = value.args.length === 0 ? 0 : integerArg(value);
  const { year, month, day, weekday } = kstParts(base);
  // 주의 시작은 월요일 — 지라 기본과 같다
  const monday = day - ((weekday + 6) % 7);
  switch (value.name.toLowerCase()) {
    case "now":
      return instant(base);
    case "startofday":
      return instant(kstAt(year, month, day + offset));
    // endOf*는 열린 위끝 — 다음 구간의 시작이다(서버와 같다)
    case "endofday":
      return instant(kstAt(year, month, day + offset + 1));
    case "startofweek":
      return instant(kstAt(year, month, monday + offset * 7));
    case "endofweek":
      return instant(kstAt(year, month, monday + (offset + 1) * 7));
    case "startofmonth":
      return instant(kstAt(year, month + offset, 1));
    case "endofmonth":
      return instant(kstAt(year, month + offset + 1, 1));
    case "startofyear":
      return instant(kstAt(year + offset, 0, 1));
    case "endofyear":
      return instant(kstAt(year + offset + 1, 0, 1));
    default:
      throw new AqlError(`함수를 모릅니다: ${value.name}()`, valuePosition(value), [
        "now()",
        "startOfDay()",
        "startOfWeek()",
        "startOfMonth()",
        "endOfDay()",
      ]);
  }
}

function integerArg(value: AqlValue & { type: "function" }): number {
  const arg = value.args[0];
  const raw = arg.type === "function" ? `${arg.name}()` : arg.value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new AqlError(`정수가 필요합니다: ${raw}`, valuePosition(arg), ["-1", "0", "1"]);
  }
  return parsed;
}

function numberOf(value: AqlValue): number {
  const raw = text(value);
  const parsed = Number(raw);
  if (raw.trim() === "" || Number.isNaN(parsed)) {
    throw new AqlError(`숫자가 아닙니다: ${raw}`, valuePosition(value), ["3", "3.5"]);
  }
  return parsed;
}

function boolOf(value: AqlValue): boolean {
  const raw = text(value);
  if (lower(raw) === "true" || raw === "1") return true;
  if (lower(raw) === "false" || raw === "0") return false;
  throw new AqlError(`true 또는 false여야 합니다: ${raw}`, valuePosition(value), ["true", "false"]);
}

// ── 이슈 값 ───────────────────────────────────────────────────

/** 이 필드에 값이 있는가. 비지 않는 컬럼은 항상 참이다(서버 `present`) */
function present(issue: Issue, field: string): boolean {
  switch (field) {
    case "assignee":
      return issue.assigneeId !== null && issue.assigneeId !== undefined;
    case "sprint":
      return Boolean(issue.sprintId);
    case "fixVersion":
      return Boolean(issue.fixVersionId);
    case "resolution":
      return Boolean(issue.resolution);
    case "parent":
      return Boolean(issue.parentId);
    case "due":
      return Boolean(issue.dueDate);
    case "estimate":
      return issue.estimateHours !== null && issue.estimateHours !== undefined;
    case "labels":
      return (issue.labels ?? []).length > 0;
    case "component":
      return (issue.componentIds ?? []).length > 0;
    default:
      return true;
  }
}

function instantOf(issue: Issue, field: string): number | null {
  const raw = field === "created" ? issue.createdAt : issue.updatedAt;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 마감일은 시각 없는 날짜(서버 `LocalDate`)다 — 순간이 아니라 `YYYY-MM-DD` 문자열로 비교한다.
 * ISO 날짜는 사전순이 곧 시간순이라 문자열 비교로 충분하고, 시간대에 휘둘리지 않는다.
 */
function dueOf(issue: Issue): string | null {
  return issue.dueDate ? issue.dueDate : null;
}

// ── 술어 ──────────────────────────────────────────────────────

function resolveAll(
  def: AqlFieldDef,
  values: AqlValue[],
  ctx: AqlEvalContext,
  issues: Issue[],
): string[] {
  const out: string[] = [];
  const add = (ids: string[]) => {
    for (const id of ids) if (!out.includes(id)) out.push(id);
  };
  for (const value of values) {
    switch (def.name) {
      case "project":
        add(projectIds(ctx, value));
        break;
      case "type":
        add(typeIds(ctx, value));
        break;
      case "status":
        add(statusIds(ctx, value));
        break;
      case "statusCategory":
        add(statusIdsOfCategory(ctx, value));
        break;
      case "priority":
        add([priorityDef(ctx, value).id]);
        break;
      case "assignee":
      case "reporter":
        add(userIds(ctx, value));
        break;
      case "sprint":
        add(sprintIds(ctx, value));
        break;
      case "fixVersion":
        add(versionIds(ctx, value));
        break;
      case "component":
        add(componentIds(ctx, value));
        break;
      case "resolution":
        add(resolutions(value));
        break;
      case "parent":
        add(parentIds(value, issues));
        break;
      case "key":
        add([text(value).toUpperCase()]);
        break;
      default:
        add([text(value)]);
    }
  }
  return out;
}

/** `=`/`IN` — 값 하나라도 맞으면 참 */
function matches(
  issue: Issue,
  def: AqlFieldDef,
  values: AqlValue[],
  ctx: AqlEvalContext,
  issues: Issue[],
): boolean {
  switch (def.name) {
    case "summary":
      return values.some((v) => lower(issue.title) === lower(text(v)));
    case "archived":
      return values.some((v) => boolOf(v) === Boolean(issue.archivedAt));
    case "due": {
      const mine = dueOf(issue);
      if (mine === null) return false;
      return values.some((v) => mine === moment(ctx, v).date);
    }
    case "estimate": {
      const mine = issue.estimateHours;
      if (mine === null || mine === undefined) return false;
      return values.some((v) => mine === numberOf(v));
    }
    case "created":
    case "updated": {
      const mine = instantOf(issue, def.name);
      if (mine === null) return false;
      return values.some((v) => {
        const at = moment(ctx, v);
        // 하루짜리 값이면 그 날 전체, 시각이면 정확히 그 순간
        return at.dateOnly ? mine >= at.start && mine < at.endExclusive : mine === at.start;
      });
    }
    default: {
      const targets = resolveAll(def, values, ctx, issues);
      if (targets.length === 0) return false;
      // 라벨은 지라처럼 대소문자를 가려 정확히 맞춘다(레지스트리 없는 자유 문자열이라 접으면 뭉쳐 보인다)
      const mine = issueValues(issue, def.name);
      return mine.some((v) => targets.includes(v));
    }
  }
}

function issueValues(issue: Issue, field: string): string[] {
  switch (field) {
    case "project":
      return [issue.projectId];
    case "key":
      return [issue.key.toUpperCase()];
    case "type":
      return [issue.type];
    case "status":
    case "statusCategory":
      return [issue.status];
    case "priority":
      return [issue.priority];
    case "assignee":
      return issue.assigneeId ? [issue.assigneeId] : [];
    case "reporter":
      return issue.reporterId ? [issue.reporterId] : [];
    case "labels":
      return issue.labels ?? [];
    case "component":
      return issue.componentIds ?? [];
    case "sprint":
      return issue.sprintId ? [issue.sprintId] : [];
    case "fixVersion":
      return issue.fixVersionId ? [issue.fixVersionId] : [];
    case "resolution":
      return issue.resolution ? [issue.resolution] : [];
    case "parent":
      return issue.parentId ? [issue.parentId] : [];
    default:
      return [];
  }
}

/** `~` — 포함(대소문자 무시). 사용자가 친 `%`·`_`는 글자 그대로다(정규식이 아니라 substring이라 자연히 그렇다) */
function contains(issue: Issue, def: AqlFieldDef, value: AqlValue): boolean {
  const needle = lower(text(value).trim());
  switch (def.name) {
    case "text":
      return (
        lower(issue.title).includes(needle) ||
        lower(htmlToText(issue.description ?? "")).includes(needle)
      );
    case "summary":
      return lower(issue.title).includes(needle);
    case "key":
      return lower(issue.key).includes(needle);
    default:
      return false;
  }
}

function ordered(
  issue: Issue,
  def: AqlFieldDef,
  operator: AqlOp,
  value: AqlValue,
  ctx: AqlEvalContext,
): boolean {
  if (def.name === "priority") {
    // sort_order는 1이 가장 중요하다 — `priority >= high`는 "high 이상으로 중요"라 rank가 작거나 같다
    const target = priorityDef(ctx, value).order;
    const rank = ctx.priorities.find((p) => p.id === issue.priority)?.order ?? ctx.priorities.length + 1;
    switch (operator) {
      case ">=":
        return rank <= target;
      case ">":
        return rank < target;
      case "<=":
        return rank >= target;
      default:
        return rank > target;
    }
  }
  if (def.name === "created" || def.name === "updated") {
    const mine = instantOf(issue, def.name);
    if (mine === null) return false;
    const at = moment(ctx, value);
    switch (operator) {
      case "<":
        return mine < at.start;
      case "<=":
        return at.dateOnly ? mine < at.endExclusive : mine <= at.start;
      case ">":
        return at.dateOnly ? mine >= at.endExclusive : mine > at.start;
      default:
        return mine >= at.start;
    }
  }
  if (def.name === "due") {
    const mine = dueOf(issue);
    if (mine === null) return false;
    const target = moment(ctx, value).date;
    switch (operator) {
      case "<":
        return mine < target;
      case "<=":
        return mine <= target;
      case ">":
        return mine > target;
      default:
        return mine >= target;
    }
  }
  if (def.name === "estimate") {
    const mine = issue.estimateHours;
    if (mine === null || mine === undefined) return false;
    const target = numberOf(value);
    switch (operator) {
      case "<":
        return mine < target;
      case "<=":
        return mine <= target;
      case ">":
        return mine > target;
      default:
        return mine >= target;
    }
  }
  return false;
}

function isEmpty(issue: Issue, def: AqlFieldDef, position: number): boolean {
  if (!def.emptyAllowed) {
    throw new AqlError(`EMPTY를 쓸 수 없는 필드입니다: ${def.name}`, position);
  }
  return !present(issue, def.name);
}

function evaluateNode(issue: Issue, node: AqlNode, ctx: AqlEvalContext, issues: Issue[]): boolean {
  switch (node.kind) {
    case "and":
      return node.children.every((child) => evaluateNode(issue, child, ctx, issues));
    case "or":
      return node.children.some((child) => evaluateNode(issue, child, ctx, issues));
    case "not":
      // 집합 여집합 — 잎이 2값이라 빈 값을 가진 이슈가 여기로 들어온다(서버와 같다)
      return !evaluateNode(issue, node.child, ctx, issues);
    case "compare": {
      const def = fieldOf(node.field);
      requireOperator(def, node.operator, 0);
      switch (node.operator) {
        case "=":
          return matches(issue, def, [node.value], ctx, issues);
        case "!=":
          return present(issue, def.name) && !matches(issue, def, [node.value], ctx, issues);
        case "~":
          return contains(issue, def, node.value);
        case "!~":
          return present(issue, def.name) && !contains(issue, def, node.value);
        default:
          return ordered(issue, def, node.operator, node.value, ctx);
      }
    }
    case "in": {
      const def = fieldOf(node.field);
      const hit = matches(issue, def, node.values, ctx, issues);
      // 부정 연산자는 빈 값을 제외한다(JQL) — 넣으려면 `OR … IS EMPTY`를 명시한다
      return node.negated ? present(issue, def.name) && !hit : hit;
    }
    case "empty": {
      const def = fieldOf(node.field);
      const empty = isEmpty(issue, def, 0);
      return node.negated ? !empty : empty;
    }
  }
}

const fieldOf = (written: string): AqlFieldDef => requireField(written, 0);

/** AST 어딘가에 해당 필드 조건이 있는가 — 보관 기본 제외 규칙이 쓴다(별칭도 편다) */
function mentionsField(node: AqlNode | null, name: string): boolean {
  if (!node) return false;
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.some((child) => mentionsField(child, name));
    case "not":
      return mentionsField(node.child, name);
    default:
      return findField(node.field)?.name === name;
  }
}

// ── 정렬 ──────────────────────────────────────────────────────

/** 정렬 키 — 서버 `sortKeys`와 같은 축. 키는 문자열이 아니라 프로젝트+번호로 센다 */
function sortKey(issue: Issue, field: string, ctx: AqlEvalContext): (number | string | null)[] {
  switch (field) {
    case "created":
      return [instantOf(issue, "created")];
    case "updated":
      return [instantOf(issue, "updated")];
    case "due":
      return [dueOf(issue)];
    case "priority":
      return [ctx.priorities.find((p) => p.id === issue.priority)?.order ?? ctx.priorities.length + 1];
    case "status":
      return [statusRank(issue, ctx)];
    case "summary":
      return [issue.title];
    case "assignee":
      return [issue.assigneeId];
    case "estimate":
      return [issue.estimateHours ?? null];
    default: {
      const [, number] = issue.key.split("-");
      return [issue.projectId, Number(number) || 0];
    }
  }
}

/** 상태는 분류(할 일→진행 중→완료) 순, 같은 분류 안에서는 레지스트리 순 */
function statusRank(issue: Issue, ctx: AqlEvalContext): number {
  const index = ctx.statuses.findIndex((s) => s.id === issue.status);
  if (index < 0) return 999_999;
  const categoryId = ctx.statuses[index].categoryId;
  const categoryIndex = ctx.categories.findIndex((c) => c.id === categoryId);
  const categoryOrder =
    ctx.categories[categoryIndex]?.order ?? (categoryIndex < 0 ? 999 : categoryIndex + 1);
  return categoryOrder * 1000 + index;
}

/** PostgreSQL 기본 — 오름차순은 NULL이 뒤, 내림차순은 NULL이 앞 */
function compareKeys(left: (number | string | null)[], right: (number | string | null)[], desc: boolean): number {
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a === null && b === null) continue;
    if (a === null) return desc ? -1 : 1;
    if (b === null) return desc ? 1 : -1;
    const diff =
      typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    if (diff !== 0) return desc ? -diff : diff;
  }
  return 0;
}

/** id 마무리 정렬 — 숫자면 수로, 아니면 글자로(목업 id는 `i1` 꼴이라 접두어 뒤 수를 본다) */
function idRank(issue: Issue): number | string {
  const digits = /(\d+)$/.exec(issue.id);
  return digits ? Number(digits[1]) : issue.id;
}

/**
 * AST를 이슈 배열에 적용한다.
 * `issues`에는 보관 이슈까지 넣어야 `archived = true` 검색이 성립한다 — 기본 제외는 여기서 한다.
 */
export function evaluateAql(query: AqlQuery, issues: Issue[], ctx: AqlEvalContext): Issue[] {
  const includeArchived = mentionsField(query.where, "archived");
  let rows = issues.filter((issue) => includeArchived || !issue.archivedAt);
  if (query.where) {
    const where = query.where;
    rows = rows.filter((issue) => evaluateNode(issue, where, ctx, issues));
  }

  const orders: AqlOrder[] =
    query.orderBy.length > 0 ? query.orderBy : [{ field: "updated", direction: "desc" }];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const name = findField(order.field)?.name ?? order.field;
      const diff = compareKeys(
        sortKey(a, name, ctx),
        sortKey(b, name, ctx),
        order.direction === "desc",
      );
      if (diff !== 0) return diff;
    }
    // 같은 값끼리의 순서가 페이지마다 흔들리지 않게 마지막 기준을 하나 둔다
    return compareKeys([idRank(a)], [idRank(b)], false);
  });
}
