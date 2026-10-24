/**
 * 서버 이슈 검색·집계 계약(`GET /api/alm/issues/search`·`/aggregate`, `/projects/{id}/labels`)의 프론트 모델.
 * REST 어댑터(`jiraApi.ts`)와 목업(`jiraMock.ts`)이 같은 의미로 구현한다 — 화면은 `jiraStore` 파사드만 쓴다.
 */
import type { IssueQuery } from "./searchQuery";

/** 서버가 아는 정렬 기준. 담당자 정렬은 없다(이름이 org-service에 있다) — 화면이 정렬 선택지로 내지 않는다 */
export type IssueSortField = "updated" | "created" | "due" | "priority" | "key" | "title" | "status" | "type";

export interface IssueSort {
  field: IssueSortField;
  dir: "asc" | "desc";
}

/**
 * 검색 조건. 배열은 비면 "조건 없음", 값끼리 OR, 필드끼리 AND.
 * - `statuses`는 **상태 id**, `statusCategories`는 **상태 분류 id**(커스텀 상태도 소속 분류로 걸린다) — 둘은 OR로 합친다.
 * - `openOnly`는 완료(kind=complete) 분류 상태를 뺀다.
 * - 날짜는 YYYY-MM-DD: `dueBefore`는 배타, `dueFrom`/`dueTo`는 포함. 마감일 없는 이슈는 날짜 조건에 걸리지 않는다.
 * - `updatedSince`는 ISO-8601 시각(포함).
 */
export interface IssueSearchCriteria {
  projectIds?: string[];
  text?: string;
  statuses?: string[];
  statusCategories?: string[];
  openOnly?: boolean;
  priorities?: string[];
  types?: string[];
  /** "unassigned" = 미지정 */
  assigneeIds?: string[];
  labels?: string[];
  componentIds?: string[];
  sprintId?: string;
  parentId?: string;
  fixVersionId?: string;
  dueBefore?: string;
  dueFrom?: string;
  dueTo?: string;
  updatedSince?: string;
  /**
   * 트리아지 대기열(V35) — true면 대기열만, false면 대기열 제외, 생략하면 둘 다(검색·AQL의 기본).
   * 보드·백로그·스프린트 목록은 false로 묻는다(서버 `triage=false` — total도 그 기준으로 정확하다).
   */
  triage?: boolean;
}

export type IssueAggregateGroup = "status" | "priority" | "assignee" | "type" | "statusCategory";

/** 집계 결과 — 버킷은 실제로 나온 값만, 건수 내림차순·키 오름차순. 표시 순서는 화면이 정한다 */
export interface IssueAggregate {
  total: number;
  buckets: { key: string; count: number }[];
}

/** 서버 검색 한 페이지의 최대 크기 */
export const MAX_SEARCH_PAGE_SIZE = 200;

/** 스마트/기본 검색 쿼리 → 서버 검색 조건. 쿼리의 `statuses`는 분류 id, `statusIds`는 상태 id다 */
export function queryToCriteria(query: IssueQuery): { criteria: IssueSearchCriteria; sort: IssueSort } {
  return {
    criteria: {
      projectIds: query.projectIds,
      text: query.text.trim() || undefined,
      statusCategories: query.statuses,
      statuses: query.statusIds,
      priorities: query.priorities,
      types: query.types,
      assigneeIds: query.assigneeIds,
      labels: query.labels,
    },
    // 검색 화면의 정렬 선택지는 방향이 정해져 있다 — 우선순위·마감일은 급한 것부터, 날짜는 최신부터
    sort: { field: query.sort, dir: query.sort === "priority" || query.sort === "due" ? "asc" : "desc" },
  };
}

/** 라벨 정렬 — 대소문자 무시, 같으면 원문 순(서버 `/labels`와 같다) */
export function compareLabels(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
