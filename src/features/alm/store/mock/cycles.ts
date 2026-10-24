// localStorage 목업 스토어 — 계획 설정(V39): 사이클(스프린트 자동화)·추정 척도. 서버 README "사이클"·"추정 척도"와 같은 규칙·문구.
import type { JiraData, PlanningSettings, PlanningSettingsPatch, Sprint } from "../types";
import {
  DEFAULT_PLANNING_SETTINGS,
  ESTIMATION_SCALE_LABELS,
  TSHIRT_SIZES,
  allowedPointsOf,
} from "../model/cycles";
import { ApiError } from "../mapping";
import { clone, load, nextId, persist } from "./db";
import { assertCanAdmin } from "./members";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_SETTINGS = "다른 사용자가 먼저 계획 설정을 수정했습니다. 새로 고친 뒤 다시 저장하세요";

function stored(data: JiraData, projectId: string): PlanningSettings {
  const row = data.planningSettings?.[projectId];
  const base = DEFAULT_PLANNING_SETTINGS(projectId);
  if (!row) return base;
  const merged: PlanningSettings = {
    ...base,
    ...row,
    sprintAutomation: { ...base.sprintAutomation, ...row.sprintAutomation },
    tshirtPoints: { ...base.tshirtPoints, ...row.tshirtPoints },
  };
  merged.allowedPoints = allowedPointsOf(merged);
  return merged;
}

export function planningSettingsOf(data: JiraData, projectId: string): PlanningSettings {
  return stored(data, projectId);
}

export async function getPlanningSettings(projectId: string): Promise<PlanningSettings> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new ApiError(404, "프로젝트를 찾을 수 없습니다");
  return clone(stored(data, projectId));
}

const oneDecimal = (n: number) => Math.round(n * 10) === n * 10;

function validate(next: PlanningSettings): void {
  const a = next.sprintAutomation;
  if (!Number.isInteger(a.lengthDays) || a.lengthDays < 1 || a.lengthDays > 90) throw new ApiError(400, "스프린트 길이는 1~90일이어야 합니다");
  if (!Number.isInteger(a.cooldownDays) || a.cooldownDays < 0 || a.cooldownDays > 30) throw new ApiError(400, "쿨다운은 0~30일이어야 합니다");
  if (a.defaultCarryOver !== "next" && a.defaultCarryOver !== "backlog") throw new ApiError(400, "이월 기본값은 next·backlog 중 하나입니다");
  if (!["fibonacci", "tshirt", "linear", "custom"].includes(next.estimationScale)) throw new ApiError(400, "추정 척도는 fibonacci·tshirt·linear·custom 중 하나입니다");
  if (next.estimationScale === "custom" && next.customValues.length === 0) throw new ApiError(400, "직접 정의 척도는 값이 1개 이상 있어야 합니다");
  if (next.customValues.length > 20) throw new ApiError(400, "직접 정의 척도는 20개까지 둘 수 있습니다");
  for (const value of next.customValues) {
    if (!Number.isFinite(value) || value < 0 || value > 9999 || !oneDecimal(value)) {
      throw new ApiError(400, "척도 값은 0~9999, 소수 첫째 자리까지입니다");
    }
  }
  if (new Set(next.customValues).size !== next.customValues.length) throw new ApiError(400, "척도 값이 중복됩니다");
  const sizes = TSHIRT_SIZES.map((s) => next.tshirtPoints[s]);
  for (const value of sizes) {
    if (!Number.isFinite(value) || value < 0 || value > 9999 || !oneDecimal(value)) {
      throw new ApiError(400, "T셔츠 포인트는 0~9999, 소수 첫째 자리까지입니다");
    }
  }
  if (sizes.some((value, i) => i > 0 && value <= sizes[i - 1])) throw new ApiError(400, "T셔츠 포인트는 XS부터 XL까지 커져야 합니다");
}

