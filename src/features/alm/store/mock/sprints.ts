// localStorage 목업 스토어 — sprints (jiraMock.ts에서 분할, 동작 불변)
import type { CompleteSprintOptions, Sprint, SprintCompletion } from "../types";
import { autoCreateNextSprint, planningSettingsOf } from "./cycles";
import { ApiError } from "../mapping";
import { clone, load, nextId, persist } from "./db";
import { assertCanAdmin, assertCanEdit } from "./members";
import { STALE_EDIT_MESSAGE } from "./issues";
import { statusKindOf, logChange } from "./rules";

// ── sprints ──────────────────────────────────────────────────

export async function listSprints(projectId: string): Promise<Sprint[]> {
  return clone(load().sprints.filter((s) => s.projectId === projectId));
}

export async function createSprint(projectId: string): Promise<Sprint> {
  const data = load();
  assertCanEdit(data, projectId);
  if (!data.projects.some((p) => p.id === projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  const count = data.sprints.filter((s) => s.projectId === projectId).length;
  const sprint: Sprint = {
    id: nextId(),
    projectId,
    name: `Sprint ${count + 1}`,
    state: "planned",
    version: 1,
  };
  data.sprints.push(sprint);
  persist();
  return clone(sprint);
}

/** 계획 메타 패치 — 빈 문자열·공백은 "지움"(undefined)으로 정규화한다 */
export interface SprintPlanPatch {
  name?: string;
  goal?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
}

function planValue(next: string | null | undefined, current: string | undefined) {
  if (next === undefined) return current;
  const trimmed = (next ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * 스프린트 계획 메타(이름·목표·예정 기간) 수정. 상태와 무관하게 허용한다 — 진행 중에도
 * 목표를 다시 쓰는 일이 실제로 일어난다. 기간 역전은 저장 전에 막는다.
 */
export async function updateSprint(id: string, patch: SprintPlanPatch, expectedVersion: number): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  assertCanEdit(data, sprint.projectId);
  if (sprint.version !== expectedVersion) throw new ApiError(409, STALE_EDIT_MESSAGE);

  const name = patch.name === undefined ? sprint.name : patch.name.trim();
  if (!name) throw new Error("스프린트 이름을 입력하세요");
  const goal = planValue(patch.goal, sprint.goal);
  const plannedStart = planValue(patch.plannedStart, sprint.plannedStart);
  const plannedEnd = planValue(patch.plannedEnd, sprint.plannedEnd);
  if (plannedStart && plannedEnd && plannedStart > plannedEnd) {
    throw new Error("시작 예정일은 종료 예정일보다 늦을 수 없습니다");
  }

  sprint.name = name;
  assignOrDelete(sprint, "goal", goal);
  assignOrDelete(sprint, "plannedStart", plannedStart);
  assignOrDelete(sprint, "plannedEnd", plannedEnd);
  sprint.version += 1;
  persist();
  return clone(sprint);
}

/** 값이 없으면 키 자체를 지운다 — 화면·테스트가 "없음"을 undefined 하나로 판단하게 한다 */
function assignOrDelete(sprint: Sprint, key: "goal" | "plannedStart" | "plannedEnd", value?: string) {
  if (value === undefined) {
    delete sprint[key];
  } else {
    sprint[key] = value;
  }
}

export async function startSprint(id: string): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  assertCanEdit(data, sprint.projectId);
  if (sprint.state !== "planned") throw new Error("계획 상태의 스프린트만 시작할 수 있습니다");
  if (data.sprints.some((s) => s.projectId === sprint.projectId && s.state === "active")) {
    throw new Error("이미 진행 중인 스프린트가 있습니다");
  }
  sprint.state = "active";
  sprint.startedAt = new Date().toISOString();
  sprint.version += 1;
  persist();
  return clone(sprint);
}

/**
 * 스프린트 완료. 미완료 이슈는 `moveUnfinishedTo`가 가리키는 스프린트로, 지정이 없으면
 * 백로그로 옮긴다(지라와 같은 선택지). 대상 검증이 실패하면 완료 자체가 일어나지 않는다.
 */
export async function completeSprint(id: string, options: CompleteSprintOptions = {}): Promise<SprintCompletion> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  assertCanEdit(data, sprint.projectId);
  if (sprint.state !== "active") throw new Error("진행 중인 스프린트만 완료할 수 있습니다");

  const targetId = options.moveUnfinishedTo ?? null;
  if (targetId !== null) {
    if (targetId === id) throw new Error("완료하는 스프린트로는 이관할 수 없습니다");
    const target = data.sprints.find((s) => s.id === targetId);
    if (!target) throw new Error("스프린트를 찾을 수 없습니다");
    if (target.projectId !== sprint.projectId) throw new Error("다른 프로젝트의 스프린트입니다");
    if (target.state === "done") throw new Error("완료된 스프린트로는 이관할 수 없습니다");
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  sprint.state = "done";
  sprint.completedAt = now;
  sprint.version += 1;
  // 사이클(V39): 예정 스프린트가 없고 자동 생성이 켜져 있으면 다음 스프린트를 만든다(이관 선택과 무관)
  const created = autoCreateNextSprint(data, sprint, nowMs);
  const nextPlanned = created ?? data.sprints.find((s) => s.projectId === sprint.projectId && s.state === "planned") ?? null;
  // 이관 대상: 스프린트 id > 요청(next·backlog) > 설정 기본값. next인데 다음 예정 스프린트가 없으면 백로그
  let destination: string | null = targetId;
  if (destination === null) {
    const wanted = options.carryOver ?? planningSettingsOf(data, sprint.projectId).sprintAutomation.defaultCarryOver;
    destination = wanted === "next" ? (nextPlanned?.id ?? null) : null;
  }
  let moved = 0;
  for (const issue of data.issues) {
    if (issue.sprintId === id && statusKindOf(data, issue.projectId, issue.status) !== "complete") {
      issue.sprintId = destination; // null = 백로그
      issue.updatedAt = now;
      logChange(data, issue, "sprint", id, destination, now);
      moved += 1;
    }
  }
  persist();
  return clone({
    ...sprint,
    carryOver: {
      target: destination === null ? "backlog" : "sprint",
      sprintId: destination,
      movedCount: moved,
      nextSprintId: nextPlanned?.id ?? null,
      nextSprintAutoCreated: created !== null,
    },
  });
}

/** 서버 409 문구와 같다 — 진행 중·완료 스프린트는 지우지 않는다 */
export const SPRINT_DELETE_PLANNED_ONLY = "예정 스프린트만 삭제할 수 있습니다";

/**
 * 예정 스프린트 삭제(F-10) — 프로젝트 관리자만. 들어 있던 이슈는 원래 순서 그대로 백로그 맨 위로 간다
 * (서버 `DELETE /api/alm/sprints/{id}`와 같은 규칙: 204, 진행 중·완료 409, 관리자 아님 403).
 */
export async function deleteSprint(id: string): Promise<void> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new ApiError(404, "스프린트를 찾을 수 없습니다");
  assertCanAdmin(data, sprint.projectId);
  if (sprint.state !== "planned") throw new ApiError(409, SPRINT_DELETE_PLANNED_ONLY);
  const now = new Date().toISOString();
  const moved = data.issues
    .filter((i) => i.sprintId === id)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  const backlog = data.issues
    .filter((i) => i.projectId === sprint.projectId && i.sprintId === null)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  moved.forEach((issue, index) => {
    issue.sprintId = null;
    issue.order = index + 1;
    issue.updatedAt = now;
    logChange(data, issue, "sprint", id, null, now);
  });
  backlog.forEach((issue, index) => {
    issue.order = moved.length + index + 1;
  });
  data.sprints = data.sprints.filter((s) => s.id !== id);
  persist();
}
