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
  PriorityDef,
  LinkTypeDef,
  Component,
  ComponentDefaultAssignee,
  Dashboard,
  DashboardGadget,
  ProjectWorklogRow,
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
  ProjectShortcut,
  UserPreferences,
  UserPreferencesPatch,
  AnnouncementBanner,
} from "./types";
import type { IssueLinkView, ProjectMemberView, ProjectPatch } from "./jiraMock";
import {
  assertAvatarFile,
  notifyAvatarChanged,
  DEFAULT_PREFERENCES,
  LINK_TYPES_CHANGED_EVENT,
  PRIORITIES_CHANGED_EVENT,
} from "./jiraMock";
import { extractMentionIds, newMentionIds } from "./richText";
import { seedDemoProject, type SampleDataApi } from "./sampleData";

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
  const response = await sharedApiFetch("/api/alm/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: input.key.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
    }),
  });
  const project = mapProject(await json(response));
  await applyTemplate(project.id, template);
  // 데모 템플릿은 공용 시더(목업과 같은 코드)가 채운다 — 낙관적 락 충돌을 피하려 전부 순차다
  if (template.richSeed) await seedDemoProject(project, sampleDataApi());
  return project;
}

/**
 * 공용 시더(`sampleData.ts`)에 넘길 REST 함수 묶음. 이 객체가 타입 체크를 통과한다는 것이
 * "시더가 부르는 스토어 함수를 REST 어댑터가 전부 갖고 있다"는 계약 검증이다.
 */
function sampleDataApi(): SampleDataApi {
  return {
    listUsers,
    createComponent,
    createVersion,
    releaseVersion,
    createSprint,
    updateSprint,
    startSprint,
    completeSprint,
    createIssue,
    addIssueLink,
    addComment,
    addWorklog,
    archiveIssue,
    createDashboard,
  };
}

/**
 * 템플릿은 서버 개념이 아니라 프론트 합성이다(목업과 같은 순서): 서버가 만든 기본 보드를 템플릿 보드로
 * 바꾸고 → Sprint 1 → 샘플 이슈를 정상 경로(createIssue)로 만든다. 도중 실패하면 프로젝트는 남고
 * 에러가 화면에 오른다 — 반쯤 적용된 템플릿은 설정 화면에서 손볼 수 있다.
 */
