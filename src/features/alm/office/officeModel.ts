/**
 * AI 사무실 화면 모델 — 응답을 화면 상태(자리·말풍선·접근 이름)로 바꾸는 순수 함수들.
 * 캔버스·팀 카드·패널이 같은 파생을 써서 세 뷰가 같은 사실을 말하게 한다.
 */
import type {
  AgentOffice,
  AgentOfficePersona,
  AgentRole,
  AgentRunStatus,
  AgentRunSummary,
} from "../store/types";
import { AGENT_ROLE_LABEL, AGENT_STATUS_LABEL, type AgentPersonaState } from "../components/AgentGlyphs";

export const ROLE_ORDER: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS", "REVIEWER"];

const TERMINAL: readonly AgentRunStatus[] = ["DONE", "FAILED", "CANCELLED"];

/** 롤 순서 → 같은 롤은 id 오름차순(숫자 id면 숫자로). 책상·유휴 자리·카드·탭 순서 공통(스펙 §1.5) */
export function sortPersonas(personas: readonly AgentOfficePersona[]): AgentOfficePersona[] {
  return [...personas].sort((a, b) => {
    const byRole = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
    if (byRole !== 0) return byRole;
    const na = Number(a.id);
    const nb = Number(b.id);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.id.localeCompare(b.id);
  });
}

/** 페르소나 상태 — 비활성 > 활성 run 상태 > 유휴 */
export function personaState(persona: AgentOfficePersona): AgentPersonaState {
  if (!persona.active) return "INACTIVE";
  return persona.currentRun?.status ?? "IDLE";
}

export function isTerminal(status: AgentRunStatus): boolean {
  return TERMINAL.includes(status);
}

/**
 * 게시판·"마지막 작업"용 종결 run — BLOCKED run은 currentRun과 recentRuns 양쪽에 오므로(endedAt null)
 * 종결 상태 + endedAt이 있는 것만 남기고, 같은 id가 두 번 오면 한 번만 둔다.
 */
export function finishedRuns(runs: readonly AgentRunSummary[]): AgentRunSummary[] {
  const seen = new Set<string>();
  return runs.filter((run) => {
    if (!isTerminal(run.status) || !run.endedAt || seen.has(run.id)) return false;
    seen.add(run.id);
    return true;
  });
}

const sameLocalDay = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString();

/** 오늘 종결된 보고서 수 — 게시판 배지 */
export function todayReportCount(runs: readonly AgentRunSummary[], now = Date.now()): number {
  return finishedRuns(runs).filter((run) => run.endedAt && sameLocalDay(run.endedAt, now)).length;
}

/** 말풍선 2행용 — 그래핌(Array.from) 기준 12자 + "…"(한글 조합 깨짐 방지) */
export function clip(text: string, max = 12): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

/** 최근 활동 원문(5분 이내일 때만 서버가 준다) — 요약이 없으면 도구명 */
export function activityText(persona: AgentOfficePersona): string | null {
  const last = persona.lastActivity;
  if (!last) return null;
  return last.summary?.trim() || last.tool;
}

export interface BubbleText {
  line1: string;
  line2: string | null;
}

const STATE_PREFIX: Partial<Record<AgentPersonaState, string>> = {
  QUEUED: "대기열",
  WAITING_APPROVAL: "승인 대기",
  BLOCKED: "차단됨",
};

/** 말풍선 문구(스펙 §4.1). 유휴·비활성은 말풍선 없음 */
export function bubbleText(persona: AgentOfficePersona): BubbleText | null {
  const state = personaState(persona);
  const run = persona.currentRun;
  if (!run || state === "IDLE" || state === "INACTIVE") return null;
  const key = run.issueKey;
  let line1: string;
  if (state === "RUNNING") {
    if (run.type === "REVIEW") line1 = key ? `리뷰 · ${key}` : "리뷰 중";
    else line1 = key ?? "작업 중";
  } else {
    const prefix = STATE_PREFIX[state] ?? "";
    line1 = key ? `${prefix} · ${key}` : prefix;
  }
  const activity = state === "RUNNING" || state === "WAITING_APPROVAL" ? activityText(persona) : null;
  return { line1, line2: activity ? clip(activity) : null };
}

/** 아바타·책상 버튼의 접근 이름(스펙 §4.4) — 요약은 말줄임 전 원문 */
export function personaAccessibleName(persona: AgentOfficePersona): string {
  const state = personaState(persona);
  const parts = [persona.name, AGENT_ROLE_LABEL[persona.role], AGENT_STATUS_LABEL[state]];
  if (persona.currentRun?.issueKey && state !== "INACTIVE") parts.push(`이슈 ${persona.currentRun.issueKey}`);
  const activity = state === "INACTIVE" ? null : activityText(persona);
  if (activity) parts.push(`최근 활동: ${activity}`);
  return `${parts.join(", ")} — 개인 오피스 열기`;
}

export interface OfficeCounts {
  total: number;
  byState: Record<AgentPersonaState, number>;
}

export function officeCounts(personas: readonly AgentOfficePersona[]): OfficeCounts {
  const byState: Record<AgentPersonaState, number> = {
    RUNNING: 0,
    QUEUED: 0,
    WAITING_APPROVAL: 0,
    BLOCKED: 0,
    IDLE: 0,
    INACTIVE: 0,
  };
  for (const p of personas) byState[personaState(p)] += 1;
  return { total: personas.length, byState };
}

const SUMMARY_ORDER: readonly AgentPersonaState[] = ["RUNNING", "QUEUED", "WAITING_APPROVAL", "BLOCKED", "IDLE", "INACTIVE"];

/** 캔버스 첫 요소의 시각 숨김 요약 — "AI 팀원 6명 — 작업 중 2, 대기열 1, …"(0인 상태는 뺀다) */
export function officeSummaryText(personas: readonly AgentOfficePersona[]): string {
  const { total, byState } = officeCounts(personas);
  const parts = SUMMARY_ORDER.filter((s) => byState[s] > 0).map((s) => `${AGENT_STATUS_LABEL[s]} ${byState[s]}`);
  return parts.length > 0 ? `AI 팀원 ${total}명 — ${parts.join(", ")}` : `AI 팀원 ${total}명`;
}

/** 폴링 사이 새로 승인 대기·차단으로 바뀐 페르소나만 알린다(스펙 §10 라이브 알림) */
export function transitionAnnouncements(prev: AgentOffice | null, next: AgentOffice): string[] {
  if (!prev) return [];
  const before = new Map(prev.personas.map((p) => [p.id, personaState(p)]));
  const out: string[] = [];
  for (const p of next.personas) {
    const now = personaState(p);
    if (before.get(p.id) === now || !before.has(p.id)) continue;
    const key = p.currentRun?.issueKey ? ` (${p.currentRun.issueKey})` : "";
    if (now === "WAITING_APPROVAL") out.push(`${p.name}${subjectJosa(p.name)} 승인을 기다립니다${key}`);
    if (now === "BLOCKED") out.push(`${p.name}${subjectJosa(p.name)} 차단됐습니다${key}`);
  }
  return out;
}

/** 주격 조사 — 마지막 글자에 받침이 있으면 "이", 없으면(또는 한글이 아니면) "가" */
export function subjectJosa(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "가";
  return code % 28 === 0 ? "가" : "이";
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** 오늘 비용 합 */
export function todayCostTotal(personas: readonly AgentOfficePersona[]): number {
  return personas.reduce((sum, p) => sum + p.todayCostUsd, 0);
}
