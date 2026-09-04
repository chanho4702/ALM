import type { LozengeProps } from "@chanho/react";
import type {
  PriorityDef,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  StatusColor,
  StatusKind,
  WorkflowStatus,
  BuiltinIssueType,
  IssueTypeDef,
  IssueTypeLevel,
} from "../store/types";

type LozengeAppearance = NonNullable<LozengeProps["appearance"]>;

/** 상태 한국어 라벨 (칸반 컬럼 제목 겸용) */
export const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "할 일",
  inprogress: "진행 중",
  done: "완료",
};

/** 스펙 §3 매핑: status → Lozenge neutral/info/success */
export const STATUS_APPEARANCE: Record<IssueStatus, LozengeAppearance> = {
  todo: "neutral",
  inprogress: "info",
  done: "success",
};

// ── 카테고리 의미(kind) — 완료 판정·정렬·보드 묶음의 기준 ──

export const STATUS_KINDS: StatusKind[] = ["new", "active", "complete"];
export const KIND_LABELS: Record<StatusKind, string> = {
  new: "할 일",
  active: "진행 중",
  complete: "완료",
};
/** 정렬용 의미 위계 (할 일 → 진행 중 → 완료) */
export const KIND_ORDER: Record<StatusKind, number> = { new: 0, active: 1, complete: 2 };
export const STATUS_COLORS: StatusColor[] = ["neutral", "info", "success", "warning", "danger"];
export const COLOR_LABELS: Record<StatusColor, string> = {
  neutral: "회색",
  info: "파랑",
  success: "초록",
  warning: "주황",
  danger: "빨강",
};
const KIND_OF_BUILTIN: Record<IssueStatus, StatusKind> = {
  todo: "new",
  inprogress: "active",
  done: "complete",
};

/** 기본 5단계 이름 — 레지스트리가 로드되기 전 폴백 */
export const PRIORITY_LABELS: Record<string, string> = {
  highest: "최상",
  high: "높음",
  medium: "보통",
  low: "낮음",
  lowest: "최하",
};

/** 기본 5단계 색 폴백 (지라 색 언어: 빨강/주황/파랑/회색) */
export const PRIORITY_APPEARANCE: Record<string, LozengeAppearance> = {
  highest: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
  lowest: "neutral",
};

export const BUILTIN_PRIORITY_IDS: IssuePriority[] = ["highest", "high", "medium", "low", "lowest"];

/** 우선순위 id → 이름. 레지스트리 우선, 없으면 기본 5종 폴백, 그래도 없으면 id */
export function priorityName(defs: PriorityDef[] | undefined, id: IssuePriority): string {
  return defs?.find((d) => d.id === id)?.name ?? PRIORITY_LABELS[id] ?? id;
}

/** 우선순위 id → Lozenge 색 */
export function priorityAppearance(defs: PriorityDef[] | undefined, id: IssuePriority): LozengeAppearance {
  return defs?.find((d) => d.id === id)?.color ?? PRIORITY_APPEARANCE[id] ?? "neutral";
}

/** 정렬용 위계 — 레지스트리 order(높음→낮음), 모르는 값은 맨 뒤 */
export function priorityRank(defs: PriorityDef[] | undefined, id: IssuePriority): number {
  const def = defs?.find((d) => d.id === id);
  if (def) return def.order;
  const index = BUILTIN_PRIORITY_IDS.indexOf(id);
  return index === -1 ? 99 : index + 1;
}

/** 보드 컬럼 순서 */
export const BOARD_STATUSES: IssueStatus[] = ["todo", "inprogress", "done"];

// ── 커스텀 워크플로 상태 헬퍼 ─────────────────────────────────
// 상태 목록(resolveSettings 결과)이 없거나 못 찾으면 기본 3상태(id=카테고리)로 폴백한다.

const CATEGORY_SET = new Set<string>(BOARD_STATUSES);

/** 상태 id → 카테고리 id */
export function statusCategory(statuses: WorkflowStatus[] | undefined, statusId: string): string {
  const found = statuses?.find((s) => s.id === statusId);
  if (found) return found.category;
  return CATEGORY_SET.has(statusId) ? statusId : "todo";
}

