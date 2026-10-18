// alm-backend REST 어댑터 — settings (jiraApi.ts에서 분할, 동작 불변)
import type { SettingsBody, SettingsScheme, WorkflowStatus, StatusCategory, StatusKind, StatusColor, StatusDef, IssueTypeDef, IssueTypeLevel } from "../types";
import { toBackendId } from "../mapping";
import { notifyIssueTypesChanged } from "../shared";
import { json, sharedApiFetch, postJson, jsonBody, settingsGeneration } from "./http";

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

/** projectId → (statusId → WorkflowStatus) */
export type StatusMetaByProject = Record<string, Record<string, WorkflowStatus>>;

/**
 * 상태 맵을 서버에서 한 번에 읽는다 — `GET /api/alm/projects/statuses`(접근 가능한 프로젝트 → order 순 상태, 휴지통 제외).
 * 항목 shape은 `/projects/{id}/settings`의 `body.statuses`와 같다. 프로젝트마다 설정을 부르던 1+N을 대체한다.
 */
async function loadStatusMeta(): Promise<StatusMetaByProject> {
  const rows = await json<Record<string, WorkflowStatus[]> | null>(await sharedApiFetch("/api/alm/projects/statuses"));
  return Object.fromEntries(
    Object.entries(rows ?? {}).map(([projectId, statuses]) => [
      projectId,
      Object.fromEntries((statuses ?? []).map((s) => [s.id, s])),
    ]),
  );
}

/** 다른 사용자가 바꾼 스킴을 놓치지 않는 상한 — 이 탭의 설정 쓰기는 세대로 즉시 무효화된다 */
const STATUS_META_TTL_MS = 60_000;

let statusMetaCache: { generation: number; at: number; value: Promise<StatusMetaByProject> } | null = null;

/** 테스트 전용 — 캐시를 비운다 */
export function __clearStatusMetaCache(): void {
  statusMetaCache = null;
}

/**
 * 접근 가능한 프로젝트 전부의 상태 맵 — 홈·검색·⌘K 모달이 열릴 때마다 부른다. 같은 세션 안에서는 진행 중 요청을
 * 나눠 쓰고 결과를 60초 캐시한다(설정 쓰기가 있으면 즉시 버린다). 실패는 캐시하지 않는다. 호출자마다 사본을 준다.
 */
export async function statusMetaByProject(): Promise<StatusMetaByProject> {
  const now = Date.now();
  const cached = statusMetaCache;
  if (!cached || cached.generation !== settingsGeneration || now - cached.at >= STATUS_META_TTL_MS) {
    const entry = { generation: settingsGeneration, at: now, value: loadStatusMeta() };
    statusMetaCache = entry;
    entry.value.catch(() => {
      if (statusMetaCache === entry) statusMetaCache = null;
    });
    return structuredClone(await entry.value);
  }
  return structuredClone(await cached.value);
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
