// localStorage 목업 스토어 — boards (jiraMock.ts에서 분할, 동작 불변)
import type { Board, BoardType, Issue } from "../types";
import { clone, load, defaultBoard, persist } from "./db";

export async function listBoards(projectId: string): Promise<Board[]> {
  return clone(
    load()
      .boards.filter((b) => b.projectId === projectId)
      .sort((a, b) =>
        a.isDefault === b.isDefault
          ? a.createdAt.localeCompare(b.createdAt)
          : a.isDefault
            ? -1
            : 1,
      ),
  );
}

export async function getBoard(id: string): Promise<Board | null> {
  const board = load().boards.find((b) => b.id === id);
  return board ? clone(board) : null;
}

export async function createBoard(input: {
  projectId: string;
  name: string;
  type: BoardType;
}): Promise<Board> {
  const data = load();
  if (!data.projects.some((p) => p.id === input.projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  const name = input.name.trim();
  if (!name) throw new Error("보드 이름을 입력하세요");
  const board = { ...defaultBoard(input.projectId, name, input.type), isDefault: false };
  data.boards.push(board);
  persist();
  return clone(board);
}

/** columns 패치는 status 3종 각 1개·WIP(null 또는 1 이상 정수)를 검증한다 */
/** 컬럼은 상태별 최대 1개 오버라이드 — 실제 컬럼 구성은 프로젝트 상태 목록에서 파생된다 */
function validateColumns(columns: Board["columns"]): void {
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.status)) throw new Error("컬럼은 상태마다 하나여야 합니다");
    seen.add(column.status);
    if (!column.name.trim()) throw new Error("컬럼 이름을 입력하세요");
    if (column.wipLimit !== null && (!Number.isInteger(column.wipLimit) || column.wipLimit < 1)) {
      throw new Error("WIP 제한은 1 이상의 정수여야 합니다");
    }
  }
}

export async function updateBoard(
  id: string,
  patch: Partial<Pick<Board, "name" | "filter" | "columns" | "swimlane" | "isDefault">>,
): Promise<Board> {
  const data = load();
  const board = data.boards.find((b) => b.id === id);
  if (!board) throw new Error("보드를 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("보드 이름을 입력하세요");
    board.name = name;
  }
  if (patch.columns !== undefined) {
    validateColumns(patch.columns);
    board.columns = patch.columns;
  }
  if (patch.filter !== undefined) board.filter = patch.filter;
  if (patch.swimlane !== undefined) board.swimlane = patch.swimlane;
  if (patch.isDefault === true) {
    for (const other of data.boards) {
      if (other.projectId === board.projectId) other.isDefault = other.id === board.id;
    }
  }
  persist();
  return clone(board);
}

export async function deleteBoard(id: string): Promise<void> {
  const data = load();
  const board = data.boards.find((b) => b.id === id);
  if (!board) throw new Error("보드를 찾을 수 없습니다");
  const siblings = data.boards.filter((b) => b.projectId === board.projectId);
  if (siblings.length <= 1) throw new Error("마지막 보드는 삭제할 수 없습니다");
  data.boards = data.boards.filter((b) => b.id !== id);
  // 기본 보드를 지웠으면 남은 첫 보드를 기본으로 승격
  if (board.isDefault) {
    const remaining = data.boards
      .filter((b) => b.projectId === board.projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (remaining[0]) remaining[0].isDefault = true;
  }
  persist();
}

/**
 * 보드에 보이는 이슈 — scrum: 활성 스프린트(없으면 빈 배열), kanban: 프로젝트 전체.
 * 공통으로 보드 저장 필터를 적용한다. 퀵 필터는 화면 몫이다.
 */
export async function listBoardIssues(boardId: string): Promise<Issue[]> {
  const data = load();
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) throw new Error("보드를 찾을 수 없습니다");
  let issues = data.issues.filter((i) => i.projectId === board.projectId);
  if (board.type === "scrum") {
    const active = data.sprints.find((s) => s.projectId === board.projectId && s.state === "active");
    if (!active) return [];
    issues = issues.filter((i) => i.sprintId === active.id);
  }
  const { assigneeIds, types, labels } = board.filter;
  if (assigneeIds.length > 0) {
    issues = issues.filter((i) =>
      i.assigneeId === null ? assigneeIds.includes("unassigned") : assigneeIds.includes(i.assigneeId),
    );
  }
  if (types.length > 0) issues = issues.filter((i) => types.includes(i.type));
  if (labels.length > 0) issues = issues.filter((i) => i.labels.some((l) => labels.includes(l)));
  return clone([...issues].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)));
}
