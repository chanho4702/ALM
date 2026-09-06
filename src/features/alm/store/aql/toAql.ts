/**
 * 기본/스마트 모드 ↔ AQL 번역.
 * `toAql`은 항상 성립한다(기본 모드 필터는 AQL의 부분집합).
 * `fromAql`은 **AND로만 연결된 `=`/`IN`/`IS EMPTY`** 만 되돌린다 — 그 밖의 식은 null(화면이 "AQL 그대로 유지"를 안내).
 */
import type { IssuePriority, IssueStatus, IssueType } from "../types";
import { EMPTY_QUERY, type IssueQuery, type QueryContext } from "../searchQuery";
import { findField, type AqlNode, type AqlQuery, type AqlValue } from "./types";

export interface AqlTranslateContext extends QueryContext {
  /** 상태 카테고리 — 기본 모드의 카테고리 필터(할일/진행중/완료)를 statusCategory로 옮긴다 */
  categories?: { id: string; name: string; kind: string }[];
}

const CATEGORY_KIND: Record<string, string> = {
  todo: "new",
  inprogress: "active",
  done: "complete",
};

/** 따옴표 없는 ident로 쓸 수 있는가 — 공백·특수문자·키워드는 따옴표가 필요하다 */
function quoteIfNeeded(raw: string): string {
  const value = raw.trim();
  if (value === "") return '""';
  if (/^[A-Za-z0-9_가-힣.-]+$/.test(value) && !/^(AND|OR|NOT|IN|IS|EMPTY|ORDER|BY|ASC|DESC)$/i.test(value)) {
    return value;
  }
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function clause(field: string, values: string[]): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return `${field} = ${quoteIfNeeded(values[0])}`;
  return `${field} IN (${values.map(quoteIfNeeded).join(", ")})`;
}

const SORT_ORDER: Record<IssueQuery["sort"], string> = {
  // 기본 모드의 정렬 의미를 그대로 옮긴다 — 최신 먼저, 마감 임박 먼저, 중요한 것 먼저
  updated: "updated DESC",
  created: "created DESC",
  due: "due ASC",
  // 우선순위 정렬 키는 레지스트리 순서(1 = 최상)라 **ASC가 중요한 것부터**다 — 기본 모드와 같은 뜻
  priority: "priority ASC",
};