/** 상태 id → 카테고리 의미 (완료 판정·통계·정렬의 기준). 해석 안 된 목록은 기본 id로 폴백 */
export function statusKind(statuses: WorkflowStatus[] | undefined, statusId: string): StatusKind {
  const found = statuses?.find((s) => s.id === statusId);
  if (found?.kind) return found.kind;
  const category = found?.category ?? statusId;
  return CATEGORY_SET.has(category) ? KIND_OF_BUILTIN[category as IssueStatus] : "new";
}

/** 상태 id → 표시 이름 */
export function statusName(statuses: WorkflowStatus[] | undefined, statusId: string): string {
  const found = statuses?.find((s) => s.id === statusId);
  if (found) return found.name;
  return CATEGORY_SET.has(statusId) ? STATUS_LABELS[statusId as IssueStatus] : statusId;
}

/** 상태 id → Lozenge appearance (카테고리 색) */
export function statusAppearance(
  statuses: WorkflowStatus[] | undefined,
  statusId: string,
): LozengeAppearance {
  const found = statuses?.find((s) => s.id === statusId);
  if (found?.color) return found.color;
  const category = statusCategory(statuses, statusId);
  return CATEGORY_SET.has(category) ? STATUS_APPEARANCE[category as IssueStatus] : "neutral";
}

/**
 * 카테고리 의미(kind)별 기본 상태 아이콘 — `StatusDef.icon`이 비었을 때의 폴백.
 * 값은 `typeIcons.tsx`의 lucide 키다(이 파일은 순수 로직이라 아이콘 모듈을 import 하지 않는다 —
 * `reportMetrics` 같은 비-React 모듈이 labels를 쓴다).
 */
export const KIND_DEFAULT_STATUS_ICON: Record<StatusKind, string> = {
  new: "circle",
  active: "refresh-cw",
  complete: "circle-check",
};

export const DEFAULT_STATUS_ICON = "circle";

/**
 * 상태 id → lucide 아이콘 키. 레지스트리 값(`StatusDef.icon` → `WorkflowStatus.icon`)이 이기고,
 * 비었으면 카테고리 의미(kind)의 기본 아이콘으로 폴백한다. 색은 절대 여기서 정하지 않는다 —
 * 색은 `statusAppearance`(카테고리 색)가 단독 진실이고, 모양·이름과 항상 함께 쓰인다.
 */
export function statusIcon(statuses: WorkflowStatus[] | undefined, statusId: string): string {
  const found = statuses?.find((s) => s.id === statusId);
  const icon = found?.icon?.trim();
  if (icon) return icon;
  return KIND_DEFAULT_STATUS_ICON[statusKind(statuses, statusId)] ?? DEFAULT_STATUS_ICON;
}

/** 정렬용 카테고리 위계 (할 일 → 진행 중 → 완료) */
export const CATEGORY_ORDER: Record<IssueStatus, number> = { todo: 0, inprogress: 1, done: 2 };

// ── 이슈 타입 (지라: 작업 파랑 / 스토리 초록 / 버그 빨강 / 에픽 보라≈주황) ──

export const ISSUE_TYPES: BuiltinIssueType[] = ["task", "story", "bug", "epic", "subtask"];

// ── 이슈 타입 레지스트리 헬퍼 — 목록이 없거나 못 찾으면 기본 5종으로 폴백 ──

export const TYPE_LEVELS: IssueTypeLevel[] = ["epic", "standard", "subtask"];
export const TYPE_LEVEL_LABELS: Record<IssueTypeLevel, string> = {
  epic: "상위(에픽)",
  standard: "일반",
  subtask: "하위 작업",
};
const BUILTIN_TYPE_LEVEL: Record<BuiltinIssueType, IssueTypeLevel> = {
  task: "standard",
  story: "standard",
  bug: "standard",
  epic: "epic",
  subtask: "subtask",
};
const BUILTIN_TYPE_ICON: Record<BuiltinIssueType, string> = {
  task: "check-square",
  story: "bookmark",
  bug: "bug",
  epic: "zap",
  subtask: "list-tree",
};
const BUILTIN_TYPE_SET = new Set<string>(ISSUE_TYPES);
const isBuiltinType = (id: string): id is BuiltinIssueType => BUILTIN_TYPE_SET.has(id);

