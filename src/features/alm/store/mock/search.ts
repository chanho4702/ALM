// localStorage 목업 스토어 — search (jiraMock.ts에서 분할, 동작 불변)
import type { Issue, StatusKind, JiraData } from "../types";
import { type IssueSort, type IssueSearchCriteria, MAX_SEARCH_PAGE_SIZE, type IssueAggregateGroup, type IssueAggregate, compareLabels } from "../issueSearch";
import { htmlToText } from "../richText";
import { listIssues } from "./issues";
import { resolvedStatuses } from "./rules";
import { categoryById, BUILTIN_CATEGORIES, load, clone } from "./db";

// ── 페이징 ───────────────────────────────────────────────────

export interface IssuePage {
  items: Issue[];
  page: number;
  size: number;
  total: number;
  /** 이 페이지 뒤에 결과가 더 있다 — 한 페이지만 읽는 화면이 "더 있음"을 그린다(서버 `truncated`와 같다) */
  truncated: boolean;
}

/**
 * 필터 + 정렬 + 페이지 — 서버 검색(`/api/alm/issues/search`)과 같은 의미로 거르고 정렬해 자른다.
 * 화면은 이 계약만 쓰고 전량을 들고 있지 않는다(BACKLOG #5 해소). 기본 정렬은 키 오름차순.
 */
export async function listIssuesPage(
  projectId: string,
  filter: Parameters<typeof listIssues>[1],
  paging: { page: number; size: number },
  sort: IssueSort = { field: "key", dir: "asc" },
): Promise<IssuePage> {
  return findIssues(
    {
      projectIds: [projectId],
      text: filter?.text,
      statuses: filter?.status ? [filter.status] : undefined,
      priorities: filter?.priority ? [filter.priority] : undefined,
      types: filter?.type ? [filter.type] : undefined,
      assigneeIds: filter?.assigneeId ? [filter.assigneeId] : undefined,
      labels: filter?.label ? [filter.label] : undefined,
      componentIds: filter?.componentId ? [filter.componentId] : undefined,
    },
    paging,
    sort,
  );
}

// ── 서버 검색·집계 계약의 목업 구현 (issueSearch.ts) ─────────────────

/** known=false: 프로젝트 워크플로에도 기본 분류 id에도 없는 상태 — 집계는 서버처럼 "uncategorized"로 묶는다 */
type StatusLookup = (projectId: string, statusId: string) => { categoryId: string; kind: StatusKind; known: boolean };

/** 요청 한 번 동안 프로젝트별 상태 해석을 한 번만 한다 — 상태 id → 분류 id·kind(프로젝트 워크플로 기준) */
function statusLookup(data: JiraData): StatusLookup {
  const byProject = new Map<string, Map<string, { categoryId: string; kind: StatusKind; known: boolean }>>();
  return (projectId, statusId) => {
    let index = byProject.get(projectId);
    if (!index) {
      index = new Map(
        resolvedStatuses(data, projectId).map((s) => [s.id, { categoryId: s.category, kind: s.kind ?? "new", known: true }]),
      );
      byProject.set(projectId, index);
    }
    const found = index.get(statusId);
    if (found) return found;
    const category = categoryById(data, statusId); // 기본 id 폴백 (구버전 데이터)
    return { categoryId: category.id, kind: category.kind, known: category.id === statusId };
  };
}

/** 분류 지정자(id·kind·이름, 대소문자 무시) → 분류 id 집합 — 서버 `statusCategories`와 같은 해석. 모르면 빈 집합 */
function matchingCategoryIds(data: JiraData, spec: string): string[] {
  const all = [
    ...data.statusCategories,
    ...BUILTIN_CATEGORIES.filter((b) => !data.statusCategories.some((c) => c.id === b.id)),
  ];
  const wanted = spec.trim().toLowerCase();
  return all
    .filter((c) => [c.id, c.kind, c.name].some((value) => value.toLowerCase() === wanted))
    .map((c) => c.id);
}