async function applyTemplate(projectId: string, template: ReturnType<typeof getTemplate>): Promise<void> {
  if (template.board) {
    const boards = await listBoards(projectId);
    const target = boards.find((b) => b.isDefault) ?? boards[0];
    if (target) {
      await updateBoard(target.id, {
        name: template.board.name,
        type: template.board.type,
        columns: template.board.columns.map((c) => ({ ...c })),
        filter: {
          assigneeIds: [...template.board.filter.assigneeIds],
          types: [...template.board.filter.types],
          labels: [...template.board.filter.labels],
        },
      });
    }
  }
  if (template.withSprint) await createSprint(projectId);
  for (const sample of template.samples) {
    await createIssue({
      projectId,
      title: sample.title,
      type: sample.type,
      status: sample.status,
      labels: sample.labels,
    });
  }
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  const current = await projectDto(id);
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: (patch.name ?? current.name).trim(),
      description: (patch.description ?? current.description ?? "").trim(),
      category: patch.category,
      leadId: patch.leadId ? toBackendId(patch.leadId) : undefined,
      clearLead: patch.leadId === null ? true : undefined,
      defaultAssignee: patch.defaultAssignee,
      icon: patch.icon,
      color: patch.color,
      url: patch.url,
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
  componentId?: string;
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
    componentIds: filter?.componentId ? toBackendId(filter.componentId).toString() : undefined,
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
  componentIds?: string[];
  fixVersionId?: string | null;
  estimateHours?: number | null;
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
        componentIds: patch.componentIds === undefined ? (current.componentIds ?? []) : patch.componentIds.map(toBackendId),
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
      mentionedUserIds:
        patch.description === undefined
          ? []
          : newMentionIds(current.description ?? "", patch.description ?? "").filter((id) => /^\d+$/.test(id)).map(Number),
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
 * 무엇을 완료로 볼지는 서버가 워크플로 의미(complete)로 판단한다. 완료가 아닌 이슈는 백로그(또는 지정 스프린트)로 돌아간다.
 */
export async function completeSprint(
  id: string,
  options: { moveUnfinishedTo?: string | null } = {},
): Promise<Sprint> {
  // 완료 판정(doneStatuses)은 보내지 않는다 — V11부터 서버가 워크플로 의미(complete)로 스스로 판단한다.
  // 목업과 같은 시그니처라 화면(백로그·보드·릴리스)이 어댑터를 구분하지 않는다.
  const target = options.moveUnfinishedTo ?? null;
  const response = await sharedApiFetch(`/api/alm/sprints/${toBackendId(id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 대상이 없으면 필드를 빼서 서버 기본값(백로그)에 맡긴다.
    body: JSON.stringify(target === null ? {} : { moveUnfinishedToSprintId: toBackendId(target) }),
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

/** 대상이 없으면 미해결 이슈는 그대로 둔다. */
export async function releaseVersion(
  id: string,
  options: { moveUnresolvedTo?: string | null } = {},
): Promise<ProjectVersion> {
  // 완료 판정은 서버가 워크플로 의미로 한다(스프린트 완료와 같은 규칙) — 목업과 같은 시그니처
  const target = options.moveUnresolvedTo ?? null;
  const response = await sharedApiFetch(`/api/alm/versions/${toBackendId(id)}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target === null ? {} : { moveUnresolvedToVersionId: toBackendId(target) }),
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
  type: "ASSIGNED" | "STATUS_CHANGED" | "COMMENTED" | "MENTIONED";
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
    case "MENTIONED":
      return `${actor} 님이 ${dto.issueKey}에서 나를 멘션했습니다`;
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

// `icon`(lucide 키, V20)은 그대로 실어 보내고 응답에서도 그대로 받는다 — 매핑 없음
export async function createStatusDef(input: {
  name: string;
  categoryId: string;
  description?: string;
  icon?: string;
}): Promise<StatusDef> {
  return (await json(await sharedApiFetch("/api/alm/settings/statuses", postJson(input)))) as StatusDef;
}

export async function updateStatusDef(
  id: string,
  patch: Partial<Pick<StatusDef, "name" | "categoryId" | "description" | "icon">>,
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

// ── 대시보드 · 프로젝트 워크로그 (서버 V18) ──

interface DashboardDto {
  id: number;
  ownerId: number;
  name: string;
  shared: boolean;
  gadgets: DashboardGadget[] | null;
  createdAt: string;
  updatedAt: string;
}

function mapDashboard(dto: DashboardDto): Dashboard {
  return {
    id: String(dto.id),
    ownerId: String(dto.ownerId),
    name: dto.name,
    shared: dto.shared,
    gadgets: dto.gadgets ?? [],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export async function listDashboards(): Promise<Dashboard[]> {
  return (await json<DashboardDto[]>(await sharedApiFetch("/api/alm/dashboards"))).map(mapDashboard);
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  const response = await sharedApiFetch(`/api/alm/dashboards/${toBackendId(id)}`);
  if (response.status === 404) return null;
  return mapDashboard(await json(response));
}

export async function createDashboard(input: { name: string; shared?: boolean; gadgets?: DashboardGadget[] }): Promise<Dashboard> {
  return mapDashboard(await json(await sharedApiFetch("/api/alm/dashboards", postJson({
    name: input.name,
    shared: input.shared ?? false,
    gadgets: input.gadgets ?? [],
  }))));
}

export async function updateDashboard(
  id: string,
  patch: { name?: string; shared?: boolean; gadgets?: DashboardGadget[] },
): Promise<Dashboard> {
  return mapDashboard(await json(await sharedApiFetch(`/api/alm/dashboards/${toBackendId(id)}`, jsonBody(patch))));
}

export async function deleteDashboard(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/dashboards/${toBackendId(id)}`, { method: "DELETE" }));
}

interface ProjectWorklogDto {
  id: number;
  issueId: number;
  issueKey: string;
  authorId: number;
  hours: number;
  comment: string | null;
  workedOn: string;
}

export async function listProjectWorklogs(
  projectId: string,
  range: { since?: string; until?: string } = {},
): Promise<ProjectWorklogRow[]> {
  const query = searchParams({ since: range.since, until: range.until });
  const rows = await json<ProjectWorklogDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/worklogs${query ? `?${query}` : ""}`),
  );
  return rows.map((r) => ({
    id: String(r.id),
    issueId: String(r.issueId),
    issueKey: r.issueKey,
    authorId: String(r.authorId),
    hours: Number(r.hours),
    comment: r.comment ?? "",
    workedOn: r.workedOn,
  }));
}

// ── 컴포넌트 (서버 V17) ──

interface ComponentDto {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  leadId: number | null;
  defaultAssignee: string;
  issueCount: number;
  createdAt: string;
}

function mapComponent(dto: ComponentDto): Component {
  return {
    id: String(dto.id),
    projectId: String(dto.projectId),
    name: dto.name,
    description: dto.description ?? "",
    leadId: dto.leadId == null ? null : String(dto.leadId),
    defaultAssignee: dto.defaultAssignee === "lead" || dto.defaultAssignee === "unassigned" ? dto.defaultAssignee : "project",
    issueCount: dto.issueCount ?? 0,
    createdAt: dto.createdAt,
  };
}

export async function listComponents(projectId: string): Promise<Component[]> {
  const rows = await json<ComponentDto[]>(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/components`));
  return rows.map(mapComponent);
}

export async function createComponent(
  projectId: string,
  input: { name: string; description?: string; leadId?: string | null; defaultAssignee?: ComponentDefaultAssignee },
): Promise<Component> {
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/components`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? "",
      leadId: input.leadId ? toBackendId(input.leadId) : null,
      defaultAssignee: input.defaultAssignee ?? "project",
    }),
  });
  return mapComponent(await json(response));
}

