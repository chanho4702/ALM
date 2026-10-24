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
}
