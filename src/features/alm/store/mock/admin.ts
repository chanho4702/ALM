// localStorage 목업 스토어 — admin (jiraMock.ts에서 분할, 동작 불변)
import type { AuditEntry, SystemStats, AgentPersona } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { load } from "./db";
import { baseOfficePersonas } from "./office";

// ── 관리 콘솔 (목업: 활동 기록·프로젝트에서 합성) ─────────────

const ACTIVITY_EVENT: Record<string, string> = { created: "ISSUE_CREATED" };

/** 목업 감사 로그 — 이슈 활동은 생성/수정으로, 프로젝트는 생성일로 한 줄씩 */
export async function listAuditLog(
  filter: { type?: string; since?: string; projectId?: string },
  paging: { page: number; size: number },
): Promise<{ items: AuditEntry[]; page: number; size: number; total: number }> {
  const data = load();
  const issueById = new Map(data.issues.map((i) => [i.id, i]));
  const entries: AuditEntry[] = [
    ...data.projects.map((project) => ({
      id: `audit-p-${project.id}`,
      eventType: "PROJECT_CREATED",
      actorId: CURRENT_USER_ID,
      projectId: project.id,
      targetKey: project.key,
      summary: project.name,
      at: project.createdAt,
    })),
    ...data.activities.map((activity) => {
      const issue = issueById.get(activity.issueId);
      return {
        id: `audit-a-${activity.id}`,
        eventType: ACTIVITY_EVENT[activity.type] ?? "ISSUE_UPDATED",
        actorId: activity.actorId,
        projectId: issue?.projectId ?? null,
        targetKey: issue?.key ?? null,
        summary: issue ? `${issue.title}${activity.detail ? ` — ${activity.detail}` : ""}` : activity.detail,
        at: activity.at,
      };
    }),
  ]
    .filter((e) => (filter.type ? e.eventType === filter.type : true))
    .filter((e) => (filter.since ? e.at >= filter.since : true))
    .filter((e) => (filter.projectId ? e.projectId === filter.projectId : true))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const size = Math.max(1, paging.size);
  const page = Math.max(0, paging.page);
  return { items: entries.slice(page * size, page * size + size), page, size, total: entries.length };
}

export async function systemStats(): Promise<SystemStats> {
  const data = load();
  return {
    projects: data.projects.length,
    issues: data.issues.length,
    attachments: data.attachments.length,
    attachmentBytes: data.attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
    auditEntries: data.activities.length + data.projects.length,
  };
}

/**
 * 목업 모드는 agent-service가 없다. 사무실 목업 6인을 그대로 돌려줘 "AI 팀 가이드" 진입점과
 * run 목록의 페르소나 이름을 목업 개발에서도 볼 수 있게 한다(불변 규칙: 목업 개발자는 모든 화면을 봐야 한다).
 */
export async function fetchAgentPersonas(): Promise<AgentPersona[]> {
  return baseOfficePersonas(Date.now()).map(({ id, name, emoji }) => ({ id, name, emoji }));
}
