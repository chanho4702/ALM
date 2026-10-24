// alm-backend REST 어댑터 — notifications (jiraApi.ts에서 분할, 동작 불변)
import { toBackendId } from "../mapping";
import type { InboxBulkAction, InboxBulkResult, InboxPage, InboxQuery, Notification } from "../types";
import { json, sharedApiFetch } from "./http";

// ── 워처 · 알림 — 서버 V9. 문장은 서버가 만들지 않으므로 여기서 type + detail로 만든다 ──

export interface WatchersView {
  watching: boolean;
  watchers: { userId: string; createdAt: string }[];
}

interface WatchersDto {
  watching: boolean;
  watchers: { userId: number; createdAt: string }[];
}

const mapWatchers = (dto: WatchersDto): WatchersView => ({
  watching: dto.watching,
  watchers: dto.watchers.map((w) => ({ userId: String(w.userId), createdAt: w.createdAt })),
});

export async function listWatchers(issueId: string): Promise<WatchersView> {
  return mapWatchers((await json(await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/watchers`))) as WatchersDto);
}

export async function watchIssue(issueId: string): Promise<WatchersView> {
  return mapWatchers(
    (await json(
      await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/watchers/me`, { method: "PUT" }),
    )) as WatchersDto,
  );
}

export async function unwatchIssue(issueId: string): Promise<WatchersView> {
  return mapWatchers(
    (await json(
      await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/watchers/me`, { method: "DELETE" }),
    )) as WatchersDto,
  );
}

interface NotificationDto {
  id: number;
  issueId: number | null;
  issueKey: string;
  actorId: number;
  type: "ASSIGNED" | "STATUS_CHANGED" | "COMMENTED" | "MENTIONED" | "AUTOMATION";
  detail: string | null;
  read: boolean;
  createdAt: string;
  /** V40 — 뒤에 붙은 필드(옛 서버는 없다) */
  snoozedUntil?: string | null;
  archivedAt?: string | null;
}

/**
 * 알림 문장 — 서버는 종류와 부가값만 준다. 사용자 이름 디렉터리가 REST에 아직 없어 행위자는 id로
 * 쓰고, 상태 이름은 id 그대로 둔다(화면이 statusName으로 바꿔 보여줄 수 있게 detail도 남긴다).
 */
function notificationMessage(dto: NotificationDto): string {
  const actor = `사용자 ${dto.actorId}`;
  switch (dto.type) {
    case "ASSIGNED":
      return `${actor} 님이 ${dto.issueKey}를 나에게 할당했습니다`;
    case "STATUS_CHANGED":
      return `${actor} 님이 ${dto.issueKey}를 ${dto.detail ?? ""}(으)로 옮겼습니다`;
    case "MENTIONED":
      return `${actor} 님이 ${dto.issueKey}에서 나를 멘션했습니다`;
    case "AUTOMATION":
      // 자동화 규칙(V37)의 NOTIFY — 문장은 규칙이 정한 detail 그대로
      return dto.detail?.trim() ? dto.detail : `${dto.issueKey}: 자동화 알림`;
    default:
      return `${actor} 님이 ${dto.issueKey}에 코멘트를 남겼습니다`;
  }
}

export function mapNotification(dto: NotificationDto): Notification {
  return {
    id: String(dto.id),
    userId: "me",
    issueId: dto.issueId === null ? "" : String(dto.issueId),
    issueKey: dto.issueKey,
    actorId: String(dto.actorId),
    type: dto.type.toLowerCase() as Notification["type"],
    message: notificationMessage(dto),
    at: dto.createdAt,
    read: dto.read,
    snoozedUntil: dto.snoozedUntil ?? null,
    archivedAt: dto.archivedAt ?? null,
  };
}

export async function listNotifications(): Promise<Notification[]> {
  const rows = (await json(await sharedApiFetch("/api/alm/notifications"))) as NotificationDto[];
  return rows.map(mapNotification);
}

// ── 알림 인박스(V40, Linear Inbox) ──

interface InboxPageDto {
  items: NotificationDto[];
  nextCursor: string | null;
  unreadCount: number;
}

export async function listNotificationInbox(query: InboxQuery = {}): Promise<InboxPage> {
  const params = new URLSearchParams();
  params.set("filter", query.filter ?? "all");
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const body = (await json(await sharedApiFetch(`/api/alm/notifications/inbox?${params}`))) as InboxPageDto;
  return {
    items: (body.items ?? []).map(mapNotification),
    nextCursor: body.nextCursor ?? null,
    unreadCount: body.unreadCount ?? 0,
  };
}

const notificationPath = (id: string, tail: string) => `/api/alm/notifications/${toBackendId(id)}/${tail}`;

export async function snoozeNotification(id: string, until: string): Promise<Notification> {
  return mapNotification(
    (await json(
      await sharedApiFetch(notificationPath(id, "snooze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until }),
      }),
    )) as NotificationDto,
  );
}

export async function unsnoozeNotification(id: string): Promise<Notification> {
  return mapNotification(
    (await json(await sharedApiFetch(notificationPath(id, "snooze"), { method: "DELETE" }))) as NotificationDto,
  );
}

export async function archiveNotification(id: string): Promise<Notification> {
  return mapNotification(
    (await json(await sharedApiFetch(notificationPath(id, "archive"), { method: "POST" }))) as NotificationDto,
  );
}

export async function unarchiveNotification(id: string): Promise<Notification> {
  return mapNotification(
    (await json(await sharedApiFetch(notificationPath(id, "unarchive"), { method: "POST" }))) as NotificationDto,
  );
}

export async function bulkNotifications(ids: string[], action: InboxBulkAction): Promise<InboxBulkResult> {
  const body = (await json(
    await sharedApiFetch("/api/alm/notifications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.map(toBackendId), action }),
    }),
  )) as InboxBulkResult;
  return { updated: body.updated ?? 0, unreadCount: body.unreadCount ?? 0 };
}

export async function markNotificationRead(id: string): Promise<void> {
  await sharedApiFetch(`/api/alm/notifications/${toBackendId(id)}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await sharedApiFetch("/api/alm/notifications/read-all", { method: "POST" });
}
