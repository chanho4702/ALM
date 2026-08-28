import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  completeSprint,
  updateSprint,
  createIssue,
  createProject,
  deleteIssue,
  listIssues,
  moveIssue,
  rankIssue,
  updateIssue,
  updateProject,
} from "./jiraApi";
import type { IssueDto, ProjectDto } from "./mapping";

const PROJECT: ProjectDto = {
  id: 3,
  key: "ALM",
  name: "ALM 제품",
  description: "통합 이슈 관리",
  version: 4,
  createdAt: "2026-08-16T00:00:00Z",
  updatedAt: "2026-08-16T01:00:00Z",
};

const ISSUE: IssueDto = {
  id: 7,
  key: "ALM-7",
  projectId: 3,
  title: "로그인 오류",
  description: "OIDC callback 실패",
  type: "BUG",
  status: "todo",
  priority: "HIGH",
  assigneeId: null,
  reporterId: 1,
  parentId: null,
  dueDate: null,
  estimateHours: null,
  labels: [],
  order: 4,
  version: 2,
  createdAt: "2026-08-16T00:00:00Z",
  updatedAt: "2026-08-16T01:00:00Z",
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("jiraApi projects", () => {
  it("빈 프로젝트를 정규화해 생성한다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(201, PROJECT));

    await expect(createProject({ key: " alm ", name: " ALM 제품 " })).resolves.toMatchObject({
      id: "3",
      key: "ALM",
    });
    expect(spy).toHaveBeenCalledWith(
      "/api/alm/projects",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      key: "ALM",
      name: "ALM 제품",
      description: "",
    });
  });

  it("서버가 지원하지 않는 프로젝트 템플릿은 요청 전에 거부한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch");
    await expect(
      createProject({ key: "SCR", name: "스크럼", templateId: "scrum" }),
    ).rejects.toThrow("빈 프로젝트 템플릿만");
    expect(spy).not.toHaveBeenCalled();
  });

  it("수정 직전 최신 version을 조회해 expectedVersion으로 보낸다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, PROJECT))
      .mockResolvedValueOnce(response(200, { ...PROJECT, name: "새 이름", version: 5 }));

    await updateProject("3", { name: " 새 이름 " });

    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/3");
    const body = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(body).toMatchObject({ name: "새 이름", description: PROJECT.description, expectedVersion: 4 });
  });
});

describe("jiraApi issues", () => {
  it("목록 DTO를 매핑한 뒤 기존 화면 필터 의미론을 유지한다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      response(200, [ISSUE, { ...ISSUE, id: 8, key: "ALM-8", type: "TASK", priority: "LOW" }]),
    );

    const result = await listIssues("3", { type: "bug", text: "callback" });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "7", type: "bug", priority: "high", order: 4 });
  });

  it("생성 요청의 enum과 assignee id를 백엔드 계약으로 바꾼다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(201, { ...ISSUE, assigneeId: 2 }));

    await createIssue({
      projectId: "3",
      title: " 로그인 오류 ",
      type: "bug",
      priority: "high",
      assigneeId: "2",
      dueDate: "2026-08-20",
      labels: ["security"],
    });

    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      title: "로그인 오류",
      type: "BUG",
      priority: "HIGH",
      assigneeId: 2,
      details: {
        parentId: null,
        sprintId: null,
        dueDate: "2026-08-20",
        estimateHours: null,
        labels: ["security"],
      },
    });
  });

  it("수정 요청도 최신 version과 완전한 PUT 본문을 보낸다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, ISSUE))
      .mockResolvedValueOnce(
        response(200, { ...ISSUE, status: "inprogress", priority: "MEDIUM", version: 3 }),
      );

    await updateIssue("7", {
      status: "inprogress",
      priority: "medium",
      dueDate: "2026-08-21",
      estimateHours: 2.5,
      labels: ["backend"],
    });

    const body = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(body).toEqual({
      title: ISSUE.title,
      description: ISSUE.description,
      type: "BUG",
      status: "inprogress",
      priority: "MEDIUM",
      assigneeId: null,
      details: {
        sprintId: null,
        parentId: null,
        dueDate: "2026-08-21",
        estimateHours: 2.5,
        labels: ["backend"],
      },
      expectedVersion: 2,
    });
  });

  it("스프린트 배정은 details로 보내고, 부분 patch는 현재 값을 채운다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(201, { ...ISSUE, sprintId: 5 }))
      .mockResolvedValueOnce(response(200, { ...ISSUE, sprintId: 5 }))
      .mockResolvedValueOnce(response(200, { ...ISSUE, sprintId: null, version: 3 }));

    const created = await createIssue({ projectId: "3", title: "T", sprintId: "5" });
    expect(created.sprintId).toBe("5");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string).details.sprintId).toBe(5);

    // 스프린트 해제는 null을 명시해야 서버가 미변경과 구분한다.
    await updateIssue("7", { sprintId: null });
    expect(JSON.parse(spy.mock.calls[2][1]!.body as string).details.sprintId).toBeNull();
  });

  it("보드 이동과 랭크 이동은 전용 엔드포인트로 보낸다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ...ISSUE, status: "done", order: 2 }))
      .mockResolvedValueOnce(response(200, { ...ISSUE, sprintId: 5, order: 1 }));

    const moved = await moveIssue("7", { status: "done", beforeId: "9" });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/7/move");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      status: "done",
      beforeId: 9,
    });
    expect(moved.order).toBe(2);

    await rankIssue("7", { sprintId: "5" });
    expect(spy.mock.calls[1][0]).toBe("/api/alm/issues/7/rank");
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({
      sprintId: 5,
      beforeId: null,
    });
  });

  it("스프린트 완료는 프론트가 판단한 완료 상태 목록을 함께 보낸다", async () => {
    const sprintDto = {
      id: 5,
      projectId: 3,
      name: "Sprint 1",
      state: "DONE",
      startedAt: "2026-08-20T00:00:00Z",
      completedAt: "2026-08-23T00:00:00Z",
      version: 3,
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-23T00:00:00Z",
    };
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(200, sprintDto));

    const sprint = await completeSprint("5", ["done", "released"]);

    expect(spy.mock.calls[0][0]).toBe("/api/alm/sprints/5/complete");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      doneStatuses: ["done", "released"],
    });
    expect(sprint).toEqual({
      id: "5",
      projectId: "3",
      name: "Sprint 1",
      state: "done",
      startedAt: "2026-08-20T00:00:00Z",
      completedAt: "2026-08-23T00:00:00Z",
    });
  });

  it("204 삭제와 서버 오류 문구를 처리한다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(403, { error: "PROJECT EDIT 권한이 필요합니다" }));

    await expect(deleteIssue("7")).resolves.toBeUndefined();
    await expect(deleteIssue("8")).rejects.toThrow("PROJECT EDIT 권한이 필요합니다");
    expect(spy.mock.calls.map(([path]) => path)).toEqual(["/api/alm/issues/7", "/api/alm/issues/8"]);
  });
});

