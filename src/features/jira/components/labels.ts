import type { LozengeProps } from "@chanho/react";
import type { IssuePriority, IssueStatus } from "../store/types";

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
