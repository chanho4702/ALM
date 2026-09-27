/**
 * AI 사무실 1:1 대화 대사(P3g §5) — 모든 문구가 이 한 곳에 있다. 봇 대사는 데이터 기반 템플릿(즉답)이고
 * 수다만 LLM이다. 롤 말버릇은 무작위가 아니라 해시라 테스트가 결정적이다.
 */
import type { AgentOfficePersona, AgentPersonaActivity, AgentRole, AgentRunSummary } from "../store/types";
import { agentMeetingRunName, type AgentPersonaState } from "../components/AgentGlyphs";
import type { AgentMeetingType } from "../store/types";
import { relTime } from "../components/time";
import { fnv1a32 } from "./pixel";
import { isTerminal, linkableIssueKey, personaState, PROJECT_WIDE_LABEL, subjectJosa, toolLabel } from "./officeModel";

/** 표정(§4.6) — 깜빡임은 평소 표정의 장식이라 대사가 고르지 않는다 */
export type Mood = "NORMAL" | "THINKING" | "HAPPY" | "TROUBLED";

export interface Utterance {
  text: string;
  mood: Mood;
}

const say = (text: string, mood: Mood = "NORMAL"): Utterance => ({ text, mood });

// ── 조사 ──

/** 받침 여부 — 한글은 음절, 숫자는 읽는 소리(영·일·삼·육·칠·팔 = 받침), 그 밖은 받침 없음으로 본다 */
function hasBatchim(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;
  const code = last.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) return code % 28 !== 0;
  if (/[0-9]/.test(last)) return "013678".includes(last);
  return false;
}

/** 목적격 — 을/를 */
export const objectJosa = (word: string) => (hasBatchim(word) ? "을" : "를");
/** 서술격 — 이에요/예요 */
export const copulaJosa = (word: string) => (hasBatchim(word) ? "이에요" : "예요");
/** 주제 — 은/는 */
export const topicJosa = (word: string) => (hasBatchim(word) ? "은" : "는");
/** 공동 — 과/와 */
export const withJosa = (word: string) => (hasBatchim(word) ? "과" : "와");

/** 이모지를 뺀 이름 — 이름표·대사용 */
export const plainName = (persona: Pick<AgentOfficePersona, "name">) => persona.name.trim();

// ── 롤 말버릇 ──

const ROLE_HABIT: Record<AgentRole, string> = {
  PLANNER: "정리하자면,",
  DESIGNER: "음, 보기엔,",
  FRONTEND: "화면 쪽은,",
  BACKEND: "서버 쪽은,",
  OPS: "배포 쪽은,",
  REVIEWER: "꼼꼼히 보면,",
  MANAGER: "보고드리자면,",
};

const localDate = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** 말버릇 — hash(personaId + 날짜 + 발화 번호) % 3 === 0일 때만 첫 문장 앞에 붙는다 */
export function roleHabit(persona: Pick<AgentOfficePersona, "id" | "role">, utteranceNo: number, now: number): string | null {
  return fnv1a32(`${persona.id}${localDate(now)}${utteranceNo}`) % 3 === 0 ? ROLE_HABIT[persona.role] : null;
}

const withHabit = (habit: string | null, sentences: string[]) =>
  habit && sentences.length > 0 ? [`${habit} ${sentences[0]}`, ...sentences.slice(1)] : sentences;

// ── 도구 라벨(말풍선과 같은 표 — officeModel) ──

export { toolLabel };

/** `{키}` — 실이슈 키, 합성 키 회의는 "프로젝트 전반", 이슈 없음은 null */
function keyText(run: { type: AgentRunSummary["type"]; issueKey: string | null }): string | null {
  const key = linkableIssueKey(run);
  if (key) return key;
  return run.issueKey ? PROJECT_WIDE_LABEL : null;
}

const MEETING_TYPES: readonly string[] = ["MEETING", "RETRO", "ESCALATION", "MANAGER"];

// ── 인사(§5.8) ──

export interface GreetingContext {
  /** 회의실 좌석에 앉아 있다(문 앞에서 부르는 연출) */
  inMeeting: boolean;
  /** 오늘 이미 대화한 기록이 있다 */
  metToday: boolean;
}

export function greetingLine(persona: AgentOfficePersona, ctx: GreetingContext): Utterance {
  const state = personaState(persona);
  let base: Utterance;
  if (ctx.inMeeting) base = say("회의 중이라 잠깐만요! 무슨 일이세요?");
  else if (state === "RUNNING") base = say("아, 네! 작업하면서 들을게요.");
  else if (state === "QUEUED") base = say("곧 제 차례예요. 무슨 일이세요?");
  else if (state === "WAITING_APPROVAL") base = say("마침 잘 오셨어요, 승인 기다리던 참이에요.", "TROUBLED");
  else if (state === "BLOCKED") base = say("으… 막혀 있었는데 와 주셨네요.", "TROUBLED");
  else base = say("안녕하세요! 뭐 도와드릴까요?", "HAPPY");
  return ctx.metToday ? { ...base, text: `또 오셨네요! ${base.text}` } : base;
}