export async function updateComponent(
  id: string,
  patch: Partial<Pick<Component, "name" | "description" | "leadId" | "defaultAssignee">>,
): Promise<Component> {
  const response = await sharedApiFetch(`/api/alm/components/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: patch.name,
      description: patch.description,
      leadId: patch.leadId ? toBackendId(patch.leadId) : undefined,
      clearLead: patch.leadId === null ? true : undefined,
      defaultAssignee: patch.defaultAssignee,
    }),
  });
  return mapComponent(await json(response));
}

export async function deleteComponent(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/components/${toBackendId(id)}`, { method: "DELETE" }));
}

// ── 보관 · 휴지통 (서버 V16) ──

export async function archiveIssue(id: string): Promise<Issue> {
  return mapIssue(await json<IssueDto>(await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}/archive`, { method: "POST" })));
}

export async function restoreIssue(id: string): Promise<Issue> {
  return mapIssue(await json<IssueDto>(await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}/restore`, { method: "POST" })));
}

export async function listArchivedIssues(projectId: string): Promise<Issue[]> {
  const rows = await json<IssueDto[]>(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/issues/archived`));
  return rows.map((row, index) => mapIssue(row, index + 1));
}

export async function archiveProject(id: string): Promise<Project> {
  return mapProject(await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}/archive`, { method: "POST" })));
}

export async function unarchiveProject(id: string): Promise<Project> {
  return mapProject(await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}/unarchive`, { method: "POST" })));
}

export async function listTrashedProjects(): Promise<Project[]> {
  const rows = await json<ProjectDto[]>(await sharedApiFetch("/api/alm/projects/trash"));
  return rows.map(mapProject);
}

export async function restoreProject(id: string): Promise<Project> {
  return mapProject(await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}/restore`, { method: "POST" })));
}

