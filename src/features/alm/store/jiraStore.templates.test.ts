import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createProject,
  listBoards,
  listIssues,
  listSprints,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("프로젝트 생성 템플릿", () => {
  it("기본(blank)은 현행 그대로 — 메인 스크럼 보드만, 샘플/스프린트 없음", async () => {
    const project = await createProject({ key: "PAY", name: "결제" });
    const boards = await listBoards(project.id);
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ name: "메인 보드", type: "scrum", isDefault: true });
    expect(await listIssues(project.id)).toHaveLength(0);
    expect(await listSprints(project.id)).toHaveLength(0);
  });

  it("스크럼 템플릿: 스프린트 보드 + Sprint 1(planned) + 샘플 이슈 3개", async () => {
    const project = await createProject({ key: "SCR", name: "스크럼", templateId: "scrum" });
    const [board] = await listBoards(project.id);
    expect(board).toMatchObject({ name: "스프린트 보드", type: "scrum", isDefault: true });

    const sprints = await listSprints(project.id);
    expect(sprints).toHaveLength(1);
    expect(sprints[0]).toMatchObject({ name: "Sprint 1", state: "planned" });

    const issues = await listIssues(project.id);
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.key)).toEqual(["SCR-1", "SCR-2", "SCR-3"]);
    expect(issues.every((i) => i.sprintId === null)).toBe(true); // 백로그로 생성
  });

  it("칸반 템플릿: 진행 중 WIP 3, 샘플 중 하나는 진행 중", async () => {
    const project = await createProject({ key: "KAN", name: "칸반", templateId: "kanban" });
    const [board] = await listBoards(project.id);
    expect(board.type).toBe("kanban");
    expect(board.columns.find((c) => c.status === "inprogress")?.wipLimit).toBe(3);

    const issues = await listIssues(project.id);
    expect(issues).toHaveLength(3);
    expect(issues.some((i) => i.status === "inprogress")).toBe(true);
  });

  it("버그 트래킹 템플릿: 버그 필터 칸반 보드 + 샘플 버그", async () => {
    const project = await createProject({ key: "BUG", name: "버그", templateId: "bugtrack" });
    const [board] = await listBoards(project.id);
    expect(board).toMatchObject({ name: "버그 보드", type: "kanban" });
    expect(board.filter.types).toEqual(["bug"]);

    const issues = await listIssues(project.id);
    expect(issues.filter((i) => i.type === "bug")).toHaveLength(2);
  });
});
