import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  acceptTriage,
  bulkUpdateIssues,
  completeSprint,
  createIssue,
  createView,
  declineTriage,
  deleteView,
  duplicateTriage,
  getBoard,
  getEstimationSummary,
  getIssueByKey,
  getTriageSettings,
  getVelocity,
  listActivity,
  listBoardIssues,
  listComments,
  listIssueLinks,
  listIssues,
  listMyViews,
  listProjectViews,
  listTriage,
  queryIssuesAql,
  saveTriageSettings,
  sendToTriage,
  setIssueFlag,
  snoozeTriage,
  updateIssue,
  updateProjectMemberRole,
  updateView,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function issue(key: string) {
  const found = await getIssueByKey(key);
  if (!found) throw new Error(`no ${key}`);
  return found;
}

describe("플래그 (D2)", () => {
  it("켜고 끄며 버전을 올리지 않는다 — 이유는 코멘트로, 같은 값은 기록 없이", async () => {
    const alm3 = await issue("ALM-3");
    const flagged = await setIssueFlag(alm3.id, true, "API 대기");
    expect(flagged).toMatchObject({ flagged: true, version: alm3.version });
    expect((await listComments(alm3.id)).at(-1)?.body).toBe("플래그 추가: API 대기");
    expect((await listActivity(alm3.id)).some((a) => a.type === "flag" && a.detail === "막힘")).toBe(true);
    await setIssueFlag(alm3.id, true);
    expect((await listActivity(alm3.id)).filter((a) => a.type === "flag")).toHaveLength(1);
    expect((await setIssueFlag(alm3.id, false)).flagged).toBe(false);
  });

  it("일괄 변경 flagged — 열어 둔 버전이 맞아야 한다", async () => {
    const alm5 = await issue("ALM-5");
    const result = await bulkUpdateIssues([{ id: alm5.id, key: alm5.key, version: alm5.version }], { flagged: true });
    expect(result).toEqual({ updated: 1, failed: [] });
    expect((await issue("ALM-5")).flagged).toBe(true);
  });

  it("AQL flagged·플래그 별칭", async () => {
    await setIssueFlag((await issue("ALM-2")).id, true);
    expect((await queryIssuesAql("flagged = true")).items.map((i) => i.key)).toEqual(["ALM-2"]);
    expect((await queryIssuesAql("막힘 = true")).total).toBe(1);
  });
});

describe("계획 필드 — 시작일·스토리 포인트 (D3, V30)", () => {
  it("만들기·수정에서 저장하고, 시작일이 마감일보다 늦으면 거부한다", async () => {
    const created = await createIssue({ projectId: "p1", title: "계획", startDate: "2026-11-01", dueDate: "2026-11-10", storyPoints: 3 });
    expect(created).toMatchObject({ startDate: "2026-11-01", storyPoints: 3 });
    await expect(updateIssue(created.id, { startDate: "2026-11-20" }, created.version)).rejects.toThrow(
      "시작일은 마감일보다 늦을 수 없습니다",
    );
    await expect(updateIssue(created.id, { storyPoints: 10000 }, created.version)).rejects.toThrow(
      "스토리 포인트는 9999 이하여야 합니다",
    );
    const half = await updateIssue(created.id, { storyPoints: 0.5 }, created.version);
    expect(half.storyPoints).toBe(0.5);
  });

  it("AQL startDate·storyPoints — 비교·EMPTY·정렬", async () => {
    await createIssue({ projectId: "p1", title: "A", startDate: "2026-11-01", storyPoints: 5 });
    await createIssue({ projectId: "p1", title: "B", startDate: "2026-12-01", storyPoints: 1 });
    expect((await queryIssuesAql("storyPoints >= 2")).items.map((i) => i.title)).toEqual(["A"]);
    expect((await queryIssuesAql("시작일 > 2026-11-15")).items.map((i) => i.title)).toEqual(["B"]);
    expect((await queryIssuesAql("포인트 IS NOT EMPTY ORDER BY storyPoints ASC")).items.map((i) => i.title)).toEqual(["B", "A"]);
  });
});

