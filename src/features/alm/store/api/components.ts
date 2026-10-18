// alm-backend REST 어댑터 — components (jiraApi.ts에서 분할, 동작 불변)
import type { Component, ComponentDefaultAssignee } from "../types";
import { toBackendId } from "../mapping";
import { json, sharedApiFetch } from "./http";

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
