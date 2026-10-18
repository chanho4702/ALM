// alm-backend REST 어댑터 — sprints (jiraApi.ts에서 분할, 동작 불변)
import type { Sprint } from "../types";
import { type SprintDto, toBackendId, mapSprint } from "../mapping";
import { json, sharedApiFetch } from "./http";

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
 * 그대로 되돌려 보낸다. expectedVersion은 **편집을 시작할 때 화면이 본 버전**이다(이슈 수정과 같은 규칙) —
 * 저장 시점에 읽은 버전을 쓰면 그 사이 남의 수정을 조용히 덮어쓴다.
 */
export async function updateSprint(
  id: string,
  patch: { name?: string; goal?: string | null; plannedStart?: string | null; plannedEnd?: string | null },
  expectedVersion: number,
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
      expectedVersion,
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
 * 무엇을 완료로 볼지는 서버가 워크플로 의미(complete)로 판단한다. 완료가 아닌 이슈는 백로그(또는 지정 스프린트)로 돌아간다.
 */
export async function completeSprint(
  id: string,
  options: { moveUnfinishedTo?: string | null } = {},
): Promise<Sprint> {
  // 완료 판정(doneStatuses)은 보내지 않는다 — V11부터 서버가 워크플로 의미(complete)로 스스로 판단한다.
  // 목업과 같은 시그니처라 화면(백로그·보드·릴리스)이 어댑터를 구분하지 않는다.
  const target = options.moveUnfinishedTo ?? null;
  const response = await sharedApiFetch(`/api/alm/sprints/${toBackendId(id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 대상이 없으면 필드를 빼서 서버 기본값(백로그)에 맡긴다.
    body: JSON.stringify(target === null ? {} : { moveUnfinishedToSprintId: toBackendId(target) }),
  });
  return mapSprint(await json(response));
}
