import type { ComponentType } from "react";
import { Lozenge } from "@chanho/react";
import {
  AppWindow,
  Ban,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  ClipboardCheck,
  ClipboardList,
  Coffee,
  GitMerge,
  HardHat,
  Hourglass,
  Keyboard,
  Palette,
  PowerOff,
  RotateCcw,
  SearchCheck,
  Server,
  Siren,
  TriangleAlert,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import type {
  AgentActiveRunStatus,
  AgentGateKind,
  AgentMeetingType,
  AgentRole,
  AgentRunStatus,
  AgentRunTrigger,
  AgentRunType,
} from "../store/types";

/**
 * AI 팀 값 글리프(스펙 §6.2) — 페르소나 상태·run 상태·롤. 사무실(캔버스·카드·패널)과 T3(run 목록·게이트)이
 * 같은 표기를 쓴다. 아이콘 + 텍스트 규약: 텍스트만 쓰지 않고, 색만으로 구분하지 않는다.
 * `variant`는 `StatusGlyph`와 같은 계약 — `auto`는 아이콘이 스스로 이름을 읽고, `icon`은 옆에 이름이 있을 때 숨는다.
 */

export type AgentPersonaState = AgentActiveRunStatus | "IDLE" | "INACTIVE";

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
};
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
const MEETING_TYPE_ICONS: Record<AgentMeetingType, Icon> = { MEETING: UsersRound, RETRO: RotateCcw, ESCALATION: Siren };
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

/** 회의 종류 — 착수/계획(사람들)/회고(되감기)/에스컬레이션(사이렌) */
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
