// alm-backend REST 어댑터 — 플래그·추정 합계·속도(V30)·저장된 보기(V31)·트리아지(V35)
import type {
  EstimationSummary,
  Issue,
  SavedView,
  SavedViewInput,
  SavedViewPatch,
  TriageAcceptInput,
  TriageQueueState,
  TriageSettings,
  VelocityReport,
  VelocityUnit,
  ViewDisplay,
  ViewFilter,
} from "../types";
import { DEFAULT_VIEW_DISPLAY } from "../types";
import { type IssueDto, mapIssue, toApiIssuePriority, toBackendId } from "../mapping";
import { json, jsonBody, postJson, searchParams, sharedApiFetch, sharedGet } from "./http";

// ── 플래그 ───────────────────────────────────────────────────

/** `PUT /api/alm/issues/{id}/flag {flagged, comment?}` — 버전을 올리지 않는다 */
export async function setIssueFlag(issueId: string, flagged: boolean, comment?: string): Promise<Issue> {
  const reason = comment?.trim();
  const response = await sharedApiFetch(
    `/api/alm/issues/${toBackendId(issueId)}/flag`,
    jsonBody({ flagged, ...(reason ? { comment: reason } : {}) }),
  );
  return mapIssue(await json<IssueDto>(response));
}

// ── 추정 합계·속도 ───────────────────────────────────────────

const num = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? 0 : Number(value));

interface EstimationGroupDto {
  sprintId: number | null;
  name: string;
  state: "ACTIVE" | "PLANNED" | null;
  issueCount: number;
  completedCount?: number;
  storyPoints?: number | string | null;
  completedStoryPoints?: number | string | null;
  unestimatedCount?: number;
  estimateHours?: number | string | null;
  completedEstimateHours?: number | string | null;
}

export async function getEstimationSummary(projectId: string): Promise<EstimationSummary> {
  const dto = await sharedGet<{ projectId: number; groups: EstimationGroupDto[] | null }>(
    `/api/alm/projects/${toBackendId(projectId)}/estimation/summary`,
  );
  return {
    projectId: String(dto.projectId),
    groups: (dto.groups ?? []).map((g) => ({
      sprintId: g.sprintId === null ? null : String(g.sprintId),
      name: g.name,
      state: g.state === "ACTIVE" ? "active" : g.state === "PLANNED" ? "planned" : null,
      issueCount: g.issueCount ?? 0,
      completedCount: g.completedCount ?? 0,
      storyPoints: num(g.storyPoints),
      completedStoryPoints: num(g.completedStoryPoints),
      unestimatedCount: g.unestimatedCount ?? 0,
      estimateHours: num(g.estimateHours),
      completedEstimateHours: num(g.completedEstimateHours),
    })),
  };
}

interface VelocityDto {
  projectId: number;
  unit: VelocityUnit;
  average: number | string | null;
  sprints: { sprintId: number; name: string; completedAt: string | null; committed: number | string | null; completed: number | string | null }[] | null;
}

export async function getVelocity(projectId: string, unit: VelocityUnit = "points", limit = 7): Promise<VelocityReport> {
  const query = searchParams({ unit, limit: String(limit) });
  const dto = await sharedGet<VelocityDto>(`/api/alm/projects/${toBackendId(projectId)}/reports/velocity?${query}`);
  return {
    projectId: String(dto.projectId),
    unit: dto.unit ?? unit,
    average: dto.average === null || dto.average === undefined ? null : Number(dto.average),
    sprints: (dto.sprints ?? []).map((s) => ({
      sprintId: String(s.sprintId),
      name: s.name,
      completedAt: s.completedAt ?? null,
      committed: num(s.committed),
      completed: num(s.completed),
    })),
  };
}

// ── 저장된 보기 ──────────────────────────────────────────────

