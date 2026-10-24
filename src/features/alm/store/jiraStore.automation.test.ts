import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createAutomationRule,
  createIssue,
  deleteAutomationRule,
  getBoard,
  getIssueByKey,
  listAutomationRuleRuns,
  listAutomationRules,
  listBoardIssues,
  listComments,
  listNotifications,
  listProjectAutomationRuns,
  moveIssue,
  setIssueFlag,
  updateAutomationRule,
  updateBoard,
  updateIssue,
  updateProjectMemberRole,
} from "./jiraStore";
import type { AutomationRuleInput } from "./types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function issue(key: string) {
  const found = await getIssueByKey(key);
  if (!found) throw new Error(`no ${key}`);
  return found;
}

const unflagOnDone: AutomationRuleInput = {
  name: "끝나면 막힘 해제",
  trigger: { type: "ISSUE_TRANSITIONED", fromStatuses: [], toStatuses: ["done"] },
  condition: "flagged = true",
  actions: [
    { type: "SET_FIELD", field: "flagged", value: false },
    { type: "COMMENT", body: "완료되어 플래그를 내렸습니다" },
  ],
};

describe("자동화 규칙 — CRUD (V36)", () => {
  it("만들면 닫힌 어휘로 정리해 저장한다 — 실행 주체는 저장한 사람", async () => {
    const rule = await createAutomationRule("p1", unflagOnDone);
    expect(rule).toMatchObject({
      projectId: "p1",
      enabled: true,
      allowRuleTrigger: false,
      actorId: "u1",
      disabledReason: null,
      version: 1,
      trigger: { type: "ISSUE_TRANSITIONED", toStatuses: ["done"], fromStatuses: [] },
    });
    expect((await listAutomationRules("p1")).map((r) => r.name)).toEqual(["끝나면 막힘 해제"]);
  });

  it.each<[Partial<AutomationRuleInput>, string]>([
    [{ name: " " }, "규칙 이름을 입력하세요"],
    [{ trigger: { type: "NOPE" as never } }, "모르는 트리거입니다: NOPE"],
    [{ trigger: { type: "FIELD_CHANGED", fields: [] } }, "지켜볼 필드를 하나 이상 고르세요"],
    [{ trigger: { type: "SCHEDULED", cron: "* * * * *" }, condition: "flagged = true" }, "예약은 5분보다 자주 돌 수 없습니다"],
    [{ trigger: { type: "SCHEDULED", cron: "0 9 * * MON-FRI" }, condition: "" }, "예약 트리거에는 조건(AQL)이 필요합니다"],
    [{ actions: [] }, "액션을 하나 이상 넣으세요"],
    [{ actions: [{ type: "SET_FIELD", field: "title" as never, value: "x" }] }, "바꿀 수 없는 필드입니다: title"],
    [{ actions: [{ type: "TRANSITION", toStatus: "nope" }] }, "이 프로젝트에 없는 상태입니다: nope"],
    [{ actions: [{ type: "NOTIFY", recipients: [], userIds: [], message: "x" }] }, "알릴 사람을 하나 이상 고르세요"],
  ])("검증 %#", async (patch, message) => {
    await expect(createAutomationRule("p1", { ...unflagOnDone, ...patch })).rejects.toThrow(message);
  });

  it("고치기는 버전이 맞아야 하고, 지우면 이력도 함께 사라진다", async () => {
    const rule = await createAutomationRule("p1", unflagOnDone);
    const renamed = await updateAutomationRule(rule.id, { ...unflagOnDone, name: "새 이름" }, rule.version);
    expect(renamed).toMatchObject({ name: "새 이름", version: 2 });
    await expect(updateAutomationRule(rule.id, unflagOnDone, 1)).rejects.toMatchObject({ status: 409 });
    await deleteAutomationRule(rule.id);
    expect(await listAutomationRules("p1")).toEqual([]);
    expect(await listProjectAutomationRuns("p1")).toEqual([]);
  });

  it("관리·이력 조회는 프로젝트 관리자만", async () => {
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    await expect(listAutomationRules("p1")).rejects.toThrow("프로젝트 관리자만 할 수 있습니다");
  });
});

