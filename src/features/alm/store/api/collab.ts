// alm-backend REST 어댑터 — collab (jiraApi.ts에서 분할, 동작 불변)
import type { Comment, Worklog, IssueLinkType, IssueLink, Activity, Issue, BoardType, BoardFilter, BoardColumn, BoardSwimlane, Board } from "../types";
import { toBackendId, type IssueDto, mapIssue } from "../mapping";
import { extractMentionIds } from "../richText";
import type { IssueLinkView } from "../jiraMock";
import { MAX_SEARCH_PAGE_SIZE } from "../issueSearch";
import { json, sharedApiFetch, issueDto, searchParams } from "./http";
import { updateIssue, type IssuePage, findIssues, type IssuePageDto } from "./issues";

// ── 협업(V12): 코멘트·워크로그·링크·활동·보드 — 목업과 같은 시그니처, 서버가 같은 규칙을 강제한다 ──

interface CommentDto {
  id: number;
  issueId: number;
  authorId: number;
  body: string;
  createdAt: string;
  updatedAt: string | null;
}

function mapComment(dto: CommentDto): Comment {
  return {
    id: String(dto.id),
    issueId: String(dto.issueId),
    authorId: String(dto.authorId),
    body: dto.body,
    createdAt: dto.createdAt,
    ...(dto.updatedAt ? { updatedAt: dto.updatedAt } : {}),
  };
}

export async function listComments(issueId: string): Promise<Comment[]> {
  const rows = await json<CommentDto[]>(
    await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/comments`),
  );
  return rows.map(mapComment);
}

/** 본문의 멘션 id → 서버 숫자 id(모르는 형식은 버린다) */
export function mentionIdsForServer(html: string): number[] {
  return extractMentionIds(html)
    .filter((id) => /^\d+$/.test(id))
    .map((id) => Number(id));
}

export async function addComment(issueId: string, body: string): Promise<Comment> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, mentionedUserIds: mentionIdsForServer(body) }),
  });
  return mapComment(await json(response));
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  // 수정 전 본문을 모르므로 본문의 멘션 전부를 보낸다 — 서버가 본인·설정으로 거른다
  const response = await sharedApiFetch(`/api/alm/comments/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, mentionedUserIds: mentionIdsForServer(body) }),
  });
  return mapComment(await json(response));
}

export async function deleteComment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/comments/${toBackendId(id)}`, { method: "DELETE" }));
}

interface WorklogDto {
  id: number;
  issueId: number;
  authorId: number;
  hours: number;
  comment: string;
  workedOn: string;
  createdAt: string;
}

function mapWorklog(dto: WorklogDto): Worklog {
  return {
    id: String(dto.id),
    issueId: String(dto.issueId),
    authorId: String(dto.authorId),
    hours: Number(dto.hours),
    comment: dto.comment ?? "",
    workedOn: dto.workedOn,
    at: dto.createdAt,
  };
}

/** 목업과 같은 순서 — 작업일 최신순, 같은 날은 기록 시각 최신순 */
export async function listWorklogs(issueId: string): Promise<Worklog[]> {
  const rows = await json<WorklogDto[]>(
    await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/worklogs`),
  );
  return rows
    .map(mapWorklog)
    .sort((a, b) => b.workedOn.localeCompare(a.workedOn) || b.at.localeCompare(a.at));
}

export async function addWorklog(
  issueId: string,
  input: { hours: number; comment?: string; workedOn: string },
): Promise<Worklog> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/worklogs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hours: input.hours, comment: input.comment ?? "", workedOn: input.workedOn }),
  });
  return mapWorklog(await json(response));
}

export async function deleteWorklog(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/worklogs/${toBackendId(id)}`, { method: "DELETE" }));
}

interface LinkDto {
  id: number;
  sourceId: number;
  targetId: number;
  type: IssueLinkType;
}

interface LinkViewDto {
  link: LinkDto;
  other: IssueDto;
  direction: IssueLinkView["direction"];
  /** 반대편 프로젝트를 볼 수 없어 other가 축약본이다(2026-10-18, 감사 A-01) */
  restricted?: boolean;
}

function mapLink(dto: LinkDto): IssueLink {
  return {
    id: String(dto.id),
    sourceId: String(dto.sourceId),
    targetId: String(dto.targetId),
    type: dto.type,
  };
}

export async function listIssueLinks(issueId: string): Promise<IssueLinkView[]> {
  const rows = await json<LinkViewDto[]>(
    await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/links`),
  );
  return rows.map((row) => ({
    link: mapLink(row.link),
    other: mapIssue(row.other),
    direction: row.direction,
    restricted: row.restricted === true,
  }));
}

/** 경로의 이슈가 source — blocks면 "source가 target을 차단" */
export async function addIssueLink(input: {
  sourceId: string;
  targetId: string;
  type: IssueLinkType;
}): Promise<IssueLink> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(input.sourceId)}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId: toBackendId(input.targetId), type: input.type }),
  });
  return mapLink(await json(response));
}

