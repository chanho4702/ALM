import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  acceptTriage,
  createAutomationRule,
  createIssue,
  getBoard,
  getEstimationSummary,
  getVelocity,
  listIssueTransitions,
  listIssues,
  listNotifications,
  listProjectViews,
  setIssueFlag,
  snoozeTriage,
  transitionIssue,
  updateIssue,
  updateView,
} from "./jiraApi";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function fetchSpy(handler: (path: string, init?: RequestInit) => Response) {
  return vi
    .spyOn(client, "sharedApiFetch")
    .mockImplementation((path: string, init?: RequestInit) => Promise.resolve(handler(path, init)));
}

const bodyOf = (spy: ReturnType<typeof fetchSpy>, index: number) =>
  JSON.parse(spy.mock.calls[index][1]!.body as string) as Record<string, unknown>;

const ISSUE = {
  id: 1024,
  key: "ALM-42",
  projectId: 7,
  title: "로그인",
  description: "",
  type: "task",
  status: "done",
  priority: "medium",
  assigneeId: 42,
  reporterId: 7,
  resolution: "WONT_DO",
  labels: [],
  componentIds: [],
  order: 1,
  version: 3,
  createdAt: "2026-10-24T00:00:00Z",
  updatedAt: "2026-10-24T00:00:00Z",
  startDate: "2026-10-27",
  storyPoints: "3.5",
  flagged: true,
  triageState: "SNOOZED",
};

afterEach(() => vi.restoreAllMocks());

describe("REST — 이슈 응답의 계획 필드(V30·V35)", () => {
  it("startDate·storyPoints(BigDecimal 문자열)·flagged·triageState를 화면 모델로 옮긴다", async () => {
    fetchSpy(() => response(200, ISSUE));
    const issue = await setIssueFlag("1024", true, "  API 대기 ");
    expect(issue).toMatchObject({ startDate: "2026-10-27", storyPoints: 3.5, flagged: true, triageState: "snoozed" });
  });

  it("구 서버 응답(필드 없음)은 null·false로 읽는다", async () => {
    const { startDate: _s, storyPoints: _p, flagged: _f, triageState: _t, ...old } = ISSUE;
    fetchSpy(() => response(200, old));
    expect(await setIssueFlag("1024", false)).toMatchObject({ startDate: null, storyPoints: null, flagged: false, triageState: null });
  });

  it("플래그 PUT 본문 — 이유는 다듬어 싣고, 비면 키째 뺀다", async () => {
    const spy = fetchSpy(() => response(200, ISSUE));
    await setIssueFlag("1024", true, "  API 대기 ");
    await setIssueFlag("1024", false, "   ");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/1024/flag");
    expect(spy.mock.calls[0][1]?.method).toBe("PUT");
    expect(bodyOf(spy, 0)).toEqual({ flagged: true, comment: "API 대기" });
    expect(bodyOf(spy, 1)).toEqual({ flagged: false });
  });

  it("만들기·수정은 planning에 **보낸 키만** 싣는다(생략 = 그대로)", async () => {
    const spy = fetchSpy(() => response(200, ISSUE));
    await createIssue({ projectId: "7", title: "새", storyPoints: 2, triage: true });
    expect(bodyOf(spy, 0)).toMatchObject({ planning: { storyPoints: 2 }, triage: true });
    expect(bodyOf(spy, 0).planning).not.toHaveProperty("startDate");
    await updateIssue("1024", { title: "제목만" }, 3);
    // GET(현재 값) 다음이 PUT
    const put = spy.mock.calls.findIndex((call) => call[1]?.method === "PUT");
    expect(bodyOf(spy, put).planning).toBeUndefined();
    await updateIssue("1024", { startDate: null }, 3);
    const lastPut = spy.mock.calls.map((c) => c[1]?.method).lastIndexOf("PUT");
    expect(bodyOf(spy, lastPut).planning).toEqual({ startDate: null });
  });

  it("listIssues(보드·백로그용)는 트리아지 대기열을 뺀다 — 검색 API에 트리아지 조건이 없어서", async () => {
    fetchSpy(() =>
      response(200, { items: [{ ...ISSUE, triageState: null }, { ...ISSUE, id: 1025, key: "ALM-43", triageState: "PENDING" }], page: 0, size: 200, total: 2 }),
    );
    expect((await listIssues("7")).map((i) => i.key)).toEqual(["ALM-42"]);
  });
});