describe("자동화 규칙 — 실행 (V37 목업 대역)", () => {
  it("전환 트리거 + 조건 AQL이 맞으면 액션을 사람과 같은 경로로 돌리고 SUCCESS를 남긴다", async () => {
    const rule = await createAutomationRule("p1", unflagOnDone);
    const alm3 = await issue("ALM-3");
    await setIssueFlag(alm3.id, true);
    await moveIssue(alm3.id, { status: "done" });
    expect((await issue("ALM-3")).flagged).toBe(false);
    expect((await listComments(alm3.id)).at(-1)?.body).toBe("완료되어 플래그를 내렸습니다");
    const [run] = await listAutomationRuleRuns(rule.id);
    expect(run).toMatchObject({ outcome: "SUCCESS", issueKey: "ALM-3", depth: 1, actionsRun: 2, triggerType: "ISSUE_TRANSITIONED" });
  });

  it("조건에 안 맞으면 실행하지도, 이력을 남기지도 않는다", async () => {
    const rule = await createAutomationRule("p1", unflagOnDone);
    await moveIssue((await issue("ALM-5")).id, { status: "done" });
    expect(await listAutomationRuleRuns(rule.id)).toEqual([]);
  });

  it("생성·필드 변경 트리거, NOTIFY는 type automation 알림", async () => {
    await createAutomationRule("p1", {
      name: "버그는 높음",
      trigger: { type: "ISSUE_CREATED" },
      condition: "type = bug",
      actions: [{ type: "SET_FIELD", field: "priority", value: "high" }, { type: "LABELS", add: ["triaged"], remove: [] }],
    });
    await createAutomationRule("p1", {
      name: "포인트 바뀌면 알림",
      trigger: { type: "FIELD_CHANGED", fields: ["storyPoints"] },
      actions: [{ type: "NOTIFY", recipients: ["assignee"], userIds: [], message: "추정이 바뀌었습니다" }],
    });
    const bug = await createIssue({ projectId: "p1", title: "새 버그", type: "bug" });
    expect(await issue(bug.key)).toMatchObject({ priority: "high", labels: ["triaged"] });
    const alm2 = await issue("ALM-2"); // 담당 u2
    await updateIssue(alm2.id, { storyPoints: 8 }, alm2.version);
    const notes = await listNotifications("u2");
    expect(notes.some((n) => n.type === "automation" && n.message === "추정이 바뀌었습니다")).toBe(true);
  });

  it("규칙이 만든 변경은 allowRuleTrigger 규칙만 깨운다 — 핑퐁은 LOOP_BLOCKED", async () => {
    const pong = await createAutomationRule("p1", {
      name: "플래그 → 높음",
      trigger: { type: "FIELD_CHANGED", fields: ["flagged"] },
      actions: [{ type: "SET_FIELD", field: "priority", value: "highest" }],
      allowRuleTrigger: true,
    });
    const ping = await createAutomationRule("p1", {
      name: "우선순위 → 플래그 뒤집기",
      trigger: { type: "FIELD_CHANGED", fields: ["priority"] },
      actions: [{ type: "SET_FIELD", field: "flagged", value: true }],
      allowRuleTrigger: true,
    });
    const alm5 = await issue("ALM-5");
    await updateIssue(alm5.id, { priority: "medium" }, alm5.version); // 시드는 낮음
    // ping(1) → 플래그 → pong(2) → 우선순위 → ping은 같은 연쇄에서 이미 돌았다 → 막힘
    expect((await listAutomationRuleRuns(ping.id)).map((r) => r.outcome).sort()).toEqual(["LOOP_BLOCKED", "SUCCESS"]);
    expect((await listAutomationRuleRuns(pong.id))[0]).toMatchObject({ outcome: "SUCCESS", depth: 2 });
    expect(await issue("ALM-5")).toMatchObject({ flagged: true, priority: "highest" });
  });

  it("액션 하나라도 실패하면 그 규칙의 변경을 전부 되돌리고 FAILED — 연속 5회면 자동으로 끈다", async () => {
    const rule = await createAutomationRule("p1", {
      name: "끝내기",
      trigger: { type: "FIELD_CHANGED", fields: ["labels"] },
      actions: [
        { type: "COMMENT", body: "남으면 안 되는 코멘트" },
        { type: "TRANSITION", toStatus: "done" },
      ],
    });
    // 끝으로 가는 전환을 막는다 — 담당자만 할 수 있게
    const { setProjectCustom, resolveSettings, updateProjectCustomSettings } = await import("./jiraStore");
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    await updateProjectCustomSettings("p1", {
      ...body,
      transitions: [{ id: "t-done", name: "끝", from: [], to: "done", conditions: [{ type: "assignee" }] }],
    });
    const alm2 = await issue("ALM-2"); // 담당 u2
    for (let i = 0; i < 5; i += 1) {
      const fresh = await issue("ALM-2");
      await updateIssue(alm2.id, { labels: [`l${i}`] }, fresh.version);
    }
    const runs = await listAutomationRuleRuns(rule.id);
    expect(runs).toHaveLength(5);
    expect(runs[0]).toMatchObject({ outcome: "FAILED", message: "담당자만 이 전환을 할 수 있습니다", actionsRun: 1 });
    expect((await listComments(alm2.id)).some((c) => c.body === "남으면 안 되는 코멘트")).toBe(false);
    const [disabled] = await listAutomationRules("p1");
    expect(disabled).toMatchObject({ enabled: false, consecutiveFailures: 5, disabledReason: "연속 5회 실패해 자동으로 껐습니다" });
    // 켜서 저장하면 사유가 지워진다
    const enabled = await updateAutomationRule(rule.id, { ...disabled, enabled: true }, disabled.version);
    expect(enabled).toMatchObject({ enabled: true, disabledReason: null, consecutiveFailures: 0 });
  });
});

