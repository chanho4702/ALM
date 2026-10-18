// alm-backend REST 어댑터 — personal (jiraApi.ts에서 분할, 동작 불변)
import type { ProjectShortcut } from "../types";
import { toBackendId } from "../mapping";
import { json, sharedApiFetch } from "./http";

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
