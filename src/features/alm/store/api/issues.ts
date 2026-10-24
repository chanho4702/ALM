// alm-backend REST 어댑터 — issues (jiraApi.ts에서 분할, 동작 불변)
import type { IssuePriority, IssueType, Issue } from "../types";
import { type IssueDto, mapIssue, toBackendId, toApiIssuePriority, toApiIssueType, toApiResolution } from "../mapping";
import { type IssueSearchCriteria, type IssueSort, MAX_SEARCH_PAGE_SIZE, type IssueAggregateGroup, type IssueAggregate, queryToCriteria } from "../issueSearch";
import type { IssueQuery } from "../searchQuery";
import { newMentionIds } from "../richText";
import { searchParams, sharedGet, sharedApiFetch, json, issueDto } from "./http";
import { mentionIdsForServer } from "./collab";

export interface IssueFilter {
  text?: string;
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string;
  label?: string;
  type?: IssueType;
  componentId?: string;
}

export interface IssuePageDto {
  items: IssueDto[];
  page: number;
  size: number;
  total: number;
  /** 이 페이지 뒤에 결과가 더 있다(2026-10-18 서버 추가) */
  truncated?: boolean;
}

export interface IssuePage {
  items: Issue[];
  page: number;
  size: number;
  total: number;
  /** 이 페이지 뒤에 결과가 더 있다 — 한 페이지만 읽는 화면이 "더 있음"을 그린다 */
  truncated: boolean;
}

/** 검색 페이지 응답 → 화면 모델. truncated가 없는 응답(구 서버)은 total로 계산한다 */
export function mapIssuePage(dto: IssuePageDto): IssuePage {
  return {
    items: dto.items.map((row, index) => mapIssue(row, dto.page * dto.size + index + 1)),
    page: dto.page,
    size: dto.size,
    total: dto.total,
    truncated: dto.truncated ?? dto.page * dto.size + dto.items.length < dto.total,
  };
}

/** 검색 조건 → 서버 쿼리 파라미터(목록은 반복 파라미터). id는 경계에서만 숫자로 바꾼다 */
function criteriaParams(criteria: IssueSearchCriteria): Record<string, string | string[] | undefined> {
  const ids = (list?: string[]) => list?.map((id) => toBackendId(id).toString());
  const one = (id?: string) => (id ? toBackendId(id).toString() : undefined);
  return {
    projectIds: ids(criteria.projectIds),
    text: criteria.text?.trim() || undefined,
    statuses: criteria.statuses,
    statusCategories: criteria.statusCategories,
    openOnly: criteria.openOnly ? "true" : undefined,
    priorities: criteria.priorities?.map(toApiIssuePriority),
    types: criteria.types?.map(toApiIssueType),
    assignees: criteria.assigneeIds?.map((id) => (id === "unassigned" ? id : toBackendId(id).toString())),
    labels: criteria.labels,
    componentIds: ids(criteria.componentIds),
    sprintId: one(criteria.sprintId),
    parentId: one(criteria.parentId),
    fixVersionId: one(criteria.fixVersionId),
    dueBefore: criteria.dueBefore,
    dueFrom: criteria.dueFrom,
    dueTo: criteria.dueTo,
    updatedSince: criteria.updatedSince,
  };
}

/**
 * 서버 검색 한 페이지 — `total`은 조건 전체 건수다(화면은 이것으로 건수·페이저를 그린다).
 * 정렬 기본은 서버와 같은 `updated desc`. 같은 조건 동시 호출은 요청 하나를 나눠 쓴다.
 */
export async function findIssues(
  criteria: IssueSearchCriteria,
  paging: { page: number; size: number },
  sort: IssueSort = { field: "updated", dir: "desc" },
): Promise<IssuePage> {
  const query = searchParams({
    ...criteriaParams(criteria),
    sort: sort.field,
    dir: sort.dir,
    page: String(Math.max(0, paging.page)),
    size: String(Math.min(MAX_SEARCH_PAGE_SIZE, Math.max(1, paging.size))),
  });
  const dto = await sharedGet<IssuePageDto>(`/api/alm/issues/search?${query}`);
  return mapIssuePage(dto);
}

/** 한 축 집계 — 이슈 본문을 받지 않고 서버가 GROUP BY로 센다 */
export async function aggregateIssues(
  criteria: IssueSearchCriteria,
  groupBy: IssueAggregateGroup,
): Promise<IssueAggregate> {
  const query = searchParams({ ...criteriaParams(criteria), groupBy });
  const dto = await sharedGet<IssueAggregate>(`/api/alm/issues/aggregate?${query}`);
  return { total: dto.total, buckets: dto.buckets.map((b) => ({ key: b.key, count: b.count })) };
}

