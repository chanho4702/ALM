/** 백로그 화면의 패널 키 — "backlog" 또는 sprintId */
export const BACKLOG_PANEL = "backlog";

export interface BacklogMoveTarget {
  sprintId: string | null;
  beforeId?: string;
}

const toSprintId = (panelKey: string): string | null =>
  panelKey === BACKLOG_PANEL ? null : panelKey;

/**
 * 백로그 드래그 종료를 rankIssue 파라미터로 변환한다 (boardDnd.resolveMove와 같은 규칙).
 *
 * @param activeId 드래그한 이슈 id
 * @param overId   드롭 대상 — 이슈 id 또는 패널 키("backlog" | sprintId)
 * @param panels   패널 키 → order순 이슈 id 배열 (드래그 시작 시점)
 * @returns 이동이 불필요하면(제자리/미지의 대상) null
 */
export function resolveBacklogMove(
  activeId: string,
  overId: string,
  panels: Record<string, string[]>,
): BacklogMoveTarget | null {
  if (activeId === overId) return null;

  // 패널 영역 자체에 드롭 → 그 패널 맨 끝
  if (overId in panels) {
    const ids = panels[overId];
    if (ids[ids.length - 1] === activeId) return null; // 이미 맨 끝
    return { sprintId: toSprintId(overId) };
  }

  const overPanel = Object.keys(panels).find((key) => panels[key].includes(overId));
  if (!overPanel) return null;

  const ids = panels[overPanel];
  const overIndex = ids.indexOf(overId);
  const activeIndex = ids.indexOf(activeId);

  if (activeIndex !== -1 && activeIndex < overIndex) {
    // 같은 패널에서 아래로: over 자리를 차지하려면 over 다음 행 앞에 삽입
    return { sprintId: toSprintId(overPanel), beforeId: ids[overIndex + 1] };
  }
  // 같은 패널에서 위로, 또는 패널 간 이동: over 행 앞에 삽입
  return { sprintId: toSprintId(overPanel), beforeId: overId };
}