describe("보드 열 매핑 (C4)", () => {
  it("상태 형식(구) — 워크플로 상태마다 한 열, 이름·WIP 덮어쓰기", async () => {
    const board = await getBoard("b2");
    expect(board).toMatchObject({ columnMode: "status", unmappedStatuses: [] });
    expect(board!.resolvedColumns.map((c) => [c.id, c.statuses, c.wipLimit])).toEqual([
      ["todo", ["todo"], null],
      ["inprogress", ["inprogress"], 2],
      ["done", ["done"], null],
    ]);
  });

  it("매핑 형식 — 열 하나에 여러 상태, 미매핑 상태의 이슈는 보드에 안 나온다", async () => {
    const saved = await updateBoard("b1", {
      columns: [
        { status: "inprogress", name: "진행·검토", statuses: ["inprogress"], wipLimit: 3 },
        { status: "done", name: "끝", statuses: ["done"], wipLimit: null },
      ],
    });
    expect(saved.columnMode).toBe("mapped");
    expect(saved.resolvedColumns.map((c) => c.name)).toEqual(["진행·검토", "끝"]);
    expect(saved.resolvedColumns[0].id).toMatch(/^col-/);
    expect(saved.unmappedStatuses).toEqual(["todo"]);
    const keys = (await listBoardIssues("b1")).map((i) => i.key);
    expect(keys).not.toContain("ALM-5");
    expect(keys).toContain("ALM-3");
  });

  it("상태는 한 열에만, 없는 상태는 거부, 섞인 형식은 거부", async () => {
    await expect(
      updateBoard("b1", {
        columns: [
          { status: "todo", name: "a", statuses: ["todo", "done"], wipLimit: null },
          { status: "done", name: "b", statuses: ["done"], wipLimit: null },
        ],
      }),
    ).rejects.toThrow("상태 하나는 한 열에만 넣을 수 있습니다: done");
    await expect(
      updateBoard("b1", { columns: [{ status: "x", name: "a", statuses: ["x"], wipLimit: null }] }),
    ).rejects.toThrow("이 프로젝트에 없는 상태입니다: x");
    await expect(
      updateBoard("b1", {
        columns: [
          { status: "todo", name: "a", statuses: ["todo"], wipLimit: null },
          { status: "done", name: "b", wipLimit: null },
        ],
      }),
    ).rejects.toThrow("열 매핑을 쓰는 보드는 모든 열에 상태 목록(statuses)이 있어야 합니다");
  });
});
