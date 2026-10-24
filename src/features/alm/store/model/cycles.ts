// ALM 도메인 모델 타입 — 계획 설정(V39): 사이클(스프린트 자동화)·추정 척도 (Linear Cycles·Estimates)
import type { Sprint } from "./issue";

/** 미완료 이슈 이월 기본값 — 다음 스프린트 또는 백로그 */
export type CarryOverTarget = "next" | "backlog";

/**
 * 추정 척도 — `linear`는 제한 없는 수직선(0~9999, 소수 첫째 자리, V30 그대로)이 기본이다.
 * 저장값(`storyPoints`)은 어느 척도든 **숫자**다 — T셔츠도 매핑한 숫자를 저장해 합계·속도가 숫자로 센다.
 */
export type EstimationScale = "fibonacci" | "tshirt" | "linear" | "custom";

export const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type TshirtSize = (typeof TSHIRT_SIZES)[number];

export const FIBONACCI_POINTS: readonly number[] = [0, 1, 2, 3, 5, 8, 13, 21];
export const DEFAULT_TSHIRT_POINTS: Readonly<Record<TshirtSize, number>> = { XS: 1, S: 2, M: 3, L: 5, XL: 8 };

export const ESTIMATION_SCALE_LABELS: Record<EstimationScale, string> = {
  fibonacci: "피보나치",
  tshirt: "T셔츠",
  linear: "수직선(자유 입력)",
  custom: "직접 정의",
};

export interface SprintAutomationSettings {
  /** 완료할 때 예정 스프린트가 없으면 다음 스프린트를 만든다 */
  autoCreateNext: boolean;
  /** 스프린트 길이(일) 1~90 */
  lengthDays: number;
  /** 다음 스프린트까지 쉬는 날 0~30 */
  cooldownDays: number;
  /** 완료 모달의 기본 이월 대상 */
  defaultCarryOver: CarryOverTarget;
}

/** `GET/PUT /api/alm/projects/{id}/planning-settings` — 행이 없으면 기본값(version 0) */
export interface PlanningSettings {
  projectId: string;
  sprintAutomation: SprintAutomationSettings;
  estimationScale: EstimationScale;
  /** custom 척도 값(오름차순) — 다른 척도로 바꿔도 남는다 */
  customValues: number[];
  tshirtPoints: Record<TshirtSize, number>;
  /** 허용 포인트 — null이면 제한 없음(linear) */
  allowedPoints: number[] | null;
  version: number;
}

/** PUT 본문 — **보낸 항목만** 바뀐다(`sprintAutomation` 안도 키별로) */
export interface PlanningSettingsPatch {
  sprintAutomation?: Partial<SprintAutomationSettings>;
  estimationScale?: EstimationScale;
  customValues?: number[];
  tshirtPoints?: Partial<Record<TshirtSize, number>>;
}

/** 스프린트 완료 응답의 이월 결과 */
export interface SprintCarryOver {
  /** 실제로 간 곳 — 스프린트 또는 백로그 */
  target: "sprint" | "backlog";
  sprintId: string | null;
  movedCount: number;
  /** 다음 스프린트(만들었거나 이미 있던 예정 스프린트) */
  nextSprintId: string | null;
  nextSprintAutoCreated: boolean;
}

/** 완료된 스프린트 + 이월 결과(옛 서버는 carryOver가 없다 → null) */
export type SprintCompletion = Sprint & { carryOver: SprintCarryOver | null };

/** 완료 요청 — 스프린트 id(가장 우선) > 다음/백로그 > 설정 기본값 */
export interface CompleteSprintOptions {
  moveUnfinishedTo?: string | null;
  carryOver?: CarryOverTarget;
}

export const DEFAULT_PLANNING_SETTINGS = (projectId: string): PlanningSettings => ({
  projectId,
  sprintAutomation: { autoCreateNext: false, lengthDays: 14, cooldownDays: 0, defaultCarryOver: "backlog" },
  estimationScale: "linear",
  customValues: [],
  tshirtPoints: { ...DEFAULT_TSHIRT_POINTS },
  allowedPoints: null,
  version: 0,
});

/** 척도의 허용 포인트(서버 allowedPoints와 같은 규칙) — linear는 null */
export function allowedPointsOf(settings: Pick<PlanningSettings, "estimationScale" | "customValues" | "tshirtPoints">): number[] | null {
  switch (settings.estimationScale) {
    case "fibonacci":
      return [...FIBONACCI_POINTS];
    case "tshirt":
      return TSHIRT_SIZES.map((size) => settings.tshirtPoints[size]);
    case "custom":
      return [...settings.customValues].sort((a, b) => a - b);
    default:
      return null;
  }
}

/** 숫자 → T셔츠 라벨(정확히 매핑된 값만) */
export function tshirtLabelOf(points: number | null | undefined, tshirtPoints: Record<TshirtSize, number>): TshirtSize | null {
  if (points === null || points === undefined) return null;
  return TSHIRT_SIZES.find((size) => tshirtPoints[size] === points) ?? null;
}

/** 표시 문자열 — T셔츠면 "M (3)", 그 밖은 숫자 */
export function formatPoints(points: number | null | undefined, settings: Pick<PlanningSettings, "estimationScale" | "tshirtPoints"> | null): string {
  if (points === null || points === undefined) return "";
  if (settings?.estimationScale === "tshirt") {
    const label = tshirtLabelOf(points, settings.tshirtPoints);
    if (label) return `${label} (${points})`;
  }
  return String(points);
}