export async function purgeProject(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}/permanent`, { method: "DELETE" }));
}

// ── 링크 타입 레지스트리 (서버 V15) ──

function notifyLinkTypesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LINK_TYPES_CHANGED_EVENT));
}

export async function listLinkTypes(): Promise<LinkTypeDef[]> {
  return (await json(await sharedApiFetch("/api/alm/settings/link-types"))) as LinkTypeDef[];
}

export async function linkTypeUsage(): Promise<Record<string, number>> {
  return (await json(await sharedApiFetch("/api/alm/settings/link-types/usage"))) as Record<string, number>;
}

export async function createLinkType(input: { name: string; outward: string; inward: string }): Promise<LinkTypeDef> {
  const created = (await json(await sharedApiFetch("/api/alm/settings/link-types", postJson(input)))) as LinkTypeDef;
  notifyLinkTypesChanged();
  return created;
}

export async function updateLinkType(
  id: string,
  patch: Partial<Pick<LinkTypeDef, "name" | "outward" | "inward">>,
): Promise<LinkTypeDef> {
  const updated = (await json(
    await sharedApiFetch(`/api/alm/settings/link-types/${encodeURIComponent(id)}`, jsonBody(patch)),
  )) as LinkTypeDef;
  notifyLinkTypesChanged();
  return updated;
}

export async function moveLinkType(id: string, delta: -1 | 1): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/link-types/${encodeURIComponent(id)}/move`, postJson({ delta })));
  notifyLinkTypesChanged();
}

export async function deleteLinkType(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/link-types/${encodeURIComponent(id)}`, { method: "DELETE" }));
  notifyLinkTypesChanged();
}

// ── 우선순위 레지스트리 (서버 V14) ──

function notifyPrioritiesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PRIORITIES_CHANGED_EVENT));
}

export async function listPriorities(): Promise<PriorityDef[]> {
  return (await json(await sharedApiFetch("/api/alm/settings/priorities"))) as PriorityDef[];
}

export async function priorityUsage(): Promise<Record<string, number>> {
  return (await json(await sharedApiFetch("/api/alm/settings/priorities/usage"))) as Record<string, number>;
}

export async function createPriority(input: {
  name: string;
  icon: string;
  color: PriorityDef["color"];
  description?: string;
}): Promise<PriorityDef> {
  const created = (await json(await sharedApiFetch("/api/alm/settings/priorities", postJson(input)))) as PriorityDef;
  notifyPrioritiesChanged();
  return created;
}

export async function updatePriority(
  id: string,
  patch: Partial<Pick<PriorityDef, "name" | "icon" | "color" | "description">>,
): Promise<PriorityDef> {
  const updated = (await json(
    await sharedApiFetch(`/api/alm/settings/priorities/${encodeURIComponent(id)}`, jsonBody(patch)),
  )) as PriorityDef;
  notifyPrioritiesChanged();
  return updated;
}

export async function movePriority(id: string, delta: -1 | 1): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/priorities/${encodeURIComponent(id)}/move`, postJson({ delta })));
  notifyPrioritiesChanged();
}

