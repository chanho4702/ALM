/**
 * AI 사무실 화면 모델 — 응답을 화면 상태(자리·말풍선·접근 이름)로 바꾸는 순수 함수들.
 * 캔버스·팀 카드·패널이 같은 파생을 써서 세 뷰가 같은 사실을 말하게 한다.
 */
import type {
  AgentActiveMeeting,
  AgentBudget,
  AgentCurrentRun,
  AgentMeetingType,
  AgentOffice,
  AgentOfficePersona,
  AgentRole,
  AgentRunStatus,
  AgentRunSummary,
  AgentRunType,
  Issue,
  IssueTypeDef,
  StatusKind,
  WorkflowStatus,
} from "../store/types";
import { isProjectWideMeeting } from "../store/agentMapping";
import { statusKind, typeLevel } from "../components/labels";
import type { MicroGlyph } from "./pixel";
import {
  agentMeetingRunName,
  AGENT_REMOTE_DETAIL,
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

/**
 * 페르소나 상태 — 비활성 > 활성 run 상태 > 원격 접속(외부 MCP, AGP-63) > 유휴.
 * 서버는 활성 run이 있으면 presence를 null로 주지만, 둘 다 와도 run이 이긴다(낙관적 run 덮어쓰기 포함).
 */
export function personaState(persona: AgentOfficePersona): AgentPersonaState {
  if (!persona.active) return "INACTIVE";
  if (persona.currentRun) return persona.currentRun.status;
  return persona.presence === "EXTERNAL" ? "REMOTE" : "IDLE";
}

/** 상태 라벨 — 원격 접속은 부연을 붙인다("원격 접속 중 — 외부 MCP"). 접근 이름·팀 카드 공용 */
export function personaStateText(state: AgentPersonaState): string {
  return state === "REMOTE" ? `${AGENT_STATUS_LABEL.REMOTE} — ${AGENT_REMOTE_DETAIL}` : AGENT_STATUS_LABEL[state];
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
  update_issue: "이슈 수정",
  get_issue: "이슈 조회",
  create_page: "문서 작성",
  update_page: "문서 수정",
  search_issues: "이슈 검색",
  find_pages: "문서 검색",
  link_pr: "PR 연결",
  create_pr: "PR 생성",
};

/** 도구의 한글 라벨 — 모르는 도구는 도구명(말풍선·대화 대사 공용) */
export const toolLabel = (tool: string) => TOOL_LABEL[tool] ?? tool;

// ── 실행 위치·러너 대기(P4a D-P4-4) — 상태 우선순위는 그대로, "러너 대기"는 QUEUED의 하위 상태 ──

/** 러너 대기 말풍선 접두 — "대기열" 대신 */
export const RUNNER_WAIT_PREFIX = "러너 대기";

/** 내 PC 러너에서 도는(또는 돌) run — 모니터에 도트 집. 구 백엔드(필드 없음)는 서버 */
export function isLocalRun(run: AgentCurrentRun | null | undefined): boolean {
  return run?.executionSite === "LOCAL";
}

/** QUEUED이고 집어 갈 러너가 없는가 — 다른 상태에 붙어 와도 무시한다(매퍼와 같은 규칙) */
export function isAwaitingRunner(run: AgentCurrentRun | null | undefined): boolean {
  return run?.status === "QUEUED" && run.awaitingRunner === true;
}

/**
 * 러너 대기 설명(패널·팀 카드·접근 이름 공용) — 대기가 아니면 null.
 * LOCAL은 사람이 자기 PC 러너를 켜야 풀리고, SERVER는 플랫폼 러너(운영) 쪽 문제다.
 */
export function runnerWaitText(run: AgentCurrentRun | null | undefined): string | null {
  if (!run || !isAwaitingRunner(run)) return null;
  return isLocalRun(run)
    ? "러너 대기 — 내 PC 러너가 켜지면 시작합니다"
    : "서버 러너 대기 — 플랫폼 러너가 연결되면 시작합니다";
}

/** 러너 대기 말풍선 2행 — 좁은 말풍선이라 누가 풀어야 하는지만 짧게 */
function runnerWaitBubble(run: AgentCurrentRun): string | null {
  if (!isAwaitingRunner(run)) return null;
  return isLocalRun(run) ? "내 PC 러너를 켜 주세요" : "플랫폼 러너 연결 대기";
}

/**
 * 워커에게 아직 전달되지 않은 사람 지시 수(P4b AGP-67) — 실행 중(RUNNING) run에서만 센다(전달은 도구 호출 때 일어난다).
 * 구 백엔드(필드 없음)는 0.
 */
export function pendingDirectives(run: AgentCurrentRun | null | undefined): number {
  return run?.status === "RUNNING" ? (run.pendingDirectiveCount ?? 0) : 0;
}

/** 실행 중 지시 API가 있는 서버인가 — 사무실 응답의 현재 run에 `pendingDirectiveCount`가 실려 오면 있다 */
export function supportsLiveDirective(run: AgentCurrentRun | null | undefined): boolean {
  return run?.pendingDirectiveCount !== undefined;
}

/** 원격 접속 말풍선 1행 */
export const REMOTE_BUBBLE = "원격 작업 중";

/**
 * 말풍선 2행 — 가림 표지는 좁은 말풍선에서 잘리면 "run=12 (본문 생…"처럼 깨진 문구가 되므로
 * 도구의 한글 라벨로 바꾼다(모르는 도구는 도구명). 가리지 않은 요약은 원문(넘치면 CSS 말줄임 한 번).
 */
export function bubbleActivity(persona: AgentOfficePersona): string | null {
  const text = activityText(persona);
  const last = persona.lastActivity;
  if (!text || !last) return text;
  return isRedactedSummary(text) ? toolLabel(last.tool) : text;
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

/** 말풍선 문구(스펙 §4.1). 유휴·비활성은 말풍선 없음. 원격 접속은 "원격 작업 중" / 최근 활동 도구 라벨(AGP-63) */
export function bubbleText(persona: AgentOfficePersona): BubbleText | null {
  const state = personaState(persona);
  if (state === "REMOTE") {
    const tool = persona.lastActivity?.tool;
    return { line1: REMOTE_BUBBLE, prefix: null, issueKey: null, line2: tool ? toolLabel(tool) : null };
  }
  const run = persona.currentRun;
  if (!run || state === "IDLE" || state === "INACTIVE") return null;
  if (isProjectWideMeeting(run)) {
    // 합성 키는 이슈가 아니다 — 1행은 회의 라벨(상태 접두가 있으면 앞에)
    const statePrefix =
      state === "RUNNING" ? null : isAwaitingRunner(run) ? RUNNER_WAIT_PREFIX : (STATE_PREFIX[state] ?? null);
    const label = meetingLabel(run.type);
    const activity =
      state === "RUNNING" || state === "WAITING_APPROVAL" ? bubbleActivity(persona) : runnerWaitBubble(run);
    return { line1: statePrefix ? `${statePrefix} · ${label}` : label, prefix: statePrefix, issueKey: null, line2: activity };
  }
  const key = run.issueKey;
  let prefix: string | null;
  if (state === "RUNNING") prefix = run.type === "REVIEW" ? (key ? "리뷰" : "리뷰 중") : key ? null : "작업 중";
  else if (isAwaitingRunner(run)) prefix = RUNNER_WAIT_PREFIX;
  else prefix = STATE_PREFIX[state] ?? "";
  const line1 = prefix && key ? `${prefix} · ${key}` : (key ?? prefix ?? "");
  const activity =
    state === "RUNNING" || state === "WAITING_APPROVAL" ? bubbleActivity(persona) : runnerWaitBubble(run);
  return { line1, prefix, issueKey: key, line2: activity };
}

/**
 * 아바타·책상 버튼의 접근 이름(스펙 §4.4) — 요약은 말줄임 전 원문. 회의실에 앉아 있으면
 * `", 회의 중 — {회의 이름}"`을 덧붙인다(P3e §2.7).
 */
export function personaAccessibleName(persona: AgentOfficePersona, meetingName: string | null = null): string {
  const state = personaState(persona);
  const parts = [persona.name, AGENT_ROLE_LABEL[persona.role], personaStateText(state)];
  const run = persona.currentRun;
  if (run && state !== "INACTIVE") {
    if (isProjectWideMeeting(run)) parts.push(`${meetingLabel(run.type)} ${PROJECT_WIDE_LABEL}`);
    else if (run.issueKey) parts.push(`이슈 ${run.issueKey}`);
  }
  const activity = state === "INACTIVE" ? null : activityText(persona);
  if (activity) parts.push(`최근 활동: ${activity}`);
  // 실행 위치(P4a) — 캔버스의 도트 집·러너 대기 말풍선과 같은 사실
  if (run && state !== "INACTIVE") {
    const wait = runnerWaitText(run);
    if (wait) parts.push(wait);
    else if (isLocalRun(run)) parts.push("내 PC 러너에서 실행");
    // 책상 위 편지 표식과 같은 사실
    const pending = pendingDirectives(run);
    if (pending > 0) parts.push(`전달 대기 중인 사람 지시 ${pending}건`);
  }
  if (meetingName) parts.push(`회의 중 — ${meetingName}`);
  return `${parts.join(", ")} — 말 걸기`;
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
    REMOTE: 0,
    IDLE: 0,
    INACTIVE: 0,
  };
  for (const p of personas) byState[personaState(p)] += 1;
  return { total: personas.length, byState };
}

const SUMMARY_ORDER: readonly AgentPersonaState[] = [
  "RUNNING",
  "QUEUED",
  "WAITING_APPROVAL",
  "BLOCKED",
  "REMOTE",
  "IDLE",
  "INACTIVE",
];

/**
 * 캔버스 첫 요소의 시각 숨김 요약 — "AI 팀원 6명 — 작업 중 2, 대기열 1, …"(0인 상태는 뺀다).
 * 회의실에 앉은 사람이 있으면 ", 회의 중 {n}"을 덧붙인다(P3e §2.9 — 상태가 아니라 위치라 따로 센다).
 */
export function officeSummaryText(personas: readonly AgentOfficePersona[], inMeeting = 0): string {
  const { total, byState } = officeCounts(personas);
  const parts = SUMMARY_ORDER.filter((s) => byState[s] > 0).map((s) => `${AGENT_STATUS_LABEL[s]} ${byState[s]}`);
  const base = parts.length > 0 ? `AI 팀원 ${total}명 — ${parts.join(", ")}` : `AI 팀원 ${total}명`;
  return inMeeting > 0 ? `${base}, 회의 중 ${inMeeting}` : base;
}

/**
 * 폴링 사이 새로 승인 대기·차단으로 바뀐 페르소나와 회의 시작·종료를 알린다(스펙 §10, P3e §6 라이브 알림).
 */
export function transitionAnnouncements(prev: AgentOffice | null, next: AgentOffice): string[] {
  if (!prev) return [];
  const before = new Map(prev.personas.map((p) => [p.id, personaState(p)]));
  const out: string[] = [];
  const ended = prev.activeMeeting;
  const started = next.activeMeeting;
  if (ended && (!started || started.runId !== ended.runId)) {
    const name = meetingLabel(ended.type);
    out.push(`${name}${subjectJosa(name)} 끝났습니다`);
  }
  if (started && (!ended || started.runId !== ended.runId)) {
    const name = meetingLabel(started.type);
    out.push(`${name}${subjectJosa(name)} 시작됐습니다 — 참석 ${started.attendeePersonaIds.length}명`);
  }
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

// ── P3e 회의실 ─────────────────────────────────────────────────

/** 먼 쪽 좌석 x(슬롯 0~4, 2 = 상석) · 가까운 쪽 좌석 x(슬롯 0~2) — 아바타 좌상단(P3e §1.2) */
export const FAR_SEATS_X: readonly number[] = [362, 382, 402, 422, 442];
export const NEAR_SEATS_X: readonly number[] = [378, 402, 426];
export const FAR_SEAT_Y = 84;
export const NEAR_SEAT_Y = 112;
/** 좌석 채우는 순서(§2.3) — 흔한 4~6명 회의에서 얼굴이 최대한 정면으로 보이게 */
const FILL_ORDER: readonly { side: "far" | "near"; slot: number }[] = [
  { side: "far", slot: 2 },
  { side: "far", slot: 1 },
  { side: "far", slot: 3 },
  { side: "near", slot: 1 },
  { side: "near", slot: 0 },
  { side: "near", slot: 2 },
  { side: "far", slot: 0 },
  { side: "far", slot: 4 },
];

export interface MeetingSeat {
  /** far = 정면 앉음, near = 뒷모습 앉음, stand = 9번째부터 입석 */
  side: "far" | "near" | "stand";
  x: number;
  y: number;
  host: boolean;
}

/** 회의 run의 현재 상태 — 진행자의 currentRun이 그 run이면 그 상태, 아니면 응답의 상태(§8) */
export function meetingRunStatus(meeting: AgentActiveMeeting, personas: readonly AgentOfficePersona[]): AgentRunStatus {
  const host = personas.find((p) => p.id === meeting.hostPersonaId);
  return host?.currentRun?.id === meeting.runId ? host.currentRun.status : meeting.status;
}

/**
 * 참석자인데 책상에 남는 이유(§2.2 규칙 2) — 회의가 아닌 자기 run이 승인 대기·차단이면 사람의 조치가 필요해 책상에 둔다.
 * 남지 않으면 null.
 */
export function deskStayState(
  persona: AgentOfficePersona,
  meeting: AgentActiveMeeting,
): "WAITING_APPROVAL" | "BLOCKED" | null {
  const run = persona.currentRun;
  if (!run || run.id === meeting.runId) return null;
  return run.status === "WAITING_APPROVAL" || run.status === "BLOCKED" ? run.status : null;
}

/**
 * 좌석 배정(§2.3) — 진행자 먼저 상석, 나머지는 정렬 순(`personas`가 이미 §1.5 정렬)으로 FILL_ORDER, 9번째부터 입석.
 * 비활성·명단 밖 id·책상 잔류 참석자는 좌석이 없다. 진행자가 앉지 못하면 상석은 비워 둔다(금테 의자에 남을 앉히지 않는다).
 * 같은 명단이면 결과가 같다 — 폴링마다 좌석이 바뀌지 않는다.
 */
export function meetingSeats(
  meeting: AgentActiveMeeting | null,
  personas: readonly AgentOfficePersona[],
): Map<string, MeetingSeat> {
  const seats = new Map<string, MeetingSeat>();
  if (!meeting) return seats;
  const attending = new Set(meeting.attendeePersonaIds);
  const seated = personas.filter((p) => attending.has(p.id) && p.active && !deskStayState(p, meeting));
  const host = seated.find((p) => p.id === meeting.hostPersonaId);
  const others = seated.filter((p) => p !== host);
  const order = host ? FILL_ORDER : FILL_ORDER.slice(1);
  const queue = host ? [host, ...others] : others;
  queue.forEach((p, n) => {
    const place = order[n];
    if (place) {
      const x = place.side === "far" ? FAR_SEATS_X[place.slot] : NEAR_SEATS_X[place.slot];
      seats.set(p.id, {
        side: place.side,
        x,
        y: place.side === "far" ? FAR_SEAT_Y : NEAR_SEAT_Y,
        host: p === host,
      });
    } else {
      const j = n - order.length;
      seats.set(p.id, { side: "stand", x: 362 + 20 * (j % 5), y: 140 + 28 * Math.floor(j / 5), host: false });
    }
  });
  return seats;
}

/** 회의 이름 — "착수/계획 회의"·"매니저 보고"(§2.4) */
export function meetingName(meeting: AgentActiveMeeting): string {
  return meetingLabel(meeting.type);
}

/** 경과 분 — 시작 시각이 없거나 못 읽으면 null */
export function meetingElapsedMinutes(startedAt: string | null, now: number): number | null {
  if (!startedAt) return null;
  const ms = now - Date.parse(startedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 60_000));
}

/** "12분째" / 1분 미만 "방금" / 모름 null */
export function meetingElapsedText(startedAt: string | null, now: number): string | null {
  const minutes = meetingElapsedMinutes(startedAt, now);
  if (minutes === null) return null;
  return minutes < 1 ? "방금" : `${minutes}분째`;
}

/** 안건 표기 — 이슈 키 또는 "프로젝트 전반" */
export function meetingAgendaText(meeting: AgentActiveMeeting): string {
  const key = linkableIssueKey(meeting);
  return key ?? PROJECT_WIDE_LABEL;
}

/** 회의실 표찰(§2.4) — 회의 중 "{회의 이름} · {n}분째", 없으면 "회의실" */
export function meetingSignText(meeting: AgentActiveMeeting | null, now: number): string {
  if (!meeting) return "회의실";
  const elapsed = meetingElapsedText(meeting.startedAt, now);
  return elapsed ? `${meetingName(meeting)} · ${elapsed}` : meetingName(meeting);
}

/** 회의실 버튼 접근 이름(§2.7) */
export function meetingRoomAccessibleName(meeting: AgentActiveMeeting | null, now: number): string {
  if (!meeting) return "회의실 — 진행 중인 회의 없음";
  const parts = [
    `회의실 — ${meetingName(meeting)} 진행 중`,
    `안건 ${meetingAgendaText(meeting)}`,
    `참석 ${meeting.attendeePersonaIds.length}명`,
  ];
  const elapsed = meetingElapsedText(meeting.startedAt, now);
  if (elapsed) parts.push(elapsed);
  return parts.join(", ");
}

/** 가중치 뽑기 — rng는 [0,1) */
export function pickWeighted<T>(items: readonly { value: T; weight: number }[], rng: () => number): T | null {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  if (items.length === 0 || total <= 0) return null;
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it.value;
  }
  return items[items.length - 1].value;
}

