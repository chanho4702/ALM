import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  completeSprint,
  createIssue,
  createSprint,
  getPlanningSettings,
  listIssues,
  listSprints,
  startSprint,
  updateIssue,
  updatePlanningSettings,
} from "./jiraStore";
import { nextSprintName } from "./mock/cycles";
import { formatPoints, tshirtLabelOf } from "./model/cycles";

const PROJECT = "p1";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("계획 설정(V39) — 목업이 서버 규칙을 흉내 낸다", () => {
  it("행이 없으면 기본값(version 0) — 자동 생성 끔·이월 백로그·수직선", async () => {
    const settings = await getPlanningSettings(PROJECT);
    expect(settings).toMatchObject({
      version: 0,
      estimationScale: "linear",
      allowedPoints: null,
      sprintAutomation: { autoCreateNext: false, defaultCarryOver: "backlog" },
    });
  });

  it("보낸 항목만 바뀌고(sprintAutomation 안도 키별로), 버전이 어긋나면 409", async () => {
    const saved = await updatePlanningSettings(PROJECT, { sprintAutomation: { autoCreateNext: true } }, 0);
    expect(saved.sprintAutomation).toMatchObject({ autoCreateNext: true, lengthDays: 14, defaultCarryOver: "backlog" });
    expect(saved.version).toBe(1);
    await expect(updatePlanningSettings(PROJECT, { estimationScale: "fibonacci" }, 0)).rejects.toMatchObject({ status: 409 });
    const fib = await updatePlanningSettings(PROJECT, { estimationScale: "fibonacci" }, 1);
    expect(fib.allowedPoints).toEqual([0, 1, 2, 3, 5, 8, 13, 21]);
    expect(fib.sprintAutomation.autoCreateNext).toBe(true);
  });

  it("범위 검사 — 길이 1~90, 쿨다운 0~30, custom 중복·T셔츠 오름차순", async () => {
    await expect(updatePlanningSettings(PROJECT, { sprintAutomation: { lengthDays: 0 } }, 0)).rejects.toThrow("스프린트 길이는 1~90일이어야 합니다");
    await expect(updatePlanningSettings(PROJECT, { sprintAutomation: { cooldownDays: 31 } }, 0)).rejects.toThrow("쿨다운은 0~30일이어야 합니다");
    await expect(updatePlanningSettings(PROJECT, { estimationScale: "custom", customValues: [1, 1] }, 0)).rejects.toThrow("척도 값이 중복됩니다");
    await expect(updatePlanningSettings(PROJECT, { estimationScale: "tshirt", tshirtPoints: { M: 1 } }, 0)).rejects.toThrow(
      "T셔츠 포인트는 XS부터 XL까지 커져야 합니다",
    );
    const custom = await updatePlanningSettings(PROJECT, { estimationScale: "custom", customValues: [8, 1, 4] }, 0);
    expect(custom.customValues).toEqual([1, 4, 8]);
  });

  it("포인트는 바뀔 때만 척도를 본다 — 서버와 같은 문구, 손대지 않은 옛 값은 그대로", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "척도", storyPoints: 4 });
    await updatePlanningSettings(PROJECT, { estimationScale: "fibonacci" }, 0);
    await expect(createIssue({ projectId: PROJECT, title: "밖", storyPoints: 4 })).rejects.toThrow(
      "스토리 포인트 4은(는) 이 프로젝트의 추정 척도(피보나치)에 없습니다 — 허용: 0, 1, 2, 3, 5, 8, 13, 21",
    );
    // 다른 필드만 고치는 저장은 막히지 않는다
    const renamed = await updateIssue(issue.id, { title: "척도 이름만" }, issue.version);
    expect(renamed.storyPoints).toBe(4);
    await expect(updateIssue(issue.id, { storyPoints: 6 }, renamed.version)).rejects.toThrow("추정 척도(피보나치)에 없습니다");
    expect((await updateIssue(issue.id, { storyPoints: 5 }, renamed.version)).storyPoints).toBe(5);
  });

  it("T셔츠 라벨 — 숫자로 저장하고 화면은 크기 라벨을 붙인다", async () => {
    const tshirt = await updatePlanningSettings(PROJECT, { estimationScale: "tshirt" }, 0);
    expect(tshirt.allowedPoints).toEqual([1, 2, 3, 5, 8]);
    expect(tshirtLabelOf(3, tshirt.tshirtPoints)).toBe("M");
    expect(formatPoints(5, tshirt)).toBe("L (5)");
    expect(formatPoints(4, tshirt)).toBe("4");
  });
});

