// alm-backend Project/Issue/Sprint REST 계약 어댑터.
// 서버가 아직 저장하지 않는 ALM 확장 필드는 조용히 유실시키지 않고 명시적으로 거부한다.
import { getTemplate, type ProjectTemplateId } from "./projectTemplates";
import { sharedApiFetch, sharedAuthClient } from "./apiClient";
import type { IssueQuery } from "./searchQuery";
import {
  extractApiError,
  mapIssue,
  mapProject,
  mapAttachment,
  mapIssueChange,
  mapSprint,
  mapVersion,
  toApiChangeField,
  toApiIssuePriority,
  toApiResolution,
  toApiIssueType,
  toBackendId,
  type AttachmentDto,
  type IssueChangeDto,
  type IssueDto,
  type ProjectDto,
  type SprintDto,
  type VersionDto,
} from "./mapping";
import type {
  Attachment,
  ChangeField,
  Issue,
  IssueChange,
  IssuePriority,
  IssueType,
  Project,
  ProjectVersion,
  Sprint,
  Notification,
  AuditEntry,
  SystemStats,
  SettingsBody,
  SettingsScheme,
  WorkflowStatus,
  StatusCategory,
  StatusDef,
  StatusKind,
  StatusColor,
  IssueTypeDef,
  IssueTypeLevel,
  User,
  ProjectRole,
  Comment,
  Worklog,
  IssueLink,
  IssueLinkType,
  Activity,
  Board,
  BoardType,
  BoardColumn,
  BoardFilter,
  BoardSwimlane,
} from "./types";
import type { IssueLinkView, ProjectMemberView } from "./jiraMock";

async function json<T>(response: Response): Promise<T> {
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(response.status, body));
  return body as T;
}

async function projectDto(id: string): Promise<ProjectDto> {
  return json(await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`));
}

async function issueDto(id: string): Promise<IssueDto> {
  return json(await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}`));
}

export async function listProjects(): Promise<Project[]> {
  const rows = await json<ProjectDto[]>(await sharedApiFetch("/api/alm/projects"));
  return rows.map(mapProject);
}

export async function createProject(input: {
  key: string;
  name: string;
  description?: string;
  templateId?: ProjectTemplateId;
}): Promise<Project> {
  const template = getTemplate(input.templateId ?? "blank");
  if (template.withSprint || template.samples.length > 0 || template.board) {
    throw new Error("백엔드 모드에서는 아직 빈 프로젝트 템플릿만 지원합니다.");
  }
  const response = await sharedApiFetch("/api/alm/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: input.key.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
    }),
  });
  return mapProject(await json(response));
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string },
): Promise<Project> {
  const current = await projectDto(id);
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: (patch.name ?? current.name).trim(),
      description: (patch.description ?? current.description ?? "").trim(),
      expectedVersion: current.version,
    }),
  });
  return mapProject(await json(response));
}

