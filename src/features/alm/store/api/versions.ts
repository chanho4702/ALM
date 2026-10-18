// alm-backend REST 어댑터 — versions (jiraApi.ts에서 분할, 동작 불변)
import type { ProjectVersion } from "../types";
import { type VersionDto, toBackendId, mapVersion } from "../mapping";
import { json, sharedApiFetch } from "./http";

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

/**
 * 버전 수정 — 서버 PUT은 전체 본문이라 보내지 않은 필드는 `current`(화면이 본 값)로 채우고, 낙관적 락 기준도
 * `current.version`(편집을 시작할 때 본 버전)이다. 저장 직전에 다시 읽은 버전을 쓰면 남의 저장을 조용히 덮는다.
 */
export async function updateVersion(
  current: ProjectVersion,
  patch: { name?: string; description?: string | null; startDate?: string | null; releaseDate?: string | null },
): Promise<ProjectVersion> {
  if (!Number.isInteger(current.version)) throw new Error("편집을 시작한 버전 정보가 필요합니다");
  const pick = (next: string | null | undefined, currentValue?: string | null) =>
    next === undefined ? (currentValue ?? null) : next === null || next.trim() === "" ? null : next.trim();
  const response = await sharedApiFetch(`/api/alm/versions/${toBackendId(current.id)}`, {
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