function matchesCriteria(
  issue: Issue,
  criteria: IssueSearchCriteria,
  statusOf: StatusLookup,
  categoryIds: Set<string> | null,
): boolean {
  const has = (list?: string[]): list is string[] => list !== undefined && list.length > 0;
  if (has(criteria.projectIds) && !criteria.projectIds.includes(issue.projectId)) return false;
  const text = criteria.text?.trim().toLowerCase();
  if (
    text &&
    !(
      issue.title.toLowerCase().includes(text) ||
      issue.key.toLowerCase().includes(text) ||
      htmlToText(issue.description).toLowerCase().includes(text)
    )
  ) {
    return false;
  }
  if (has(criteria.statuses) || categoryIds !== null) {
    // 상태 id ∪ 분류에 속한 상태 — 분류는 프로젝트 워크플로 설정으로 해석한다(커스텀 상태도 걸린다)
    const byId = criteria.statuses?.includes(issue.status) ?? false;
    const byCategory = categoryIds !== null && categoryIds.has(statusOf(issue.projectId, issue.status).categoryId);
    if (!byId && !byCategory) return false;
  }
  if (criteria.openOnly && statusOf(issue.projectId, issue.status).kind === "complete") return false;
  if (has(criteria.priorities) && !criteria.priorities.includes(issue.priority)) return false;
  if (has(criteria.types) && !criteria.types.includes(issue.type)) return false;
  if (has(criteria.assigneeIds) && !criteria.assigneeIds.includes(issue.assigneeId ?? "unassigned")) return false;
  if (has(criteria.labels) && !issue.labels.some((l) => criteria.labels!.includes(l))) return false;
  if (has(criteria.componentIds) && !(issue.componentIds ?? []).some((c) => criteria.componentIds!.includes(c))) {
    return false;
  }
  if (criteria.sprintId && issue.sprintId !== criteria.sprintId) return false;
  if (criteria.parentId && issue.parentId !== criteria.parentId) return false;
  if (criteria.fixVersionId && issue.fixVersionId !== criteria.fixVersionId) return false;
  // 마감일 조건은 마감일 없는 이슈를 절대 잡지 않는다
  if (criteria.dueBefore && !(issue.dueDate !== null && issue.dueDate < criteria.dueBefore)) return false;
  if (criteria.dueFrom && !(issue.dueDate !== null && issue.dueDate >= criteria.dueFrom)) return false;
  if (criteria.dueTo && !(issue.dueDate !== null && issue.dueDate <= criteria.dueTo)) return false;
  if (criteria.updatedSince && Date.parse(issue.updatedAt) < Date.parse(criteria.updatedSince)) return false;
  return true;
}

function filterByCriteria(data: JiraData, criteria: IssueSearchCriteria): { issues: Issue[]; statusOf: StatusLookup } {
  const statusOf = statusLookup(data);
  const categoryIds =
    criteria.statusCategories && criteria.statusCategories.length > 0
      ? new Set(criteria.statusCategories.flatMap((spec) => matchingCategoryIds(data, spec)))
      : null;
  return {
    issues: data.issues.filter((issue) => matchesCriteria(issue, criteria, statusOf, categoryIds)),
    statusOf,
  };
}

const KIND_RANK: Record<StatusKind, number> = { new: 0, active: 1, complete: 2 };

/** 키 번호 — 서버는 프로젝트 안 일련번호(issueNumber)로 정렬한다 */
function issueNumberOf(issue: Issue): number {
  const n = Number(issue.key.slice(issue.key.lastIndexOf("-") + 1));
  return Number.isFinite(n) ? n : 0;
}