export async function deleteProject(id: string): Promise<void> {
  await json(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`, { method: "DELETE" }),
  );
}

export interface IssueFilter {
  text?: string;
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string;
  label?: string;
  type?: IssueType;
}


interface IssuePageDto {
  items: IssueDto[];
  page: number;
  size: number;
  total: number;
}

export interface IssuePage {
  items: Issue[];
  page: number;
  size: number;
  total: number;
}

/** 서버 검색 파라미터 — 목록 값은 반복 파라미터로 보낸다 */
function searchParams(entries: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params.toString();
}

/** 필터를 서버가 거른다 — 클라이언트 전량 필터(BACKLOG #5)를 쓰지 않는다 */
export async function listIssuesPage(
  projectId: string,
  filter: IssueFilter | undefined,
  paging: { page: number; size: number },
): Promise<IssuePage> {
  const query = searchParams({
    projectIds: toBackendId(projectId).toString(),
    text: filter?.text,
    statuses: filter?.status,
    priorities: filter?.priority ? toApiIssuePriority(filter.priority) : undefined,
    types: filter?.type ? toApiIssueType(filter.type) : undefined,
    assignees: filter?.assigneeId ? toBackendId(filter.assigneeId).toString() : undefined,
    labels: filter?.label,
    sort: "key",
    dir: "asc",
    page: String(paging.page),
    size: String(paging.size),
  });
  const dto = await json<IssuePageDto>(await sharedApiFetch(`/api/alm/issues/search?${query}`));
  return {
    items: dto.items.map((row, index) => mapIssue(row, dto.page * dto.size + index + 1)),
    page: dto.page,
    size: dto.size,
    total: dto.total,
  };
}

/** 전량이 필요한 화면(보드·백로그·리포트)용 — 서버 최대 페이지 크기로 끝까지 읽는다 */
export async function listIssues(projectId: string, filter?: IssueFilter): Promise<Issue[]> {
  const all: Issue[] = [];
  for (let page = 0; ; page += 1) {
    const chunk = await listIssuesPage(projectId, filter, { page, size: 200 });
    all.push(...chunk.items);
    if (all.length >= chunk.total || chunk.items.length === 0) break;
  }
  return all;
}

export async function getIssueByKey(key: string): Promise<Issue | null> {
  const response = await sharedApiFetch(`/api/alm/issues/by-key/${encodeURIComponent(key.trim().toUpperCase())}`);
  if (response.status === 404) return null;
  return mapIssue(await json<IssueDto>(response));
}

/** 교차 프로젝트 검색(검색 페이지·모달) — 카테고리 필터는 기본 상태 id로만 서버에 전달한다 */
export async function queryIssues(query: IssueQuery): Promise<Issue[]> {
  const params = searchParams({
    projectIds: query.projectIds.map((id) => toBackendId(id).toString()),
    text: query.text.trim() || undefined,
    statuses: [...query.statuses, ...query.statusIds],
    priorities: query.priorities.map(toApiIssuePriority),
    types: query.types.map(toApiIssueType),
    assignees: query.assigneeIds.map((id) => (id === "unassigned" ? id : toBackendId(id).toString())),
    labels: query.labels,
    sort: query.sort,
    dir: query.sort === "priority" || query.sort === "due" ? "asc" : "desc",
    size: "200",
  });
  const dto = await json<IssuePageDto>(await sharedApiFetch(`/api/alm/issues/search?${params}`));
  return dto.items.map((row, index) => mapIssue(row, index + 1));
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
          sprintId: input.sprintId == null ? null : toBackendId(input.sprintId),
          dueDate: input.dueDate ?? null,
          estimateHours: null,
          labels: input.labels ?? [],
        },
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
    | "estimateHours"
    | "resolution"
    | "fixVersionId"
  >
>;

function assertPatchFieldsSupported(_patch: IssuePatch): void {
  // V3에서 스프린트까지 서버가 저장한다. 남은 미지원 필드가 생기면 여기서 막는다.
}

export async function updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
  assertPatchFieldsSupported(patch);
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
        // 기본값·해제 규칙은 목업 스토어와 같이 프론트 몫이다 — 여기서는 값만 옮긴다
        resolution:
          patch.resolution === undefined ? (current.resolution ?? null) : toApiResolution(patch.resolution),
        fixVersionId:
          patch.fixVersionId === undefined
            ? (current.fixVersionId ?? null)
            : patch.fixVersionId === null
              ? null
              : toBackendId(patch.fixVersionId),
      },
      expectedVersion: current.version,
    }),
  });
  return mapIssue(await json(response));
}

// ── sprints ──────────────────────────────────────────────────

export async function listSprints(projectId: string): Promise<Sprint[]> {
  const rows = await json<SprintDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/sprints`),
  );
  return rows.map(mapSprint);
}

export async function createSprint(projectId: string): Promise<Sprint> {
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/sprints`, {
    method: "POST",
  });
  return mapSprint(await json(response));
}

async function sprintDto(id: string): Promise<SprintDto> {
  return json(await sharedApiFetch(`/api/alm/sprints/${toBackendId(id)}`));
}

/**
 * 계획 메타 수정. 서버는 전체 본문을 받으므로 최신 값을 먼저 읽어 건드리지 않은 필드를
 * 그대로 되돌려 보내고, 그때 읽은 version을 expectedVersion으로 쓴다(이슈 수정과 같은 규칙).
 */
export async function updateSprint(
  id: string,
  patch: { name?: string; goal?: string | null; plannedStart?: string | null; plannedEnd?: string | null },
): Promise<Sprint> {
  const current = await sprintDto(id);
  const pick = (next: string | null | undefined, currentValue?: string | null) =>
    next === undefined ? (currentValue ?? null) : next === null || next.trim() === "" ? null : next.trim();
  const response = await sharedApiFetch(`/api/alm/sprints/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: patch.name === undefined ? current.name : patch.name.trim(),
      goal: pick(patch.goal, current.goal),
      plannedStart: pick(patch.plannedStart, current.plannedStart),
      plannedEnd: pick(patch.plannedEnd, current.plannedEnd),
      expectedVersion: current.version,
    }),
  });
  return mapSprint(await json(response));
}

export async function startSprint(id: string): Promise<Sprint> {
  const response = await sharedApiFetch(`/api/alm/sprints/${toBackendId(id)}/start`, {
    method: "POST",
  });
  return mapSprint(await json(response));
}

/**
 * 무엇을 완료로 볼지는 워크플로 스킴을 가진 프론트가 알려준다 — 서버는 아직 상태 카테고리를
 * 모른다. doneStatuses에 없는 이슈는 백로그로 돌아간다.
 */