describe("추정 합계·속도", () => {
  it("진행 중 스프린트 + 백로그 합계 — 미추정은 0으로 세고 건수를 따로 준다", async () => {
    const alm3 = await issue("ALM-3");
    await updateIssue(alm3.id, { storyPoints: 5 }, alm3.version);
    const alm1 = await issue("ALM-1"); // 완료
    await updateIssue(alm1.id, { storyPoints: 3 }, alm1.version);
    const summary = await getEstimationSummary("p1");
    expect(summary.groups.map((g) => g.name)).toEqual(["Sprint 1", "백로그"]);
    expect(summary.groups[0]).toMatchObject({
      state: "active",
      issueCount: 5,
      completedCount: 1,
      storyPoints: 8,
      completedStoryPoints: 3,
      unestimatedCount: 3,
    });
    expect(summary.groups[1]).toMatchObject({ sprintId: null, issueCount: 3 });
  });

  it("속도 — 완료한 스프린트의 약속(완료 + 이월)과 완료, 단위 전환", async () => {
    const alm3 = await issue("ALM-3");
    await updateIssue(alm3.id, { storyPoints: 5, estimateHours: 4 }, alm3.version);
    const alm1 = await issue("ALM-1");
    await updateIssue(alm1.id, { storyPoints: 3 }, alm1.version);
    await completeSprint("s1", { moveUnfinishedTo: null });
    const points = await getVelocity("p1", "points");
    expect(points.sprints).toHaveLength(1);
    expect(points.sprints[0]).toMatchObject({ name: "Sprint 1", completed: 3, committed: 8 });
    expect(points.average).toBe(3);
    const count = await getVelocity("p1", "count");
    expect(count.sprints[0]).toMatchObject({ completed: 1, committed: 5 });
    expect((await getVelocity("p1", "hours")).sprints[0]).toMatchObject({ committed: 12, completed: 0 });
  });
});

describe("저장된 보기 (D1, V31)", () => {
  it("만들면 표시 옵션을 기본값으로 채워 언제나 전부 있는 모양으로 준다", async () => {
    const view = await createView({ name: " 막힌 이슈 ", projectId: "p1", layout: "board", filter: { kind: "aql", query: "flagged = true" }, display: { groupBy: "assignee" } });
    expect(view).toMatchObject({
      name: "막힌 이슈",
      scope: "personal",
      mine: true,
      canEdit: true,
      layout: "board",
      display: { groupBy: "assignee", subGroupBy: "none", orderBy: "manual", orderDirection: "asc", showSubIssues: true, showEmptyGroups: false },
      version: 1,
    });
    expect(view.display.properties).toEqual(["key", "type", "status", "priority", "assignee", "labels", "flagged"]);
  });

  it("닫힌 어휘 — 모르는 값·같은 하위 그룹·AQL 문법 오류는 저장 때 거부한다", async () => {
    await expect(createView({ name: "x", display: { groupBy: "mood" as never } })).rejects.toThrow("모르는 그룹 기준입니다: mood");
    await expect(createView({ name: "x", display: { groupBy: "status", subGroupBy: "status" } })).rejects.toThrow(
      "하위 그룹 기준은 그룹 기준과 달라야 합니다",
    );
    await expect(createView({ name: "x", filter: { kind: "aql", query: "status = (" } })).rejects.toMatchObject({ name: "AqlError" });
    await expect(createView({ name: "x", scope: "project" })).rejects.toThrow("프로젝트 보기에는 프로젝트가 필요합니다");
  });

  it("프로젝트 보기 목록 = 공유 보기 먼저 + 내 개인 보기, 각각 이름 순", async () => {
    await createView({ name: "나", projectId: "p1" });
    await createView({ name: "팀 보드", projectId: "p1", scope: "project" });
    await createView({ name: "가", projectId: "p1" });
    expect((await listProjectViews("p1")).map((v) => v.name)).toEqual(["팀 보드", "가", "나"]);
    expect((await listMyViews("p1")).map((v) => v.name)).toEqual(["가", "나"]);
  });

  it("고치기는 보낸 항목만, 버전이 어긋나면 409, filter null은 지우기", async () => {
    const view = await createView({ name: "v", projectId: "p1", filter: { kind: "smart", query: "담당:나" } });
    const renamed = await updateView(view.id, { name: "새 이름", display: { orderBy: "storyPoints", orderDirection: "desc" } }, view.version);
    expect(renamed).toMatchObject({ name: "새 이름", filter: { kind: "smart", query: "담당:나" }, display: { orderBy: "storyPoints", orderDirection: "desc" }, version: 2 });
    await expect(updateView(view.id, { name: "늦은 저장" }, 1)).rejects.toMatchObject({ status: 409 });
    expect((await updateView(view.id, { filter: null }, 2)).filter).toBeNull();
    await deleteView(view.id);
    expect(await listMyViews()).toEqual([]);
  });
});

