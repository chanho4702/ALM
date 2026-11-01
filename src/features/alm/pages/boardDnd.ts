export interface MoveTarget {
  status: string; // WorkflowStatus.id
  beforeId?: string;
}

/**
 * 드래그 종료(active를 over 위에 드롭)를 moveIssue 파라미터로 변환한다.
 *
 * @param activeId 드래그한 이슈 id
 * @param overId   드롭 대상 id — 이슈 id 또는 컬럼 droppable id(= 상태 id 문자열)
 * @param columns  상태 id → order순 이슈 id 배열 (드래그 시작 시점의 보드 상태)
 * @returns 이동이 불필요하면(제자리) null
 */
export function resolveMove(
  activeId: string,
  overId: string,
  columns: Record<string, string[]>,
): MoveTarget | null {
  if (activeId === overId) return null;

  // 컬럼 영역 자체에 드롭 → 그 컬럼 맨 끝에 추가
  if (overId in columns) {
    const ids = columns[overId];
    if (ids[ids.length - 1] === activeId) return null; // 이미 맨 끝
    return { status: overId };
  }

  const overStatus = Object.keys(columns).find((s) => columns[s].includes(overId));
  if (!overStatus) return null;

  const overIndex = columns[overStatus].indexOf(overId);
  const activeIndex = columns[overStatus].indexOf(activeId);

  if (activeIndex !== -1 && activeIndex < overIndex) {
    // 같은 컬럼에서 아래로: over 자리를 차지하려면 over 다음 카드 앞에 삽입
    // (over가 마지막이면 beforeId=undefined → 맨 끝)
    return { status: overStatus, beforeId: columns[overStatus][overIndex + 1] };
  }
  // 같은 컬럼에서 위로, 또는 컬럼 간 이동: over 카드 앞에 삽입
  return { status: overStatus, beforeId: overId };
}

/**
 * 다중 선택 드래그의 놓을 자리 — 잡은 카드 기준으로 resolveMove를 하되, 끼워 넣을 앞 카드가 함께 옮기는 카드면
 * 그 뒤의 첫 비(非)묶음 카드 앞으로(없으면 열 끝). 묶음이 이미 그 열 끝에 그 순서로 모여 있으면 null.
 */
export function groupDropBefore(
  activeId: string,
  overId: string,
  columns: Record<string, string[]>,
  group: string[],
): MoveTarget | null {
  const members = new Set(group);
  const status = overId in columns ? overId : Object.keys(columns).find((s) => columns[s].includes(overId));
  if (!status) return null;
  const ids = columns[status];
  let beforeId: string | undefined;
  if (!(overId in columns)) {
    if (members.has(overId)) {
      beforeId = overId;
    } else {
      const base = resolveMove(activeId, overId, columns);
      if (!base) return null;
      beforeId = base.beforeId;
    }
  }
  if (beforeId !== undefined && members.has(beforeId)) {
    beforeId = ids.slice(ids.indexOf(beforeId)).find((id) => !members.has(id));
  }
  if (beforeId === undefined) {
    const tail = ids.slice(Math.max(0, ids.length - group.length));
    if (tail.length === group.length && tail.every((id, i) => id === group[i])) return null;
  }
  return { status, beforeId };
}

/** 키보드 이동(`[`·`]`)의 목적지 — 이 상태가 든 열의 이웃 열 id. 끝이거나 보드에 없는 상태면 null */
export function adjacentColumnId(
  columns: { id: string; statuses: string[] }[],
  status: string,
  delta: -1 | 1,
): string | null {
  const index = columns.findIndex((column) => column.statuses.includes(status));
  if (index === -1) return null;
  return columns[index + delta]?.id ?? null;
}