export async function completeSprint(
  id: string,
  doneStatuses: string[],
  options: { moveUnfinishedTo?: string | null } = {},
): Promise<Sprint> {
  const target = options.moveUnfinishedTo ?? null;
  const response = await sharedApiFetch(`/api/alm/sprints/${toBackendId(id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 대상이 없으면 필드를 빼서 서버 기본값(백로그)에 맡긴다.
    body: JSON.stringify(
      target === null
        ? { doneStatuses }
        : { doneStatuses, moveUnfinishedToSprintId: toBackendId(target) },
    ),
  });
  return mapSprint(await json(response));
}

// ── 버전(릴리스) ──────────────────────────────────────────────

export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  const rows = await json<VersionDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/versions`),
  );
  return rows.map(mapVersion);
}

export async function createVersion(
  projectId: string,
  input: { name: string; description?: string | null; startDate?: string | null; releaseDate?: string | null },
): Promise<ProjectVersion> {
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name.trim(),
      description: input.description ?? null,
      startDate: input.startDate || null,
      releaseDate: input.releaseDate || null,
    }),
  });
  return mapVersion(await json(response));
}

/** 서버는 전체 본문을 받으므로 목록에서 최신 값을 읽어 채우고 그 version을 expectedVersion으로 쓴다 */
export async function updateVersion(
  id: string,
  projectId: string,
  patch: { name?: string; description?: string | null; startDate?: string | null; releaseDate?: string | null },
): Promise<ProjectVersion> {
  const current = (
    await json<VersionDto[]>(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/versions`))
  ).find((row) => String(row.id) === id);
  if (!current) throw new Error("버전을 찾을 수 없습니다");
  const pick = (next: string | null | undefined, currentValue?: string | null) =>
    next === undefined ? (currentValue ?? null) : next === null || next.trim() === "" ? null : next.trim();
  const response = await sharedApiFetch(`/api/alm/versions/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: patch.name === undefined ? current.name : patch.name.trim(),
      description: pick(patch.description, current.description),
      startDate: pick(patch.startDate, current.startDate),
      releaseDate: pick(patch.releaseDate, current.releaseDate),
      expectedVersion: current.version,
    }),
  });
  return mapVersion(await json(response));
}

/** 완료 판정은 프론트가 알려준다(스프린트 완료와 같은 규칙). 대상이 없으면 이슈는 그대로 둔다. */
export async function releaseVersion(
  id: string,
  doneStatuses: string[],
  options: { moveUnresolvedTo?: string | null } = {},
): Promise<ProjectVersion> {
  const target = options.moveUnresolvedTo ?? null;
  const response = await sharedApiFetch(`/api/alm/versions/${toBackendId(id)}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      target === null
        ? { doneStatuses }
        : { doneStatuses, moveUnresolvedToVersionId: toBackendId(target) },
    ),
  });
  return mapVersion(await json(response));
}

export async function archiveVersion(id: string): Promise<ProjectVersion> {
  const response = await sharedApiFetch(`/api/alm/versions/${toBackendId(id)}/archive`, { method: "POST" });
  return mapVersion(await json(response));
}

export async function deleteVersion(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/versions/${toBackendId(id)}`, { method: "DELETE" }));
}

// ── 첨부 ─────────────────────────────────────────────────────

export async function listAttachments(issueId: string): Promise<Attachment[]> {
  const rows = await json<AttachmentDto[]>(
    await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/attachments`),
  );
  return rows.map(mapAttachment);
}

/** multipart — Content-Type은 브라우저가 boundary와 함께 붙이므로 직접 쓰지 않는다 */
export async function uploadAttachment(issueId: string, file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/attachments`, {
    method: "POST",
    body,
  });
  return mapAttachment(await json(response));
}

/**
 * 바이트는 인증 헤더가 필요해 <a href>로 직접 열 수 없다 — fetch로 받아 Blob으로 돌려주고
 * 화면이 object URL로 저장한다(목업과 같은 계약).
 */
export async function downloadAttachment(id: string): Promise<Blob> {
  const response = await sharedApiFetch(`/api/alm/attachments/${toBackendId(id)}`);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(extractApiError(response.status, body));
  }
  return response.blob();
}

export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}

// ── 변경 이력 ────────────────────────────────────────────────

/** 리포트 원천. 필터는 서버와 같은 의미이며 스프린트 필터는 전이 양쪽을 잡는다(서버 규칙). */
export async function listProjectChanges(
  projectId: string,
  filter: { field?: ChangeField; sprintId?: string; since?: string } = {},
): Promise<IssueChange[]> {
  const params = new URLSearchParams();
  if (filter.field) params.set("field", toApiChangeField(filter.field));
  if (filter.sprintId) params.set("sprintId", String(toBackendId(filter.sprintId)));
  if (filter.since) params.set("since", filter.since);
  const query = params.toString();
  const rows = await json<IssueChangeDto[]>(
    await sharedApiFetch(
      `/api/alm/projects/${toBackendId(projectId)}/changes${query ? `?${query}` : ""}`,
    ),
  );
  return rows.map(mapIssueChange);
}

