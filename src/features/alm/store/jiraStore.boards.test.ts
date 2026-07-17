import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  completeSprint,
  createBoard,
  createIssue,
  deleteBoard,
  deleteProject,
  getBoard,
  listBoardIssues,
  listBoards,
  updateBoard,
  updateIssue,
} from "./jiraStore";

const PROJECT = "p1"; // 시드 프로젝트 (보드 b1 스크럼 기본, b2 칸반 backend 필터)

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("boards CRUD", () => {
  it("listBoards는 기본 보드를 앞세워 반환한다 (시드: 메인 보드, 백엔드 팀)", async () => {
    const boards = await listBoards(PROJECT);
    expect(boards.map((b) => b.name)).toEqual(["메인 보드", "백엔드 팀"]);
    expect(boards[0].isDefault).toBe(true);
    expect(boards[1].type).toBe("kanban");
  });

  it("createBoard는 필터 없는 기본 3컬럼 보드를 만든다 (isDefault=false)", async () => {
    const board = await createBoard({ projectId: PROJECT, name: "QA 보드", type: "kanban" });
    expect(board).toMatchObject({
      name: "QA 보드",
      type: "kanban",
      isDefault: false,
      swimlane: "none",
    });
    expect(board.columns.map((c) => c.status)).toEqual(["todo", "inprogress", "done"]);
    expect(await getBoard(board.id)).not.toBeNull();
  });

  it("빈 이름/없는 프로젝트는 거부한다", async () => {
    await expect(createBoard({ projectId: PROJECT, name: "  ", type: "scrum" })).rejects.toThrow(
      "보드 이름을 입력하세요",
    );
    await expect(createBoard({ projectId: "없음", name: "x", type: "scrum" })).rejects.toThrow(
      "프로젝트를 찾을 수 없습니다",
    );
  });

  it("updateBoard: 이름/필터/스윔레인/WIP 반영, 잘못된 컬럼·WIP는 거부", async () => {
    const [main] = await listBoards(PROJECT);
    const updated = await updateBoard(main.id, {
      name: "스프린트 보드",
      swimlane: "assignee",
      filter: { assigneeIds: ["u1"], types: [], labels: [] },
      columns: [
        { status: "todo", name: "대기", wipLimit: null },
        { status: "inprogress", name: "작업 중", wipLimit: 3 },
        { status: "done", name: "끝", wipLimit: null },
      ],
    });
    expect(updated.name).toBe("스프린트 보드");
    expect(updated.columns[1]).toEqual({ status: "inprogress", name: "작업 중", wipLimit: 3 });

    await expect(
      updateBoard(main.id, {
        columns: [
          { status: "todo", name: "a", wipLimit: null },
          { status: "todo", name: "b", wipLimit: null },
          { status: "done", name: "c", wipLimit: null },
        ],
      }),
    ).rejects.toThrow("컬럼은 할 일/진행 중/완료 각 1개여야 합니다");
    await expect(
      updateBoard(main.id, {
        columns: [
          { status: "todo", name: "a", wipLimit: 0 },
          { status: "inprogress", name: "b", wipLimit: null },
          { status: "done", name: "c", wipLimit: null },
        ],
      }),
    ).rejects.toThrow("WIP 제한은 1 이상의 정수여야 합니다");
  });

  it("isDefault 지정 시 같은 프로젝트의 나머지 보드는 기본 해제된다", async () => {
    const boards = await listBoards(PROJECT);
    await updateBoard(boards[1].id, { isDefault: true });
    const after = await listBoards(PROJECT);
    expect(after[0].name).toBe("백엔드 팀");
    expect(after.filter((b) => b.isDefault)).toHaveLength(1);
  });

  it("deleteBoard: 기본 보드 삭제 시 남은 보드 승격, 마지막 보드는 삭제 금지", async () => {
    const boards = await listBoards(PROJECT);
    await deleteBoard(boards[0].id); // 기본(메인 보드) 삭제
    const remaining = await listBoards(PROJECT);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ name: "백엔드 팀", isDefault: true });

    await expect(deleteBoard(remaining[0].id)).rejects.toThrow(
      "마지막 보드는 삭제할 수 없습니다",
    );
  });

  it("deleteProject는 보드도 연쇄 삭제한다", async () => {
    await deleteProject(PROJECT);
    expect(await listBoards(PROJECT)).toHaveLength(0);
  });
});

