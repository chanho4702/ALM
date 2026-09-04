import { describe, expect, it } from "vitest";
import {
  extractApiError,
  mapIssue,
  mapProject,
  mapSprint,
  toApiIssuePriority,
  toApiIssueType,
  toBackendId,
  type IssueDto,
} from "./mapping";

const ISSUE_DTO: IssueDto = {
  id: 7,
  key: "ALM-7",
  projectId: 3,
  title: "로그인 오류",
  description: null,
  type: "bug",
  status: "inprogress",
  priority: "HIGH",
  assigneeId: 2,
  reporterId: 1,
  parentId: 6,
  dueDate: "2026-08-20",
  estimateHours: 3.5,
  labels: ["security", "backend"],
  order: 9,
  version: 4,
  createdAt: "2026-08-16T00:00:00Z",
  updatedAt: "2026-08-16T01:00:00Z",
};

describe("alm-backend DTO mapping", () => {
  it("프로젝트 숫자 id와 null 설명을 화면 모델로 바꾼다", () => {
    expect(
      mapProject({
        id: 3,
        key: "ALM",
        name: "ALM 제품",
        description: null,
        version: 2,
        createdAt: "2026-08-16T00:00:00Z",
        updatedAt: "2026-08-16T01:00:00Z",
      }),
    ).toEqual({
      id: "3",
      key: "ALM",
      name: "ALM 제품",
      description: "",
      category: "",
      leadId: null,
      defaultAssignee: "unassigned",
      icon: "",
      color: "",
      url: "",
      archivedAt: null,
      deletedAt: null,
      purgeAt: null,
      createdAt: "2026-08-16T00:00:00Z",
    });
  });

  it("이슈 enum과 사용자 id를 변환하고 미지원 필드에는 안전한 기본값을 둔다", () => {
    expect(mapIssue(ISSUE_DTO, 5)).toMatchObject({
      id: "7",
      projectId: "3",
      type: "bug",
      priority: "high",
      assigneeId: "2",
      reporterId: "1",
      description: "",
      sprintId: null,
      parentId: "6",
      dueDate: "2026-08-20",
      estimateHours: 3.5,
      labels: ["security", "backend"],
      order: 9,
    });
  });

  it("프론트 enum을 백엔드 enum으로 바꾼다", () => {
    expect(toApiIssueType("subtask")).toBe("subtask"); // V11부터 레지스트리 id 그대로
    expect(toApiIssuePriority("medium")).toBe("medium");
  });

  it("백엔드 id는 양의 안전한 정수만 허용한다", () => {
    expect(toBackendId("42")).toBe(42);
    expect(() => toBackendId("u1")).toThrow("잘못된 백엔드 id");
    expect(() => toBackendId("0")).toThrow("잘못된 백엔드 id");
  });

  it("서버 오류 문구를 우선하고 상태별 한국어 폴백을 제공한다", () => {
    expect(extractApiError(400, { error: "프로젝트 키 오류" })).toBe("프로젝트 키 오류");
    expect(extractApiError(409, null)).toContain("다른 사용자");
    expect(extractApiError(401, null)).toContain("로그인이 만료");
  });
});

describe("mapSprint", () => {
  const BASE = {
    id: 12,
    projectId: 3,
    name: "Sprint 1",
    state: "PLANNED" as const,
    version: 1,
    createdAt: "2026-08-28T00:00:00Z",
    updatedAt: "2026-08-28T00:00:00Z",
  };

  it("계획 메타(목표·예정 기간)를 화면 모델로 옮긴다", () => {
    const sprint = mapSprint({
      ...BASE,
      goal: "결제 실패율 절반으로",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
    });

    expect(sprint).toMatchObject({
      id: "12",
      projectId: "3",
      goal: "결제 실패율 절반으로",
      plannedStart: "2026-09-01",
      plannedEnd: "2026-09-12",
    });
  });

  it("서버가 비워 보낸 계획 메타는 필드 자체를 만들지 않는다", () => {
    const sprint = mapSprint({ ...BASE, goal: null, plannedStart: null, plannedEnd: null });

    expect(sprint.goal).toBeUndefined();
    expect(sprint.plannedStart).toBeUndefined();
    expect(sprint.plannedEnd).toBeUndefined();
  });
});
