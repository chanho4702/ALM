import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createProject,
  createSprint,
  listSprints,
  startSprint,
  updateSprint,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function sprintInNewProject() {
  const project = await createProject({ key: "PLN", name: "계획 검증" });
  return createSprint(project.id);
}

describe("스프린트 계획 메타", () => {
  it("목표와 예정 기간을 저장하고 목록에서 다시 읽는다", async () => {
    const sprint = await sprintInNewProject();

    const updated = await updateSprint(sprint.id, {
      goal: "결제 실패율 절반으로",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
    });

    expect(updated).toMatchObject({
      goal: "결제 실패율 절반으로",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
    });
    const [reloaded] = await listSprints(sprint.projectId);
    expect(reloaded.goal).toBe("결제 실패율 절반으로");
    expect(reloaded.plannedEnd).toBe("2026-09-12");
  });

  it("시작 예정일이 종료 예정일보다 늦으면 거부하고 값을 남기지 않는다", async () => {
    const sprint = await sprintInNewProject();

    await expect(
      updateSprint(sprint.id, { plannedStart: "2026-09-12", plannedEnd: "2026-09-01" }),
    ).rejects.toThrow("시작 예정일은 종료 예정일보다 늦을 수 없습니다");

    const [reloaded] = await listSprints(sprint.projectId);
    expect(reloaded.plannedStart).toBeUndefined();
  });

  it("빈 문자열을 보내면 목표와 기간을 지운다", async () => {
    const sprint = await sprintInNewProject();
    await updateSprint(sprint.id, {
      goal: "임시 목표",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
    });

    const cleared = await updateSprint(sprint.id, { goal: "  ", plannedStart: "", plannedEnd: "" });

    expect(cleared.goal).toBeUndefined();
    expect(cleared.plannedStart).toBeUndefined();
    expect(cleared.plannedEnd).toBeUndefined();
  });

  it("이름을 바꿀 수 있고 진행 중 스프린트도 목표를 고칠 수 있다", async () => {
    const sprint = await sprintInNewProject();
    await startSprint(sprint.id);

    const updated = await updateSprint(sprint.id, { name: "릴리스 준비", goal: "진행 중 재정의" });

    expect(updated.name).toBe("릴리스 준비");
    expect(updated.state).toBe("active");
    expect(updated.goal).toBe("진행 중 재정의");
  });

  it("없는 스프린트는 거부한다", async () => {
    await expect(updateSprint("없는-id", { goal: "x" })).rejects.toThrow(
      "스프린트를 찾을 수 없습니다",
    );
  });
});