describe("listBoardIssues", () => {
  it("스크럼 보드는 활성 스프린트 이슈만, 칸반 보드는 백로그 포함 전체를 필터로 거른다", async () => {
    const [main, backend] = await listBoards(PROJECT);
    // 시드: s1 활성 스프린트 이슈 = ALM-1~5
    const scrumIssues = await listBoardIssues(main.id);
    expect(scrumIssues.map((i) => i.key).sort()).toEqual([
      "ALM-1",
      "ALM-2",
      "ALM-3",
      "ALM-4",
      "ALM-5",
    ]);
    // b2: kanban + labels=["backend"] → 백로그의 ALM-6만 (backend 라벨)
    const kanbanIssues = await listBoardIssues(backend.id);
    expect(kanbanIssues.map((i) => i.key)).toEqual(["ALM-6"]);
  });

  it("스크럼 보드는 활성 스프린트가 없으면 빈 배열", async () => {
    await completeSprint("s1");
    const [main] = await listBoards(PROJECT);
    expect(await listBoardIssues(main.id)).toEqual([]);
  });

  it("저장 필터: assigneeIds의 unassigned 센티널은 미지정 이슈를 매치한다", async () => {
    const board = await createBoard({ projectId: PROJECT, name: "미지정만", type: "kanban" });
    await updateBoard(board.id, {
      filter: { assigneeIds: ["unassigned"], types: [], labels: [] },
    });
    const issues = await listBoardIssues(board.id);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.assigneeId === null)).toBe(true);
  });

  it("저장 필터: 타입 필터 (bug = ALM-8)", async () => {
    const board = await createBoard({ projectId: PROJECT, name: "버그만", type: "kanban" });
    await updateBoard(board.id, { filter: { assigneeIds: [], types: ["bug"], labels: [] } });
    expect((await listBoardIssues(board.id)).map((i) => i.key)).toEqual(["ALM-8"]);
  });

  it("이슈 상태를 바꿔도 보드 조회에 반영된다 (뷰일 뿐 소속이 아니다)", async () => {
    const [, backend] = await listBoards(PROJECT);
    const [issue] = await listBoardIssues(backend.id); // ALM-6 todo
    await updateIssue(issue.id, { status: "done" });
    const after = await listBoardIssues(backend.id);
    expect(after.find((i) => i.key === "ALM-6")?.status).toBe("done");
  });

  it("칸반 보드에 새 백로그 이슈가 바로 보인다", async () => {
    const [, backend] = await listBoards(PROJECT);
    await createIssue({ projectId: PROJECT, title: "새 백엔드 작업", labels: ["backend"] });
    const issues = await listBoardIssues(backend.id);
    expect(issues.some((i) => i.title === "새 백엔드 작업")).toBe(true);
  });
});

describe("boards 마이그레이션", () => {
  it("보드가 없던 구버전 데이터에 기본 스크럼 보드를 만든다", async () => {
    const now = "2026-07-01T00:00:00.000Z";
    localStorage.setItem(
      "alm.jira.v1",
      JSON.stringify({
        users: [{ id: "u1", name: "김찬호" }],
        projects: [{ id: "p9", key: "OLD", name: "구버전", createdAt: now }],
        sprints: [],
        issues: [],
        comments: [],
        activities: [],
        issueCounters: { p9: 0 },
      }),
    );
    __resetForTest();
    const boards = await listBoards("p9");
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ name: "메인 보드", type: "scrum", isDefault: true });
  });
});

describe("createProject 기본 보드", () => {
  it("새 프로젝트는 기본 스크럼 보드를 함께 갖는다", async () => {
    const { createProject } = await import("./jiraStore");
    const project = await createProject({ key: "PAY", name: "결제" });
    const boards = await listBoards(project.id);
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ name: "메인 보드", type: "scrum", isDefault: true });
  });
});