// ── 순서 ─────────────────────────────────────────────────────

/** 보드 컬럼 이동. 서버가 대상 컬럼 전체 순서를 다시 매기므로 화면은 이동 후 재조회한다. */
export async function moveIssue(
  id: string,
  to: { status: string; beforeId?: string },
): Promise<Issue> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: to.status,
      beforeId: to.beforeId == null ? null : toBackendId(to.beforeId),
    }),
  });
  return mapIssue(await json(response));
}

/** 백로그/스프린트 랭크 이동. sprintId가 null이면 백로그다. */
export async function rankIssue(
  id: string,
  to: { sprintId: string | null; beforeId?: string },
): Promise<Issue> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sprintId: to.sprintId == null ? null : toBackendId(to.sprintId),
      beforeId: to.beforeId == null ? null : toBackendId(to.beforeId),
    }),
  });
  return mapIssue(await json(response));
}

export async function deleteIssue(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}`, { method: "DELETE" }));
}

// ── 대량 변경 — 서버 일괄 API가 없어 이슈마다 호출한다 (목업과 같은 결과 형태) ──

export interface BulkIssuePatch {
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  fixVersionId?: string | null;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface BulkResult {
  updated: number;
  failed: { id: string; key: string; reason: string }[];
}

export async function bulkUpdateIssues(ids: string[], patch: BulkIssuePatch): Promise<BulkResult> {
  if (ids.length === 0) throw new Error("선택한 이슈가 없습니다");
  let updated = 0;
  const failed: BulkResult["failed"] = [];
  for (const id of ids) {
    try {
      const current = mapIssue(await issueDto(id));
      const remove = new Set(patch.removeLabels ?? []);
      const labels =
        patch.addLabels || patch.removeLabels
          ? [...new Set([...current.labels.filter((l) => !remove.has(l)), ...(patch.addLabels ?? [])])]
          : undefined;
      await updateIssue(id, {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
        ...(patch.sprintId !== undefined ? { sprintId: patch.sprintId } : {}),
        ...(patch.fixVersionId !== undefined ? { fixVersionId: patch.fixVersionId } : {}),
        ...(labels ? { labels } : {}),
      });
      updated += 1;
    } catch (error) {
      failed.push({ id, key: id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { updated, failed };
}

export async function bulkDeleteIssues(
  ids: string[],
): Promise<{ deleted: number; failed: BulkResult["failed"] }> {
  if (ids.length === 0) throw new Error("선택한 이슈가 없습니다");
  let deleted = 0;
  const failed: BulkResult["failed"] = [];
  for (const id of ids) {
    try {
      await deleteIssue(id);
      deleted += 1;
    } catch (error) {
      failed.push({ id, key: id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { deleted, failed };
}

// ── CSV/이관 가져오기 — 서버 일괄 API(키 보존·행 단위 실패)로 한 번에 보낸다 ──

export interface ImportResult {
  created: number;
  failed: { row: number; title: string; reason: string }[];
}

export async function importIssues(
  projectId: string,
  inputs: {
    key?: string;
    title: string;
    description?: string;
    type?: IssueType;
    status?: string;
    priority?: IssuePriority;
    assigneeId?: string | null;
    labels?: string[];
    dueDate?: string | null;
    estimateHours?: number | null;
  }[],
): Promise<ImportResult> {
  if (inputs.length === 0) throw new Error("가져올 이슈가 없습니다");
  const items = inputs.map((input) => ({
    key: input.key ?? null,
    title: input.title,
    description: input.description ?? "",
    type: input.type ? toApiIssueType(input.type) : null,
    status: input.status ?? null,
    priority: input.priority ? toApiIssuePriority(input.priority) : null,
    assigneeId: input.assigneeId ? toBackendId(input.assigneeId) : null,
    details: {
      parentId: null,
      sprintId: null,
      dueDate: input.dueDate ?? null,
      estimateHours: input.estimateHours ?? null,
      labels: input.labels ?? [],
    },
  }));
  return json<ImportResult>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/issues/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }),
  );
}

// ── 워처 · 알림 — 서버 V9. 문장은 서버가 만들지 않으므로 여기서 type + detail로 만든다 ──

export interface WatchersView {
  watching: boolean;
  watchers: { userId: string; createdAt: string }[];
}

interface WatchersDto {
  watching: boolean;
  watchers: { userId: number; createdAt: string }[];
}

const mapWatchers = (dto: WatchersDto): WatchersView => ({
  watching: dto.watching,
  watchers: dto.watchers.map((w) => ({ userId: String(w.userId), createdAt: w.createdAt })),
});

export async function listWatchers(issueId: string): Promise<WatchersView> {
  return mapWatchers((await json(await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/watchers`))) as WatchersDto);
}