/** 회의 종류별 미니 말풍선 풀(§2.5) — 가중치는 % */
export const MICRO_BUBBLE_POOLS: Record<AgentMeetingType, readonly { value: MicroGlyph; weight: number }[]> = {
  MEETING: [
    { value: "DOTS", weight: 40 },
    { value: "BULB", weight: 25 },
    { value: "QUESTION", weight: 20 },
    { value: "CHART", weight: 15 },
  ],
  RETRO: [
    { value: "DOTS", weight: 35 },
    { value: "BULB", weight: 20 },
    { value: "STAR", weight: 30 },
    { value: "CHECK", weight: 15 },
  ],
  ESCALATION: [
    { value: "DOTS", weight: 45 },
    { value: "QUESTION", weight: 35 },
    { value: "SWEAT", weight: 20 },
  ],
  MANAGER: [
    { value: "CHECK", weight: 40 },
    { value: "DOC", weight: 60 },
  ],
};

/**
 * 오늘 커피값 재미 카피(§4.2) — 킬 스위치가 먼저, 그다음 이달 상한 90% 경고, 그다음 오늘 비용 구간.
 */
export function coffeeCopy(todayUsd: number, budget: AgentBudget): string {
  if (budget.killSwitch) return "커피 머신 전원이 꺼져 있어요 (킬 스위치)";
  const cap = budget.monthlyCapUsd;
  if (cap !== null && cap > 0 && budget.platformMonthToDateUsd >= cap * 0.9) return "이달 원두가 거의 떨어졌어요";
  if (todayUsd <= 0) return "아직 한 잔도 안 마셨어요";
  if (todayUsd < 1) return "가볍게 한 잔";
  if (todayUsd < 5) return "적당히 마시는 중";
  return "오늘은 카페인 과다!";
}

