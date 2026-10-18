// ALM 도메인 모델 타입 — board (types.ts에서 분할, 동작 불변)
import type { IssueType } from "./issue";

export type BoardType = "scrum" | "kanban";

export type BoardSwimlane = "none" | "assignee" | "epic";

export interface BoardColumn {
  /** WorkflowStatus.id 참조 — 실제 컬럼 구성은 프로젝트 상태 목록에서 파생된다 */
  status: string;
  name: string; // 표시 이름 (기본: 상태 이름)
  wipLimit: number | null; // null = 제한 없음
}

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
  columns: BoardColumn[]; // 항상 길이 3, status 순서 고정
  swimlane: BoardSwimlane; // 기본 스윔레인 (화면에서 임시 전환 가능)
  isDefault: boolean; // 뷰 탭 "보드"가 여는 보드
  createdAt: string;
}
