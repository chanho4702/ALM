// localStorage 목업 스토어 — boards (jiraMock.ts에서 분할, 동작 불변)
import type { Board, BoardColumn, BoardType, Issue, JiraData, ResolvedBoardColumn } from "../types";
import { clone, load, defaultBoard, persist, nextId } from "./db";
import { resolvedStatuses } from "./rules";

/**
 * 읽을 때의 열 해석 — 서버 `BoardService.response`와 같은 규칙(C4).
 * 상태 형식: 워크플로 상태 전부(order 순) + 열 이름·WIP 덮어쓰기. 매핑 형식: 저장 열 순서, 워크플로에서 빠진 상태는 뺀다.
 */
export function resolveBoard(data: JiraData, board: Board): Board {
  const statuses = [...resolvedStatuses(data, board.projectId)].sort((a, b) => a.order - b.order);
  const known = new Set(statuses.map((s) => s.id));
  const mapped = board.columns.some((c) => Array.isArray(c.statuses));
  const resolved: ResolvedBoardColumn[] = [];
  const unmapped: string[] = [];
  let columns: BoardColumn[];
  if (mapped) {
    const placed = new Set<string>();
    columns = board.columns.map((c) => {
      const live = (c.statuses ?? []).filter((id) => known.has(id));
      live.forEach((id) => placed.add(id));
      resolved.push({ id: c.id ?? "", name: c.name, statuses: live, wipLimit: c.wipLimit ?? null });
      return { id: c.id, status: live[0] ?? "", name: c.name, statuses: live, wipLimit: c.wipLimit ?? null };
    });
    for (const s of statuses) if (!placed.has(s.id)) unmapped.push(s.id);
  } else {
    columns = board.columns.map((c) => ({ status: c.status, name: c.name, wipLimit: c.wipLimit ?? null }));
    for (const s of statuses) {
      const override = board.columns.find((c) => c.status === s.id);
      resolved.push({
        id: s.id,
        name: override?.name?.trim() ? override.name : s.name,
        statuses: [s.id],
        wipLimit: override?.wipLimit ?? null,
      });
    }
  }
  return {
    ...board,
    columns,
    columnMode: mapped ? "mapped" : "status",
    resolvedColumns: resolved,
    unmappedStatuses: unmapped,
  };
}

export async function listBoards(projectId: string): Promise<Board[]> {
  const data = load();
  return clone(
    data
      .boards.filter((b) => b.projectId === projectId)
      .map((b) => resolveBoard(data, b))
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
  const data = load();
  const board = data.boards.find((b) => b.id === id);
  return board ? clone(resolveBoard(data, board)) : null;
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
  return clone(resolveBoard(data, board));
}

/**
 * 저장 전 검증·정리 — 서버 `normalizeColumns`와 같은 규칙·같은 문구.
 * 상태 형식(구): 상태마다 하나. 매핑 형식: 열 하나라도 `statuses`가 있으면 모든 열에 있어야 하고, 상태는 한 열에만.
 */
function normalizeColumns(data: JiraData, projectId: string, columns: BoardColumn[]): BoardColumn[] {
  for (const column of columns) {
    if (!column) throw new Error("컬럼이 비어 있습니다");
    if (!column.name?.trim()) throw new Error("컬럼 이름을 입력하세요");
    if (column.wipLimit !== null && column.wipLimit !== undefined && (!Number.isInteger(column.wipLimit) || column.wipLimit < 1)) {
      throw new Error("WIP 제한은 1 이상의 정수여야 합니다");
    }
  }
  const mapped = columns.some((c) => Array.isArray(c.statuses));
  if (!mapped) {
    const seen = new Set<string>();
    for (const column of columns) {
      if (!column.status || seen.has(column.status)) throw new Error("컬럼은 상태마다 하나여야 합니다");
      seen.add(column.status);
    }
    return columns.map((c) => ({ status: c.status, name: c.name, wipLimit: c.wipLimit ?? null }));
  }
  const known = new Set(resolvedStatuses(data, projectId).map((s) => s.id));
  const seenStatus = new Set<string>();
  const seenId = new Set<string>();
  return columns.map((column) => {
    if (!Array.isArray(column.statuses)) {
      throw new Error("열 매핑을 쓰는 보드는 모든 열에 상태 목록(statuses)이 있어야 합니다");
    }
    const statuses = [...new Set(column.statuses)];
    for (const status of statuses) {
      if (!known.has(status)) throw new Error(`이 프로젝트에 없는 상태입니다: ${status}`);
      if (seenStatus.has(status)) throw new Error(`상태 하나는 한 열에만 넣을 수 있습니다: ${status}`);
      seenStatus.add(status);
    }
    const id = column.id?.trim() ? column.id.trim() : `col-${nextId().slice(0, 8)}`;
    if (seenId.has(id)) throw new Error(`같은 열 id가 두 번 있습니다: ${id}`);
    seenId.add(id);
    return { id, status: statuses[0] ?? "", name: column.name.trim(), statuses, wipLimit: column.wipLimit ?? null };
  });
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
    board.columns = normalizeColumns(data, board.projectId, patch.columns);
  }
  if (patch.filter !== undefined) board.filter = patch.filter;
  if (patch.swimlane !== undefined) board.swimlane = patch.swimlane;
  if (patch.isDefault === true) {
    for (const other of data.boards) {
      if (other.projectId === board.projectId) other.isDefault = other.id === board.id;
    }
  }
  persist();
  return clone(resolveBoard(data, board));
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
  // 트리아지 대기열(V35)은 보드에 나오지 않는다 — 수락돼야 워크플로에 들어온다
  let issues = data.issues.filter((i) => i.projectId === board.projectId && !i.triageState);
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
  // 열 매핑 보드(C4): 어느 열에도 없는 상태의 이슈는 보드에 나오지 않는다(지라와 같다)
  const layout = resolveBoard(data, board);
  if (layout.columnMode === "mapped") {
    const placed = new Set(layout.resolvedColumns.flatMap((c) => c.statuses));
    issues = issues.filter((i) => placed.has(i.status));
  }
  return clone([...issues].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)));
}
