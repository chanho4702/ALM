// alm-backend REST 어댑터 — history (jiraApi.ts에서 분할, 동작 불변)
import type { ChangeFilter, ChangeWindow } from "../jiraMock";
import { toApiChangeField, toBackendId, type IssueChangeDto, mapIssueChange } from "../mapping";
import type { IssueChange } from "../types";
import { sharedApiFetch, json } from "./http";

// ── 변경 이력 ────────────────────────────────────────────────

/** 리포트 원천. 필터는 서버와 같은 의미이며 스프린트 필터는 전이 양쪽을 잡는다(서버 규칙). */
/**
 * 변경 이력 — 기간(since 포함 ~ until 배타)과 상한(limit, 서버 기본·최대 20000) 안을 시간 오름차순으로.
 * 상한에 걸려 오래된 쪽이 잘렸으면 서버가 `X-Result-Truncated: true`를 붙인다 → `truncated`.
 */
export async function listProjectChangeWindow(projectId: string, filter: ChangeFilter = {}): Promise<ChangeWindow> {
  const params = new URLSearchParams();
  if (filter.field) params.set("field", toApiChangeField(filter.field));
  if (filter.sprintId) params.set("sprintId", String(toBackendId(filter.sprintId)));
  if (filter.since) params.set("since", filter.since);
  if (filter.until) params.set("until", filter.until);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  const query = params.toString();
  const response = await sharedApiFetch(
    `/api/alm/projects/${toBackendId(projectId)}/changes${query ? `?${query}` : ""}`,
  );
  const rows = await json<IssueChangeDto[]>(response);
  return { items: rows.map(mapIssueChange), truncated: response.headers.get("X-Result-Truncated") === "true" };
}

export async function listProjectChanges(projectId: string, filter: ChangeFilter = {}): Promise<IssueChange[]> {
  return (await listProjectChangeWindow(projectId, filter)).items;
}
