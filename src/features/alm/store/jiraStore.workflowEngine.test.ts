import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  __versionForTest,
  getIssueByKey,
  listComments,
  listIssueTransitions,
  moveIssue,
  resolveSettings,
  setProjectCustom,
  transitionIssue,
  updateIssue,
  updateProjectCustomSettings,
  updateProjectMemberRole,
  bulkUpdateIssues,
  createIssue,
} from "./jiraStore";
import type { SettingsBody, WorkflowTransition } from "./types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function useWorkflow(transitions: WorkflowTransition[], extra: Partial<SettingsBody> = {}) {
  await setProjectCustom("p1", true);
  const { body } = await resolveSettings("p1");
  await updateProjectCustomSettings("p1", { ...body, transitions, ...extra });
}

async function issue(key: string) {
  const found = await getIssueByKey(key);
  if (!found) throw new Error(`no ${key}`);
  return found;
}

describe("가용 전환 — listIssueTransitions (A2)", () => {
  it("전환 목록이 빈 워크플로는 다른 모든 상태로 가는 암묵 전환을 준다(implicit:<상태>)", async () => {
    const alm5 = await issue("ALM-5"); // 할 일
    const result = await listIssueTransitions(alm5.id);
    expect(result).toMatchObject({ issueId: alm5.id, status: "todo", version: alm5.version, typeWorkflow: false });
    expect(result.transitions.map((t) => [t.id, t.name, t.toKind, t.isGlobal, t.available])).toEqual([
      ["implicit:inprogress", "진행 중", "active", true, true],
      ["implicit:done", "완료", "complete", true, true],
    ]);
  });

  it("지금 상태에서 갈 수 있는 전환만 이름과 함께 — 자기 자신으로 가는 전환은 뺀다", async () => {
    await useWorkflow([
      { id: "t-start", name: "시작", from: ["todo"], to: "inprogress" },
      { id: "t-done", name: "", from: ["inprogress"], to: "done" },
      { id: "t-reset", name: "처음으로", from: [], to: "todo" },
    ]);
    const alm3 = await issue("ALM-3"); // 진행 중
    const { transitions } = await listIssueTransitions(alm3.id);
    // 이름이 비면 대상 상태 이름
    expect(transitions.map((t) => [t.id, t.name, t.isGlobal])).toEqual([
      ["t-done", "완료", false],
      ["t-reset", "처음으로", true],
    ]);
  });

  it("조건 때문에 못 하는 전환은 숨기지 않고 이유와 함께 흐리게 — 담당자만·관리자만·하위 완료", async () => {
    await useWorkflow([
      { id: "t-mine", name: "내가 끝내기", from: ["inprogress"], to: "done", conditions: [{ type: "assignee" }] },
      { id: "t-admin", name: "관리자 종료", from: ["todo"], to: "done", conditions: [{ type: "role", role: "ADMIN" }] },
      { id: "t-children", name: "에픽 완료", from: ["todo"], to: "inprogress", conditions: [{ type: "subtasksDone" }] },
    ]);
    const alm2 = await issue("ALM-2"); // 진행 중, 담당 u2 (나는 u1)
    const [mine] = (await listIssueTransitions(alm2.id)).transitions;
    expect(mine).toMatchObject({ id: "t-mine", available: false, unavailableReason: "담당자만 이 전환을 할 수 있습니다" });

    // 에픽 ALM-4의 하위 ALM-2가 아직 진행 중
    const epic = await issue("ALM-4");
    const epicOptions = (await listIssueTransitions(epic.id)).transitions;
    expect(epicOptions.find((t) => t.id === "t-children")).toMatchObject({
      available: false,
      unavailableReason: "완료되지 않은 하위 이슈가 1개 있습니다",
    });
    expect(epicOptions.find((t) => t.id === "t-admin")).toMatchObject({ available: true });

    // 편집자로 강등되면 관리자 조건이 막힌다(다른 관리자를 먼저 세운다 — 마지막 관리자 가드)
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    expect((await listIssueTransitions(epic.id)).transitions.find((t) => t.id === "t-admin")).toMatchObject({
      available: false,
      unavailableReason: "프로젝트 관리자만 이 전환을 할 수 있습니다",
    });
  });

  it("편집 권한이 없으면 모든 전환이 막힌다(이유는 권한 문구)", async () => {
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "viewer");
    const { transitions } = await listIssueTransitions((await issue("ALM-5")).id);
    expect(transitions.every((t) => !t.available && t.unavailableReason === "이 프로젝트를 편집할 권한이 없습니다")).toBe(true);
  });

  it("전환 화면·검증 — screenFields·requiredFields·missingFields를 싣는다", async () => {
    await useWorkflow([
      {
        id: "t-done",
        name: "끝내기",
        from: [],
        to: "done",
        validators: ["dueDate", "assignee"],
        screenFields: ["resolution", "comment", "dueDate"],
      },
    ]);
    const alm5 = await issue("ALM-5"); // 담당자 없음·마감일 없음
    const [done] = (await listIssueTransitions(alm5.id)).transitions;
    expect(done).toMatchObject({
      hasScreen: true,
      screenFields: ["resolution", "comment", "dueDate"],
      requiredFields: ["dueDate", "assignee"],
      missingFields: ["dueDate", "assignee"],
    });
  });
});