/** 프로젝트에서 쓰이는 라벨(보관 이슈 제외) — 서버가 정렬해 준다 */
export async function listProjectLabels(projectId: string): Promise<string[]> {
  const rows = await sharedGet<string[]>(`/api/alm/projects/${toBackendId(projectId)}/labels`);
  return [...rows];
}

/** 목록 화면 필터(단일 값) → 검색 조건 */
function filterCriteria(projectId: string, filter: IssueFilter | undefined): IssueSearchCriteria {
  return {
    projectIds: [projectId],
    text: filter?.text,
    statuses: filter?.status ? [filter.status] : undefined,
    priorities: filter?.priority ? [filter.priority] : undefined,
    types: filter?.type ? [filter.type] : undefined,
    assigneeIds: filter?.assigneeId ? [filter.assigneeId] : undefined,
    labels: filter?.label ? [filter.label] : undefined,
    componentIds: filter?.componentId ? [filter.componentId] : undefined,
  };
}

/** 필터·정렬·페이지를 서버가 처리한다 — 클라이언트 전량 필터(BACKLOG #5)를 쓰지 않는다. 기본 정렬은 키 오름차순 */
export async function listIssuesPage(
  projectId: string,
  filter: IssueFilter | undefined,
  paging: { page: number; size: number },
  sort: IssueSort = { field: "key", dir: "asc" },
): Promise<IssuePage> {
  return findIssues(filterCriteria(projectId, filter), paging, sort);
}

/**
 * 전량이 필요한 화면(보드·백로그·리포트)용 — 서버 최대 페이지 크기로 끝까지 읽는다.
 * 트리아지 대기열(V35)은 빼고 돌려준다 — 서버 `/projects/{id}/issues`(보드·백로그 목록)와 같은 의미.
 * 검색 API(`/issues/search`)에 트리아지 조건이 없어 여기서 거른다(백엔드에 `triage` 파라미터 요청함).
 */
export async function listIssues(projectId: string, filter?: IssueFilter): Promise<Issue[]> {
  const all: Issue[] = [];
  let seen = 0;
  for (let page = 0; ; page += 1) {
    const chunk = await listIssuesPage(projectId, filter, { page, size: MAX_SEARCH_PAGE_SIZE });
    seen += chunk.items.length;
    all.push(...chunk.items.filter((issue) => !issue.triageState));
    if (seen >= chunk.total || chunk.items.length === 0) break;
  }
  return all;
}

export async function getIssueByKey(key: string): Promise<Issue | null> {
  const response = await sharedApiFetch(`/api/alm/issues/by-key/${encodeURIComponent(key.trim().toUpperCase())}`);
  if (response.status === 404) return null;
  return mapIssue(await json<IssueDto>(response));
}

/**
 * 교차 프로젝트 검색(검색 페이지·필터 가젯) — 서버 페이징. 쿼리의 상태 **분류**는 `statusCategories`로,
 * 상태 **id**는 `statuses`로 나눠 보낸다(서버가 분류를 상태 레지스트리로 풀어 커스텀 상태까지 잡는다).
 */
export async function queryIssuesPage(
  query: IssueQuery,
  paging: { page: number; size: number },
): Promise<IssuePage> {
  const { criteria, sort } = queryToCriteria(query);
  return findIssues(criteria, paging, sort);
}

export interface IssueCreateInput {
  projectId: string;
  title: string;
  description?: string;
  type?: IssueType;
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  labels?: string[];
  componentIds?: string[];
  fixVersionId?: string | null;
  estimateHours?: number | null;
  /** V30 계획 필드 — `planning`으로 보낸다(보낸 키만) */
  startDate?: string | null;
  storyPoints?: number | null;
  /** V35 — 트리아지 대기열로 만든다(편집자, 트리아지를 켠 프로젝트) */
  triage?: boolean;
}

/** 계획 필드(V30) 본문 — `details`와 달리 **보낸 키만** 바뀐다(생략 = 그대로, null = 비우기) */
export function planningBody(input: { startDate?: string | null; storyPoints?: number | null }): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  if (input.startDate !== undefined) body.startDate = input.startDate;
  if (input.storyPoints !== undefined) body.storyPoints = input.storyPoints;
  return Object.keys(body).length > 0 ? body : undefined;
}

function assertCreateFieldsSupported(_input: IssueCreateInput): void {
  // V3에서 스프린트까지 서버가 저장한다. 남은 미지원 필드가 생기면 여기서 막는다.
}

