// alm-backend REST 어댑터 — registries (jiraApi.ts에서 분할, 동작 불변)
import type { LinkTypeDef, PriorityDef } from "../types";
import { notifyLinkTypesChanged, notifyPrioritiesChanged } from "../shared";
import { json, sharedApiFetch, postJson, jsonBody } from "./http";

// ── 링크 타입 레지스트리 (서버 V15) ──

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
