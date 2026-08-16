import { describe, expect, it } from "vitest";
import {
  extractApiError,
  mapIssue,
  mapProject,
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
  type: "BUG",
  status: "inprogress",
  priority: "HIGH",
  assigneeId: 2,
  reporterId: 1,
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
      parentId: null,
      dueDate: null,
      estimateHours: null,
      labels: [],
      order: 5,
    });
  });

  it("프론트 enum을 백엔드 enum으로 바꾼다", () => {
    expect(toApiIssueType("subtask")).toBe("SUBTASK");
    expect(toApiIssuePriority("medium")).toBe("MEDIUM");
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
