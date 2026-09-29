import type { ComponentType } from "react";
import { Lozenge } from "@chanho/react";
import {
  AppWindow,
  Ban,
  Bot,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  Coffee,
  Cog,
  FolderKanban,
  GitMerge,
  Globe,
  HardHat,
  Hourglass,
  House,
  Keyboard,
  Laptop,
  Mail,
  MailX,
  Palette,
  Plug,
  PowerOff,
  RotateCcw,
  SearchCheck,
  Server,
  ServerCog,
  Siren,
  Sparkles,
  TriangleAlert,
  UserRound,
  UsersRound,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import type {
  AgentActiveRunStatus,
  AgentAuditOrigin,
  AgentExecutionSite,
  AgentGateKind,
  AgentMeetingType,
  AgentReviewerSource,
  AgentRole,
  AgentRunStatus,
  AgentRunTrigger,
  AgentRunType,
  AgentRunnerStatus,
} from "../store/types";

/**
 * AI 팀 값 글리프(스펙 §6.2) — 페르소나 상태·run 상태·롤. 사무실(캔버스·카드·패널)과 T3(run 목록·게이트)이
 * 같은 표기를 쓴다. 아이콘 + 텍스트 규약: 텍스트만 쓰지 않고, 색만으로 구분하지 않는다.
 * `variant`는 `StatusGlyph`와 같은 계약 — `auto`는 아이콘이 스스로 이름을 읽고, `icon`은 옆에 이름이 있을 때 숨는다.
 */

/** REMOTE(AGP-63) = 활성 run 없이 외부 MCP(사람이 발급한 페르소나 토큰)로 일하는 중 */
export type AgentPersonaState = AgentActiveRunStatus | "REMOTE" | "IDLE" | "INACTIVE";

/** 원격 접속 상태의 부연 — 접근 이름·팀 카드가 상태 라벨 뒤에 붙인다("원격 접속 중 — 외부 MCP") */
export const AGENT_REMOTE_DETAIL = "외부 MCP";

type Appearance = "neutral" | "info" | "success" | "warning" | "danger";
type Icon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

interface GlyphDef {
  icon: Icon;
  label: string;
  appearance: Appearance;
}

const PERSONA_STATES: Record<AgentPersonaState, GlyphDef> = {
  RUNNING: { icon: Keyboard, label: "작업 중", appearance: "info" },
  QUEUED: { icon: Hourglass, label: "대기열", appearance: "neutral" },
  WAITING_APPROVAL: { icon: CircleAlert, label: "승인 대기", appearance: "warning" },
  BLOCKED: { icon: Ban, label: "차단됨", appearance: "danger" },
  REMOTE: { icon: Laptop, label: "원격 접속 중", appearance: "info" },
  IDLE: { icon: Coffee, label: "휴식 중", appearance: "neutral" },
  INACTIVE: { icon: PowerOff, label: "비활성", appearance: "neutral" },
};

const RUN_STATES: Record<AgentRunStatus, GlyphDef> = {
  QUEUED: { icon: Hourglass, label: "대기열", appearance: "neutral" },
  RUNNING: { icon: Keyboard, label: "실행 중", appearance: "info" },
  WAITING_APPROVAL: { icon: CircleAlert, label: "승인 대기", appearance: "warning" },
  BLOCKED: { icon: Ban, label: "차단됨", appearance: "danger" },
  DONE: { icon: CircleCheck, label: "완료", appearance: "success" },
  FAILED: { icon: TriangleAlert, label: "실패", appearance: "danger" },
  CANCELLED: { icon: CircleSlash, label: "취소됨", appearance: "neutral" },
};

const ROLES: Record<AgentRole, { icon: Icon; label: string }> = {
  PLANNER: { icon: ClipboardList, label: "기획" },
  DESIGNER: { icon: Palette, label: "디자인" },
  FRONTEND: { icon: AppWindow, label: "프론트엔드" },
  BACKEND: { icon: Server, label: "백엔드" },
  OPS: { icon: HardHat, label: "운영" },
  REVIEWER: { icon: SearchCheck, label: "리뷰" },
  // 기획(ClipboardList)·계획 게이트(ClipboardCheck)와 겹치지 않는 클립보드 — 매니저 보고 run과 같은 그림
  MANAGER: { icon: ClipboardPen, label: "매니저" },
};

export const AGENT_STATUS_LABEL: Record<AgentPersonaState, string> = Object.fromEntries(
  Object.entries(PERSONA_STATES).map(([k, v]) => [k, v.label]),
) as Record<AgentPersonaState, string>;

export const AGENT_RUN_STATUS_LABEL: Record<AgentRunStatus, string> = Object.fromEntries(
  Object.entries(RUN_STATES).map(([k, v]) => [k, v.label]),
) as Record<AgentRunStatus, string>;

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = Object.fromEntries(
  Object.entries(ROLES).map(([k, v]) => [k, v.label]),
) as Record<AgentRole, string>;

interface GlyphProps {
  size?: 12 | 14 | 16;
  variant?: "auto" | "icon";
}

function Glyph({ def, prefix, size = 14, variant = "auto" }: GlyphProps & { def: GlyphDef; prefix: string }) {
  const Icon = def.icon;
  const name = `${prefix}${def.label}`;
  const labelProps =
    variant === "icon"
      ? { "aria-hidden": true as const, title: name }
      : { role: "img", "aria-label": name, title: name };
  return (
    <span className={`status-glyph is-${def.appearance}`} {...labelProps}>
      <Icon size={size} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

/** 페르소나 상태 아이콘 — 접근 이름 "AI 상태: 작업 중" */
export function AgentStatusGlyph({ state, ...rest }: GlyphProps & { state: AgentPersonaState }) {
  return <Glyph def={PERSONA_STATES[state]} prefix="AI 상태: " {...rest} />;
}

/** 페르소나 상태 Lozenge — 안에 아이콘 12px + 라벨 */
export function AgentStatusLozenge({ state }: { state: AgentPersonaState }) {
  const def = PERSONA_STATES[state];
  const Icon = def.icon;
  return (
    <Lozenge appearance={def.appearance} className={`agent-lozenge is-${def.appearance}`}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      {def.label}
    </Lozenge>
  );
}

/** run 상태 아이콘 — 접근 이름 "실행 상태: 완료" */
export function AgentRunStatusGlyph({ status, ...rest }: GlyphProps & { status: AgentRunStatus }) {
  return <Glyph def={RUN_STATES[status]} prefix="실행 상태: " {...rest} />;
}

/** run 상태 Lozenge — 아이콘 + 텍스트(목록 행·게시판) */
export function AgentRunStatusLozenge({ status }: { status: AgentRunStatus }) {
  const def = RUN_STATES[status];
  const Icon = def.icon;
  return (
    <Lozenge appearance={def.appearance} className={`agent-lozenge is-${def.appearance}`}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      {def.label}
    </Lozenge>
  );
}

/** 롤 아이콘만(장식) — Select 옵션처럼 옆에 라벨 텍스트가 따로 있는 자리 */
export function AgentRoleIcon({ role, size = 14 }: { role: AgentRole; size?: 12 | 14 | 16 }) {
  const Icon = ROLES[role].icon;
  return <Icon size={size} aria-hidden />;
}

/** 롤 — 아이콘 + 한국어 라벨(색만으로 롤을 말하지 않는다) */
export function AgentRoleGlyph({ role, size = 14 }: { role: AgentRole; size?: 12 | 14 | 16 }) {
  const def = ROLES[role];
  const Icon = def.icon;
  return (
    <span className="status-cell agent-role">
      <Icon size={size} aria-hidden />
      {def.label}
    </span>
  );
}

/** 회의 종류 — 게시판·회의 소집 모달·run 목록이 같은 이름을 쓴다 */
export const AGENT_MEETING_TYPE_LABEL: Record<AgentMeetingType, string> = {
  MEETING: "착수/계획",
  RETRO: "회고",
  ESCALATION: "에스컬레이션",
  MANAGER: "매니저 보고",
};
/** 말풍선·토스트의 run 이름 — 매니저 보고는 회의가 아니라 " 회의"를 붙이지 않는다 */
export function agentMeetingRunName(type: AgentMeetingType): string {
  return type === "MANAGER" ? AGENT_MEETING_TYPE_LABEL[type] : `${AGENT_MEETING_TYPE_LABEL[type]} 회의`;
}
export const AGENT_RUN_TYPE_LABEL: Record<AgentRunType, string> = {
  TASK: "작업",
  REVIEW: "리뷰",
  ...AGENT_MEETING_TYPE_LABEL,
};
export const AGENT_RUN_TRIGGER_LABEL: Record<AgentRunTrigger, string> = { SCHEDULER: "자동", USER: "수동" };
export const AGENT_GATE_KIND_LABEL: Record<AgentGateKind, string> = {
  MERGE: "머지",
  ESCALATION: "에스컬레이션",
  PLAN: "계획",
};

/** 에스컬레이션은 게이트 종류와 같은 사이렌 — 같은 뜻에 같은 그림 */
const MEETING_TYPE_ICONS: Record<AgentMeetingType, Icon> = {
  MEETING: UsersRound,
  RETRO: RotateCcw,
  ESCALATION: Siren,
  MANAGER: ClipboardPen,
};
const RUN_TYPE_ICONS: Record<AgentRunType, Icon> = { TASK: Wrench, REVIEW: SearchCheck, ...MEETING_TYPE_ICONS };
const RUN_TRIGGER_ICONS: Record<AgentRunTrigger, Icon> = { SCHEDULER: CalendarClock, USER: UserRound };
const GATE_KIND_ICONS: Record<AgentGateKind, Icon> = { MERGE: GitMerge, ESCALATION: Siren, PLAN: ClipboardCheck };

function IconText({ icon: IconComp, label, size = 14 }: { icon: Icon; label: string; size?: 12 | 14 | 16 }) {
  return (
    <span className="status-cell">
      <IconComp size={size} aria-hidden />
      {label}
    </span>
  );
}

/** run 종류 — 작업(렌치)/리뷰(돋보기, 캔버스 돋보기와 같은 뜻) */
export function AgentRunTypeGlyph({ type, size }: { type: AgentRunType; size?: 12 | 14 | 16 }) {
  return <IconText icon={RUN_TYPE_ICONS[type]} label={AGENT_RUN_TYPE_LABEL[type]} size={size} />;
}

/** 회의 종류 — 착수/계획(사람들)/회고(되감기)/에스컬레이션(사이렌)/매니저 보고(펜 든 클립보드) */
export function AgentMeetingTypeGlyph({ type, size }: { type: AgentMeetingType; size?: 12 | 14 | 16 }) {
  return <IconText icon={MEETING_TYPE_ICONS[type]} label={AGENT_MEETING_TYPE_LABEL[type]} size={size} />;
}

/** 아이콘만(Select 옵션처럼 라벨이 따로 있는 자리) — 장식이라 접근 이름이 없다 */
export function AgentMeetingTypeIcon({ type, size = 14 }: { type: AgentMeetingType; size?: 12 | 14 | 16 }) {
  const IconComp = MEETING_TYPE_ICONS[type];
  return <IconComp size={size} aria-hidden />;
}

/** run 트리거 — 자동(스케줄러)/수동(사람 요청) */
export function AgentRunTriggerGlyph({ trigger, size }: { trigger: AgentRunTrigger; size?: 12 | 14 | 16 }) {
  return <IconText icon={RUN_TRIGGER_ICONS[trigger]} label={AGENT_RUN_TRIGGER_LABEL[trigger]} size={size} />;
}

/** 게이트 종류 — 머지/에스컬레이션/계획 */
export function AgentGateKindGlyph({ kind, size }: { kind: AgentGateKind; size?: 12 | 14 | 16 }) {
  return <IconText icon={GATE_KIND_ICONS[kind]} label={AGENT_GATE_KIND_LABEL[kind]} size={size} />;
}

/** 감사 출처(AGP-63) — 워커 실행(로봇)/외부 MCP(플러그)/시스템(톱니) */
const AUDIT_ORIGINS: Record<AgentAuditOrigin, { icon: Icon; label: string }> = {
  WORKER: { icon: Bot, label: "워커 실행" },
  EXTERNAL: { icon: Plug, label: "외부 MCP" },
  SYSTEM: { icon: Cog, label: "시스템" },
};

/** 감사 출처 텍스트 — 워커는 run 번호를 붙인다("워커 실행 #12") */
export function auditOriginLabel(origin: AgentAuditOrigin, runId: string | null): string {
  const base = AUDIT_ORIGINS[origin].label;
  return origin === "WORKER" && runId ? `${base} #${runId}` : base;
}

/** 감사 출처 배지 — 아이콘 + 텍스트. 링크로 감쌀지는 쓰는 쪽이 정한다 */
export function AgentAuditOriginGlyph({ origin, runId }: { origin: AgentAuditOrigin; runId: string | null }) {
  const IconComp = AUDIT_ORIGINS[origin].icon;
  return (
    <span className={`status-cell agent-origin is-${origin.toLowerCase()}`}>
      <IconComp size={12} aria-hidden />
      {auditOriginLabel(origin, runId)}
    </span>
  );
}

// ── 실행 위치·러너(P4a AGP-69) ──

/**
 * 실행 위치 — 서버(톱니 달린 서버: 롤 "백엔드"의 서버 그림과 구분)/내 PC 러너(집 — 사무실 모니터의 도트 집과 같은 뜻).
 */
const EXECUTION_SITES: Record<AgentExecutionSite, { icon: Icon; label: string }> = {
  SERVER: { icon: ServerCog, label: "서버" },
  LOCAL: { icon: House, label: "내 PC 러너" },
};

export const AGENT_EXECUTION_SITE_LABEL: Record<AgentExecutionSite, string> = {
  SERVER: EXECUTION_SITES.SERVER.label,
  LOCAL: EXECUTION_SITES.LOCAL.label,
};

/** 아이콘만(Select·Radio 옵션처럼 라벨이 옆에 따로 있는 자리) */
export function AgentExecutionSiteIcon({ site, size = 14 }: { site: AgentExecutionSite; size?: 12 | 14 | 16 | 20 }) {
  const IconComp = EXECUTION_SITES[site].icon;
  return <IconComp size={size} aria-hidden />;
}

/** 실행 위치 — 아이콘 + 텍스트 */
export function AgentExecutionSiteGlyph({ site, size }: { site: AgentExecutionSite; size?: 12 | 14 | 16 }) {
  return <IconText icon={EXECUTION_SITES[site].icon} label={EXECUTION_SITES[site].label} size={size} />;
}

const RUNNER_STATES: Record<AgentRunnerStatus, GlyphDef> = {
  ONLINE: { icon: Wifi, label: "온라인", appearance: "success" },
  OFFLINE: { icon: WifiOff, label: "오프라인", appearance: "warning" },
  NEVER_CONNECTED: { icon: CircleDashed, label: "연결 전", appearance: "neutral" },
  REVOKED: { icon: Ban, label: "철회됨", appearance: "neutral" },
};

export const AGENT_RUNNER_STATUS_LABEL: Record<AgentRunnerStatus, string> = Object.fromEntries(
  Object.entries(RUNNER_STATES).map(([k, v]) => [k, v.label]),
) as Record<AgentRunnerStatus, string>;

/** 러너 상태 Lozenge — 아이콘 + 텍스트(색만으로 온라인을 말하지 않는다) */
export function AgentRunnerStatusLozenge({ status }: { status: AgentRunnerStatus }) {
  const def = RUNNER_STATES[status];
  const IconComp = def.icon;
  return (
    <Lozenge appearance={def.appearance} className={`agent-lozenge is-${def.appearance}`}>
      <IconComp size={12} strokeWidth={2.25} aria-hidden />
      {def.label}
    </Lozenge>
  );
}

// ── 리뷰어 출처·지시 전달(P4b AGP-59·67) ──

/** 유효 리뷰어가 정해진 단계 — 프로젝트 설정 > 전역 설정 > 서버 env > 자동 > 없음 */
const REVIEWER_SOURCES: Record<AgentReviewerSource, GlyphDef> = {
  PROJECT: { icon: FolderKanban, label: "프로젝트 지정", appearance: "info" },
  PLATFORM: { icon: Globe, label: "전역 지정", appearance: "info" },
  ENV: { icon: Server, label: "서버 설정", appearance: "neutral" },
  AUTO: { icon: Sparkles, label: "자동 선택", appearance: "neutral" },
  NONE: { icon: TriangleAlert, label: "없음", appearance: "warning" },
};

export const AGENT_REVIEWER_SOURCE_LABEL: Record<AgentReviewerSource, string> = Object.fromEntries(
  Object.entries(REVIEWER_SOURCES).map(([k, v]) => [k, v.label]),
) as Record<AgentReviewerSource, string>;

/** 리뷰어 출처 Lozenge — 아이콘 + 텍스트 */
export function AgentReviewerSourceLozenge({ source }: { source: AgentReviewerSource }) {
  const def = REVIEWER_SOURCES[source];
  const IconComp = def.icon;
  return (
    <Lozenge appearance={def.appearance} className={`agent-lozenge is-${def.appearance}`}>
      <IconComp size={12} strokeWidth={2.25} aria-hidden />
      {def.label}
    </Lozenge>
  );
}

/**
 * 실행 중 지시 전달 상태 — 전달 대기(편지)/전달됨(두 번 체크)/전달 안 됨(run이 끝나 더는 전달되지 않는다 — 서버는 RUNNING일 때만 전달)
 */
export function AgentDirectiveDeliveryLozenge({ delivered, runEnded = false }: { delivered: boolean; runEnded?: boolean }) {
  if (!delivered && runEnded) {
    return (
      <Lozenge appearance="neutral" className="agent-lozenge is-neutral">
        <MailX size={12} strokeWidth={2.25} aria-hidden />
        전달 안 됨 — run 종료
      </Lozenge>
    );
  }
  return delivered ? (
    <Lozenge appearance="success" className="agent-lozenge is-success">
      <CheckCheck size={12} strokeWidth={2.25} aria-hidden />
      전달됨
    </Lozenge>
  ) : (
    <Lozenge appearance="warning" className="agent-lozenge is-warning">
      <Mail size={12} strokeWidth={2.25} aria-hidden />
      전달 대기
    </Lozenge>
  );
}
