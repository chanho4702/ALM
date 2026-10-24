// alm-backend REST 어댑터 — 계획 설정(V39): 사이클·추정 척도 (`/api/alm/projects/{id}/planning-settings`)
import type { PlanningSettings, PlanningSettingsPatch, SprintCarryOver, TshirtSize } from "../types";
import { DEFAULT_TSHIRT_POINTS, TSHIRT_SIZES, allowedPointsOf } from "../model/cycles";
import { toBackendId } from "../mapping";
import { json, sharedApiFetch } from "./http";

interface PlanningSettingsDto {
  projectId: number;
  sprintAutomation?: {
    autoCreateNext?: boolean;
    lengthDays?: number;
    cooldownDays?: number;
    defaultCarryOver?: "next" | "backlog";
  } | null;
  estimationScale?: PlanningSettings["estimationScale"] | null;
  customValues?: (number | string)[] | null;
  tshirtPoints?: Partial<Record<TshirtSize, number | string>> | null;
  allowedPoints?: (number | string)[] | null;
  version?: number;
}

/** NUMERIC은 문자열로 올 수 있다(storyPoints와 같은 경계 변환) */
const num = (value: number | string) => (typeof value === "number" ? value : Number(value));

export function mapPlanningSettings(dto: PlanningSettingsDto): PlanningSettings {
  const a = dto.sprintAutomation ?? {};
  const tshirt = { ...DEFAULT_TSHIRT_POINTS } as Record<TshirtSize, number>;
  for (const size of TSHIRT_SIZES) {
    const value = dto.tshirtPoints?.[size];
    if (value !== undefined && value !== null) tshirt[size] = num(value);
  }
  const settings: PlanningSettings = {
    projectId: String(dto.projectId),
    sprintAutomation: {
      autoCreateNext: a.autoCreateNext ?? false,
      lengthDays: a.lengthDays ?? 14,
      cooldownDays: a.cooldownDays ?? 0,
      defaultCarryOver: a.defaultCarryOver === "next" ? "next" : "backlog",
    },
    estimationScale: dto.estimationScale ?? "linear",
    customValues: (dto.customValues ?? []).map(num),
    tshirtPoints: tshirt,
    allowedPoints: null,
    version: dto.version ?? 0,
  };
  // 서버 값이 정본 — 없으면(옛 서버) 척도에서 파생한다
  settings.allowedPoints = dto.allowedPoints === undefined ? allowedPointsOf(settings) : dto.allowedPoints === null ? null : dto.allowedPoints.map(num);
  return settings;
}

export async function getPlanningSettings(projectId: string): Promise<PlanningSettings> {
  return mapPlanningSettings(
    (await json(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/planning-settings`))) as PlanningSettingsDto,
  );
}

/** 보낸 항목만 바뀐다 — expectedVersion 필수(처음 0, 어긋나면 409). ADMIN */
export async function updatePlanningSettings(
  projectId: string,
  patch: PlanningSettingsPatch,
  expectedVersion: number,
): Promise<PlanningSettings> {
  return mapPlanningSettings(
    (await json(
      await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/planning-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, expectedVersion }),
      }),
    )) as PlanningSettingsDto,
  );
}

export interface SprintCarryOverDto {
  target: "sprint" | "backlog" | string;
  sprintId: number | null;
  movedCount: number;
  nextSprintId: number | null;
  nextSprintAutoCreated: boolean;
}

export function mapCarryOver(dto: SprintCarryOverDto | null | undefined): SprintCarryOver | null {
  if (!dto) return null;
  return {
    target: dto.target === "sprint" ? "sprint" : "backlog",
    sprintId: dto.sprintId === null || dto.sprintId === undefined ? null : String(dto.sprintId),
    movedCount: dto.movedCount ?? 0,
    nextSprintId: dto.nextSprintId === null || dto.nextSprintId === undefined ? null : String(dto.nextSprintId),
    nextSprintAutoCreated: Boolean(dto.nextSprintAutoCreated),
  };
}
