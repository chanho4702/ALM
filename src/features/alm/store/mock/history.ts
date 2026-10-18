// localStorage 목업 스토어 — history (jiraMock.ts에서 분할, 동작 불변)
import type { ChangeField, IssueChange } from "../types";
import { CHANGE_HISTORY_MAX_LIMIT } from "../shared";
import { load, clone } from "./db";

/**
 * 프로젝트 변경 이력 — 리포트가 집계하는 원천. 시간 오름차순이며 필터는 전부 선택이다.
 * 스프린트 필터는 **전이의 양쪽**을 잡는다(서버와 같은 규칙) — 떠난 줄을 놓치면 원래 스프린트의
 * "빠진 이슈"를 셀 수 없다.
 */
/** 변경 이력 조회 조건 — since 포함·until 배타(ISO-8601), limit은 서버와 같은 기본·최대 20000 */
export interface ChangeFilter {
  field?: ChangeField;
  sprintId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

/** 이력 한 묶음 — truncated면 기간 안에 limit보다 많아 오래된 쪽이 잘렸다(서버 `X-Result-Truncated`) */
export interface ChangeWindow {
  items: IssueChange[];
  truncated: boolean;
}

export async function listProjectChangeWindow(projectId: string, filter: ChangeFilter = {}): Promise<ChangeWindow> {
  const data = load();
  const rows = data.changes.filter((change) => {
    if (change.projectId !== projectId) return false;
    if (filter.field && change.field !== filter.field) return false;
    if (filter.since && change.at < filter.since) return false;
    if (filter.until && change.at >= filter.until) return false;
    if (filter.sprintId) {
      const touchesSprint =
        change.sprintId === filter.sprintId ||
        (change.field === "sprint" &&
          (change.fromValue === filter.sprintId || change.toValue === filter.sprintId));
      if (!touchesSprint) return false;
    }
    return true;
  });
  // 같은 밀리초에 쌓인 줄은 **기록 순서**로 남긴다. id는 UUID라 문자열 비교가 무작위가 되고,
  // 그러면 "마지막 변경"이 실행마다 달라진다. Array.sort는 안정 정렬이라 동률은 삽입 순서를 지킨다.
  const sorted = rows.sort((a, b) => a.at.localeCompare(b.at));
  const cap = Math.min(CHANGE_HISTORY_MAX_LIMIT, Math.max(1, filter.limit ?? CHANGE_HISTORY_MAX_LIMIT));
  const truncated = sorted.length > cap;
  return { items: clone(truncated ? sorted.slice(sorted.length - cap) : sorted), truncated };
}

/** 변경 이력(시간 오름차순) — 잘림 여부가 필요하면 listProjectChangeWindow */
export async function listProjectChanges(projectId: string, filter: ChangeFilter = {}): Promise<IssueChange[]> {
  return (await listProjectChangeWindow(projectId, filter)).items;
}