/** IssueQuery → AQL 문자열 */
export function toAql(query: IssueQuery, ctx: AqlTranslateContext): string {
  const parts: string[] = [];

  const projectKeys = query.projectIds
    .map((id) => ctx.projects.find((p) => p.id === id)?.key)
    .filter((key): key is string => Boolean(key));
  const projectClause = clause("project", projectKeys);
  if (projectClause) parts.push(projectClause);

  const categoryKinds = query.statuses
    .map((id) => ctx.categories?.find((c) => c.id === id)?.kind ?? CATEGORY_KIND[id])
    .filter((kind): kind is string => Boolean(kind));
  const categoryClause = clause("statusCategory", categoryKinds);
  if (categoryClause) parts.push(categoryClause);

  const statusNames = query.statusIds
    .map((id) => ctx.statuses?.find((s) => s.id === id)?.name ?? id)
    .filter(Boolean);
  const statusClause = clause("status", statusNames);
  if (statusClause) parts.push(statusClause);

  const typeClause = clause("type", query.types);
  if (typeClause) parts.push(typeClause);

  const priorityClause = clause("priority", query.priorities);
  if (priorityClause) parts.push(priorityClause);

  const assigneeNames = query.assigneeIds
    .filter((id) => id !== "unassigned")
    .map((id) => ctx.users.find((u) => u.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const unassigned = query.assigneeIds.includes("unassigned");
  const assigneeClause = clause("assignee", assigneeNames);
  if (assigneeClause && unassigned) parts.push(`(${assigneeClause} OR assignee IS EMPTY)`);
  else if (assigneeClause) parts.push(assigneeClause);
  else if (unassigned) parts.push("assignee IS EMPTY");

  const labelClause = clause("labels", query.labels);
  if (labelClause) parts.push(labelClause);

  if (query.text.trim()) parts.push(`text ~ ${quoteIfNeeded(query.text)}`);

  const where = parts.join(" AND ");
  return where ? `${where} ORDER BY ${SORT_ORDER[query.sort]}` : `ORDER BY ${SORT_ORDER[query.sort]}`;
}

/** 필드를 직접 가진 잎 노드 — AND 평탄화의 결과 */
type AqlLeaf = Extract<AqlNode, { field: string }>;

/** 조건을 AND 목록으로 편다. OR/NOT이 하나라도 있으면 null */
function flattenAnd(node: AqlNode | null): AqlLeaf[] | null {
  if (!node) return [];
  if (node.kind === "and") {
    const out: AqlLeaf[] = [];
    for (const child of node.children) {
      const flat = flattenAnd(child);
      if (!flat) return null;
      out.push(...flat);
    }
    return out;
  }
  if (node.kind === "or" || node.kind === "not") return null;
  return [node];
}

/** 함수 값은 기본 모드에 대응이 없다 — 되돌리지 않는다는 신호로 null */
const valueText = (value: AqlValue): string | null =>
  value.type === "function" ? null : value.value;

const SORT_FROM_AQL: Record<string, IssueQuery["sort"]> = {
  updated: "updated",
  created: "created",
  due: "due",
  priority: "priority",
};

/**
 * AQL → IssueQuery. 되돌릴 수 없으면 null.
 * 되돌릴 수 있는 형태: AND로만 연결된 `=`/`IN`/`assignee IS EMPTY`, 그리고 기본 모드가 아는 필드만.
 */
export function fromAql(query: AqlQuery, ctx: AqlTranslateContext): IssueQuery | null {
  const nodes = flattenAnd(query.where);
  if (!nodes) return null;

  const result: IssueQuery = {
    ...EMPTY_QUERY,
    projectIds: [],
    statuses: [],
    statusIds: [],
    priorities: [],
    types: [],
    assigneeIds: [],
    labels: [],
  };
  const push = <T,>(list: T[], value: T) => {
    if (!list.includes(value)) list.push(value);
  };

  for (const node of nodes) {
    if (node.kind === "empty") {
      if (node.field !== "assignee" || node.negated) return null;
      push(result.assigneeIds, "unassigned");
      continue;
    }
    if (node.kind === "in" && node.negated) return null;
    if (node.kind === "compare" && node.operator !== "=" && node.operator !== "~") return null;

    const values =
      node.kind === "in" ? node.values : node.kind === "compare" ? [node.value] : [];
    const texts = values.map(valueText);
    if (texts.some((t) => t === null)) {
      // currentUser()만 예외 — 기본 모드에도 "나"가 없으므로 되돌리지 않는다
      return null;
    }
    const raw = texts as string[];

    // AST는 쓴 그대로를 담는다 — 기본 모드로 되돌리려면 정식명으로 편다
    switch (findField(node.field)?.name) {
      case "project": {
        for (const text of raw) {
          const project = ctx.projects.find(
            (p) => p.key.toLowerCase() === text.toLowerCase() || p.name === text,
          );
          if (!project) return null;
          push(result.projectIds, project.id);
        }
        break;
      }
      case "statusCategory": {
        for (const text of raw) {
          const category =
            ctx.categories?.find(
              (c) => c.id === text || c.name === text || c.kind === text.toLowerCase(),
            ) ??
            Object.entries(CATEGORY_KIND)
              .map(([id, kind]) => ({ id, kind }))
              .find((c) => c.id === text || c.kind === text.toLowerCase());
          if (!category) return null;
          push(result.statuses, category.id as IssueStatus);
        }
        break;
      }
      case "status": {
        for (const text of raw) {
          const matched = ctx.statuses?.filter((s) => s.id === text || s.name === text) ?? [];
          if (matched.length === 0) return null;
          for (const status of matched) push(result.statusIds, status.id);
        }
        break;
      }
      case "type": {
        for (const text of raw) {
          const type = ctx.types?.find((t) => t.id === text || t.name === text);
          push(result.types, (type?.id ?? text) as IssueType);
        }
        break;
      }
      case "priority": {
        for (const text of raw) {
          const priority = ctx.priorities?.find((p) => p.id === text || p.name === text);
          push(result.priorities, (priority?.id ?? text) as IssuePriority);
        }
        break;
      }
      case "assignee": {
        for (const text of raw) {
          const user = ctx.users.find((u) => u.id === text || u.name === text);
          if (!user) return null;
          push(result.assigneeIds, user.id);
        }
        break;
      }
      case "labels": {
        for (const text of raw) push(result.labels, text);
        break;
      }
      case "text": {
        if (node.kind !== "compare" || node.operator !== "~") return null;
        result.text = result.text ? `${result.text} ${raw[0]}` : raw[0];
        break;
      }
      default:
        return null;
    }
    if (node.kind === "compare" && node.operator === "~" && findField(node.field)?.name !== "text") {
      return null;
    }
  }

  if (query.orderBy.length > 1) return null;
  if (query.orderBy.length === 1) {
    const sort = SORT_FROM_AQL[findField(query.orderBy[0].field)?.name ?? ""];
    if (!sort) return null;
    result.sort = sort;
  }
  return result;
}