describe("REST — 가용 전환·전환 실행 (A2·A4)", () => {
  it("전환 목록을 그대로 옮기고 이슈 id는 문자열로", async () => {
    const spy = fetchSpy(() =>
      response(200, {
        issueId: 1024,
        status: "inprogress",
        version: 3,
        typeWorkflow: false,
        transitions: [
          { id: "t-done", name: "끝내기", to: "done", toName: "완료", toKind: "complete", toIcon: "check-circle", isGlobal: false, available: false, unavailableReason: "담당자만 이 전환을 할 수 있습니다", hasScreen: true, screenFields: ["resolution", "comment"], requiredFields: ["dueDate"], missingFields: ["dueDate"] },
        ],
      }),
    );
    const result = await listIssueTransitions("1024");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/1024/transitions");
    expect(result).toEqual({
      issueId: "1024",
      status: "inprogress",
      version: 3,
      typeWorkflow: false,
      transitions: [
        { id: "t-done", name: "끝내기", to: "done", toName: "완료", toKind: "complete", toIcon: "check-circle", isGlobal: false, available: false, unavailableReason: "담당자만 이 전환을 할 수 있습니다", hasScreen: true, screenFields: ["resolution", "comment"], requiredFields: ["dueDate"], missingFields: ["dueDate"] },
      ],
    });
  });

  it("실행 본문 — 화면 값은 서버 어휘·숫자 id로, 안 준 칸은 싣지 않는다", async () => {
    const spy = fetchSpy(() => response(200, ISSUE));
    await transitionIssue("1024", {
      transitionId: "t-done",
      expectedVersion: 3,
      fields: { resolution: "wont_do", assigneeId: "42", dueDate: null },
      comment: "  범위에서 뺍니다 ",
    });
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
    expect(bodyOf(spy, 0)).toEqual({
      transitionId: "t-done",
      expectedVersion: 3,
      fields: { resolution: "WONT_DO", assigneeId: 42, dueDate: null },
      comment: "범위에서 뺍니다",
    });
    await transitionIssue("1024", { transitionId: "implicit:done" });
    expect(bodyOf(spy, 1)).toEqual({ transitionId: "implicit:done" });
  });

  it("거부는 서버 {error} 문구 그대로 — 409·503은 상태를 싣는다", async () => {
    fetchSpy(() => response(503, { error: "권한 서비스에 연결할 수 없습니다" }));
    await expect(transitionIssue("1024", { transitionId: "t" })).rejects.toMatchObject({ status: 503, message: "권한 서비스에 연결할 수 없습니다" });
  });
});

describe("REST — 보드 열 매핑 (C4)", () => {
  it("columnMode·resolvedColumns·unmappedStatuses를 옮기고, 구 응답은 status 형식으로 본다", async () => {
    fetchSpy(() =>
      response(200, {
        id: 3, projectId: 7, name: "보드", type: "kanban", filter: null, swimlane: "none", isDefault: true, createdAt: "x",
        columnMode: "mapped",
        columns: [{ id: "col-1", status: "inprogress", name: "진행", statuses: ["inprogress", "review"], wipLimit: 3 }],
        resolvedColumns: [{ id: "col-1", name: "진행", statuses: ["inprogress", "review"], wipLimit: 3 }],
        unmappedStatuses: ["todo"],
      }),
    );
    expect(await getBoard("3")).toMatchObject({
      columnMode: "mapped",
      columns: [{ id: "col-1", status: "inprogress", statuses: ["inprogress", "review"], wipLimit: 3 }],
      resolvedColumns: [{ id: "col-1", statuses: ["inprogress", "review"] }],
      unmappedStatuses: ["todo"],
    });
    vi.restoreAllMocks();
    fetchSpy(() => response(200, { id: 3, projectId: 7, name: "보드", type: "kanban", filter: null, swimlane: "none", isDefault: true, createdAt: "x", columns: [] }));
    expect(await getBoard("3")).toMatchObject({ columnMode: "status", resolvedColumns: [], unmappedStatuses: [] });
  });
});

