/**
 * 프로젝트 실시간 스트림 프레임 → 화면 모델(id는 문자열). 모양이 낯선 issue/sprint 프레임은 "뭔가 바뀌었다"로 보고
 * reset으로 접는다 — 전체 재조회가 정본이라 손해가 없다. 모르는 event 이름은 버린다(앞으로 늘어날 수 있다).
 */
import type { SseFrame } from "./sse";
import type { IssueStreamType, ProjectStreamEvent, SprintStreamType } from "./model/realtime";

const ISSUE_TYPES: readonly IssueStreamType[] = [
  "issue.created",
  "issue.updated",
  "issue.transitioned",
  "issue.ranked",
  "issue.deleted",
  "issue.archived",
  "issue.restored",
];
const SPRINT_TYPES: readonly SprintStreamType[] = [
  "sprint.created",
  "sprint.updated",
  "sprint.started",
  "sprint.completed",
  "sprint.deleted",
];

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parse(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function mapProjectStreamFrame(frame: SseFrame, projectId: string): ProjectStreamEvent | null {
  const eventId = frame.id ?? null;
  const body = parse(frame.data);
  const fallbackReset = (): ProjectStreamEvent => ({ kind: "reset", projectId, reason: "malformed", eventId });
  switch (frame.event) {
    case "ready":
      return {
        kind: "ready",
        projectId,
        replayed: num(body?.replayed) ?? 0,
        reset: body?.reset === true,
        eventId,
      };
    case "reset":
      return { kind: "reset", projectId, reason: str(body?.reason), eventId };
    case "revoked":
      return { kind: "revoked", projectId };
    case "issue": {
      const type = str(body?.type) as IssueStreamType | null;
      const issueId = str(body?.issueId);
      if (!body || !type || !ISSUE_TYPES.includes(type) || !issueId) return fallbackReset();
      return {
        kind: "issue",
        type,
        projectId: str(body.projectId) ?? projectId,
        issueId,
        issueKey: str(body.issueKey) ?? "",
        version: num(body.version),
        changedFields: Array.isArray(body.changedFields) ? body.changedFields.filter((f): f is string => typeof f === "string") : [],
        sprintId: str(body.sprintId),
        actorId: str(body.actorId) ?? "",
        at: str(body.at),
        eventId,
      };
    }
    case "sprint": {
      const type = str(body?.type) as SprintStreamType | null;
      const sprintId = str(body?.sprintId);
      if (!body || !type || !SPRINT_TYPES.includes(type) || !sprintId) return fallbackReset();
      return {
        kind: "sprint",
        type,
        projectId: str(body.projectId) ?? projectId,
        sprintId,
        version: num(body.version),
        actorId: str(body.actorId) ?? "",
        at: str(body.at),
        eventId,
      };
    }
    default:
      return null;
  }
}
