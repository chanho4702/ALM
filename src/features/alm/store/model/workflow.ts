// ALM 도메인 모델 타입 — 워크플로 엔진(가용 전환·전환 실행, 2026-10-24 웨이브 A·C)
import type { IssueResolution, StatusKind } from "./issue";
import type { TransitionScreenField } from "./settings";

/**
 * 지금 상태에서 할 수 있는 전환 하나 — 서버 `GET /api/alm/issues/{id}/transitions`의 항목과 같은 뜻
 * (지라 getTransitions의 isGlobal·isAvailable·hasScreen). 조건 때문에 못 하는 전환도 숨기지 않는다.
 */
export interface IssueTransitionOption {
  /** 전환 id. 전환 목록이 빈 워크플로(모두 허용)에서는 `implicit:<상태 id>` */
  id: string;
  /** 전환 이름 — 비어 있으면 대상 상태 이름 */
  name: string;
  /** 대상 상태 id */
  to: string;
  toName: string;
  /** 대상 상태 의미 — 서버가 모르면 null */
  toKind: StatusKind | null;
  /** 대상 상태 아이콘(폴백까지 해석된 lucide 키) */
  toIcon: string | null;
  /** 모든 상태에서 갈 수 있는 전역 전환인가 */
  isGlobal: boolean;
  /** 지금 이 사용자가 할 수 있나(조건·편집 권한까지 평가) */
  available: boolean;
  /** 못 하는 이유 — available=false일 때만 */
  unavailableReason: string | null;
  /** 전환 화면이 있나(screenFields가 비지 않음) */
  hasScreen: boolean;
  screenFields: TransitionScreenField[];
  /** 전환 검증 필드 */
  requiredFields: string[];
  /** requiredFields 중 지금 비어 있는 것 — 화면 칸으로 채우지 않으면 실행이 400 */
  missingFields: string[];
}

export interface IssueTransitions {
  issueId: string;
  /** 현재 상태 id */
  status: string;
  /** 현재 이슈 버전 — 전환 실행의 expectedVersion으로 보낸다 */
  version: number;
  /** 이슈 타입별 워크플로가 적용됐나(false = 프로젝트 기본) */
  typeWorkflow: boolean;
  transitions: IssueTransitionOption[];
}

/**
 * 전환 화면 값 — **키를 보낸 칸만** 바뀐다. 그 전환의 `screenFields`에 없는 칸은 400이다.
 * `assigneeId`·`fixVersionId`·`dueDate`는 null이면 해제, `resolution`은 null이면 기본값(완료).
 */
export interface TransitionFields {
  resolution?: IssueResolution | null;
  assigneeId?: string | null;
  fixVersionId?: string | null;
  dueDate?: string | null;
}

/** 전환 실행 요청 — `POST /api/alm/issues/{id}/transitions` */
export interface TransitionRequest {
  transitionId: string;
  /** 화면이 본 이슈 버전. 주면 서버 값과 다를 때 409 */
  expectedVersion?: number;
  fields?: TransitionFields;
  /** 전환 코멘트 — 화면에 comment 칸이 있을 때만. 비우면 남기지 않는다 */
  comment?: string;
}

/** 전환 id 접두어 — 전환 목록이 빈 워크플로의 암묵 전환 */
export const IMPLICIT_TRANSITION_PREFIX = "implicit:";