describe("트리아지 (V35)", () => {
  async function enable() {
    return saveTriageSettings("p1", true);
  }

  it("켜지 않은 프로젝트는 대기열로 보낼 수 없다", async () => {
    await expect(sendToTriage((await issue("ALM-5")).id)).rejects.toThrow("트리아지를 켜지 않은 프로젝트입니다");
    expect(await getTriageSettings("p1")).toEqual({ projectId: "p1", enabled: false, pending: 0, snoozed: 0 });
  });

  it("대기열 이슈는 스프린트에서 빠지고 보드·백로그 목록에 나오지 않는다 — 검색·AQL에는 나온다", async () => {
    await enable();
    const alm5 = await issue("ALM-5"); // 활성 스프린트 s1
    const sent = await sendToTriage(alm5.id);
    expect(sent).toMatchObject({ triageState: "pending", sprintId: null });
    const board = await getBoard("b1");
    expect((await listBoardIssues(board!.id)).map((i) => i.key)).not.toContain("ALM-5");
    expect((await listIssues("p1")).map((i) => i.key)).not.toContain("ALM-5");
    expect((await queryIssuesAql("triage = true")).items.map((i) => i.key)).toEqual(["ALM-5"]);
    expect((await getTriageSettings("p1")).pending).toBe(1);
    await expect(sendToTriage(alm5.id)).rejects.toThrow("이미 트리아지 대기열에 있습니다");
    await expect(sendToTriage((await issue("ALM-1")).id)).rejects.toThrow("완료된 이슈는 트리아지로 보낼 수 없습니다");
  });

  it("열람자가 만든 이슈는 대기열로(EXTERNAL), 편집자는 triage: true로", async () => {
    await enable();
    const mine = await createIssue({ projectId: "p1", title: "편집자 접수", triage: true, sprintId: "s1" });
    expect(mine).toMatchObject({ triageState: "pending", sprintId: null, status: "todo" });
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "viewer");
    const external = await createIssue({ projectId: "p1", title: "외부 접수" });
    expect(external.triageState).toBe("pending");
    expect((await listTriage("p1")).map((i) => i.title)).toEqual(["편집자 접수", "외부 접수"]);
  });

  it("수락 — 지정 상태·담당자·우선순위로 백로그에, 완료 상태로는 거부", async () => {
    await enable();
    const created = await createIssue({ projectId: "p1", title: "접수", triage: true });
    await expect(acceptTriage(created.id, { status: "done" })).rejects.toThrow(
      "수락은 진행할 상태로만 할 수 있습니다 — 끝내려면 거절이나 중복을 쓰세요",
    );
    const accepted = await acceptTriage(created.id, { status: "inprogress", assigneeId: "u3", priority: "high", comment: "이번 주에" });
    expect(accepted).toMatchObject({ triageState: null, status: "inprogress", assigneeId: "u3", priority: "high", sprintId: null });
    expect((await listComments(created.id)).map((c) => c.body)).toEqual(["이번 주에"]);
    await expect(acceptTriage(created.id)).rejects.toThrow("트리아지 대기열에 없는 이슈입니다");
  });

  it("거절은 하지 않음, 중복은 링크 + 중복 해결 — 둘 다 첫 완료 상태", async () => {
    await enable();
    const a = await createIssue({ projectId: "p1", title: "A", triage: true });
    const b = await createIssue({ projectId: "p1", title: "B", triage: true });
    expect(await declineTriage(a.id, { comment: "범위 밖" })).toMatchObject({ status: "done", resolution: "wont_do", triageState: null });
    const original = await issue("ALM-3");
    await expect(duplicateTriage(b.id, { duplicateOfIssueId: b.id })).rejects.toThrow("자기 자신의 중복일 수는 없습니다");
    expect(await duplicateTriage(b.id, { duplicateOfIssueId: original.id })).toMatchObject({ status: "done", resolution: "duplicate" });
    expect((await listIssueLinks(b.id)).some((l) => l.link.type === "duplicates" && l.other.id === original.id)).toBe(true);
  });

  it("보류 — 미래 시각까지, 1년을 넘으면 거부. 보류 중은 snoozed 탭에", async () => {
    await enable();
    const created = await createIssue({ projectId: "p1", title: "나중에", triage: true });
    await expect(snoozeTriage(created.id, new Date(Date.now() - 1000).toISOString())).rejects.toThrow("보류는 미래 시각까지로 지정하세요");
    await expect(snoozeTriage(created.id, new Date(Date.now() + 400 * 86400000).toISOString())).rejects.toThrow("보류는 1년까지만 할 수 있습니다");
    const snoozed = await snoozeTriage(created.id, new Date(Date.now() + 86400000).toISOString());
    expect(snoozed.triageState).toBe("snoozed");
    expect(await listTriage("p1", "pending")).toEqual([]);
    expect((await listTriage("p1", "snoozed")).map((i) => i.id)).toEqual([created.id]);
    expect(await getTriageSettings("p1")).toMatchObject({ pending: 0, snoozed: 1 });
  });
});
