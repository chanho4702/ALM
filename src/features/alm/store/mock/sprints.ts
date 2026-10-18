// localStorage 목업 스토어 — sprints (jiraMock.ts에서 분할, 동작 불변)
import type { Sprint } from "../types";
import { ApiError } from "../mapping";
import { clone, load, nextId, persist } from "./db";
import { assertCanEdit } from "./members";
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
export async function completeSprint(
  id: string,
  options: { moveUnfinishedTo?: string | null } = {},
): Promise<Sprint> {
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

  const now = new Date().toISOString();
  for (const issue of data.issues) {
    if (issue.sprintId === id && statusKindOf(data, issue.projectId, issue.status) !== "complete") {
      issue.sprintId = targetId; // null = 백로그
      issue.updatedAt = now;
      logChange(data, issue, "sprint", id, targetId, now);
    }
  }
  sprint.state = "done";
  sprint.completedAt = now;
  sprint.version += 1;
  persist();
  return clone(sprint);
}