// ── "지금 뭐 해?"(§5.2) ──

export type StatusContext = "GATES" | "RUN_DETAIL" | null;

export interface StatusAnswer extends Utterance {
  /** 답 뒤 메뉴 맨 위에 붙는 상황 선택지(최대 1개) */
  context: StatusContext;
}

export const STATUS_LOADING = say("잠깐만요, 확인해 볼게요…", "THINKING");
/** 원격 접속(AGP-63) — 워커 실행이 아니라 사람이 연결한 외부 MCP로 일하는 중 */
export const REMOTE_STATUS = "지금 밖에서 원격으로 작업 중이에요 — 외부 MCP로 연결돼 있어요.";

const sameLocalDay = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString();

/** 오늘 종결 run 수 — activity가 있으면 그것, 없으면 사무실 최근 run */
function finishedToday(personaId: string, activity: AgentPersonaActivity | null, recentRuns: readonly AgentRunSummary[], now: number) {
  const runs = activity?.runs ?? recentRuns.filter((r) => r.personaId === personaId);
  const seen = new Set<string>();
  return runs.filter((r) => {
    if (seen.has(r.id) || !isTerminal(r.status) || !r.endedAt || !sameLocalDay(r.endedAt, now)) return false;
    seen.add(r.id);
    return true;
  }).length;
}

export function statusAnswer(
  persona: AgentOfficePersona,
  activity: AgentPersonaActivity | null,
  recentRuns: readonly AgentRunSummary[],
  utteranceNo: number,
  now: number = Date.now(),
): StatusAnswer {
  const state = personaState(persona);
  const run = state === "INACTIVE" ? null : persona.currentRun;
  const sentences: string[] = [];
  let mood: Mood = "NORMAL";
  let context: StatusContext = null;
  const key = run ? keyText(run) : null;
  const at = (k: string | null, suffix: string, plain: string) => (k ? `${k}${suffix}` : plain);

  if (run && run.status === "RUNNING" && MEETING_TYPES.includes(run.type)) {
    const name = agentMeetingRunName(run.type as AgentMeetingType);
    sentences.push(`${name} 중이에요.`);
    if (key) sentences.push(`안건은 ${key}${copulaJosa(key)}.`);
  } else if (run && run.status === "RUNNING" && run.type === "REVIEW") {
    sentences.push(at(key, " 검토하고 있어요.", "검토하고 있어요."));
  } else if (run && run.status === "RUNNING") {
    sentences.push(key ? `지금은 ${key} 작업 중이에요.` : "지금은 작업 중이에요.");
    if (run.startedAt) sentences.push(`${relTime(run.startedAt, now)}부터 하고 있어요.`);
    if (run.attempt >= 2) sentences.push(`이번이 ${run.attempt}번째 시도예요.`);
  } else if (run && run.status === "QUEUED") {
    sentences.push(at(key, " 차례를 기다리는 중이에요.", "제 차례를 기다리는 중이에요."));
  } else if (run && run.status === "WAITING_APPROVAL") {
    sentences.push(at(key, "에서 승인을 기다리고 있어요.", "승인을 기다리고 있어요."), "봐 주실 수 있나요?");
    mood = "TROUBLED";
    context = "GATES";
  } else if (run && run.status === "BLOCKED") {
    sentences.push(at(key, "에서 막혔어요…", "막혔어요…"), "사람이 확인해 줘야 해요.");
    mood = "TROUBLED";
    context = "RUN_DETAIL";
  } else if (state === "REMOTE") {
    sentences.push(REMOTE_STATUS);
  } else {
    sentences.push("지금은 쉬는 중이에요.");
    const n = finishedToday(persona.id, activity, recentRuns, now);
    if (n >= 1) sentences.push(`오늘은 ${n}건 끝냈어요.`);
    mood = "HAPPY";
  }

  // 원격 접속은 활동 조회가 늦어도 사무실 스냅샷의 최근 활동(5분 이내)으로 꼬리를 단다
  const latest = activity?.todayAudits[0] ?? (state === "REMOTE" ? persona.lastActivity : null);
  if (latest) {
    const label = toolLabel(latest.tool);
    const minutes = (now - Date.parse(latest.createdAt)) / 60_000;
    const when = Number.isFinite(minutes) && minutes > 5 ? `${relTime(latest.createdAt, now)}에는` : "방금 전엔";
    sentences.push(`${when} ${label}${objectJosa(label)} 했어요.`);
  }
  return { text: withHabit(roleHabit(persona, utteranceNo, now), sentences).join(" "), mood, context };
}

// ── "잘 가"(§5.6) ──