export async function watchIssue(issueId: string): Promise<WatchersView> {
  return mapWatchers(
    (await json(
      await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/watchers/me`, { method: "PUT" }),
    )) as WatchersDto,
  );
}

export async function unwatchIssue(issueId: string): Promise<WatchersView> {
  return mapWatchers(
    (await json(
      await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/watchers/me`, { method: "DELETE" }),
    )) as WatchersDto,
  );
}

interface NotificationDto {
  id: number;
  issueId: number | null;
  issueKey: string;
  actorId: number;
  type: "ASSIGNED" | "STATUS_CHANGED" | "COMMENTED";
  detail: string | null;
  read: boolean;
  createdAt: string;
}

/**
 * 알림 문장 — 서버는 종류와 부가값만 준다. 사용자 이름 디렉터리가 REST에 아직 없어 행위자는 id로
 * 쓰고, 상태 이름은 id 그대로 둔다(화면이 statusName으로 바꿔 보여줄 수 있게 detail도 남긴다).
 */
function notificationMessage(dto: NotificationDto): string {
  const actor = `사용자 ${dto.actorId}`;
  switch (dto.type) {
    case "ASSIGNED":
      return `${actor} 님이 ${dto.issueKey}를 나에게 할당했습니다`;
    case "STATUS_CHANGED":
      return `${actor} 님이 ${dto.issueKey}를 ${dto.detail ?? ""}(으)로 옮겼습니다`;
    default:
      return `${actor} 님이 ${dto.issueKey}에 코멘트를 남겼습니다`;
  }
}