/** 서버와 같은 끝 묶음 — id 오름차순(숫자 id는 수로) */
function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function plainCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortIssues(data: JiraData, issues: Issue[], sort: IssueSort, statusOf: StatusLookup): Issue[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  // 레지스트리 순서(높음→낮음) — 모르는 값은 맨 끝 순위(서버와 같이 방향을 따른다)
  const priorityRank = new Map([...data.priorities].sort((a, b) => a.order - b.order).map((p, i) => [p.id, i]));
  const rankOfPriority = (id: string) => priorityRank.get(id) ?? priorityRank.size + 1;
  return [...issues].sort((a, b) => {
    let cmp = 0;
    switch (sort.field) {
      case "created":
        cmp = plainCompare(a.createdAt, b.createdAt) * dir;
        break;
      case "due":
        // 마감일 없음은 방향과 무관하게 맨 뒤
        if ((a.dueDate === null) !== (b.dueDate === null)) return a.dueDate === null ? 1 : -1;
        cmp = a.dueDate === null || b.dueDate === null ? 0 : plainCompare(a.dueDate, b.dueDate) * dir;
        break;
      case "key":
        cmp = (issueNumberOf(a) - issueNumberOf(b)) * dir;
        break;
      case "priority":
        cmp = (rankOfPriority(a.priority) - rankOfPriority(b.priority)) * dir;
        break;
      case "title":
        cmp = plainCompare(a.title.toLowerCase(), b.title.toLowerCase()) * dir;
        break;
      case "type":
        cmp = plainCompare(a.type, b.type) * dir;
        break;
      case "status":
        cmp =
          (KIND_RANK[statusOf(a.projectId, a.status).kind] - KIND_RANK[statusOf(b.projectId, b.status).kind]) * dir ||
          plainCompare(a.status, b.status) * dir;
        break;
      default:
        cmp = plainCompare(a.updatedAt, b.updatedAt) * dir;
    }
    return cmp || compareIds(a.id, b.id);
  });
}

/** 서버 검색 한 페이지 — `total`은 조건 전체 건수. 크기는 서버처럼 1..200으로 묶는다 */
export async function findIssues(
  criteria: IssueSearchCriteria,
  paging: { page: number; size: number },
  sort: IssueSort = { field: "updated", dir: "desc" },
): Promise<IssuePage> {
  const data = load();
  const { issues, statusOf } = filterByCriteria(data, criteria);
  const sorted = sortIssues(data, issues, sort, statusOf);
  const size = Math.min(MAX_SEARCH_PAGE_SIZE, Math.max(1, paging.size));
  const page = Math.max(0, paging.page);
  return {
    items: clone(sorted.slice(page * size, page * size + size)),
    page,
    size,
    total: sorted.length,
    truncated: (page + 1) * size < sorted.length,
  };
}

/** 한 축 집계 — 나온 값만, 건수 내림차순·키 오름차순(서버와 같다) */
export async function aggregateIssues(
  criteria: IssueSearchCriteria,
  groupBy: IssueAggregateGroup,
): Promise<IssueAggregate> {
  const data = load();
  const { issues, statusOf } = filterByCriteria(data, criteria);
  const keyOf = (issue: Issue): string => {
    switch (groupBy) {
      case "status":
        return issue.status;
      case "priority":
        return issue.priority;
      case "type":
        return issue.type;
      case "assignee":
        return issue.assigneeId ?? "unassigned";
      default: {
        // 레지스트리(워크플로)에 없는 상태는 서버처럼 "uncategorized" — 버킷 합 = total
        const status = statusOf(issue.projectId, issue.status);
        return status.known ? status.categoryId : "uncategorized";
      }
    }
  };
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(keyOf(issue), (counts.get(keyOf(issue)) ?? 0) + 1);
  const buckets = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || plainCompare(a.key, b.key));
  return { total: issues.length, buckets };
}

/** 프로젝트에서 쓰이는 라벨(보관 이슈 제외) — 대소문자 무시 순(서버와 같다) */
export async function listProjectLabels(projectId: string): Promise<string[]> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  const labels = new Set(data.issues.filter((i) => i.projectId === projectId).flatMap((i) => i.labels));
  return [...labels].sort(compareLabels);
}
