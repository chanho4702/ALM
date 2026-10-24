// ALM 도메인 모델 타입 — activity (types.ts에서 분할, 동작 불변)

/** 사용자에게 전달되는 알림 — 본인 액션은 알리지 않는다 (지라와 동일) */
/** 감사 로그 한 줄 — 서버 이벤트 봉투(payloadCase) 이름이 eventType */
export interface AuditEntry {
  id: string;
  eventType: string;
  actorId: string;
  projectId: string | null;
  targetKey: string | null;
  summary: string | null;
  at: string;
}

export interface SystemStats {
  projects: number;
  issues: number;
  attachments: number;
  attachmentBytes: number;
  auditEntries: number;
}

/** 이슈 워처 — 알림 대상. 보고자·담당자는 자동, 나머지는 스스로 등록 */
export interface IssueWatcher {
  issueId: string;
  userId: string;
  createdAt: string;
}

/** 알림 종류 — 서버 `type`의 소문자. 목업 옛 데이터·구 응답에는 없을 수 있다 */
export type NotificationType = "assigned" | "status_changed" | "commented" | "mentioned" | "automation";

export interface Notification {
  id: string;
  /** 종류 — 자동화 알림(`automation`)은 화면이 규칙 아이콘으로 구분한다 */
  type?: NotificationType;
  /** 수신자 */
  userId: string;
  issueId: string;
  issueKey: string;
  /** 행위자 */
  actorId: string;
  message: string;
  at: string;
  read: boolean;
  /** 미루기 해제 시각(V40) — 미래면 미뤄 둔 알림, 과거면 "미루기에서 돌아온" 알림. 없으면 null/생략 */
  snoozedUntil?: string | null;
  /** 보관 시각(V40) — 있으면 보관함에만 보인다 */
  archivedAt?: string | null;
  /** 정렬 키 — 처음엔 생성 시각, 미루기에서 돌아오면 해제 시각(서버 sortAt). 목업만 저장한다 */
  sortAt?: string;
}

/** 인박스 필터(Linear Inbox) — 서버 `filter` 값 그대로 */
export type InboxFilter = "all" | "unread" | "mentions" | "assigned" | "automation" | "snoozed" | "archived";

export interface InboxQuery {
  filter?: InboxFilter;
  /** 불투명 커서 — 앞 페이지의 nextCursor */
  cursor?: string | null;
  limit?: number;
}

export interface InboxPage {
  items: Notification[];
  /** 다음 페이지 커서 — 없으면 null */
  nextCursor: string | null;
  /** 배지 숫자 — 미뤄 둔 것·보관한 것은 세지 않는다 */
  unreadCount: number;
}

/** 일괄 처리(`POST /notifications/bulk`) */
export type InboxBulkAction = "read" | "unread" | "archive" | "unarchive";

export interface InboxBulkResult {
  updated: number;
  unreadCount: number;
}
