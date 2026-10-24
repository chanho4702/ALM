// localStorage 목업 스토어 — notifications (jiraMock.ts에서 분할) + 알림 인박스(V40 Linear Inbox 대역)
import { CURRENT_USER_ID } from "../../../../mock/users";
import type { InboxBulkAction, InboxBulkResult, InboxFilter, InboxPage, InboxQuery, Notification } from "../types";
import { ApiError } from "../mapping";
import { clone, load, persist } from "./db";

// ── notifications ────────────────────────────────────────────

const YEAR_MS = 366 * 24 * 60 * 60 * 1000;
const INBOX_DEFAULT_LIMIT = 50;
const BULK_MAX = 200;

/** 정렬 키 — 미루기에서 돌아온 알림은 해제 시각 자리(맨 위)로 온다(서버 sortAt) */
const sortKey = (n: Notification): string => n.sortAt ?? n.at;
const isSnoozed = (n: Notification, now: number) => Boolean(n.snoozedUntil && Date.parse(n.snoozedUntil) > now);
const isArchived = (n: Notification) => Boolean(n.archivedAt);
/** 서버와 같은 순서 — sortAt 내림차순, 같으면 id 내림차순 */
const byInboxOrder = (a: Notification, b: Notification) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id);

/** 배지·전체 목록에 보이는 알림 — 보관·미뤄 둔 것 제외 */
const inMainInbox = (n: Notification, now: number) => !isArchived(n) && !isSnoozed(n, now);

function unreadOf(list: Notification[], now: number): number {
  return list.filter((n) => inMainInbox(n, now) && !n.read).length;
}

function matches(n: Notification, filter: InboxFilter, now: number): boolean {
  switch (filter) {
    case "archived":
      return isArchived(n);
    case "snoozed":
      return !isArchived(n) && isSnoozed(n, now);
    case "unread":
      return inMainInbox(n, now) && !n.read;
    case "mentions":
      return inMainInbox(n, now) && n.type === "mentioned";
    case "assigned":
      return inMainInbox(n, now) && n.type === "assigned";
    case "automation":
      return inMainInbox(n, now) && n.type === "automation";
    default:
      return inMainInbox(n, now);
  }
}

const mine = (userId: string) => load().notifications.filter((n) => n.userId === userId);

/** 수신자의 알림을 최신순으로 반환한다 (기본: 현재 사용자) — 서버 옛 경로처럼 보관·미뤄 둔 것은 뺀다 */
export async function listNotifications(userId: string = CURRENT_USER_ID): Promise<Notification[]> {
  const now = Date.now();
  return clone(mine(userId).filter((n) => inMainInbox(n, now)).sort(byInboxOrder));
}

export async function markNotificationRead(id: string): Promise<void> {
  const data = load();
  const notification = data.notifications.find((n) => n.id === id);
  if (!notification) throw new Error("알림을 찾을 수 없습니다");
  notification.read = true;
  persist();
}

export async function markAllNotificationsRead(
  userId: string = CURRENT_USER_ID,
): Promise<void> {
  const data = load();
  for (const notification of data.notifications) {
    if (notification.userId === userId) notification.read = true;
  }
  persist();
}

/** 커서 = `<sortAt>_<id>`(목업 형식 — 화면은 불투명 문자열로만 다룬다) */
const cursorOf = (n: Notification) => `${sortKey(n)}_${n.id}`;

export async function listNotificationInbox(query: InboxQuery = {}): Promise<InboxPage> {
  const filter = query.filter ?? "all";
  const limit = Math.min(100, Math.max(1, query.limit ?? INBOX_DEFAULT_LIMIT));
  const now = Date.now();
  const all = mine(CURRENT_USER_ID);
  let list = all.filter((n) => matches(n, filter, now)).sort(byInboxOrder);
  if (query.cursor) {
    const split = query.cursor.lastIndexOf("_");
    if (split <= 0) throw new ApiError(400, "잘못된 커서입니다");
    const [key, id] = [query.cursor.slice(0, split), query.cursor.slice(split + 1)];
    list = list.filter((n) => sortKey(n) < key || (sortKey(n) === key && n.id < id));
  }
  const page = list.slice(0, limit);
  return {
    items: clone(page),
    nextCursor: list.length > limit ? cursorOf(page[page.length - 1]) : null,
    unreadCount: unreadOf(all, now),
  };
}

function requireMine(id: string): Notification {
  const notification = load().notifications.find((n) => n.id === id);
  if (!notification) throw new ApiError(404, "알림을 찾을 수 없습니다");
  if (notification.userId !== CURRENT_USER_ID) throw new ApiError(403, "본인 알림만 처리할 수 있습니다");
  return notification;
}

/** 미루기 — 미래, 1년 뒤까지. 미루면 읽지 않음으로 바뀌고 해제 시각 자리(맨 위)로 돌아온다 */
export async function snoozeNotification(id: string, until: string): Promise<Notification> {
  const notification = requireMine(id);
  const at = Date.parse(until);
  const now = Date.now();
  if (Number.isNaN(at) || at <= now) throw new ApiError(400, "미루기 시각은 미래여야 합니다");
  if (at - now > YEAR_MS) throw new ApiError(400, "미루기는 1년 뒤까지만 할 수 있습니다");
  if (isArchived(notification)) throw new ApiError(400, "보관한 알림은 미룰 수 없습니다");
  notification.snoozedUntil = new Date(at).toISOString();
  notification.sortAt = notification.snoozedUntil;
  notification.read = false;
  persist();
  return clone(notification);
}

/** 미루기 취소 — 원래 자리(생성 시각)로 */
export async function unsnoozeNotification(id: string): Promise<Notification> {
  const notification = requireMine(id);
  notification.snoozedUntil = null;
  notification.sortAt = notification.at;
  persist();
  return clone(notification);
}

export async function archiveNotification(id: string): Promise<Notification> {
  const notification = requireMine(id);
  notification.archivedAt ??= new Date().toISOString();
  persist();
  return clone(notification);
}

export async function unarchiveNotification(id: string): Promise<Notification> {
  const notification = requireMine(id);
  notification.archivedAt = null;
  persist();
  return clone(notification);
}

/** 일괄 — 남의 id·없는 id는 조용히 건너뛴다(서버와 같다) */
export async function bulkNotifications(ids: string[], action: InboxBulkAction): Promise<InboxBulkResult> {
  if (ids.length === 0) throw new ApiError(400, "알림을 하나 이상 고르세요");
  if (ids.length > BULK_MAX) throw new ApiError(400, `한 번에 ${BULK_MAX}개까지 처리할 수 있습니다`);
  const data = load();
  const wanted = new Set(ids);
  let updated = 0;
  const now = new Date().toISOString();
  for (const n of data.notifications) {
    if (!wanted.has(n.id) || n.userId !== CURRENT_USER_ID) continue;
    if (action === "read") n.read = true;
    else if (action === "unread") n.read = false;
    else if (action === "archive") n.archivedAt ??= now;
    else n.archivedAt = null;
    updated += 1;
  }
  persist();
  return { updated, unreadCount: unreadOf(data.notifications.filter((n) => n.userId === CURRENT_USER_ID), Date.now()) };
}