export function farewellLine(persona: AgentOfficePersona, inMeeting: boolean): Utterance {
  const state: AgentPersonaState = personaState(persona);
  if (inMeeting) return say("회의 마저 하고 올게요!", "HAPPY");
  if (state === "RUNNING") return say("그럼 하던 거 마저 할게요!", "HAPPY");
  if (state === "WAITING_APPROVAL" || state === "BLOCKED") return say("승인 기다리고 있을게요.", "HAPPY");
  return say("또 불러 주세요!", "HAPPY");
}

// ── 권한(§5.7) ──

export const MANAGE_REASON = "프로젝트 관리자만 AI 팀원에게 일을 시킬 수 있어요";
export const MANAGE_DENIED = say("그건 프로젝트 관리자만 시킬 수 있어요. 대신 지금 뭐 하는지는 알려 드릴게요!", "TROUBLED");

// ── 지시하기(§5.3) ──

export const DIRECTIVE_ASK = say("네, 말씀하세요.");
export const DIRECTIVE_WHERE = say("어디에 남길까요?");
export const NO_CURRENT_ISSUE = "지금 맡은 이슈가 없어요";
export const NEXT_STEP_NOTICE = "지금 실행 중인 작업에는 다음 단계(승인 뒤 이어하기·재개·수정 run·다음 작업)부터 반영돼요.";
export const DIRECTIVE_OK = say("알겠어요! 다음 단계에서 꼭 반영할게요.", "HAPPY");
export const DIRECTIVE_FORBIDDEN = say("이 이슈엔 코멘트를 남길 권한이 없대요.", "TROUBLED");
export const ISSUE_NOT_FOUND = say("그 이슈를 찾을 수 없어요.", "TROUBLED");
export const DIRECTIVE_FAILED = say("지금은 전달이 안 돼요. 잠시 뒤 다시 해 볼까요?", "TROUBLED");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** 지시 코멘트 본문 — 사람 명의 코멘트라 워커 프롬프트의 "사람 코멘트 = 지시" 규약을 탄다 */
export function directiveCommentHtml(personaName: string, body: string): string {
  const text = escapeHtml(body.trim()).replace(/\r?\n/g, "<br>");
  return `<p><strong>[AI 사무실 지시 → ${escapeHtml(personaName)}]</strong></p><p>${text}</p>`;
}

// ── 맡아줘(§5.4) ──

export const ASSIGN_ASK = say("어떤 이슈요?");
export const assignOk = (key: string, killSwitch: boolean): Utterance =>
  killSwitch ? say(`${key}, 스위치가 풀리면 바로 할게요!`, "HAPPY") : say(`${key}, 바로 시작할게요!`, "HAPPY");
export const ASSIGN_CONFLICT = say("그 이슈는 이미 누가 잡고 있어요.", "TROUBLED");
export const ASSIGN_INACTIVE = say("지금은 제가 쉴 수밖에 없는 상태래요(비활성).", "TROUBLED");
export const ASSIGN_FAILED = say("지금은 맡을 수가 없어요. 잠시 뒤 다시 해 볼까요?", "TROUBLED");

/** 모델 선택(로컬 상수 — 모델 목록 API는 후속). 빈 문자열 value 금지(DS 함정) → 센티널 */
export const MODEL_DEFAULT = "__default__";
export const AGENT_MODEL_OPTIONS: readonly string[] = [
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
];

// ── 수다(§5.5) ──

export const CHAT_OFF = say("지금은 수다 모드가 꺼져 있어요. 관리자가 켜 주면 얘기해요!", "TROUBLED");
export const CHAT_START = say("좋아요, 무슨 얘기 할까요?");
export const CHAT_STOPPED = say("지금은 모두 멈춘 상태라 수다도 쉬어요.", "TROUBLED");
export const CHAT_SLOW = say("잠깐 쉬었다 얘기해요.", "TROUBLED");
export const CHAT_FAILED = say("말이 잘 안 나오네요… 다시 해 볼까요?", "TROUBLED");
export const CHAT_ENOUGH = say("오늘은 여기까지 얘기해요!", "HAPPY");
/** 한 장면 수다 턴 상한 */
export const CHAT_TURN_LIMIT = 20;
export const CHAT_MAX = 500;

// ── 끝내기 확인 ──

export const EXIT_CONFIRM = "입력한 내용이 사라져요. 대화를 끝낼까요?";

// ── 캔버스 live 문구 ──

export const awayNotice = (name: string) => `${name}${topicJosa(name)} 지금 자리에 없어요`;
export const NOBODY_NEAR = "근처에 말 걸 팀원이 없어요 — Tab으로 팀원을 고르세요";
export const dialogTitle = (name: string) => `${name}${withJosa(name)} 대화`;
export const logLabel = (name: string) => `${name}${withJosa(name)}의 대화 기록`;
export { subjectJosa };