export async function createIssue(input: IssueCreateInput): Promise<Issue> {
  assertCreateFieldsSupported(input);
  const response = await sharedApiFetch(
    `/api/alm/projects/${toBackendId(input.projectId)}/issues`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        description: input.description ?? "",
        type: input.type ? toApiIssueType(input.type) : undefined,
        status: input.status,
        priority: input.priority ? toApiIssuePriority(input.priority) : undefined,
        assigneeId: input.assigneeId == null ? null : toBackendId(input.assigneeId),
        details: {
          parentId: input.parentId == null ? null : toBackendId(input.parentId),
          mentionedUserIds: mentionIdsForServer(input.description ?? ""),
          sprintId: input.sprintId == null ? null : toBackendId(input.sprintId),
          dueDate: input.dueDate ?? null,
          estimateHours: input.estimateHours ?? null,
          labels: input.labels ?? [],
          componentIds: (input.componentIds ?? []).map(toBackendId),
          fixVersionId: input.fixVersionId == null ? null : toBackendId(input.fixVersionId),
        },
        planning: planningBody(input),
        ...(input.triage ? { triage: true } : {}),
      }),
    },
  );
  return mapIssue(await json(response));
}

type IssuePatch = Partial<
  Pick<
    Issue,
    | "title"
    | "description"
    | "type"
    | "status"
    | "priority"
    | "assigneeId"
    | "parentId"
    | "sprintId"
    | "dueDate"
    | "labels"
    | "componentIds"
    | "estimateHours"
    | "resolution"
    | "fixVersionId"
    | "startDate"
    | "storyPoints"
  >
>;

function assertPatchFieldsSupported(_patch: IssuePatch): void {
  // V3에서 스프린트까지 서버가 저장한다. 남은 미지원 필드가 생기면 여기서 막는다.
}

/**
 * 서버는 전체 본문을 받으므로 건드리지 않은 필드는 최신 값으로 채운다(보드 이동·랭크처럼 버전을 올리지
 * 않는 변경을 되돌리지 않기 위해서). 낙관적 락 기준은 **화면이 편집을 시작할 때 본 버전**이다 —
 * 저장 시점에 다시 읽은 버전을 쓰면 그 사이 남이 저장한 내용을 조용히 덮어쓴다(409가 나야 한다).
 */
export async function updateIssue(id: string, patch: IssuePatch, expectedVersion: number): Promise<Issue> {
  assertPatchFieldsSupported(patch);
  if (!Number.isInteger(expectedVersion)) throw new Error("편집을 시작한 이슈 버전이 필요합니다");
  const current = await issueDto(id);
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: (patch.title ?? current.title).trim(),
      description: patch.description ?? current.description ?? "",
      type: patch.type ? toApiIssueType(patch.type) : current.type,
      status: patch.status ?? current.status,
      priority: patch.priority ? toApiIssuePriority(patch.priority) : current.priority,
      assigneeId:
        patch.assigneeId === undefined
          ? current.assigneeId
          : patch.assigneeId === null
            ? null
            : toBackendId(patch.assigneeId),
      details: {
        sprintId:
          patch.sprintId === undefined
            ? (current.sprintId ?? null)
            : patch.sprintId === null
              ? null
              : toBackendId(patch.sprintId),
        parentId:
          patch.parentId === undefined
            ? (current.parentId ?? null)
            : patch.parentId === null
              ? null
              : toBackendId(patch.parentId),
        dueDate: patch.dueDate === undefined ? (current.dueDate ?? null) : patch.dueDate,
        estimateHours:
          patch.estimateHours === undefined
            ? (current.estimateHours ?? null)
            : patch.estimateHours,
        labels: patch.labels === undefined ? (current.labels ?? []) : patch.labels,
        componentIds: patch.componentIds === undefined ? (current.componentIds ?? []) : patch.componentIds.map(toBackendId),
        // 해결 규칙은 **서버가 정본**이다(2026-10-24 A1, 완료 진입 시 DONE·이탈 시 비움) — 프론트는 값만 보낸다.
        // 서버는 이 값이 현재 값과 다를 때만 "지정"으로 보므로, 건드리지 않았으면 현재 값을 그대로 실어도 된다
        resolution:
          patch.resolution === undefined ? (current.resolution ?? null) : toApiResolution(patch.resolution),
        fixVersionId:
          patch.fixVersionId === undefined
            ? (current.fixVersionId ?? null)
            : patch.fixVersionId === null
              ? null
              : toBackendId(patch.fixVersionId),
      },
      expectedVersion,
      planning: planningBody(patch),
      mentionedUserIds:
        patch.description === undefined
          ? []
          : newMentionIds(current.description ?? "", patch.description ?? "").filter((id) => /^\d+$/.test(id)).map(Number),
    }),
  });
  return mapIssue(await json(response));
}

/**
 * 이슈 복제(F-11) — `POST /api/alm/issues/{id}/clone`(본문 없음) → 201 새 이슈. 무엇을 복사할지는 서버가 정한다
 * (제목 "복제: " 접두·처음 상태, 담당자·스프린트·마감·추정·수정 버전·댓글·워크로그·첨부 제외, 원본과 clones 링크).
 */
export async function cloneIssue(issueId: string): Promise<Issue> {
  return mapIssue(await json(await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/clone`, { method: "POST" })));
}
