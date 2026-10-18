// alm-backend REST 어댑터 — issueOps (jiraApi.ts에서 분할, 동작 불변)
import type { Issue, IssuePriority, IssueType } from "../types";
import { toBackendId, mapIssue, toApiIssuePriority, toApiIssueType } from "../mapping";
import { settleWithConcurrency, reasonText } from "../concurrency";
import { sharedApiFetch, json, postJson } from "./http";

// ── 순서 ─────────────────────────────────────────────────────

/** 보드 컬럼 이동. 서버가 대상 컬럼 전체 순서를 다시 매기므로 화면은 이동 후 재조회한다. */
export async function moveIssue(
  id: string,
  to: { status: string; beforeId?: string },
): Promise<Issue> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: to.status,
      beforeId: to.beforeId == null ? null : toBackendId(to.beforeId),
    }),
  });
  return mapIssue(await json(response));
}

/** 백로그/스프린트 랭크 이동. sprintId가 null이면 백로그다. */
export async function rankIssue(
  id: string,
  to: { sprintId: string | null; beforeId?: string },
): Promise<Issue> {
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sprintId: to.sprintId == null ? null : toBackendId(to.sprintId),
      beforeId: to.beforeId == null ? null : toBackendId(to.beforeId),
    }),
  });
  return mapIssue(await json(response));
}

export async function deleteIssue(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}`, { method: "DELETE" }));
}

// ── 대량 변경 — 서버 일괄 API가 없어 이슈마다 호출한다 (목업과 같은 결과 형태) ──

export interface BulkIssuePatch {
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  fixVersionId?: string | null;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface BulkIssueTarget {
  id: string;
  /** 실패 보고에 쓰는 이슈 키 — 서버 본문을 읽기 전에 실패해도 숫자 id 대신 보인다 */
  key?: string;
  version: number;
}

/** 대량 삭제 대상 — id만 넘기면 실패 보고의 키 자리에 id가 선다 */
export type BulkDeleteTarget = string | { id: string; key?: string };

export function bulkDeleteTarget(target: BulkDeleteTarget): { id: string; key?: string } {
  return typeof target === "string" ? { id: target } : target;
}

export interface BulkResult {
  updated: number;
  failed: { id: string; key: string; reason: string }[];
}

/** 서버 일괄 편집 한 요청의 최대 이슈 수(`IssueBulkUpdateRequest.MAX_ITEMS`) — 넘으면 나눠 보낸다 */
export const BULK_UPDATE_MAX_ITEMS = 200;

/** 서버가 키를 주지 않은 실패 행(볼 수 없거나 없는 이슈)의 표시 */
export const BULK_HIDDEN_ISSUE_LABEL = "볼 수 없는 이슈";

interface BulkUpdateRowDto {
  issueId: number;
  key: string | null;
  ok: boolean;
  code: "OK" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNAVAILABLE" | "ERROR";
  error: string | null;
  currentVersion: number | null;
}

interface BulkUpdateResponseDto {
  updated: number;
  failed: number;
  results: BulkUpdateRowDto[];
}

/** 보낸 키만 바뀐다 — assigneeId·sprintId·fixVersionId의 null은 "비우기" */
function bulkChanges(patch: BulkIssuePatch): Record<string, unknown> {
  const optionalId = (value: string | null) => (value === null ? null : toBackendId(value));
  return {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: toApiIssuePriority(patch.priority) } : {}),
    ...(patch.assigneeId !== undefined ? { assigneeId: optionalId(patch.assigneeId) } : {}),
    ...(patch.sprintId !== undefined ? { sprintId: optionalId(patch.sprintId) } : {}),
    ...(patch.fixVersionId !== undefined ? { fixVersionId: optionalId(patch.fixVersionId) } : {}),
    ...(patch.addLabels !== undefined ? { addLabels: patch.addLabels } : {}),
    ...(patch.removeLabels !== undefined ? { removeLabels: patch.removeLabels } : {}),
  };
}

/**
 * 일괄 편집 — `POST /api/alm/issues/bulk` 한 요청(200건 넘으면 나눠서). 행마다 서버 트랜잭션이고 낙관적 락 기준은
 * 화면이 본 버전이다(남이 고친 이슈는 그 행만 CONFLICT). 응답은 늘 200이고 행별 결과를 요청 순서로 준다.
 * 400(빈 선택·중복·빈 변경)은 서버 문구 그대로 던진다.
 */
export async function bulkUpdateIssues(targets: BulkIssueTarget[], patch: BulkIssuePatch): Promise<BulkResult> {
  if (targets.length === 0) throw new Error("선택한 이슈가 없습니다");
  const changes = bulkChanges(patch);
  let updated = 0;
  const failed: BulkResult["failed"] = [];
  for (let start = 0; start < targets.length; start += BULK_UPDATE_MAX_ITEMS) {
    const chunk = targets.slice(start, start + BULK_UPDATE_MAX_ITEMS);
    const body = await json<BulkUpdateResponseDto>(
      await sharedApiFetch("/api/alm/issues/bulk", postJson({
        items: chunk.map(({ id, version }) => ({ issueId: toBackendId(id), expectedVersion: version })),
        changes,
      })),
    );
    for (const row of body.results ?? []) {
      if (row.ok) {
        updated += 1;
        continue;
      }
      failed.push({
        id: String(row.issueId),
        key: row.key ?? BULK_HIDDEN_ISSUE_LABEL,
        reason: row.error ?? row.code,
      });
    }
  }
  return { updated, failed };
}

export async function bulkDeleteIssues(
  targets: BulkDeleteTarget[],
): Promise<{ deleted: number; failed: BulkResult["failed"] }> {
  if (targets.length === 0) throw new Error("선택한 이슈가 없습니다");
  const normalized = targets.map(bulkDeleteTarget);
  const results = await settleWithConcurrency(normalized, ({ id }) => deleteIssue(id));
  return {
    deleted: results.filter((r) => r.status === "fulfilled").length,
    failed: results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];
      const { id, key } = normalized[index];
      return [{ id, key: key ?? id, reason: reasonText(result.reason) }];
    }),
  };
}

// ── CSV/이관 가져오기 — 서버 일괄 API(키 보존·행 단위 실패)로 한 번에 보낸다 ──

export interface ImportResult {
  created: number;
  failed: { row: number; title: string; reason: string }[];
}

export async function importIssues(
  projectId: string,
  inputs: {
    key?: string;
    title: string;
    description?: string;
    type?: IssueType;
    status?: string;
    priority?: IssuePriority;
    assigneeId?: string | null;
    labels?: string[];
    dueDate?: string | null;
    estimateHours?: number | null;
  }[],
): Promise<ImportResult> {
  if (inputs.length === 0) throw new Error("가져올 이슈가 없습니다");
  const items = inputs.map((input) => ({
    key: input.key ?? null,
    title: input.title,
    description: input.description ?? "",
    type: input.type ? toApiIssueType(input.type) : null,
    status: input.status ?? null,
    priority: input.priority ? toApiIssuePriority(input.priority) : null,
    assigneeId: input.assigneeId ? toBackendId(input.assigneeId) : null,
    details: {
      parentId: null,
      sprintId: null,
      dueDate: input.dueDate ?? null,
      estimateHours: input.estimateHours ?? null,
      labels: input.labels ?? [],
    },
  }));
  return json<ImportResult>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/issues/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }),
  );
}
