/**
 * run 목록·상세·게이트 인박스의 순수 계산 — 필터·계보·액션 노출 규칙. 화면과 분리해 단위 테스트한다.
 * 액션 노출 규칙은 agent-service(Run.CANCELLABLE, RunResumeService.RESUMABLE)와 같다 — 서버가 최종 판정(409).
 */
import type { AgentGate, AgentPersona, AgentRunStatus, AgentRunSummary } from "../store/types";
import { isTerminal } from "./officeModel";

export type RunGroup = "all" | "active" | "finished";

const CANCELLABLE: readonly AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "FAILED"];
const RESUMABLE: readonly AgentRunStatus[] = ["BLOCKED", "FAILED"];

export const canCancel = (status: AgentRunStatus): boolean => CANCELLABLE.includes(status);
export const canResume = (status: AgentRunStatus): boolean => RESUMABLE.includes(status);

/** 활성 = 아직 끝나지 않은 run(BLOCKED 포함), 종결 = DONE·FAILED·CANCELLED */
export function inGroup(status: AgentRunStatus, group: RunGroup): boolean {
  if (group === "all") return true;
  return group === "active" ? !isTerminal(status) : isTerminal(status);
}

/** 이슈키의 프로젝트 키 부분 — "ALM-12" → "ALM". 형식이 아니면 null */
export function issueProjectKey(issueKey: string | null): string | null {
  if (!issueKey) return null;
  const dash = issueKey.lastIndexOf("-");
  return dash > 0 ? issueKey.slice(0, dash) : null;
}

/**
 * 프로젝트 축은 클라이언트 필터 — runs API에 projectId가 없어 이슈키 접두어로 맞춘다.
 * projectKey가 null이면 전체(이슈 없는 run 포함). 이슈 없는 run은 프로젝트 범위에서 빠진다.
 */
export function inProject(issueKey: string | null, projectKey: string | null): boolean {
  if (projectKey === null) return true;
  return issueProjectKey(issueKey)?.toUpperCase() === projectKey.toUpperCase();
}

export function filterRuns(
  runs: readonly AgentRunSummary[],
  { group, projectKey }: { group: RunGroup; projectKey: string | null },
): AgentRunSummary[] {
  return runs.filter((r) => inGroup(r.status, group) && inProject(r.issueKey, projectKey));
}

/** 최신 먼저 — 시작 시각(없으면 대기열이라 가장 최근 취급), 같으면 id 큰 것 */
export function sortRunsNewestFirst(runs: readonly AgentRunSummary[]): AgentRunSummary[] {
  const stamp = (r: AgentRunSummary) => (r.startedAt ? Date.parse(r.startedAt) : Number.POSITIVE_INFINITY);
  return [...runs].sort((a, b) => stamp(b) - stamp(a) || Number(b.id) - Number(a.id));
}

export interface RunLineage {
  parent: AgentRunSummary | null;
  /** 이 run을 부모로 가리키는 run(리뷰·반려-fix) */
  children: AgentRunSummary[];
  /** 같은 이슈키의 run 전부(자기 포함) — attempt 오름차순, 같으면 id 오름차순 */
  sameIssue: AgentRunSummary[];
}

export function runLineage(runs: readonly AgentRunSummary[], run: AgentRunSummary): RunLineage {
  const parent = run.parentRunId ? (runs.find((r) => r.id === run.parentRunId) ?? null) : null;
  const children = runs.filter((r) => r.parentRunId === run.id);
  const sameIssue = run.issueKey
    ? runs
        .filter((r) => r.issueKey === run.issueKey)
        .sort((a, b) => a.attempt - b.attempt || Number(a.id) - Number(b.id))
    : [run];
  return { parent, children, sameIssue };
}

/** 페르소나 표기 — 이름(+이모지). 목록에 없으면 `페르소나 #id` 폴백 */
export function personaDisplay(
  personas: ReadonlyMap<string, AgentPersona>,
  personaId: string,
): { name: string; emoji: string | null } {
  const persona = personas.get(personaId);
  return persona ? { name: persona.name, emoji: persona.emoji ?? null } : { name: `페르소나 #${personaId}`, emoji: null };
}

/** `?persona=` 필터 — 게이트에는 페르소나가 없어 runId → run.personaId로 맞춘다 */
export function gatesForPersona(
  gates: readonly AgentGate[],
  runs: readonly AgentRunSummary[],
  personaId: string | null,
): AgentGate[] {
  if (!personaId) return [...gates];
  const personaOfRun = new Map(runs.map((r) => [r.id, r.personaId]));
  return gates.filter((g) => personaOfRun.get(g.runId) === personaId);
}
