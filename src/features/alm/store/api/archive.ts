// alm-backend REST 어댑터 — archive (jiraApi.ts에서 분할, 동작 불변)
import type { Issue, Project } from "../types";
import { mapIssue, type IssueDto, toBackendId, mapProject, type ProjectDto } from "../mapping";
import { json, sharedApiFetch } from "./http";

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