describe("전환 실행 — transitionIssue (A4·C2·C3)", () => {
  it("화면 값·해결·코멘트를 한 번에 저장한다 — 해결은 화면 값이 이긴다", async () => {
    await useWorkflow([
      { id: "t-done", name: "끝내기", from: [], to: "done", screenFields: ["resolution", "comment", "dueDate"] },
    ]);
    const alm5 = await issue("ALM-5");
    const saved = await transitionIssue(alm5.id, {
      transitionId: "t-done",
      expectedVersion: alm5.version,
      fields: { resolution: "wont_do", dueDate: "2026-11-01" },
      comment: "범위에서 뺍니다",
    });
    expect(saved).toMatchObject({ status: "done", resolution: "wont_do", dueDate: "2026-11-01" });
    expect(saved.resolvedAt).not.toBeNull();
    // 편집 폼이 보는 값(마감일)이 바뀌었으니 버전이 오른다
    expect(saved.version).toBe(alm5.version + 1);
    expect((await listComments(alm5.id)).map((c) => c.body)).toContain("범위에서 뺍니다");
  });

  it("상태·해결만 바뀌는 전환은 버전을 올리지 않는다(보드 이동처럼)", async () => {
    const alm5 = await issue("ALM-5");
    const saved = await transitionIssue(alm5.id, { transitionId: "implicit:done" });
    expect(saved).toMatchObject({ status: "done", resolution: "done", version: alm5.version });
  });

  it("화면에 없는 칸·코멘트는 400, 버전이 어긋나면 409", async () => {
    await useWorkflow([{ id: "t-done", name: "끝내기", from: [], to: "done", screenFields: ["resolution"] }]);
    const alm5 = await issue("ALM-5");
    await expect(
      transitionIssue(alm5.id, { transitionId: "t-done", fields: { assigneeId: "u2" } }),
    ).rejects.toThrow("이 전환 화면에 없는 칸입니다: 담당자");
    await expect(transitionIssue(alm5.id, { transitionId: "t-done", comment: "메모" })).rejects.toThrow(
      "이 전환 화면에는 코멘트 칸이 없습니다",
    );
    await expect(
      transitionIssue(alm5.id, { transitionId: "t-done", expectedVersion: alm5.version + 5 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(transitionIssue(alm5.id, { transitionId: "nope" })).rejects.toThrow("없는 전환입니다: nope");
    // 아무것도 바뀌지 않았다
    expect(await issue("ALM-5")).toMatchObject({ status: "todo", resolution: null });
  });

  it("지금 상태에서 못 하는 전환은 상태 이름으로 거부한다", async () => {
    await useWorkflow([{ id: "t-done", name: "끝내기", from: ["inprogress"], to: "done" }]);
    const alm5 = await issue("ALM-5");
    await expect(transitionIssue(alm5.id, { transitionId: "t-done" })).rejects.toThrow(
      "지금 상태(할 일)에서는 할 수 없는 전환입니다: 끝내기",
    );
  });

  it("검증 — 화면 값을 반영한 뒤 비어 있으면 생성 필수와 같은 문구로 거부한다", async () => {
    await useWorkflow([
      { id: "t-done", name: "끝내기", from: [], to: "done", validators: ["dueDate"], screenFields: ["dueDate"] },
    ]);
    const alm5 = await issue("ALM-5");
    await expect(transitionIssue(alm5.id, { transitionId: "t-done" })).rejects.toThrow("마감일은 필수입니다");
    await expect(
      transitionIssue(alm5.id, { transitionId: "t-done", fields: { dueDate: "2026-12-01" } }),
    ).resolves.toMatchObject({ status: "done" });
  });

  it("후처리 — 담당자를 실행자로·해결 기본값 지정", async () => {
    await useWorkflow([
      { id: "t-start", name: "시작", from: ["todo"], to: "inprogress", postFunctions: [{ type: "assignToActor" }] },
      { id: "t-drop", name: "버리기", from: [], to: "done", postFunctions: [{ type: "setResolution", value: "WONT_DO" }, { type: "clearAssignee" }] },
    ]);
    const alm5 = await issue("ALM-5");
    expect(await transitionIssue(alm5.id, { transitionId: "t-start" })).toMatchObject({ status: "inprogress", assigneeId: "u1" });
    expect(await transitionIssue(alm5.id, { transitionId: "t-drop" })).toMatchObject({
      status: "done",
      resolution: "wont_do",
      assigneeId: null,
    });
  });
});

describe("상태만 오는 경로도 같은 엔진 — 보드 이동·수정·일괄", () => {
  it("조건을 충족하는 첫 전환을 고르고, 모두 막히면 첫 후보의 이유로 거부한다", async () => {
    await useWorkflow([
      { id: "t-a", name: "담당 끝내기", from: ["inprogress"], to: "done", conditions: [{ type: "assignee" }] },
      { id: "t-b", name: "관리자 끝내기", from: ["inprogress"], to: "done", conditions: [{ type: "role", role: "ADMIN" }] },
    ]);
    const alm2 = await issue("ALM-2"); // 남의 담당 — t-a는 막히지만 나는 관리자라 t-b
    expect(await moveIssue(alm2.id, { status: "done" })).toMatchObject({ status: "done", resolution: "done" });

    await useWorkflow([
      { id: "t-a", name: "담당 끝내기", from: ["inprogress"], to: "done", conditions: [{ type: "assignee" }] },
    ]);
    const alm3 = await issue("ALM-3"); // 내 담당 — 통과
    await expect(moveIssue(alm3.id, { status: "done" })).resolves.toMatchObject({ status: "done" });
    const back = await issue("ALM-2");
    await expect(updateIssue(back.id, { status: "inprogress" }, __versionForTest("issue", back.id))).rejects.toThrow(
      "완료에서 진행 중로 옮길 수 없습니다",
    );
  });

  it("일괄 변경도 조건·검증을 타고 막힌 이슈만 실패로 남긴다", async () => {
    await useWorkflow([{ id: "t-done", name: "끝", from: [], to: "done", validators: ["assignee"] }]);
    const alm5 = await issue("ALM-5"); // 담당 없음
    const alm3 = await issue("ALM-3"); // 담당 u1
    const result = await bulkUpdateIssues(
      [
        { id: alm5.id, key: alm5.key, version: alm5.version },
        { id: alm3.id, key: alm3.key, version: alm3.version },
      ],
      { status: "done" },
    );
    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([{ id: alm5.id, key: "ALM-5", reason: "담당자는 필수입니다" }]);
  });
});

describe("해결 규칙 — 서버 정본과 같은 판정(A1)", () => {
  it("완료에서 되돌리며 옛 해결을 그대로 실어 보내도 거부하지 않고 비운다(현재 값과 같으면 지정이 아니다)", async () => {
    const alm1 = await issue("ALM-1"); // 완료·해결 done
    const reopened = await updateIssue(alm1.id, { status: "todo", resolution: "done" }, alm1.version);
    expect(reopened).toMatchObject({ status: "todo", resolution: null, resolvedAt: null });
  });

  it("완료 안에서 null을 지정하면 기본값 — 완료 이슈는 해결이 비지 않는다", async () => {
    const alm1 = await issue("ALM-1");
    const wont = await updateIssue(alm1.id, { resolution: "wont_do" }, alm1.version);
    const cleared = await updateIssue(alm1.id, { resolution: null }, wont.version);
    expect(cleared.resolution).toBe("done");
  });

  it("완료가 아닌 이슈에 새 값을 지정하면 거부한다", async () => {
    const alm5 = await issue("ALM-5");
    await expect(updateIssue(alm5.id, { resolution: "duplicate" }, alm5.version)).rejects.toThrow(
      "완료된 이슈에만 해결을 설정할 수 있습니다",
    );
  });
});

describe("이슈 타입별 워크플로 (C5)", () => {
  async function bugWorkflow() {
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    await updateProjectCustomSettings("p1", {
      ...body,
      statuses: [...body.statuses, { id: "review", name: "검토", category: "inprogress", order: 4 }],
      workflowsByType: { bug: { statuses: ["todo", "review", "done"], transitions: null } },
    });
  }

  it("타입 키가 있는 이슈는 그 하위 집합만 본다 — 다른 타입은 기본 워크플로", async () => {
    await bugWorkflow();
    const bug = await issue("ALM-8");
    const options = await listIssueTransitions(bug.id);
    expect(options.typeWorkflow).toBe(true);
    // 상태 순서는 프로젝트 목록의 order(검토 4 > 완료 3)
    expect(options.transitions.map((t) => t.to)).toEqual(["done", "review"]);
    const task = await listIssueTransitions((await issue("ALM-5")).id);
    expect(task.typeWorkflow).toBe(false);
    expect(task.transitions.map((t) => t.to)).toEqual(["inprogress", "done", "review"]);
  });

  it("그 타입 워크플로에 없는 상태는 상태 이름으로 거부하고, 새 버그는 그 워크플로의 첫 '할 일'로 시작한다", async () => {
    await bugWorkflow();
    const bug = await issue("ALM-8");
    await expect(moveIssue(bug.id, { status: "inprogress" })).rejects.toThrow(
      "이 이슈 타입의 워크플로에 없는 상태입니다: 진행 중",
    );
    const created = await createIssue({ projectId: "p1", title: "새 버그", type: "bug" });
    expect(created.status).toBe("todo");
  });

  it("타입을 바꿔 새 워크플로에 지금 상태가 없으면 같은 카테고리 → 같은 의미 순으로 이관한다", async () => {
    await bugWorkflow();
    const alm3 = await issue("ALM-3"); // 작업 · 진행 중
    const moved = await updateIssue(alm3.id, { type: "bug" }, alm3.version);
    expect(moved).toMatchObject({ type: "bug", status: "review" });
  });

  it("타입 워크플로도 의미마다 상태가 있어야 하고, 프로젝트에 없는 상태는 거부한다", async () => {
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    await expect(
      updateProjectCustomSettings("p1", { ...body, workflowsByType: { bug: { statuses: ["todo", "done"], transitions: null } } }),
    ).rejects.toThrow("버그 워크플로에도 카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다");
    await expect(
      updateProjectCustomSettings("p1", { ...body, workflowsByType: { bug: { statuses: ["todo", "x", "done"], transitions: null } } }),
    ).rejects.toThrow("버그 워크플로에 프로젝트에 없는 상태가 있습니다: x");
  });
});

describe("전환 규칙 저장 검증 — 서버와 같은 문구", () => {
  it.each([
    [{ id: "a", name: "", from: [], to: "inprogress", screenFields: ["resolution" as const] }, "해결 칸은 완료 상태로 가는 전환에만 넣을 수 있습니다"],
    [{ id: "a", name: "", from: [], to: "inprogress", postFunctions: [{ type: "setResolution" as const, value: "DONE" as const }] }, "해결 설정 후처리는 완료 상태로 가는 전환에만 쓸 수 있습니다"],
    [{ id: "a", name: "", from: [], to: "done", postFunctions: [{ type: "assignToActor" as const }, { type: "clearAssignee" as const }] }, "담당자를 나로 지정하면서 비울 수는 없습니다"],
    [{ id: "a", name: "", from: [], to: "done", conditions: [{ type: "role" as const, role: null }] }, "역할 조건은 ADMIN 또는 EDIT여야 합니다"],
    [{ id: "a", name: "", from: ["nope"], to: "done" }, "전환의 출발 상태가 워크플로에 없습니다: nope"],
  ])("%#", async (transition, message) => {
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    await expect(updateProjectCustomSettings("p1", { ...body, transitions: [transition as WorkflowTransition] })).rejects.toThrow(message);
  });

  it("조건·검증·화면·후처리는 저장 뒤 읽을 때 그대로 왕복한다", async () => {
    const rule: WorkflowTransition = {
      id: "t-done",
      name: "끝내기",
      from: ["inprogress"],
      to: "done",
      conditions: [{ type: "assignee" }],
      validators: ["fixVersion"],
      screenFields: ["resolution", "comment"],
      postFunctions: [{ type: "setResolution", value: "DUPLICATE" }],
    };
    await useWorkflow([rule]);
    const { body } = await resolveSettings("p1");
    expect(body.transitions).toEqual([rule]);
    // 다른 구획 저장(...body 스프레드)이 규칙을 지우지 않는다
    await updateProjectCustomSettings("p1", { ...body, enabledTypes: body.enabledTypes });
    expect((await resolveSettings("p1")).body.transitions).toEqual([rule]);
  });
});