describe("REST — 추정·속도·보기·트리아지·자동화·알림", () => {
  it("추정 합계·속도 — BigDecimal은 수로, 상태는 소문자로", async () => {
    const spy = fetchSpy((path) =>
      path.includes("velocity")
        ? response(200, { projectId: 7, unit: "hours", average: "17.5", sprints: [{ sprintId: 11, name: "Sprint 2", completedAt: "z", committed: "24", completed: 18 }] })
        : response(200, { projectId: 7, groups: [{ sprintId: 12, name: "Sprint 3", state: "ACTIVE", issueCount: 8, completedCount: 3, storyPoints: "21", completedStoryPoints: 8, unestimatedCount: 2, estimateHours: "30.5", completedEstimateHours: 10 }, { sprintId: null, name: "백로그", state: null, issueCount: 14 }] }),
    );
    const summary = await getEstimationSummary("7");
    expect(summary.groups[0]).toMatchObject({ sprintId: "12", state: "active", storyPoints: 21, estimateHours: 30.5 });
    expect(summary.groups[1]).toMatchObject({ sprintId: null, state: null, storyPoints: 0, completedCount: 0 });
    const velocity = await getVelocity("7", "hours", 5);
    expect(spy.mock.calls[1][0]).toBe("/api/alm/projects/7/reports/velocity?unit=hours&limit=5");
    expect(velocity).toEqual({ projectId: "7", unit: "hours", average: 17.5, sprints: [{ sprintId: "11", name: "Sprint 2", completedAt: "z", committed: 24, completed: 18 }] });
  });

  it("보기 — 목록 경로, 고치기에서 filter null은 clearFilter", async () => {
    const VIEW = { id: 31, name: "막힌", scope: "project", projectId: 7, ownerId: 42, mine: true, canEdit: true, layout: "board", filter: { kind: "aql", query: "flagged = true" }, display: { groupBy: "assignee" }, version: 1, createdAt: "a", updatedAt: "b" };
    const spy = fetchSpy(() => response(200, [VIEW]));
    const [view] = await listProjectViews("7");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/views");
    expect(view).toMatchObject({ id: "31", projectId: "7", ownerId: "42", display: { groupBy: "assignee", orderBy: "manual", showSubIssues: true } });
    vi.restoreAllMocks();
    const put = fetchSpy(() => response(200, VIEW));
    await updateView("31", { filter: null, name: "새" }, 1);
    expect(bodyOf(put, 0)).toEqual({ expectedVersion: 1, name: "새", clearFilter: true });
  });

  it("트리아지 — 수락 본문은 준 것만, 보류는 until", async () => {
    const spy = fetchSpy(() => response(200, { ...ISSUE, triageState: null }));
    await acceptTriage("1024", { assigneeId: "42", comment: " " });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/1024/triage/accept");
    expect(bodyOf(spy, 0)).toEqual({ assigneeId: 42 });
    await snoozeTriage("1024", "2026-11-01T00:00:00Z");
    expect(spy.mock.calls[1][0]).toBe("/api/alm/issues/1024/triage/snooze");
    expect(bodyOf(spy, 1)).toEqual({ until: "2026-11-01T00:00:00Z" });
  });

  it("자동화 — 사용자 id만 숫자로 바꿔 보내고, 빈 조건은 null", async () => {
    const RULE = { id: 5, projectId: 7, name: "r", description: null, enabled: true, disabledReason: null, trigger: { type: "ISSUE_CREATED" }, condition: null, actions: [{ type: "NOTIFY", recipients: ["assignee"], userIds: [7], message: "m" }], allowRuleTrigger: false, actorId: 42, createdBy: 42, nextRunAt: null, lastRunAt: null, consecutiveFailures: 0, version: 1, createdAt: "a", updatedAt: "b" };
    const spy = fetchSpy(() => response(201, RULE));
    const rule = await createAutomationRule("7", {
      name: "r",
      trigger: { type: "ISSUE_CREATED" },
      condition: "  ",
      actions: [{ type: "NOTIFY", recipients: ["assignee"], userIds: ["7"], message: "m" }],
    });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/7/automation/rules");
    expect(bodyOf(spy, 0)).toMatchObject({ condition: null, actions: [{ type: "NOTIFY", userIds: [7], userId: null }] });
    expect(rule).toMatchObject({ id: "5", actorId: "42", condition: "", actions: [{ userIds: ["7"] }] });
  });

  it("알림 type AUTOMATION — 문장은 규칙이 정한 detail 그대로", async () => {
    fetchSpy(() => response(200, [{ id: 1, issueId: 1024, issueKey: "ALM-42", actorId: 42, type: "AUTOMATION", detail: "마감이 지났습니다", read: false, createdAt: "c" }]));
    expect(await listNotifications()).toEqual([
      expect.objectContaining({ type: "automation", message: "마감이 지났습니다", issueKey: "ALM-42" }),
    ]);
  });
});
