// alm-backend REST 어댑터 — admin (jiraApi.ts에서 분할, 동작 불변)
import type { AuditEntry, SystemStats, AgentPersona, AgentOffice, AgentPersonaActivity } from "../types";
import { toBackendId } from "../mapping";
import { type AgentPersonaDto, mapAgentPersona, mapAgentOffice, type AgentOfficeDto, mapAgentPersonaActivity, type AgentPersonaActivityDto } from "../agentMapping";
import { searchParams, json, sharedApiFetch } from "./http";

// ── 관리 콘솔 — 서버 V10 감사 로그·현황 (roles에 ADMIN 필요, 아니면 403이 그대로 온다) ──

interface AuditDto {
  id: number;
  eventType: string;
  actorId: number;
  projectId: number | null;
  targetKey: string | null;
  summary: string | null;
  occurredAt: string;
}

export async function listAuditLog(
  filter: { type?: string; since?: string; projectId?: string },
  paging: { page: number; size: number },
): Promise<{ items: AuditEntry[]; page: number; size: number; total: number }> {
  const query = searchParams({
    type: filter.type,
    since: filter.since,
    projectId: filter.projectId ? toBackendId(filter.projectId).toString() : undefined,
    page: String(paging.page),
    size: String(paging.size),
  });
  const dto = (await json(await sharedApiFetch(`/api/alm/admin/audit?${query}`))) as {
    items: AuditDto[];
    page: number;
    size: number;
    total: number;
  };
  return {
    items: dto.items.map((row) => ({
      id: String(row.id),
      eventType: row.eventType,
      actorId: String(row.actorId),
      projectId: row.projectId === null ? null : String(row.projectId),
      targetKey: row.targetKey,
      summary: row.summary,
      at: row.occurredAt,
    })),
    page: dto.page,
    size: dto.size,
    total: dto.total,
  };
}

export async function systemStats(): Promise<SystemStats> {
  return (await json(await sharedApiFetch("/api/alm/admin/stats"))) as SystemStats;
}

/**
 * agent-service 페르소나 목록 — "AI 팀 가이드" 진입점의 활성 판정에만 쓴다.
 * agent-service가 없는 배포(401/403/404/5xx)나 네트워크 오류는 모두 "비활성"으로 접는다 —
 * 이 기능이 없다고 화면에 오류를 띄우거나 콘솔에 로그를 남기면 안 된다(그레이스풀 디그레이드).
 */
export async function fetchAgentPersonas(): Promise<AgentPersona[]> {
  try {
    const res = await sharedApiFetch("/api/agent/personas");
    if (!res.ok) return [];
    const body: unknown = await res.json().catch(() => null);
    return Array.isArray(body) ? (body as AgentPersonaDto[]).map(mapAgentPersona) : [];
  } catch {
    return [];
  }
}

/**
 * AI 사무실 한 화면 분량(페르소나·현재 run·최근 run·대기 게이트·예산) — 사무실 화면이 10초마다 폴링한다.
 * 진입점 판정(`fetchAgentPersonas`)과 달리 실패를 삼키지 않는다: 화면이 오류 상태·재시도를 보여 줘야 한다.
 */
export async function fetchOffice(projectId?: string): Promise<AgentOffice> {
  const query = projectId ? `?projectId=${toBackendId(projectId)}` : "";
  return mapAgentOffice(await json<AgentOfficeDto>(await sharedApiFetch(`/api/agent/office${query}`)));
}

/** 개인 오피스 — 최근 run 20·오늘 감사 50·오늘 비용 */
export async function fetchPersonaActivity(personaId: string): Promise<AgentPersonaActivity> {
  return mapAgentPersonaActivity(
    await json<AgentPersonaActivityDto>(
      await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}/activity`),
    ),
  );
}