export async function listNotifications(): Promise<Notification[]> {
  const rows = (await json(await sharedApiFetch("/api/alm/notifications"))) as NotificationDto[];
  return rows.map((dto) => ({
    id: String(dto.id),
    userId: "me",
    issueId: dto.issueId === null ? "" : String(dto.issueId),
    issueKey: dto.issueKey,
    actorId: String(dto.actorId),
    message: notificationMessage(dto),
    at: dto.createdAt,
    read: dto.read,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await sharedApiFetch(`/api/alm/notifications/${toBackendId(id)}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await sharedApiFetch("/api/alm/notifications/read-all", { method: "POST" });
}

// ── 관리 콘솔 — 서버 V10 감사 로그·현황 (roles에 ADMIN 필요, 아니면 403이 그대로 온다) ──

interface AuditDto {
  id: number;
  eventType: string;
  actorId: number;
  projectId: number | null;
  targetKey: string | null;
  summary: string | null;
  occurredAt: string;
}

export async function listAuditLog(
  filter: { type?: string; since?: string; projectId?: string },
  paging: { page: number; size: number },
): Promise<{ items: AuditEntry[]; page: number; size: number; total: number }> {
  const query = searchParams({
    type: filter.type,
    since: filter.since,
    projectId: filter.projectId ? toBackendId(filter.projectId).toString() : undefined,
    page: String(paging.page),
    size: String(paging.size),
  });
  const dto = (await json(await sharedApiFetch(`/api/alm/admin/audit?${query}`))) as {
    items: AuditDto[];
    page: number;
    size: number;
    total: number;
  };
  return {
    items: dto.items.map((row) => ({
      id: String(row.id),
      eventType: row.eventType,
      actorId: String(row.actorId),
      projectId: row.projectId === null ? null : String(row.projectId),
      targetKey: row.targetKey,
      summary: row.summary,
      at: row.occurredAt,
    })),
    page: dto.page,
    size: dto.size,
    total: dto.total,
  };
}

export async function systemStats(): Promise<SystemStats> {
  return (await json(await sharedApiFetch("/api/alm/admin/stats"))) as SystemStats;
}

// ── 설정 — 서버 V11(레지스트리·스킴·프로젝트 설정). 목업 스토어와 같은 시그니처 ──

interface SchemeDto {
  id: string;
  name: string;
  isDefault: boolean;
  body: SettingsBody;
}

interface ResolvedDto {
  body: SettingsBody;
  source: "scheme" | "custom";
  scheme: SchemeDto;
}

export interface ResolvedSettings {
  body: SettingsBody;
  source: "scheme" | "custom";
  scheme: SettingsScheme;
}

const mapScheme = (dto: SchemeDto): SettingsScheme => ({
  id: dto.id,
  name: dto.name,
  isDefault: dto.isDefault,
  body: dto.body,
});
const mapResolved = (dto: ResolvedDto): ResolvedSettings => ({
  body: dto.body,
  source: dto.source,
  scheme: mapScheme(dto.scheme),
});
const jsonBody = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const postJson = (body: unknown): RequestInit => ({ ...jsonBody(body), method: "POST" });

export async function listSchemes(): Promise<SettingsScheme[]> {
  const rows = (await json(await sharedApiFetch("/api/alm/settings/schemes"))) as SchemeDto[];
  return rows.map(mapScheme);
}

export async function countSchemeProjects(schemeId: string): Promise<number> {
  const dto = (await json(
    await sharedApiFetch(`/api/alm/settings/schemes/${encodeURIComponent(schemeId)}/projects/count`),
  )) as { count: number };
  return dto.count;
}

export async function createScheme(name: string): Promise<SettingsScheme> {
  return mapScheme((await json(await sharedApiFetch("/api/alm/settings/schemes", postJson({ name })))) as SchemeDto);
}

export async function updateScheme(
  id: string,
  patch: { name?: string; body?: SettingsBody },
): Promise<SettingsScheme> {
  return mapScheme(
    (await json(
      await sharedApiFetch(`/api/alm/settings/schemes/${encodeURIComponent(id)}`, jsonBody(patch)),
    )) as SchemeDto,
  );
}

export async function deleteScheme(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/schemes/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function setDefaultScheme(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/schemes/${encodeURIComponent(id)}/default`, { method: "POST" }));
}

export async function resolveSettings(projectId: string): Promise<ResolvedSettings> {
  return mapResolved(
    (await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings`))) as ResolvedDto,
  );
}

export async function listProjectStatuses(projectId: string): Promise<WorkflowStatus[]> {
  const resolved = await resolveSettings(projectId);
  return [...resolved.body.statuses].sort((a, b) => a.order - b.order);
}

/** projectId → (statusId → WorkflowStatus) — 접근 가능한 프로젝트 전부를 해석한다 */
export async function statusMetaByProject(): Promise<Record<string, Record<string, WorkflowStatus>>> {
  const projects = await listProjects();
  const entries = await Promise.all(
    projects.map(async (project) => {
      const statuses = await listProjectStatuses(project.id);
      return [project.id, Object.fromEntries(statuses.map((s) => [s.id, s]))] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function listAllStatuses(): Promise<{ id: string; name: string }[]> {
  return (await listStatusDefs()).map((d) => ({ id: d.id, name: d.name }));
}

export async function assignScheme(projectId: string, schemeId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/scheme`, jsonBody({ schemeId })));
}

export async function setProjectCustom(projectId: string, custom: boolean): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/custom`, jsonBody({ custom })));
}

export async function updateProjectCustomSettings(projectId: string, body: SettingsBody): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/custom-body`, jsonBody(body)));
}

// 상태 카테고리
export async function listStatusCategories(): Promise<StatusCategory[]> {
  return (await json(await sharedApiFetch("/api/alm/settings/categories"))) as StatusCategory[];
}

export async function createStatusCategory(input: {
  name: string;
  kind: StatusKind;
  color: StatusColor;
}): Promise<StatusCategory> {
  return (await json(await sharedApiFetch("/api/alm/settings/categories", postJson(input)))) as StatusCategory;
}

export async function updateStatusCategory(
  id: string,
  patch: Partial<Pick<StatusCategory, "name" | "kind" | "color">>,
): Promise<StatusCategory> {
  return (await json(
    await sharedApiFetch(`/api/alm/settings/categories/${encodeURIComponent(id)}`, jsonBody(patch)),
  )) as StatusCategory;
}

