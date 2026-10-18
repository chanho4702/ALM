// localStorage 목업 스토어 — versions (jiraMock.ts에서 분할, 동작 불변)
import type { ProjectVersion, JiraData } from "../types";
import { ApiError } from "../mapping";
import { clone, load, nextId, persist } from "./db";
import { assertCanEdit } from "./members";
import { STALE_EDIT_MESSAGE } from "./issues";
import { statusKindOf } from "./rules";

// ── versions (릴리스) ─────────────────────────────────────────

export interface VersionInput {
  name?: string;
  description?: string | null;
  startDate?: string | null;
  releaseDate?: string | null;
}

function dateValue(next: string | null | undefined, current: string | undefined) {
  if (next === undefined) return current;
  const trimmed = (next ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function assertVersionDates(startDate?: string, releaseDate?: string): void {
  if (startDate && releaseDate && startDate > releaseDate) {
    throw new Error("시작일은 릴리스일보다 늦을 수 없습니다");
  }
}

/** 만든 순서 — 릴리스 허브는 최신을 위에 보이려면 화면에서 뒤집는다 */
export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  return clone(load().versions.filter((v) => v.projectId === projectId));
}

export async function createVersion(
  projectId: string,
  input: VersionInput & { name: string },
): Promise<ProjectVersion> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanEdit(data, projectId);
  const name = input.name.trim();
  if (!name) throw new Error("버전 이름을 입력하세요");
  if (data.versions.some((v) => v.projectId === projectId && v.name === name)) {
    throw new Error(`이미 있는 버전 이름입니다: ${name}`);
  }
  const startDate = dateValue(input.startDate, undefined);
  const releaseDate = dateValue(input.releaseDate, undefined);
  assertVersionDates(startDate, releaseDate);
  const version: ProjectVersion = {
    id: nextId(),
    projectId,
    name,
    description: input.description?.trim() ?? "",
    status: "unreleased",
    createdAt: new Date().toISOString(),
    version: 1,
  };
  if (startDate) version.startDate = startDate;
  if (releaseDate) version.releaseDate = releaseDate;
  data.versions.push(version);
  persist();
  return clone(version);
}

/**
 * 버전 수정 — 서버 PUT과 같은 낙관적 락: `current`는 화면이 편집을 시작할 때 본 버전이고, 그 사이 남이 고쳤으면 409.
 * 보내지 않은 필드는 그대로 둔다.
 */
export async function updateVersion(current: ProjectVersion, patch: VersionInput): Promise<ProjectVersion> {
  const data = load();
  const version = requireVersion(data, current.id);
  assertCanEdit(data, version.projectId);
  if ((version.version ?? 1) !== (current.version ?? 1)) throw new ApiError(409, STALE_EDIT_MESSAGE);
  const name = patch.name === undefined ? version.name : patch.name.trim();
  if (!name) throw new Error("버전 이름을 입력하세요");
  if (
    name !== version.name &&
    data.versions.some((v) => v.projectId === version.projectId && v.name === name)
  ) {
    throw new Error(`이미 있는 버전 이름입니다: ${name}`);
  }
  const startDate = dateValue(patch.startDate, version.startDate);
  const releaseDate = dateValue(patch.releaseDate, version.releaseDate);
  assertVersionDates(startDate, releaseDate);
  version.name = name;
  if (patch.description !== undefined) version.description = patch.description?.trim() ?? "";
  if (startDate === undefined) delete version.startDate;
  else version.startDate = startDate;
  if (releaseDate === undefined) delete version.releaseDate;
  else version.releaseDate = releaseDate;
  version.version = (version.version ?? 1) + 1;
  persist();
  return clone(version);
}

/**
 * 릴리스. 미완료(카테고리 done 아님) 이슈는 `moveUnresolvedTo`로 옮기고, 지정이 없으면
 * 그 버전에 그대로 둔다(지라와 동일). 대상 검증이 실패하면 릴리스 자체가 일어나지 않는다.
 */
export async function releaseVersion(
  id: string,
  options: { moveUnresolvedTo?: string | null } = {},
): Promise<ProjectVersion> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  if (version.status === "released") throw new Error("이미 릴리스된 버전입니다");
  if (version.status === "archived") throw new Error("보관된 버전은 릴리스할 수 없습니다");
  const targetId = options.moveUnresolvedTo ?? null;
  if (targetId !== null) {
    if (targetId === id) throw new Error("릴리스하는 버전으로는 이관할 수 없습니다");
    const target = requireVersion(data, targetId);
    if (target.projectId !== version.projectId) throw new Error("다른 프로젝트의 버전입니다");
    if (target.status === "released") throw new Error("릴리스된 버전으로는 이관할 수 없습니다");
    if (target.status === "archived") throw new Error("보관된 버전으로는 이관할 수 없습니다");
    const now = new Date().toISOString();
    for (const issue of data.issues) {
      if (
        issue.fixVersionId === id &&
        statusKindOf(data, issue.projectId, issue.status) !== "complete"
      ) {
        issue.fixVersionId = targetId;
        issue.updatedAt = now;
      }
    }
  }
  version.status = "released";
  version.releasedAt = new Date().toISOString();
  persist();
  return clone(version);
}

export async function archiveVersion(id: string): Promise<ProjectVersion> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  if (version.status === "archived") throw new Error("이미 보관된 버전입니다");
  version.status = "archived";
  persist();
  return clone(version);
}

/** 지우면 달려 있던 이슈의 수정 버전이 비워진다(이슈는 남는다) */
export async function deleteVersion(id: string): Promise<void> {
  const data = load();
  const version = requireVersion(data, id);
  assertCanEdit(data, version.projectId);
  for (const issue of data.issues) {
    if (issue.fixVersionId === id) issue.fixVersionId = null;
  }
  data.versions = data.versions.filter((v) => v.id !== id);
  persist();
}

function requireVersion(data: JiraData, id: string): ProjectVersion {
  const version = data.versions.find((v) => v.id === id);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  return version;
}