export function typeName(types: IssueTypeDef[] | undefined, id: string): string {
  const def = types?.find((t) => t.id === id);
  if (def) return def.name;
  return isBuiltinType(id) ? TYPE_LABELS[id] : id;
}

/** 타입 id → 계층 (부모-자식 규칙·만들기 후보의 기준) */
export function typeLevel(types: IssueTypeDef[] | undefined, id: string): IssueTypeLevel {
  const def = types?.find((t) => t.id === id);
  if (def) return def.level;
  return isBuiltinType(id) ? BUILTIN_TYPE_LEVEL[id] : "standard";
}

export function typeIcon(types: IssueTypeDef[] | undefined, id: string): string {
  const def = types?.find((t) => t.id === id);
  if (def) return def.icon;
  return isBuiltinType(id) ? BUILTIN_TYPE_ICON[id] : "check-square";
}

export function typeAppearance(types: IssueTypeDef[] | undefined, id: string): LozengeAppearance {
  const def = types?.find((t) => t.id === id);
  if (def) return def.color;
  return isBuiltinType(id) ? TYPE_APPEARANCE[id] : "neutral";
}

export const TYPE_LABELS: Record<BuiltinIssueType, string> = {
  task: "작업",
  story: "스토리",
  bug: "버그",
  epic: "에픽",
  subtask: "하위 작업",
};

export const TYPE_APPEARANCE: Record<BuiltinIssueType, LozengeAppearance> = {
  task: "info",
  story: "success",
  bug: "danger",
  epic: "warning",
  subtask: "neutral",
};

/** 카드/행에 쓰는 한 글자 글리프 — 지라 타입 아이콘 대응 */
export const TYPE_GLYPHS: Record<BuiltinIssueType, string> = {
  task: "✓",
  story: "◆",
  bug: "●",
  epic: "⚡",
  subtask: "☑",
};

/**
 * 계획 기간 표기 — "9월 1일 – 9월 12일". 한쪽만 있으면 그쪽만, 둘 다 없으면 빈 문자열.
 * 로케일 API 대신 고정 형식을 쓴다(환경별 표기 흔들림·테스트 취약 방지).
 */
export function formatPlannedRange(start?: string, end?: string): string {
  const day = (iso: string) => {
    const [, month, date] = iso.split("-");
    return `${Number(month)}월 ${Number(date)}일`;
  };
  if (start && end) return `${day(start)} – ${day(end)}`;
  if (start) return `${day(start)}부터`;
  if (end) return `${day(end)}까지`;
  return "";
}

/**
 * 패널 계획 합계 — 예상 시간(h) 합과 미입력 건수. 추정 단위는 ALM 확정 결정(예상+기록 2값)에
 * 따라 시간이며, 스토리 포인트는 도입하지 않았다(roadmap 2026-08-28 §10-1).
 */
export function estimateSummary(issues: { estimateHours: number | null }[]): {
  totalHours: number;
  missing: number;
} {
  let totalHours = 0;
  let missing = 0;
  for (const issue of issues) {
    if (issue.estimateHours == null) missing += 1;
    else totalHours += issue.estimateHours;
  }
  // 0.1h 단위까지만 — 부동소수 누적 오차가 "8.000000000000002h"로 새지 않게 한다
  return { totalHours: Math.round(totalHours * 10) / 10, missing };
}

// ── 해결(Resolution) ─────────────────────────────────────

export const RESOLUTIONS: IssueResolution[] = ["done", "wont_do", "duplicate", "cannot_reproduce"];

export const RESOLUTION_LABELS: Record<IssueResolution, string> = {
  done: "완료됨",
  wont_do: "하지 않음",
  duplicate: "중복",
  cannot_reproduce: "재현 불가",
};