export async function moveStatusCategory(id: string, delta: -1 | 1): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/categories/${encodeURIComponent(id)}/move`, postJson({ delta })));
}

export async function deleteStatusCategory(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/categories/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// 상태 레지스트리
export async function listStatusDefs(): Promise<StatusDef[]> {
  return (await json(await sharedApiFetch("/api/alm/settings/statuses"))) as StatusDef[];
}

export async function statusDefUsage(): Promise<Record<string, number>> {
  return (await json(await sharedApiFetch("/api/alm/settings/statuses/usage"))) as Record<string, number>;
}

export async function createStatusDef(input: {
  name: string;
  categoryId: string;
  description?: string;
}): Promise<StatusDef> {
  return (await json(await sharedApiFetch("/api/alm/settings/statuses", postJson(input)))) as StatusDef;
}

export async function updateStatusDef(
  id: string,
  patch: Partial<Pick<StatusDef, "name" | "categoryId" | "description">>,
): Promise<StatusDef> {
  return (await json(
    await sharedApiFetch(`/api/alm/settings/statuses/${encodeURIComponent(id)}`, jsonBody(patch)),
  )) as StatusDef;
}

export async function deleteStatusDef(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/statuses/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// 이슈 타입 레지스트리
export const ISSUE_TYPES_CHANGED_EVENT = "alm:issue-types-changed";
const notifyIssueTypesChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ISSUE_TYPES_CHANGED_EVENT));
};

export async function listIssueTypes(): Promise<IssueTypeDef[]> {
  return (await json(await sharedApiFetch("/api/alm/settings/issue-types"))) as IssueTypeDef[];
}

export async function issueTypeUsage(): Promise<Record<string, number>> {
  return (await json(await sharedApiFetch("/api/alm/settings/issue-types/usage"))) as Record<string, number>;
}

export async function createIssueType(input: {
  name: string;
  level: IssueTypeLevel;
  icon: string;
  color: IssueTypeDef["color"];
  description?: string;
}): Promise<IssueTypeDef> {
  const created = (await json(await sharedApiFetch("/api/alm/settings/issue-types", postJson(input)))) as IssueTypeDef;
  notifyIssueTypesChanged();
  return created;
}

export async function updateIssueType(
  id: string,
  patch: Partial<Pick<IssueTypeDef, "name" | "icon" | "color" | "level" | "description">>,
): Promise<IssueTypeDef> {
  const updated = (await json(
    await sharedApiFetch(`/api/alm/settings/issue-types/${encodeURIComponent(id)}`, jsonBody(patch)),
  )) as IssueTypeDef;
  notifyIssueTypesChanged();
  return updated;
}

export async function moveIssueType(id: string, delta: -1 | 1): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/issue-types/${encodeURIComponent(id)}/move`, postJson({ delta })));
  notifyIssueTypesChanged();
}

export async function deleteIssueType(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/issue-types/${encodeURIComponent(id)}`, { method: "DELETE" }));
  notifyIssueTypesChanged();
}

// ── 사용자 — 디렉터리 서비스가 아직 없다. 현재 사용자는 /api/me, 목록은 현재 사용자뿐 ──

let cachedMe: User | null = null;

/** JWT sub가 사용자 id(서버의 actorId/assigneeId와 같은 숫자 문자열) */
export async function getCurrentUser(): Promise<User> {
  if (cachedMe) return cachedMe;
  const me = await sharedAuthClient.fetchMe();
  cachedMe = { id: me.sub ?? me.email, name: me.name ?? me.email };
  return cachedMe;
}


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

export async function addComment(issueId: string, body: string): Promise<Comment> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return mapComment(await json(response));
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const response = await sharedApiFetch(`/api/alm/comments/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
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

export async function setIssueParent(id: string, parentId: string | null): Promise<Issue> {
  return updateIssue(id, { parentId });
}

/** 서버 검색으로 자식을 찾는다 — 키 오름차순 */
export async function listChildren(issueId: string): Promise<Issue[]> {
  const query = searchParams({
    parentId: toBackendId(issueId).toString(),
    sort: "key",
    dir: "asc",
    size: "200",
  });
  const dto = await json<IssuePageDto>(await sharedApiFetch(`/api/alm/issues/search?${query}`));
  return dto.items.map((row, index) => mapIssue(row, index + 1));
}

/** 링크·부모 선택기용 텍스트 검색 — 접근 가능한 모든 프로젝트 */
export async function searchIssues(text: string, limit = 20): Promise<Issue[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const query = searchParams({ text: trimmed, sort: "updated", dir: "desc", size: String(limit) });
  const dto = await json<IssuePageDto>(await sharedApiFetch(`/api/alm/issues/search?${query}`));
  return dto.items.map((row, index) => mapIssue(row, index + 1));
}

/** 버전 진행률 — fixVersion 검색 결과를 프로젝트 상태 카테고리(complete)로 센다 */
export async function versionProgress(
  id: string,
): Promise<{ total: number; done: number; percent: number }> {
  const query = searchParams({ fixVersionId: toBackendId(id).toString(), size: "200" });
  const [dto, meta] = await Promise.all([
    json<IssuePageDto>(await sharedApiFetch(`/api/alm/issues/search?${query}`)),
    statusMetaByProject(),
  ]);
  const issues = dto.items.map((row, index) => mapIssue(row, index + 1));
  const done = issues.filter((issue) => meta[issue.projectId]?.[issue.status]?.kind === "complete").length;
  const total = issues.length;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
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

export async function updateBoard(
  id: string,
  patch: Partial<Pick<Board, "name" | "filter" | "columns" | "swimlane" | "isDefault">>,
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

// ── 사용자 디렉터리·프로젝트 멤버 — org-service REST(게이트웨이 `/api/org/**`). 권한의 진실은 org-service ──

interface OrgMemberDto {
  id: number;
  displayName: string;
  email?: string | null;
  status: string;
}

interface OrgGrantDto {
  id: number;
  subjectType: "USER" | "TEAM";
  subjectId: number;
  resourceType: string;
  resourceId: string | null;
  role: "VIEWER" | "EDITOR" | "ADMIN";
}

const ROLE_FROM_ORG: Record<OrgGrantDto["role"], ProjectRole> = { VIEWER: "viewer", EDITOR: "editor", ADMIN: "admin" };
const ROLE_TO_ORG: Record<ProjectRole, OrgGrantDto["role"]> = { viewer: "VIEWER", editor: "EDITOR", admin: "ADMIN" };
const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

/** ACTIVE 멤버만 — 비활성 계정은 담당자·멤버 선택 UI에 나오면 안 된다 */
export async function listUsers(): Promise<User[]> {
  const rows = await json<OrgMemberDto[]>(await sharedApiFetch("/api/org/members"));
  return rows.filter((m) => m.status === "ACTIVE").map((m) => ({ id: String(m.id), name: m.displayName }));
}

/** org-service는 grant 목록을 그 리소스의 ADMIN(또는 전역 관리자)에게만 연다 */
async function projectGrants(projectId: string): Promise<OrgGrantDto[]> {
  const response = await sharedApiFetch(
    `/api/org/grants?resourceType=PROJECT&resourceId=${toBackendId(projectId)}`,
  );
  if (response.status === 403) throw new Error("멤버 목록은 프로젝트 관리자만 볼 수 있습니다");
  const rows = await json<OrgGrantDto[]>(response);
  return rows.filter((g) => g.subjectType === "USER");
}

/** 역할 높은 순 → 이름순. 팀 grant는 개인 멤버 목록에 넣지 않는다(목업과 같은 모양) */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberView[]> {
  const [grants, users] = await Promise.all([projectGrants(projectId), listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return grants
    .map((g) => ({
      user: { id: String(g.subjectId), name: names.get(String(g.subjectId)) ?? `사용자 ${g.subjectId}` },
      role: ROLE_FROM_ORG[g.role],
    }))
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.user.name.localeCompare(b.user.name));
}

async function createProjectGrant(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  await json(
    await sharedApiFetch("/api/org/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectType: "USER",
        subjectId: toBackendId(userId),
        resourceType: "PROJECT",
        resourceId: String(toBackendId(projectId)),
        role: ROLE_TO_ORG[role],
      }),
    }),
  );
}

export async function addProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  await createProjectGrant(projectId, userId, role);
}

