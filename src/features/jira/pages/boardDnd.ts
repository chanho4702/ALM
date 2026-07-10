import type { IssueStatus } from "../store/types";
import { BOARD_STATUSES } from "../components/labels";

export interface MoveTarget {
  status: IssueStatus;
  beforeId?: string;
}

/**
 * 드래그 종료(active를 over 위에 드롭)를 moveIssue 파라미터로 변환한다.
 *
 * @param activeId 드래그한 이슈 id
 * @param overId   드롭 대상 id — 이슈 id 또는 컬럼 droppable id(= IssueStatus 문자열)
 * @param columns  status → order순 이슈 id 배열 (드래그 시작 시점의 보드 상태)
 * @returns 이동이 불필요하면(제자리) null
 */
export function resolveMove(
  activeId: string,
  overId: string,
  columns: Record<IssueStatus, string[]>,
): MoveTarget | null {
  if (activeId === overId) return null;

  // 컬럼 영역 자체에 드롭 → 그 컬럼 맨 끝에 추가
  if ((BOARD_STATUSES as string[]).includes(overId)) {
    const status = overId as IssueStatus;
    const ids = columns[status];
    if (ids[ids.length - 1] === activeId) return null; // 이미 맨 끝
    return { status };
  }

  const overStatus = BOARD_STATUSES.find((s) => columns[s].includes(overId));
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
