/**
 * 보드 열 해석·드롭 대상 고르기(C4·A3) — 순수 함수. 스토어 접근 없음(boardDnd.ts와 같은 자리).
 */
import type { Board, Issue, IssueTransitionOption, ResolvedBoardColumn, WorkflowStatus } from "../store/types";

/**
 * 보드가 그릴 열 — 서버(·목업)가 준 `resolvedColumns`가 정본이다. 구 서버(필드 없음)면 상태 목록 + 이름·WIP
 * 덮어쓰기로 예전처럼 상태 1:1 열을 만든다. 워크플로에서 빠진 상태는 버린다.
 */
export function boardColumnsOf(board: Board, statuses: WorkflowStatus[]): ResolvedBoardColumn[] {
  const known = new Set(statuses.map((s) => s.id));
  if (board.resolvedColumns && board.resolvedColumns.length > 0) {
    return board.resolvedColumns.map((column) => ({
      ...column,
      statuses: column.statuses.filter((id) => known.has(id)),
    }));
  }
  return [...statuses]
    .sort((a, b) => a.order - b.order)
    .map((status) => {
      const override = board.columns.find((c) => c.status === status.id && !c.statuses);
      return {
        id: status.id,
        name: override?.name?.trim() ? override.name : status.name,
        statuses: [status.id],
        wipLimit: override?.wipLimit ?? null,
      };
    });
}

/** 열 id → 그 열 이슈 id(보드 순서) — resolveMove 입력 */
export function columnIssueIds(columns: ResolvedBoardColumn[], issues: Issue[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const column of columns) {
    map[column.id] = issues.filter((issue) => column.statuses.includes(issue.status)).map((issue) => issue.id);
  }
  return map;
}

export type ColumnAvailability = { allowed: true; option: IssueTransitionOption | null } | { allowed: false; reason: string };

/**
 * 이 이슈를 그 열에 놓을 수 있나 — 열의 상태 중 **지금 상태면 순서 변경**(전환 아님), 아니면 그 열 상태로 가는
 * 가용 전환 중 열에 넣은 순서상 첫 번째(기획 C4 "가용 전환 중 첫 번째"). 하나도 없으면 첫 후보의 이유로 막는다.
 */
export function columnAvailability(
  column: ResolvedBoardColumn,
  issue: Pick<Issue, "status">,
  options: IssueTransitionOption[],
): ColumnAvailability {
  if (column.statuses.includes(issue.status)) return { allowed: true, option: null };
  let firstReason: string | null = null;
  for (const status of column.statuses) {
    const candidates = options.filter((option) => option.to === status);
    const usable = candidates.find((option) => option.available);
    if (usable) return { allowed: true, option: usable };
    firstReason ??= candidates.find((option) => option.unavailableReason)?.unavailableReason ?? null;
  }
  return { allowed: false, reason: firstReason ?? "이 열로 옮길 수 있는 전환이 없습니다" };
}

/**
 * 낙관적 이동 — 서버 응답을 기다리지 않고 화면 목록을 먼저 바꾼다. 대상 상태로 바꾸고 `beforeId` 앞(없으면
 * 그 열 맨 끝)에 끼운다. 실패하면 호출자가 이전 목록으로 되돌린다.
 */
export function applyOptimisticMove(
  issues: Issue[],
  issueId: string,
  toStatus: string,
  beforeId: string | undefined,
  columnStatuses: string[],
): Issue[] {
  const moving = issues.find((issue) => issue.id === issueId);
  if (!moving) return issues;
  const rest = issues.filter((issue) => issue.id !== issueId);
  const moved = { ...moving, status: toStatus };
  let index = beforeId ? rest.findIndex((issue) => issue.id === beforeId) : -1;
  if (index === -1) {
    // 열 맨 끝 — 그 열의 마지막 이슈 바로 뒤(없으면 목록 끝)
    const lastInColumn = rest.reduce((last, issue, i) => (columnStatuses.includes(issue.status) ? i : last), -1);
    index = lastInColumn === -1 ? rest.length : lastInColumn + 1;
  }
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}