export async function deletePriority(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/settings/priorities/${encodeURIComponent(id)}`, { method: "DELETE" }));
  notifyPrioritiesChanged();
}

// ── 사용자 — 디렉터리 서비스가 아직 없다. 현재 사용자는 /api/me, 목록은 현재 사용자뿐 ──

let cachedMe: User | null = null;

/** JWT sub가 사용자 id(서버의 actorId/assigneeId와 같은 숫자 문자열). 아바타는 캐시하지 않는다 */
export async function getCurrentUser(): Promise<User> {
  if (!cachedMe) {
    const me = await sharedAuthClient.fetchMe();
    cachedMe = { id: me.sub ?? me.email, name: me.name ?? me.email };
  }
  return { ...cachedMe, avatarUrl: await myAvatarObjectUrl() };
}

// ── 프로필 사진 (아바타 — org-service V7 `member_profile`) ───────────────────────────
//
// 아바타는 ALM이 아니라 **org-service**가 가진다(위키·보드도 같은 사진을 본다). 경로는
// `PUT/DELETE /api/org/me/avatar`(내 사진), `GET /api/org/members/{id}/avatar`(바이트)이고
// 사용자 목록(`GET /api/org/members`)·내 프로필(`GET /api/org/me`)이 `avatarUrl`을 함께 준다 —
// ALM 전용 `/api/alm/users/avatars` 병합은 없다.
//
// 바이트는 **Bearer 토큰이 필요해 `<img src="/api/...">`로 직접 열 수 없다.** 인증은 메모리
// access token이고(`auth/client.ts`) 쿠키는 refresh 전용이라 브라우저가 `<img>` 요청에
// Authorization 헤더를 붙이지 않는다 — 첨부 내려받기와 같은 제약이다. 그래서 fetch로 받아
// object URL로 바꾸고 캐시한다.
//
// 경로는 **서버가 준 `avatarUrl`을 그대로 쓴다**(프론트가 조립하지 않는다). 그 문자열에 버전이
// 들어 있어 사진이 바뀌면 경로가 달라지고, 그때 이전 object URL을 revoke하고 새로 받는다.
// 바이트 응답에 `Cache-Control: private, max-age=300`이 붙어 있어 브라우저 HTTP 캐시도 함께 탄다.

/** 서버 상한 — 목업(200KB)과 달리 오브젝트 스토리지라 2MB까지 받는다(경계 포함) */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** memberId → { 서버가 준 경로, 표시용 object URL } */
const avatarUrls = new Map<string, { path: string; url: string }>();

/**
 * `/api/org/me` 응답은 **캐시하지 않는다** — 캐시하면 내가 다른 탭에서 바꾼 사진이 영원히
 * 안 보인다. 대신 진행 중인 요청만 합쳐(in-flight dedup) 한 번의 화면 로드에서 여러 번 부르지
 * 않게 한다. 비싼 쪽은 바이트이고 그건 아래 `avatarUrls`가 경로 단위로 막는다.
 */
let myProfileInFlight: Promise<OrgMeDto | null> | null = null;

/** 이전 object URL을 브라우저에 돌려준다 — 사진 교체·삭제 때 쌓이지 않게 */
function releaseAvatar(userId: string): void {
  const entry = avatarUrls.get(userId);
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  avatarUrls.delete(userId);
}

/**
 * 테스트 전용: 모듈 캐시(현재 사용자·진행 중 프로필 요청·object URL)를 비운다.
 * 목업의 같은 이름 함수와 짝이며, 파사드는 테스트에서 항상 목업 쪽을 고른다.
 */
export function __resetForTest(): void {
  cachedMe = null;
  myProfileInFlight = null;
  for (const userId of [...avatarUrls.keys()]) releaseAvatar(userId);
}

/**
 * 아바타 경로를 담은 org-service 응답 조각 — `/api/org/members` 행, `/api/org/me`,
 * `PUT /api/org/me/avatar` 응답이 모두 이 모양을 포함한다.
 */
interface OrgAvatarFields {
  /** 바이트 경로(`/api/org/members/{id}/avatar?v=…`). 서버가 만든 것을 그대로 쓴다 */
  avatarUrl?: string | null;
  /** ISO-8601. 목록·프로필 응답의 이름 */
  avatarUpdatedAt?: string | null;
  /** ISO-8601. 업로드 응답(`{memberId, avatarUrl, updatedAt}`)의 이름 */
  updatedAt?: string | null;
}

/** `GET /api/org/me` — 목록에 나 자신이 없을 수도 있어 별도 경로로 읽는다 */
interface OrgMeDto extends OrgAvatarFields {
  id: number | string;
  displayName?: string | null;
  email?: string | null;
}

/** `PUT /api/org/me/avatar` 응답 */
interface AvatarUploadDto extends OrgAvatarFields {
  memberId: number | string;
}

/** 사진이 없으면 null — 서버가 경로를 안 줄 때만 시각으로 조립한다(`?v`는 캐시버스터) */
function avatarPathOf(memberId: string, row: OrgAvatarFields): string | null {
  if (row.avatarUrl) return row.avatarUrl;
  const updatedAt = row.avatarUpdatedAt ?? row.updatedAt;
  if (!updatedAt) return null;
  return `/api/org/members/${encodeURIComponent(memberId)}/avatar?v=${encodeURIComponent(updatedAt)}`;
}

function myProfile(): Promise<OrgMeDto | null> {
  if (myProfileInFlight) return myProfileInFlight;
  myProfileInFlight = (async () => {
    try {
      return await json<OrgMeDto>(await sharedApiFetch("/api/org/me"));
    } catch {
      // 아바타는 부가 정보다 — 프로필 조회가 실패해도 화면은 이니셜로 그린다
      return null;
    } finally {
      myProfileInFlight = null;
    }
  })();
  return myProfileInFlight;
}

async function avatarObjectUrl(userId: string, path: string): Promise<string | null> {
  const cached = avatarUrls.get(userId);
  if (cached?.path === path) return cached.url;
  releaseAvatar(userId); // 사진이 바뀌었다
  try {
    const response = await sharedApiFetch(path);
    // 목록에 있던 사용자가 404면 그 사이 지워진 경합이다 — 조용히 이니셜로 떨어진다
    if (!response.ok) return null;
    const url = URL.createObjectURL(await response.blob());
    avatarUrls.set(userId, { path, url });
    return url;
  } catch {
    return null;
  }
}

/** 사용자 하나에 표시용 avatarUrl을 채운다 — 사진이 있는 사람만 바이트를 받는다 */
async function withAvatar(user: User, path: string | null): Promise<User> {
  if (!path) {
    releaseAvatar(user.id); // 사진이 지워졌다
    return { ...user, avatarUrl: null };
  }
  return { ...user, avatarUrl: await avatarObjectUrl(user.id, path) };
}

/** 내 사진의 표시용 object URL — 없으면 null. 식별은 `/api/org/me`가 준 id를 쓴다 */
async function myAvatarObjectUrl(): Promise<string | null> {
  const profile = await myProfile();
  if (!profile) return null;
  const memberId = String(profile.id);
  const path = avatarPathOf(memberId, profile);
  if (!path) {
    releaseAvatar(memberId);
    return null;
  }
  return avatarObjectUrl(memberId, path);
}

/**
 * multipart PUT — Content-Type은 브라우저가 boundary와 함께 붙이므로 직접 쓰지 않는다.
 * 사전 검증(`assertAvatarFile`)을 통과해도 서버가 매직 바이트로 거부할 수 있다(이름만 .png인
 * GIF·SVG 등) — 그 `{error}` 문구는 그대로 위로 던져 화면이 띄운다.
 */
export async function uploadMyAvatar(file: File): Promise<string> {
  assertAvatarFile(file, AVATAR_MAX_BYTES);
  const body = new FormData();
  body.append("file", file, file.name);
  const saved = await json<AvatarUploadDto | null>(
    await sharedApiFetch("/api/org/me/avatar", { method: "PUT", body }),
  );
  const userId = saved ? String(saved.memberId) : (await getCurrentUser()).id;
  releaseAvatar(userId);
  // 방금 올린 바이트는 이미 로컬에 있다 — 왕복 없이 미리보기를 만들고, 응답이 준 새 경로로
  // 캐시에 등록해 다음 목록 조회도 이 URL을 재사용한다(바이트를 두 번 받지 않는다).
  const url = URL.createObjectURL(file);
  // 응답 본문이 없어도(계약 밖 200) URL을 캐시에 등록해 둬야 다음 교체·삭제 때 revoke된다 — 누수 방지
  const path = (saved && avatarPathOf(userId, saved)) ?? `local:${Date.now()}`;
  avatarUrls.set(userId, { path, url });
  notifyAvatarChanged();
  return url;
}

export async function removeMyAvatar(): Promise<void> {
  await json(await sharedApiFetch("/api/org/me/avatar", { method: "DELETE" }));
  // 캐시된 object URL은 다음 조회에서 withAvatar가 놓아준다(경로가 사라지므로)
  notifyAvatarChanged();
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

/** 본문의 멘션 id → 서버 숫자 id(모르는 형식은 버린다) */
function mentionIdsForServer(html: string): number[] {
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

// ── 사용자 디렉터리·프로젝트 멤버 — org-service REST(게이트웨이 `/api/org/**`). 권한의 진실은 org-service ──

interface OrgMemberDto extends OrgAvatarFields {
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

/**
 * ACTIVE 멤버만 — 비활성 계정은 담당자·멤버 선택 UI에 나오면 안 된다.
 * 아바타 경로는 org-service가 목록 행에 함께 준다(별도 병합 호출 없음).
 */
export async function listUsers(): Promise<User[]> {
  const rows = await json<OrgMemberDto[]>(await sharedApiFetch("/api/org/members"));
  return Promise.all(
    rows
      .filter((m) => m.status === "ACTIVE")
      .map((m) => {
        const id = String(m.id);
        return withAvatar({ id, name: m.displayName }, avatarPathOf(id, m));
      }),
  );
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
  const directory = new Map(users.map((u) => [u.id, u]));
  return grants
    .map((g) => ({
      user: directory.get(String(g.subjectId)) ?? {
        id: String(g.subjectId),
        name: `사용자 ${g.subjectId}`,
        avatarUrl: null,
      },
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

// ── 개인 설정 · 바로 가기 · 공지 배너 (서버 V13) ──

interface ShortcutDto {
  id: number;
  projectId: number;
  name: string;
  url: string;
  order: number;
  createdAt: string;
}

function mapShortcut(dto: ShortcutDto): ProjectShortcut {
  return {
    id: String(dto.id),
    projectId: String(dto.projectId),
    name: dto.name,
    url: dto.url,
    order: dto.order,
    createdAt: dto.createdAt,
  };
}

export async function listProjectShortcuts(projectId: string): Promise<ProjectShortcut[]> {
  const rows = await json<ShortcutDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/shortcuts`),
  );
  return rows.map(mapShortcut);
}

export async function addProjectShortcut(
  projectId: string,
  input: { name: string; url: string },
): Promise<ProjectShortcut> {
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/shortcuts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, url: input.url }),
  });
  return mapShortcut(await json(response));
}

export async function updateProjectShortcut(
  id: string,
  input: { name: string; url: string },
): Promise<ProjectShortcut> {
  const response = await sharedApiFetch(`/api/alm/shortcuts/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, url: input.url }),
  });
  return mapShortcut(await json(response));
}

export async function removeProjectShortcut(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/shortcuts/${toBackendId(id)}`, { method: "DELETE" }));
}

interface PreferenceDto {
  notifications?: Partial<UserPreferences["notifications"]> | null;
  autoWatch?: Partial<UserPreferences["autoWatch"]> | null;
  startPage?: string | null;
  emailEnabled?: boolean | null;
  /** 읽기 전용 — 요청에 실어도 서버가 무시한다 */
  mailConfigured?: boolean | null;
}

function mapPreferences(dto: PreferenceDto): UserPreferences {
  const startPage = dto.startPage;
  return {
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(dto.notifications ?? {}) },
    autoWatch: { ...DEFAULT_PREFERENCES.autoWatch, ...(dto.autoWatch ?? {}) },
    startPage:
      startPage === "projects" || startPage === "last-project" ? startPage : "home",
    emailEnabled: dto.emailEnabled === true,
    mailConfigured: dto.mailConfigured === true,
  };
}

/** 사진을 뺀 설정 문서 — 저장이 "현재 값 위에 패치"를 만들 때 쓴다(아바타 왕복 없음) */
async function fetchPreferences(): Promise<UserPreferences> {
  return mapPreferences(await json<PreferenceDto>(await sharedApiFetch("/api/alm/me/preferences")));
}

export async function getMyPreferences(): Promise<UserPreferences> {
  const prefs = await fetchPreferences();
  // 사진은 org-service가 가진다(`/api/org/me`) — 없으면 목업과 같은 shape(null)로 이니셜 표시
  prefs.avatarUrl = await myAvatarObjectUrl();
  return prefs;
}

/** 서버는 전체 문서를 받는다 — 현재 값 위에 패치를 얹어 보낸다 */
export async function saveMyPreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  const current = await fetchPreferences();
  const next: PreferenceDto = {
    notifications: { ...current.notifications, ...patch.notifications },
    autoWatch: { ...current.autoWatch, ...patch.autoWatch },
    startPage: patch.startPage ?? current.startPage,
    emailEnabled: patch.emailEnabled ?? current.emailEnabled,
  };
  const response = await sharedApiFetch("/api/alm/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  return mapPreferences(await json(response));
}

export async function getBanner(): Promise<AnnouncementBanner> {
  const dto = await json<Partial<AnnouncementBanner>>(await sharedApiFetch("/api/alm/banner"));
  return {
    enabled: dto.enabled === true,
    level: dto.level === "warning" ? "warning" : "info",
    message: dto.message ?? "",
  };
}

export async function saveBanner(banner: AnnouncementBanner): Promise<AnnouncementBanner> {
  const response = await sharedApiFetch("/api/alm/admin/banner", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(banner),
  });
  const dto = await json<Partial<AnnouncementBanner>>(response);
  return {
    enabled: dto.enabled === true,
    level: dto.level === "warning" ? "warning" : "info",
    message: dto.message ?? "",
  };
}