describe("jiraApi sprints", () => {
  const SPRINT = {
    id: 12,
    projectId: 3,
    name: "Sprint 1",
    state: "PLANNED" as const,
    goal: null,
    plannedStart: null,
    plannedEnd: null,
    startedAt: null,
    completedAt: null,
    version: 4,
    createdAt: "2026-08-28T00:00:00Z",
    updatedAt: "2026-08-28T00:00:00Z",
  };

  it("최신 version을 조회한 뒤 계획 메타를 expectedVersion과 함께 보낸다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, SPRINT))
      .mockResolvedValueOnce(
        response(200, {
          ...SPRINT,
          goal: "결제 실패율 절반으로",
          plannedStart: "2026-09-01",
          plannedEnd: "2026-09-12",
          version: 5,
        }),
      );

    const updated = await updateSprint("12", {
      goal: "결제 실패율 절반으로",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
    });

    expect(spy.mock.calls[0][0]).toBe("/api/alm/sprints/12");
    const [path, init] = spy.mock.calls[1];
    expect(path).toBe("/api/alm/sprints/12");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Sprint 1",
      goal: "결제 실패율 절반으로",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
      expectedVersion: 4,
    });
    expect(updated.goal).toBe("결제 실패율 절반으로");
  });

  it("건드리지 않은 필드는 서버의 현재 값을 그대로 되돌려 보낸다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ...SPRINT, goal: "유지할 목표", plannedEnd: "2026-09-12" }))
      .mockResolvedValueOnce(response(200, { ...SPRINT, goal: "유지할 목표", version: 5 }));

    await updateSprint("12", { plannedEnd: null });

    expect(JSON.parse(String(spy.mock.calls[1][1]?.body))).toEqual({
      name: "Sprint 1",
      goal: "유지할 목표",
      plannedStart: null,
      plannedEnd: null,
      expectedVersion: 4,
    });
  });

  it("완료 요청은 이관 대상 스프린트를 서버 id로 보낸다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ...SPRINT, state: "DONE" as const }));

    await completeSprint("12", ["done"], { moveUnfinishedTo: "13" });

    expect(spy.mock.calls[0][0]).toBe("/api/alm/sprints/12/complete");
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toEqual({
      doneStatuses: ["done"],
      moveUnfinishedToSprintId: 13,
    });
  });

  it("이관 대상이 없으면 필드를 보내지 않는다 (서버 기본값 = 백로그)", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ...SPRINT, state: "DONE" as const }));

    await completeSprint("12", ["done"]);

    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toEqual({ doneStatuses: ["done"] });
  });

  it("서버 오류 메시지를 그대로 올린다", async () => {
    vi.spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, SPRINT))
      .mockResolvedValueOnce(response(409, { error: "다른 사용자가 먼저 스프린트를 수정했습니다" }));

    await expect(updateSprint("12", { goal: "x" })).rejects.toThrow(
      "다른 사용자가 먼저 스프린트를 수정했습니다",
    );
  });
});
