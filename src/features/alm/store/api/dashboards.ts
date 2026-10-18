// alm-backend REST 어댑터 — dashboards (jiraApi.ts에서 분할, 동작 불변)
import type { DashboardGadget, Dashboard, ProjectWorklogRow } from "../types";
import { toBackendId } from "../mapping";
import { json, sharedApiFetch, postJson, jsonBody, searchParams } from "./http";

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
