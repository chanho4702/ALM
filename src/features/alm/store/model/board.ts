// ALM 도메인 모델 타입 — board (types.ts에서 분할, 동작 불변)
import type { IssueType } from "./issue";

export type BoardType = "scrum" | "kanban";

export type BoardSwimlane = "none" | "assignee" | "epic";

/**
 * 저장 열. 두 형식이 있다(2026-10-24 C4).
 * - **상태 형식**(`columnMode: "status"`, 구 형식): 열 = 상태 1:1. `statuses`가 없고 `status`별 이름·WIP 덮어쓰기만 담는다.
 * - **매핑 형식**(`columnMode: "mapped"`): 모든 열에 `statuses[]`(하나 이상)와 보드가 붙인 `id`가 있다. 열 하나에 여러 상태,
 *   상태는 한 열에만. 응답의 `status`는 첫 상태(구 클라이언트 호환)다.
 */
export interface BoardColumn {
  /** 매핑 형식의 열 id — 비워 보내면 서버가 붙인다 */
  id?: string;
  /** 상태 형식: WorkflowStatus.id. 매핑 형식: 첫 상태 */
  status: string;
  name: string; // 표시 이름 (기본: 상태 이름)
  /** 매핑 형식에서만 — 이 열에 들어가는 상태들(순서 = 놓을 때 고르는 순서) */
  statuses?: string[];
  wipLimit: number | null; // null = 제한 없음
}

/** 보드가 실제로 그리는 열 — 순서·이름·상태(서버 `resolvedColumns`, 목업도 같은 규칙으로 계산한다) */
export interface ResolvedBoardColumn {
  /** 상태 형식이면 상태 id, 매핑 형식이면 열 id */
  id: string;
  name: string;
  /** 이 열에 보이는 상태(워크플로 order 순이 아니라 열에 넣은 순서) */
  statuses: string[];
  wipLimit: number | null;
}

export type BoardColumnMode = "status" | "mapped";

/** 보드 저장 필터 — 빈 배열 = 전체. assigneeIds의 "unassigned" = 미지정 매치 */
export interface BoardFilter {
  assigneeIds: string[];
  types: IssueType[];
  labels: string[];
}

/**
 * 보드 = "보는 방법"만 저장하는 필터 뷰 (지라와 동일 철학).
 * 이슈/스프린트는 계속 프로젝트 소속이다.
 */
export interface Board {
  id: string;
  projectId: string;
  name: string;
  type: BoardType; // scrum = 활성 스프린트 이슈, kanban = 스프린트 무관 전체
  filter: BoardFilter;
  /** 저장 열 — 형식은 `columnMode`. 화면이 그릴 때는 `resolvedColumns`를 쓴다 */
  columns: BoardColumn[];
  swimlane: BoardSwimlane; // 기본 스윔레인 (화면에서 임시 전환 가능)
  isDefault: boolean; // 뷰 탭 "보드"가 여는 보드
  createdAt: string;
  /** 열 형식 — 구 응답(필드 없음)은 status */
  columnMode: BoardColumnMode;
  /** 최종 열(읽을 때 워크플로에서 빠진 상태는 뺀다) */
  resolvedColumns: ResolvedBoardColumn[];
  /** 어느 열에도 없는 상태 — 그 상태의 이슈는 보드에 나오지 않는다(매핑 형식에서만 비지 않는다) */
  unmappedStatuses: string[];
}