describe("사이클 — 스프린트 완료 이월·다음 스프린트 자동 생성", () => {
  it("이름 규칙 — 끝 숫자 + 1, 숫자가 없으면 Sprint N", () => {
    expect(nextSprintName("Sprint 3", 3)).toBe("Sprint 4");
    expect(nextSprintName("결제 7", 1)).toBe("결제 8");
    expect(nextSprintName("가을 스프린트", 4)).toBe("Sprint 5");
  });

  it("아무것도 안 보내면 설정 기본값(없으면 백로그) — 이월 결과를 돌려준다", async () => {
    const result = await completeSprint("s1");
    expect(result.carryOver).toMatchObject({ target: "backlog", sprintId: null, nextSprintAutoCreated: false });
    expect(result.carryOver!.movedCount).toBeGreaterThan(0);
    const backlog = (await listIssues(PROJECT)).filter((i) => i.sprintId === null);
    expect(backlog.length).toBeGreaterThanOrEqual(result.carryOver!.movedCount);
  });

  it("자동 생성 켜짐 + 예정 스프린트 없음 → 다음 스프린트를 만들고(이름·예정 기간) 'next'면 그리로 이월", async () => {
    await updatePlanningSettings(PROJECT, { sprintAutomation: { autoCreateNext: true, lengthDays: 10, cooldownDays: 2, defaultCarryOver: "next" } }, 0);
    const result = await completeSprint("s1");
    const carry = result.carryOver!;
    expect(carry.nextSprintAutoCreated).toBe(true);
    expect(carry.target).toBe("sprint");
    const created = (await listSprints(PROJECT)).find((s) => s.id === carry.nextSprintId)!;
    expect(created).toMatchObject({ name: "Sprint 2", state: "planned" });
    const start = Date.parse(created.plannedStart!);
    const end = Date.parse(created.plannedEnd!);
    expect((end - start) / 86_400_000).toBe(9);
    const moved = (await listIssues(PROJECT)).filter((i) => i.sprintId === created.id);
    expect(moved).toHaveLength(carry.movedCount);
  });

  it("'next'인데 예정 스프린트가 없고 자동 생성이 꺼져 있으면 백로그 · 예정 스프린트가 있으면 그리로 · 스프린트 id가 가장 우선", async () => {
    const backlogOnly = await completeSprint("s1", { carryOver: "next" });
    expect(backlogOnly.carryOver).toMatchObject({ target: "backlog", nextSprintId: null });

    const planned = await createSprint(PROJECT);
    const third = await createSprint(PROJECT);
    await startSprint(planned.id);
    await createIssue({ projectId: PROJECT, title: "남은 일", sprintId: planned.id });
    const next = await completeSprint(planned.id, { carryOver: "next" });
    expect(next.carryOver).toMatchObject({ target: "sprint", sprintId: third.id, nextSprintId: third.id, nextSprintAutoCreated: false });

    await startSprint(third.id);
    const fourth = await createSprint(PROJECT);
    const explicit = await completeSprint(third.id, { moveUnfinishedTo: fourth.id, carryOver: "backlog" });
    expect(explicit.carryOver).toMatchObject({ target: "sprint", sprintId: fourth.id });
  });
});

describe("검색 triage 조건(V35 계약 보완)", () => {
  it("triage=false는 대기열을 빼고 total도 그 기준, true는 대기열만, 생략은 둘 다", async () => {
    const { findIssues, saveTriageSettings, sendToTriage, getIssueByKey: byKey } = await import("./jiraStore");
    await saveTriageSettings(PROJECT, true);
    const target = (await byKey("ALM-6"))!;
    await sendToTriage(target.id);
    const all = await findIssues({ projectIds: [PROJECT] }, { page: 0, size: 200 });
    const outside = await findIssues({ projectIds: [PROJECT], triage: false }, { page: 0, size: 200 });
    const inside = await findIssues({ projectIds: [PROJECT], triage: true }, { page: 0, size: 200 });
    expect(outside.total).toBe(all.total - 1);
    expect(inside.items.map((i) => i.key)).toEqual(["ALM-6"]);
    expect((await listIssues(PROJECT)).some((i) => i.key === "ALM-6")).toBe(false);
  });
});
