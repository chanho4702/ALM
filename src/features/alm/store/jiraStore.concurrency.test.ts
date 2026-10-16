import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createIssue,
  getIssueByKey,
  listProjects,
  listSprints,
  moveIssue,
  setIssueParent,
  startSprint,
  updateIssue,
  updateProject,
  updateSprint,
} from "./jiraStore";
import { ApiError, errorStatus } from "./mapping";

/**
 * 동시 편집 무결성 — 목업은 서버 PUT과 같은 낙관적 락을 건다: 편집을 시작할 때 본 버전이 아니면 409.
 * 화면이 오래 열어 둔 초안으로 동료의 저장을 조용히 덮어쓰지 못하게 하는 계약이다.
 */
beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("거부되어야 합니다");
}

describe("이슈 편집 버전", () => {
  it("만들 때 1이고, 편집 저장마다 1씩 오른다", async () => {
    const created = await createIssue({ projectId: "p1", title: "버전 확인" });
    expect(created.version).toBe(1);
    const saved = await updateIssue(created.id, { title: "버전 확인 2" }, created.version);
    expect(saved.version).toBe(2);
  });

  it("편집을 시작한 뒤 동료가 먼저 저장했으면 409로 막고 동료의 값을 지킨다", async () => {
    const mine = (await getIssueByKey("ALM-3"))!; // 내가 편집을 시작할 때 본 이슈
    await updateIssue(mine.id, { description: "동료가 쓴 설명" }, mine.version); // 동료 저장

    const error = await rejection(updateIssue(mine.id, { description: "내 오래된 초안" }, mine.version));
    expect(error).toBeInstanceOf(ApiError);
    expect(errorStatus(error)).toBe(409);
    expect((await getIssueByKey("ALM-3"))!.description).toBe("동료가 쓴 설명");
  });

  it("최신 버전을 기준으로 다시 적용하면 저장된다(사용자가 고른 경우)", async () => {
    const mine = (await getIssueByKey("ALM-3"))!;
    await updateIssue(mine.id, { priority: "high" }, mine.version);
    const latest = (await getIssueByKey("ALM-3"))!;
    const saved = await updateIssue(mine.id, { title: "내 제목" }, latest.version);
    // 내가 안 건드린 필드(우선순위)는 동료 값 그대로
    expect(saved).toMatchObject({ title: "내 제목", priority: "high", version: latest.version + 1 });
  });

  it("보드 이동은 버전을 올리지 않는다(서버와 같다) — 드래그 한 번이 남의 편집을 409로 만들지 않는다", async () => {
    const mine = (await getIssueByKey("ALM-4"))!;
    await moveIssue(mine.id, { status: "inprogress" });
    expect((await getIssueByKey("ALM-4"))!.version).toBe(mine.version);
    const saved = await updateIssue(mine.id, { title: "이동 뒤 편집" }, mine.version);
    expect(saved).toMatchObject({ title: "이동 뒤 편집", status: "inprogress" });
  });

  it("상위 항목 변경도 편집이다 — 낡은 버전이면 409", async () => {
    const task = await createIssue({ projectId: "p1", title: "자식" });
    const epic = (await getIssueByKey("ALM-4"))!;
    await updateIssue(task.id, { title: "자식(동료 수정)" }, task.version);
    expect(errorStatus(await rejection(setIssueParent(task.id, epic.id, task.version)))).toBe(409);
    expect((await getIssueByKey(task.key))!.parentId).toBeNull();
  });
});

describe("스프린트·프로젝트 편집 버전", () => {
  it("스프린트 계획은 모달을 연 때 본 버전으로 저장하고, 그 사이 시작됐으면 409", async () => {
    const [sprint] = (await listSprints("p1")).filter((s) => s.state === "active");
    const planned = await (await import("./jiraStore")).createSprint("p1");
    expect(planned.version).toBe(1);
    const saved = await updateSprint(planned.id, { goal: "목표" }, planned.version);
    expect(saved.version).toBe(2);
    // 진행 중 스프린트를 완료하고 계획 스프린트를 시작하면 버전이 오른다
    expect(sprint).toBeDefined();
    await (await import("./jiraStore")).completeSprint(sprint.id);
    const started = await startSprint(planned.id);
    expect(started.version).toBe(3);
    expect(errorStatus(await rejection(updateSprint(planned.id, { goal: "낡은 초안" }, saved.version)))).toBe(409);
  });

  it("프로젝트 일반 설정도 낡은 버전이면 409로 막는다", async () => {
    const [project] = await listProjects();
    const saved = await updateProject(project.id, { name: "동료가 바꾼 이름" }, project.version);
    expect(saved.version).toBe(project.version + 1);
    expect(errorStatus(await rejection(updateProject(project.id, { description: "내 설명" }, project.version)))).toBe(409);
    expect((await listProjects())[0].name).toBe("동료가 바꾼 이름");
  });
});
