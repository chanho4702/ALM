/**
 * AI 사무실 화면 모델 — 응답을 화면 상태(자리·말풍선·접근 이름)로 바꾸는 순수 함수들.
 * 캔버스·팀 카드·패널이 같은 파생을 써서 세 뷰가 같은 사실을 말하게 한다.
 */
import type {
  AgentMeetingType,
  AgentOffice,
  AgentOfficePersona,
  AgentRole,
  AgentRunStatus,
  AgentRunSummary,
  AgentRunType,
} from "../store/types";
import { isProjectWideMeeting } from "../store/agentMapping";
import {
  agentMeetingRunName,
  AGENT_ROLE_LABEL,
  AGENT_STATUS_LABEL,
  type AgentPersonaState,
} from "../components/AgentGlyphs";

/** 안건 이슈 없는 회의 run의 안건 표기 — 이슈 링크 대신 */
export const PROJECT_WIDE_LABEL = "프로젝트 전반";

/** 이슈 링크를 걸 수 있는 키 — 안건 이슈 없는 회의(합성 키 `PROJECT-<id>`)면 null. 판정은 `isProjectWideMeeting` 한 곳 */
export function linkableIssueKey(run: { type: AgentRunType; issueKey: string | null }): string | null {
  return isProjectWideMeeting(run) ? null : run.issueKey;
}

/** "회고 회의"·"매니저 보고" — 회의 계열 run의 이름 */
const meetingLabel = (type: AgentRunType) => agentMeetingRunName(type as AgentMeetingType);

/** MANAGER는 맨 끝 — 기존 6롤의 책상·카드 자리를 밀지 않는다. 목록에 없는 롤도 끝으로(indexOf −1을 앞으로 보내지 않게) */
export const ROLE_ORDER: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS", "REVIEWER", "MANAGER"];

const roleRank = (role: AgentRole) => {
  const i = ROLE_ORDER.indexOf(role);
  return i < 0 ? ROLE_ORDER.length : i;
};

const TERMINAL: readonly AgentRunStatus[] = ["DONE", "FAILED", "CANCELLED"];

/** 롤 순서 → 같은 롤은 id 오름차순(숫자 id면 숫자로). 책상·유휴 자리·카드·탭 순서 공통(스펙 §1.5) */
export function sortPersonas(personas: readonly AgentOfficePersona[]): AgentOfficePersona[] {
  return [...personas].sort((a, b) => {
    const byRole = roleRank(a.role) - roleRank(b.role);
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

/** 최근 활동 원문(5분 이내일 때만 서버가 준다) — 요약이 없으면 도구명. 접근 이름·팀 카드는 이 원문을 쓴다 */
export function activityText(persona: AgentOfficePersona): string | null {
  const last = persona.lastActivity;
  if (!last) return null;
  return last.summary?.trim() || last.tool;
}

/** 서버가 내용을 가린 요약(AuditSummaryRedactor: "run=12 (본문 생략)", "ALM-3 (링크 생략)" 등) */
export const isRedactedSummary = (summary: string): boolean => /\([^()]*생략\)$/.test(summary.trim());

const TOOL_LABEL: Record<string, string> = {
  report_progress: "진행 보고",
  add_comment: "코멘트 작성",
  create_issue: "이슈 생성",
  create_page: "문서 작성",
  update_page: "문서 수정",
  search_issues: "이슈 검색",
  find_pages: "문서 검색",
  link_pr: "PR 연결",
};

/**
 * 말풍선 2행 — 가림 표지는 좁은 말풍선에서 잘리면 "run=12 (본문 생…"처럼 깨진 문구가 되므로
 * 도구의 한글 라벨로 바꾼다(모르는 도구는 도구명). 가리지 않은 요약은 원문(넘치면 CSS 말줄임 한 번).
 */
export function bubbleActivity(persona: AgentOfficePersona): string | null {
  const text = activityText(persona);
  const last = persona.lastActivity;
  if (!text || !last) return text;
  return isRedactedSummary(text) ? (TOOL_LABEL[last.tool] ?? last.tool) : text;
}

export interface BubbleText {
  line1: string;
  /** line1의 상태 접두("승인 대기" 등) — 좁으면 접두가 먼저 줄고 이슈키는 보존된다 */
  prefix: string | null;
  issueKey: string | null;
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
  if (isProjectWideMeeting(run)) {
    // 합성 키는 이슈가 아니다 — 1행은 회의 라벨(상태 접두가 있으면 앞에)
    const statePrefix = state === "RUNNING" ? null : (STATE_PREFIX[state] ?? null);
    const label = meetingLabel(run.type);
    const activity = state === "RUNNING" || state === "WAITING_APPROVAL" ? bubbleActivity(persona) : null;
    return { line1: statePrefix ? `${statePrefix} · ${label}` : label, prefix: statePrefix, issueKey: null, line2: activity };
  }
  const key = run.issueKey;
  let prefix: string | null;
  if (state === "RUNNING") prefix = run.type === "REVIEW" ? (key ? "리뷰" : "리뷰 중") : key ? null : "작업 중";
  else prefix = STATE_PREFIX[state] ?? "";
  const line1 = prefix && key ? `${prefix} · ${key}` : (key ?? prefix ?? "");
  const activity = state === "RUNNING" || state === "WAITING_APPROVAL" ? bubbleActivity(persona) : null;
  return { line1, prefix, issueKey: key, line2: activity };
}

/** 아바타·책상 버튼의 접근 이름(스펙 §4.4) — 요약은 말줄임 전 원문 */
export function personaAccessibleName(persona: AgentOfficePersona): string {
  const state = personaState(persona);
  const parts = [persona.name, AGENT_ROLE_LABEL[persona.role], AGENT_STATUS_LABEL[state]];
  const run = persona.currentRun;
  if (run && state !== "INACTIVE") {
    if (isProjectWideMeeting(run)) parts.push(`${meetingLabel(run.type)} ${PROJECT_WIDE_LABEL}`);
    else if (run.issueKey) parts.push(`이슈 ${run.issueKey}`);
  }
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
    const linkable = p.currentRun ? linkableIssueKey(p.currentRun) : null;
    const key = linkable ? ` (${linkable})` : "";
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
