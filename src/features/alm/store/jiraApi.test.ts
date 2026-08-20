import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  createIssue,
  createProject,
  deleteIssue,
  listIssues,
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
        parentId: null,
        dueDate: "2026-08-21",
        estimateHours: 2.5,
        labels: ["backend"],
      },
      expectedVersion: 2,
    });
  });

  it("서버 미지원 확장 필드는 네트워크 요청 전에 거부해 데이터 유실을 막는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch");
    await expect(createIssue({ projectId: "3", title: "T", sprintId: "1" })).rejects.toThrow(
      "스프린트는 아직",
    );
    await expect(updateIssue("7", { sprintId: "1" })).rejects.toThrow("스프린트는 아직");
    expect(spy).not.toHaveBeenCalled();
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
