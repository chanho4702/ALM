// ALM 도메인 모델 타입 — 프로젝트 실시간 스트림(2026-10-24, Linear식). 정본은 alm-backend README "실시간 동기화".
//
// 무효화 신호만 온다 — 무엇이(id·종류) 어느 version으로 바뀌었는지. 본문은 없다: 받는 쪽이 REST로 다시 읽고,
// 그 REST가 권한을 거른다.

export type IssueStreamType =
  | "issue.created"
  | "issue.updated"
  | "issue.transitioned"
  | "issue.ranked"
  | "issue.deleted"
  | "issue.archived"
  | "issue.restored";

export type SprintStreamType = "sprint.created" | "sprint.updated" | "sprint.started" | "sprint.completed" | "sprint.deleted";

export interface IssueStreamEvent {
  kind: "issue";
  type: IssueStreamType;
  projectId: string;
  issueId: string;
  issueKey: string;
  /** 없을 수 있다(삭제·보관) */
  version: number | null;
  changedFields: string[];
  /** ranked — 다시 매겨진 그룹(null = 백로그) */
  sprintId: string | null;
  /** 변경한 사람(사이클 자동 생성은 "0") */
  actorId: string;
  at: string | null;
  /** SSE id(스트림 위치) */
  eventId: string | null;
}

export interface SprintStreamEvent {
  kind: "sprint";
  type: SprintStreamType;
  projectId: string;
  sprintId: string;
  version: number | null;
  actorId: string;
  at: string | null;
  eventId: string | null;
}

/** 연결 시점 — 재생한 신호 수, 이어 줄 수 없었으면 reset */
export interface ReadyStreamEvent {
  kind: "ready";
  projectId: string;
  replayed: number;
  reset: boolean;
  eventId: string | null;
}

/** 이어 줄 수 없다(재생 창 밖·대기열 넘침) — 화면 전체 재조회 */
export interface ResetStreamEvent {
  kind: "reset";
  projectId: string;
  reason: string | null;
  eventId: string | null;
}

/** 볼 권한을 잃었다 — 서버가 보낸 뒤 닫는다. 다시 붙지 않는다 */
export interface RevokedStreamEvent {
  kind: "revoked";
  projectId: string;
}

export type ProjectStreamEvent =
  | IssueStreamEvent
  | SprintStreamEvent
  | ReadyStreamEvent
  | ResetStreamEvent
  | RevokedStreamEvent;

export interface ProjectStreamHandlers {
  signal: AbortSignal;
  /** 마지막으로 받은 SSE id — 재연결 때 `Last-Event-ID`로 보낸다 */
  lastEventId: string | null;
  onOpen: () => void;
  onActivity: () => void;
  onEvent: (event: ProjectStreamEvent) => void;
}
