import type { LozengeProps } from "@chanho/react";
import type { IssuePriority, IssueStatus, IssueType, WorkflowStatus } from "../store/types";

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

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

/** 아이콘 패키지가 없어 우선순위는 Lozenge 색으로 구분한다 (지라 색 언어: 빨강/주황/회색) */
export const PRIORITY_APPEARANCE: Record<IssuePriority, LozengeAppearance> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

/** 보드 컬럼 순서 */
export const BOARD_STATUSES: IssueStatus[] = ["todo", "inprogress", "done"];

// ── 커스텀 워크플로 상태 헬퍼 ─────────────────────────────────
// 상태 목록(resolveSettings 결과)이 없거나 못 찾으면 기본 3상태(id=카테고리)로 폴백한다.

const CATEGORY_SET = new Set<string>(BOARD_STATUSES);

/** 상태 id → 카테고리 (색·완료 판정·통계의 기준) */
export function statusCategory(
  statuses: WorkflowStatus[] | undefined,
  statusId: string,
): IssueStatus {
  const found = statuses?.find((s) => s.id === statusId);
  if (found) return found.category;
  return CATEGORY_SET.has(statusId) ? (statusId as IssueStatus) : "todo";
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
  return STATUS_APPEARANCE[statusCategory(statuses, statusId)];
}

/** 정렬용 카테고리 위계 (할 일 → 진행 중 → 완료) */
export const CATEGORY_ORDER: Record<IssueStatus, number> = { todo: 0, inprogress: 1, done: 2 };

// ── 이슈 타입 (지라: 작업 파랑 / 스토리 초록 / 버그 빨강 / 에픽 보라≈주황) ──

export const ISSUE_TYPES: IssueType[] = ["task", "story", "bug", "epic", "subtask"];

export const TYPE_LABELS: Record<IssueType, string> = {
  task: "작업",
  story: "스토리",
  bug: "버그",
  epic: "에픽",
  subtask: "하위 작업",
};

export const TYPE_APPEARANCE: Record<IssueType, LozengeAppearance> = {
  task: "info",
  story: "success",
  bug: "danger",
  epic: "warning",
  subtask: "neutral",
};

/** 카드/행에 쓰는 한 글자 글리프 — 지라 타입 아이콘 대응 */
export const TYPE_GLYPHS: Record<IssueType, string> = {
  task: "✓",
  story: "◆",
  bug: "●",
  epic: "⚡",
  subtask: "☑",
};