interface ViewDto {
  id: number;
  name: string;
  scope: "personal" | "project";
  projectId: number | null;
  ownerId: number;
  mine: boolean;
  canEdit: boolean;
  layout: "list" | "board";
  filter: ViewFilter | null;
  display: Partial<ViewDisplay> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function mapView(dto: ViewDto): SavedView {
  return {
    id: String(dto.id),
    name: dto.name,
    scope: dto.scope === "project" ? "project" : "personal",
    projectId: dto.projectId == null ? null : String(dto.projectId),
    ownerId: String(dto.ownerId),
    mine: Boolean(dto.mine),
    canEdit: Boolean(dto.canEdit),
    layout: dto.layout === "board" ? "board" : "list",
    filter: dto.filter ? { kind: dto.filter.kind === "aql" ? "aql" : "smart", query: dto.filter.query } : null,
    // 서버는 언제나 전부 채워 주지만, 빠진 항목이 있어도 화면이 기본값으로 그리게 한다
    display: { ...DEFAULT_VIEW_DISPLAY, ...(dto.display ?? {}), properties: [...(dto.display?.properties ?? DEFAULT_VIEW_DISPLAY.properties)] },
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export async function listMyViews(projectId?: string): Promise<SavedView[]> {
  const query = projectId ? `?${searchParams({ projectId: String(toBackendId(projectId)) })}` : "";
  return (await sharedGet<ViewDto[]>(`/api/alm/me/views${query}`)).map(mapView);
}

export async function listProjectViews(projectId: string): Promise<SavedView[]> {
  return (await sharedGet<ViewDto[]>(`/api/alm/projects/${toBackendId(projectId)}/views`)).map(mapView);
}

export async function getView(viewId: string): Promise<SavedView> {
  return mapView(await json<ViewDto>(await sharedApiFetch(`/api/alm/views/${toBackendId(viewId)}`)));
}

export async function createView(input: SavedViewInput): Promise<SavedView> {
  const body = {
    name: input.name,
    scope: input.scope ?? "personal",
    projectId: input.projectId ? toBackendId(input.projectId) : null,
    layout: input.layout ?? "list",
    filter: input.filter ?? null,
    display: input.display ?? null,
  };
  return mapView(await json<ViewDto>(await sharedApiFetch("/api/alm/views", postJson(body))));
}

/** 보낸 항목만 바뀐다 — `filter: null`은 `clearFilter: true`로 보낸다(서버는 null을 "그대로"로 읽는다) */
export async function updateView(viewId: string, patch: SavedViewPatch, expectedVersion: number): Promise<SavedView> {
  const body: Record<string, unknown> = { expectedVersion };
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.scope !== undefined) body.scope = patch.scope;
  if (patch.layout !== undefined) body.layout = patch.layout;
  if (patch.filter === null) body.clearFilter = true;
  else if (patch.filter !== undefined) body.filter = patch.filter;
  if (patch.display !== undefined) body.display = patch.display;
  return mapView(await json<ViewDto>(await sharedApiFetch(`/api/alm/views/${toBackendId(viewId)}`, jsonBody(body))));
}

export async function deleteView(viewId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/views/${toBackendId(viewId)}`, { method: "DELETE" }));
}

// ── 트리아지 ─────────────────────────────────────────────────

interface TriageSettingsDto {
  projectId: number;
  enabled: boolean;
  pending: number;
  snoozed: number;
}

const mapTriageSettings = (dto: TriageSettingsDto): TriageSettings => ({
  projectId: String(dto.projectId),
  enabled: Boolean(dto.enabled),
  pending: dto.pending ?? 0,
  snoozed: dto.snoozed ?? 0,
});

export async function getTriageSettings(projectId: string): Promise<TriageSettings> {
  return mapTriageSettings(await sharedGet<TriageSettingsDto>(`/api/alm/projects/${toBackendId(projectId)}/triage/settings`));
}

export async function saveTriageSettings(projectId: string, enabled: boolean): Promise<TriageSettings> {
  return mapTriageSettings(
    await json<TriageSettingsDto>(
      await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/triage/settings`, jsonBody({ enabled })),
    ),
  );
}

export async function listTriage(projectId: string, state: TriageQueueState = "pending"): Promise<Issue[]> {
  const rows = await sharedGet<IssueDto[]>(`/api/alm/projects/${toBackendId(projectId)}/triage?${searchParams({ state })}`);
  return rows.map((row, index) => mapIssue(row, index + 1));
}

async function triagePost(issueId: string, action: string, body?: unknown): Promise<Issue> {
  const path = `/api/alm/issues/${toBackendId(issueId)}/triage${action ? `/${action}` : ""}`;
  const init = body === undefined ? { method: "POST" } : postJson(body);
  return mapIssue(await json<IssueDto>(await sharedApiFetch(path, init)));
}

export async function sendToTriage(issueId: string): Promise<Issue> {
  return triagePost(issueId, "");
}

export async function acceptTriage(issueId: string, input: TriageAcceptInput = {}): Promise<Issue> {
  return triagePost(issueId, "accept", {
    ...(input.status ? { status: input.status } : {}),
    ...(input.assigneeId ? { assigneeId: toBackendId(input.assigneeId) } : {}),
    ...(input.priority ? { priority: toApiIssuePriority(input.priority) } : {}),
    ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
  });
}

export async function declineTriage(issueId: string, input: { comment?: string } = {}): Promise<Issue> {
  return triagePost(issueId, "decline", input.comment?.trim() ? { comment: input.comment.trim() } : {});
}

export async function duplicateTriage(issueId: string, input: { duplicateOfIssueId: string; comment?: string }): Promise<Issue> {
  return triagePost(issueId, "duplicate", {
    duplicateOfIssueId: toBackendId(input.duplicateOfIssueId),
    ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
  });
}

export async function snoozeTriage(issueId: string, until: string): Promise<Issue> {
  return triagePost(issueId, "snooze", { until });
}
