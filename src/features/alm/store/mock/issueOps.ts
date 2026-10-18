// localStorage 목업 스토어 — issueOps (jiraMock.ts에서 분할, 동작 불변)
import type { IssueType, IssuePriority } from "../types";
import { createIssue, updateIssue } from "./issues";
import { load, persist } from "./db";
import { resolvePriority } from "./rules";
import { assertCanEdit } from "./members";

// ── CSV/이관 가져오기 ────────────────────────────────────────

export interface ImportResult {
  created: number;
  failed: { row: number; title: string; reason: string }[];
}

/**
 * 여러 이슈를 순서대로 만든다 — 한 줄이 실패해도 나머지는 만들고 사유를 남긴다(전부 롤백 없음).
 * 키가 있으면 보존한다(createIssue의 key 규칙).
 */
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
  let created = 0;
  const failed: ImportResult["failed"] = [];
  for (const [index, input] of inputs.entries()) {
    try {
      await createIssue({ projectId, ...input });
      created += 1;
    } catch (error) {
      failed.push({
        row: index + 1,
        title: input.key ?? input.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { created, failed };
}

// ── 대량 변경 ────────────────────────────────────────────────

export interface BulkIssuePatch {
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  fixVersionId?: string | null;
  addLabels?: string[];
  removeLabels?: string[];
}

/** 대량 변경 대상 — 화면이 목록을 그릴 때 본 버전을 함께 보낸다(그 뒤 남이 고쳤으면 그 이슈만 실패) */
export interface BulkIssueTarget {
  id: string;
  /** 실패 보고에 쓰는 이슈 키 — 서버 본문을 읽기 전에 실패해도 숫자 id 대신 보인다 */
  key?: string;
  version: number;
}

/** 대량 삭제 대상 — id만 넘기면 실패 보고의 키 자리에 id가 선다 */
export type BulkDeleteTarget = string | { id: string; key?: string };

export interface BulkResult {
  updated: number;
  failed: { id: string; key: string; reason: string }[];
}

/**
 * 여러 이슈에 같은 변경을 적용한다 — 이슈마다 `updateIssue`를 거치므로 전이 규칙·권한·타입 검증이
 * 그대로 먹는다. 막힌 이슈는 사유와 함께 실패 목록에 남기고 나머지는 적용한다(전부 롤백하지 않는다).
 * 이미 같은 값인 필드는 변경으로 세지 않는다.
 */
export async function bulkUpdateIssues(
  targets: BulkIssueTarget[],
  patch: BulkIssuePatch,
): Promise<BulkResult> {
  if (targets.length === 0) throw new Error("선택한 이슈가 없습니다");
  const data = load();
  let updated = 0;
  const failed: BulkResult["failed"] = [];
  for (const { id, key, version } of targets) {
    const issue = data.issues.find((i) => i.id === id);
    if (!issue) {
      failed.push({ id, key: key ?? id, reason: "이슈를 찾을 수 없습니다" });
      continue;
    }
    const next: Parameters<typeof updateIssue>[1] = {};
    if (patch.status !== undefined && patch.status !== issue.status) next.status = patch.status;
    if (patch.priority !== undefined && patch.priority !== issue.priority) {
      next.priority = resolvePriority(data, issue.projectId, patch.priority);
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId) {
      next.assigneeId = patch.assigneeId;
    }
    if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId) {
      next.sprintId = patch.sprintId;
    }
    if (patch.fixVersionId !== undefined && patch.fixVersionId !== issue.fixVersionId) {
      next.fixVersionId = patch.fixVersionId;
    }
    if (patch.addLabels || patch.removeLabels) {
      const remove = new Set(patch.removeLabels ?? []);
      const labels = [
        ...new Set([...issue.labels.filter((l) => !remove.has(l)), ...(patch.addLabels ?? [])]),
      ];
      if (labels.join("\u0000") !== issue.labels.join("\u0000")) next.labels = labels;
    }
    if (Object.keys(next).length === 0) continue;
    try {
      await updateIssue(id, next, version);
      updated += 1;
    } catch (error) {
      failed.push({
        id,
        key: issue.key,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { updated, failed };
}

export async function bulkDeleteIssues(
  targets: BulkDeleteTarget[],
): Promise<{ deleted: number; failed: BulkResult["failed"] }> {
  if (targets.length === 0) throw new Error("선택한 이슈가 없습니다");
  let deleted = 0;
  const failed: BulkResult["failed"] = [];
  for (const target of targets) {
    const id = typeof target === "string" ? target : target.id;
    const key = load().issues.find((i) => i.id === id)?.key ?? (typeof target === "string" ? id : target.key ?? id);
    try {
      await deleteIssue(id);
      deleted += 1;
    } catch (error) {
      failed.push({ id, key, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { deleted, failed };
}

export async function deleteIssue(id: string): Promise<void> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, data.issues[index].projectId);
  data.issues.splice(index, 1);
  data.comments = data.comments.filter((c) => c.issueId !== id);
  data.activities = data.activities.filter((a) => a.issueId !== id);
  data.notifications = data.notifications.filter((n) => n.issueId !== id);
  data.watchers = data.watchers.filter((w) => w.issueId !== id);
  data.links = data.links.filter((l) => l.sourceId !== id && l.targetId !== id);
  data.worklogs = data.worklogs.filter((w) => w.issueId !== id);
  data.changes = data.changes.filter((c) => c.issueId !== id);
  data.attachments = data.attachments.filter((a) => a.issueId !== id);
  for (const child of data.issues) {
    if (child.parentId === id) child.parentId = null; // 자식은 부모만 해제
  }
  persist();
}
