/**
 * run 목록·상세·게이트 인박스의 순수 계산 — 필터·계보·액션 노출 규칙. 화면과 분리해 단위 테스트한다.
 * 액션 노출 규칙은 agent-service(Run.CANCELLABLE, RunResumeService.RESUMABLE)와 같다 — 서버가 최종 판정(409).
 */
import type { AgentGate, AgentPersona, AgentRunCost, AgentRunStatus, AgentRunSummary } from "../store/types";

/** 원장 기록이 없는 run의 표기 — 0원으로 보이게 하지 않는다(F-16) */
export const RUN_COST_NONE = "기록 없음";

/** run 비용 "$0.1234" — 1센트 미만도 보이게 소수 넷째 자리까지. 없으면 null */
export function formatRunCost(cost: AgentRunCost | null | undefined): string | null {
  if (!cost) return null;
  return `$${cost.costUsd.toFixed(4)}`;
}

/** 토큰 "입력 12,345 · 출력 1,234" — 없으면 null */
export function formatRunTokens(cost: AgentRunCost | null | undefined): string | null {
  if (!cost) return null;
  return `입력 ${cost.inputTokens.toLocaleString("ko-KR")} · 출력 ${cost.outputTokens.toLocaleString("ko-KR")}`;
}

/** 계보·게이트 대조용으로 한 번에 받는 run 수 — 서버 size 상한(100). 그보다 오래된 run은 링크만 남는다 */
export const RUN_LOOKUP_SIZE = 100;

const CANCELLABLE: readonly AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "FAILED"];
const RESUMABLE: readonly AgentRunStatus[] = ["BLOCKED", "FAILED"];

export const canCancel = (status: AgentRunStatus): boolean => CANCELLABLE.includes(status);
export const canResume = (status: AgentRunStatus): boolean => RESUMABLE.includes(status);

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