/** 보낸 항목만 바꾼다 — expectedVersion이 어긋나면 409(처음은 0). 관리자만 */
export async function updatePlanningSettings(
  projectId: string,
  patch: PlanningSettingsPatch,
  expectedVersion: number,
): Promise<PlanningSettings> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new ApiError(404, "프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, projectId);
  const current = stored(data, projectId);
  if (current.version !== expectedVersion) throw new ApiError(409, STALE_SETTINGS);
  const next: PlanningSettings = {
    ...current,
    sprintAutomation: { ...current.sprintAutomation, ...(patch.sprintAutomation ?? {}) },
    estimationScale: patch.estimationScale ?? current.estimationScale,
    customValues: patch.customValues ? [...patch.customValues].sort((x, y) => x - y) : current.customValues,
    tshirtPoints: { ...current.tshirtPoints, ...(patch.tshirtPoints ?? {}) },
    version: current.version + 1,
  };
  validate(next);
  next.allowedPoints = allowedPointsOf(next);
  data.planningSettings ??= {};
  data.planningSettings[projectId] = next;
  persist();
  return clone(next);
}

/**
 * 포인트가 **바뀔 때만** 척도를 본다(서버와 같다) — 척도를 바꿔도 손대지 않은 옛 값은 그대로 저장된다.
 * 문구: `스토리 포인트 4은(는) 이 프로젝트의 추정 척도(피보나치)에 없습니다 — 허용: 0, 1, 2, 3, 5, 8, 13, 21`
 */
export function assertPointsInScale(data: JiraData, projectId: string, points: number | null | undefined): void {
  if (points === null || points === undefined) return;
  const settings = stored(data, projectId);
  const allowed = settings.allowedPoints;
  if (!allowed || allowed.includes(points)) return;
  throw new ApiError(
    400,
    `스토리 포인트 ${points}은(는) 이 프로젝트의 추정 척도(${ESTIMATION_SCALE_LABELS[settings.estimationScale].replace(/\(.*\)/, "")})에 없습니다 — 허용: ${allowed.join(", ")}`,
  );
}

/** 이름의 끝 숫자 + 1 (`Sprint 3` → `Sprint 4`, `결제 7` → `결제 8`), 끝이 숫자가 아니면 `Sprint N` */
export function nextSprintName(completedName: string, count: number): string {
  const match = /^(.*?)(\d+)\s*$/.exec(completedName);
  if (match) return `${match[1]}${Number(match[2]) + 1}`;
  return `Sprint ${count + 1}`;
}

/** 서울 날짜 "YYYY-MM-DD" + n일 */
function seoulDate(at: number, plusDays: number): string {
  const seoul = new Date(at + 9 * 60 * 60 * 1000 + plusDays * DAY_MS);
  return seoul.toISOString().slice(0, 10);
}

/**
 * 완료 시 자동 생성 — 다른 예정 스프린트가 없고 autoCreateNext면 만든다(이관 선택과 무관).
 * 예정 시작 = 완료일(서울) + 쿨다운, 예정 종료 = 시작 + 길이 − 1.
 */
export function autoCreateNextSprint(data: JiraData, completed: Sprint, now: number): Sprint | null {
  const settings = stored(data, completed.projectId);
  if (!settings.sprintAutomation.autoCreateNext) return null;
  if (data.sprints.some((s) => s.projectId === completed.projectId && s.state === "planned")) return null;
  const { lengthDays, cooldownDays } = settings.sprintAutomation;
  const count = data.sprints.filter((s) => s.projectId === completed.projectId).length;
  const sprint: Sprint = {
    id: nextId(),
    projectId: completed.projectId,
    name: nextSprintName(completed.name, count),
    state: "planned",
    plannedStart: seoulDate(now, cooldownDays),
    plannedEnd: seoulDate(now, cooldownDays + lengthDays - 1),
    version: 1,
  };
  data.sprints.push(sprint);
  return sprint;
}
