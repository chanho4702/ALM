// alm-backend Project/Issue/Sprint REST 계약 어댑터.
// 서버가 아직 저장하지 않는 ALM 확장 필드는 조용히 유실시키지 않고 명시적으로 거부한다.
import { getTemplate, type ProjectTemplateId } from "./projectTemplates";
import { sharedApiFetch } from "./apiClient";
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
} from "./types";

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

function filterIssues(issues: Issue[], filter?: IssueFilter): Issue[] {
  if (!filter) return issues;
  let result = issues;
  if (filter.text) {
    const text = filter.text.toLowerCase();
    result = result.filter(
      (issue) =>
        issue.title.toLowerCase().includes(text) ||
        issue.key.toLowerCase().includes(text) ||
        issue.description.toLowerCase().includes(text),
    );
  }
  if (filter.status) result = result.filter((issue) => issue.status === filter.status);
  if (filter.priority) result = result.filter((issue) => issue.priority === filter.priority);
  if (filter.assigneeId) result = result.filter((issue) => issue.assigneeId === filter.assigneeId);
  if (filter.label) result = result.filter((issue) => issue.labels.includes(filter.label!));
  if (filter.type) result = result.filter((issue) => issue.type === filter.type);
  return result;
}

export async function listIssues(projectId: string, filter?: IssueFilter): Promise<Issue[]> {
  const rows = await json<IssueDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/issues`),
  );
  return filterIssues(rows.map((row, index) => mapIssue(row, index + 1)), filter);
}

/** 백엔드에 key 단건 조회가 생기기 전까지 접근 가능한 프로젝트를 순회한다. */
export async function getIssueByKey(key: string): Promise<Issue | null> {
  const normalized = key.trim().toUpperCase();
  const projects = await listProjects();
  for (const project of projects) {
    const issue = (await listIssues(project.id)).find((candidate) => candidate.key === normalized);
    if (issue) return issue;
  }
  return null;
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

// ── CSV/이관 가져오기 — 서버는 키를 직접 발급하므로 키 보존은 서버 이관 API까지 목업 전용 ──

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
  let created = 0;
  const failed: ImportResult["failed"] = [];
  for (const [index, input] of inputs.entries()) {
    try {
      if (input.key) throw new Error("서버는 아직 키 보존 가져오기를 지원하지 않습니다");
      const { estimateHours, key: _key, ...rest } = input;
      const issue = await createIssue({ projectId, ...rest });
      if (estimateHours !== undefined && estimateHours !== null) {
        await updateIssue(issue.id, { estimateHours });
      }
      created += 1;
    } catch (error) {
      failed.push({
        row: index + 1,
        title: input.key ?? input.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { created, failed };
}