function requireGrant(grants: OrgGrantDto[], userId: string): OrgGrantDto {
  const grant = grants.find((g) => String(g.subjectId) === userId);
  if (!grant) throw new Error("프로젝트 멤버가 아닙니다");
  return grant;
}

function assertNotLastAdmin(grants: OrgGrantDto[], userId: string): void {
  const otherAdmin = grants.some((g) => g.role === "ADMIN" && String(g.subjectId) !== userId);
  if (!otherAdmin) throw new Error("프로젝트에는 관리자가 최소 한 명 필요합니다");
}

/** org-service grant는 역할 수정이 없다 — 기존 grant를 지우고 새 역할로 다시 만든다 */
export async function updateProjectMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  const grants = await projectGrants(projectId);
  const current = requireGrant(grants, userId);
  if (ROLE_FROM_ORG[current.role] === role) return;
  if (current.role === "ADMIN" && role !== "admin") assertNotLastAdmin(grants, userId);
  await json(await sharedApiFetch(`/api/org/grants/${current.id}`, { method: "DELETE" }));
  await createProjectGrant(projectId, userId, role);
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const grants = await projectGrants(projectId);
  const current = requireGrant(grants, userId);
  if (current.role === "ADMIN") assertNotLastAdmin(grants, userId);
  await json(await sharedApiFetch(`/api/org/grants/${current.id}`, { method: "DELETE" }));
}

/** 내 역할 — PROJECT grant, 없으면 GLOBAL ADMIN, 그것도 없으면 null(멤버 아님) */
export async function getMyProjectRole(projectId: string): Promise<ProjectRole | null> {
  const rows = await json<{ resourceType: string; resourceId: string | null; role: OrgGrantDto["role"] }[]>(
    await sharedApiFetch("/api/org/me/permissions"),
  );
  const resourceId = String(toBackendId(projectId));
  const mine = rows.filter((g) => g.resourceType === "PROJECT" && g.resourceId === resourceId);
  if (mine.length > 0) {
    return mine.map((g) => ROLE_FROM_ORG[g.role]).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0];
  }
  if (rows.some((g) => g.resourceType === "GLOBAL" && g.role === "ADMIN")) return "admin";
  return null;
}