// ── P3e 게시판 "지금 만드는 것" ─────────────────────────────────

export interface EpicGoal {
  issue: Issue;
  kind: StatusKind;
  done: number;
  total: number;
  /** 에픽 또는 그 자손을 지금 맡은 활성 페르소나 */
  workers: AgentOfficePersona[];
}

const KIND_RANK: Record<StatusKind, number> = { active: 0, new: 1, complete: 2 };

const keyNumber = (key: string) => {
  const n = Number(key.slice(key.lastIndexOf("-") + 1));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

/**
 * 목표(에픽)와 진행(§3.4) — 목표 = 타입 계층 epic인 이슈(없으면 parentId 없고 하위가 있는 이슈), 진행 = 모든 자손 중
 * 완료 kind 수(방문 집합으로 순환 방지). 정렬: 진행 중 → 할 일 → 완료, 같은 그룹은 AI 작업 수 내림차순 → 키 번호 오름차순.
 */
export function epicGoals(
  issues: readonly Issue[],
  types: readonly IssueTypeDef[] | undefined,
  statuses: readonly WorkflowStatus[] | undefined,
  personas: readonly AgentOfficePersona[],
): EpicGoal[] {
  const typeList = types ? [...types] : undefined;
  const statusList = statuses ? [...statuses] : undefined;
  const children = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.parentId) continue;
    const list = children.get(issue.parentId) ?? [];
    list.push(issue);
    children.set(issue.parentId, list);
  }
  let roots = issues.filter((i) => typeLevel(typeList, i.type) === "epic");
  if (roots.length === 0) roots = issues.filter((i) => i.parentId === null && (children.get(i.id)?.length ?? 0) > 0);

  const working = personas.filter((p) => p.active && p.currentRun?.issueKey);
  const goals = roots.map((epic): EpicGoal => {
    const seen = new Set<string>([epic.id]);
    const descendants: Issue[] = [];
    const stack = [...(children.get(epic.id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      descendants.push(next);
      stack.push(...(children.get(next.id) ?? []));
    }
    const keys = new Set([epic.key, ...descendants.map((d) => d.key)]);
    return {
      issue: epic,
      kind: statusKind(statusList, epic.status),
      done: descendants.filter((d) => statusKind(statusList, d.status) === "complete").length,
      total: descendants.length,
      workers: working.filter((p) => keys.has(p.currentRun!.issueKey!)),
    };
  });
  return goals.sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      b.workers.length - a.workers.length ||
      keyNumber(a.issue.key) - keyNumber(b.issue.key),
  );
}

/** 도트 진행바 채움 칸(§3.3) — 10칸, 시작했으면 최소 1칸·덜 끝났으면 최대 9칸 */
export function progressCells(done: number, total: number, cells = 10): number {
  if (total <= 0 || done <= 0) return 0;
  if (done >= total) return cells;
  return Math.min(cells - 1, Math.max(1, Math.round((done / total) * cells)));
}
