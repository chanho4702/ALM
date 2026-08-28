import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  completeSprint,
  deleteIssue,
  deleteProject,
  getIssueByKey,
  listProjectChanges,
  moveIssue,
  setProjectCustom,
  resolveSettings,
  updateProjectCustomSettings,
  createIssue,
  createProject,
  createSprint,
  listIssues,
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

describe("스프린트 완료 시 미완료 이슈 이관", () => {
  async function activeSprintWithIssues() {
    const project = await createProject({ key: "MOV", name: "이관 검증" });
    const current = await createSprint(project.id);
    await startSprint(current.id);
    const next = await createSprint(project.id);
    const done = await createIssue({
      projectId: project.id,
      title: "끝난 것",
      sprintId: current.id,
      status: "done",
    });
    const left = await createIssue({
      projectId: project.id,
      title: "남은 것",
      sprintId: current.id,
      status: "inprogress",
    });
    return { project, current, next, done, left };
  }

  it("대상을 지정하면 미완료 이슈가 그 스프린트로 넘어간다", async () => {
    const { project, current, next, done, left } = await activeSprintWithIssues();

    await completeSprint(current.id, { moveUnfinishedTo: next.id });

    const issues = await listIssues(project.id);
    expect(issues.find((i) => i.id === left.id)?.sprintId).toBe(next.id);
    expect(issues.find((i) => i.id === done.id)?.sprintId).toBe(current.id);
  });

  it("대상을 생략하면 백로그로 되돌린다", async () => {
    const { project, current, left } = await activeSprintWithIssues();

    await completeSprint(current.id);

    const issues = await listIssues(project.id);
    expect(issues.find((i) => i.id === left.id)?.sprintId).toBeNull();
  });

  it("완료하는 스프린트 자신으로는 옮길 수 없다", async () => {
    const { current } = await activeSprintWithIssues();

    await expect(completeSprint(current.id, { moveUnfinishedTo: current.id })).rejects.toThrow(
      "완료하는 스프린트로는 이관할 수 없습니다",
    );
    expect((await listSprints(current.projectId)).find((s) => s.id === current.id)?.state).toBe(
      "active",
    );
  });

  it("이미 끝난 스프린트로는 옮길 수 없다", async () => {
    const { project, current, next } = await activeSprintWithIssues();
    await completeSprint(current.id); // current가 done이 된다
    await startSprint(next.id);
    await createIssue({
      projectId: project.id,
      title: "다음 스프린트의 남은 것",
      sprintId: next.id,
      status: "todo",
    });

    await expect(completeSprint(next.id, { moveUnfinishedTo: current.id })).rejects.toThrow(
      "완료된 스프린트로는 이관할 수 없습니다",
    );
  });

  it("다른 프로젝트의 스프린트로는 옮길 수 없다", async () => {
    const { current } = await activeSprintWithIssues();
    const other = await createProject({ key: "OTH", name: "다른 제품" });
    const otherSprint = await createSprint(other.id);

    await expect(completeSprint(current.id, { moveUnfinishedTo: otherSprint.id })).rejects.toThrow(
      "다른 프로젝트의 스프린트입니다",
    );
  });
});

describe("변경 이력 유지보수", () => {
  it("워크플로 구성 변경으로 상태가 이관되면 이력에도 남는다", async () => {
    // 시드 프로젝트에 커스텀 상태를 만들고 그 상태의 이슈를 만든 뒤, 상태를 지운다
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    const withReview = {
      statuses: [...body.statuses, { id: "review", name: "리뷰", category: "inprogress" as const, order: 9 }],
      enabledTypes: body.enabledTypes,
    };
    await updateProjectCustomSettings("p1", withReview);
    const issue = await getIssueByKey("ALM-6");
    await moveIssue(issue!.id, { status: "review" });

    await updateProjectCustomSettings("p1", { statuses: body.statuses, enabledTypes: body.enabledTypes });

    const changes = await listProjectChanges("p1", { field: "status" });
    const forIssue = changes.filter((change) => change.issueId === issue!.id);
    // review로 옮긴 이력 + 구성 변경으로 되돌아온 이력이 모두 남아야 리포트 재생이 어긋나지 않는다
    expect(forIssue.at(-1)).toMatchObject({ fromValue: "review", toValue: "inprogress" });
  });

  it("이슈를 지우면 그 이슈의 이력도 사라진다", async () => {
    const issue = await getIssueByKey("ALM-7");
    await moveIssue(issue!.id, { status: "done" });
    expect(await listProjectChanges("p1")).not.toHaveLength(0);

    await deleteIssue(issue!.id);

    const remaining = await listProjectChanges("p1");
    expect(remaining.some((change) => change.issueId === issue!.id)).toBe(false);
  });

  it("프로젝트를 지우면 그 프로젝트의 이력도 사라진다", async () => {
    const project = await createProject({ key: "TMP", name: "임시" });
    const issue = await createIssue({ projectId: project.id, title: "임시 이슈" });
    expect(await listProjectChanges(project.id)).not.toHaveLength(0);

    await deleteProject(project.id);

    expect(await listProjectChanges(project.id)).toHaveLength(0);
    expect(issue.projectId).toBe(project.id);
  });
});