export async function removeIssueLink(linkId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/links/${toBackendId(linkId)}`, { method: "DELETE" }));
}

interface ActivityDto {
  id: number;
  issueId: number;
  actorId: number;
  type: Activity["type"];
  detail: string;
  occurredAt: string;
}

export async function listActivity(issueId: string): Promise<Activity[]> {
  const rows = await json<ActivityDto[]>(
    await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/activity`),
  );
  return rows.map((row) => ({
    id: String(row.id),
    issueId: String(row.issueId),
    actorId: String(row.actorId),
    type: row.type,
    detail: row.detail,
    at: row.occurredAt,
  }));
}

export async function setIssueParent(id: string, parentId: string | null, expectedVersion: number): Promise<Issue> {
  return updateIssue(id, { parentId }, expectedVersion);
}

/** 상위 경로를 따라갈 최대 깊이 — 계층은 무제한이지만 끊긴 체인·순환에 무한히 묻지 않게 */
const MAX_ANCESTOR_DEPTH = 50;

/**
 * 상위 항목 경로(루트 먼저) — 서버에 조상 API가 없어 부모를 한 단계씩 읽는다(깊이만큼 GET, 보통 1~3).
 * `parentId`를 넘기면 자기 자신은 다시 읽지 않는다. 중간 부모를 못 읽으면(삭제·권한) 거기까지만 돌려준다.
 */
export async function listIssueAncestors(issueId: string, parentId?: string | null): Promise<Issue[]> {
  const ancestors: Issue[] = [];
  const seen = new Set<string>([issueId]);
  let next = parentId === undefined ? mapIssue(await issueDto(issueId)).parentId : parentId;
  while (next && !seen.has(next) && ancestors.length < MAX_ANCESTOR_DEPTH) {
    seen.add(next);
    let parent: Issue;
    try {
      parent = mapIssue(await issueDto(next));
    } catch {
      break;
    }
    ancestors.unshift(parent);
    next = parent.parentId;
  }
  return ancestors;
}

/**
 * 자식 한 페이지(키 오름차순, 최대 200건) — `truncated`면 더 있다. 화면은 "N건 중 M건"을 그리고 개수는 집계로 센다.
 */
export async function listChildrenPage(issueId: string): Promise<IssuePage> {
  return findIssues({ parentId: issueId }, { page: 0, size: MAX_SEARCH_PAGE_SIZE }, { field: "key", dir: "asc" });
}

/** 자식 목록(첫 페이지) — 하위의 하위처럼 개수가 중요하지 않은 자리용. 잘림 여부가 필요하면 listChildrenPage */
export async function listChildren(issueId: string): Promise<Issue[]> {
  return (await listChildrenPage(issueId)).items;
}

/** 링크·부모 선택기용 텍스트 검색 — 접근 가능한 모든 프로젝트 */
export async function searchIssues(text: string, limit = 20): Promise<Issue[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const query = searchParams({ text: trimmed, sort: "updated", dir: "desc", size: String(limit) });
  const dto = await json<IssuePageDto>(await sharedApiFetch(`/api/alm/issues/search?${query}`));
  return dto.items.map((row, index) => mapIssue(row, index + 1));
}

interface BoardDto {
  id: number;
  projectId: number;
  name: string;
  type: BoardType;
  filter: Partial<BoardFilter> | null;
  columns: BoardColumn[] | null;
  swimlane: BoardSwimlane;
  isDefault: boolean;
  createdAt: string;
}

function mapBoard(dto: BoardDto): Board {
  return {
    id: String(dto.id),
    projectId: String(dto.projectId),
    name: dto.name,
    type: dto.type,
    filter: {
      assigneeIds: dto.filter?.assigneeIds ?? [],
      types: dto.filter?.types ?? [],
      labels: dto.filter?.labels ?? [],
    },
    columns: (dto.columns ?? []).map((column) => ({
      status: column.status,
      name: column.name,
      wipLimit: column.wipLimit ?? null,
    })),
    swimlane: dto.swimlane,
    isDefault: dto.isDefault,
    createdAt: dto.createdAt,
  };
}

export async function listBoards(projectId: string): Promise<Board[]> {
  const rows = await json<BoardDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/boards`),
  );
  return rows.map(mapBoard);
}

export async function getBoard(id: string): Promise<Board | null> {
  const response = await sharedApiFetch(`/api/alm/boards/${toBackendId(id)}`);
  if (response.status === 404) return null;
  return mapBoard(await json(response));
}

export async function createBoard(input: {
  projectId: string;
  name: string;
  type: BoardType;
}): Promise<Board> {
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(input.projectId)}/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, type: input.type }),
  });
  return mapBoard(await json(response));
}

/** REST는 목업과 달리 type도 바꿀 수 있다(템플릿 적용용) */
export async function updateBoard(
  id: string,
  patch: Partial<Pick<Board, "name" | "type" | "filter" | "columns" | "swimlane" | "isDefault">>,
): Promise<Board> {
  const response = await sharedApiFetch(`/api/alm/boards/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return mapBoard(await json(response));
}

export async function deleteBoard(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/boards/${toBackendId(id)}`, { method: "DELETE" }));
}

export async function listBoardIssues(boardId: string): Promise<Issue[]> {
  const rows = await json<IssueDto[]>(
    await sharedApiFetch(`/api/alm/boards/${toBackendId(boardId)}/issues`),
  );
  return rows.map((row, index) => mapIssue(row, index + 1));
}
