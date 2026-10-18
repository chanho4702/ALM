// localStorage 목업 스토어 — notifications (jiraMock.ts에서 분할, 동작 불변)
import { CURRENT_USER_ID } from "../../../../mock/users";
import type { Notification } from "../types";
import { clone, load, persist } from "./db";

// ── notifications ────────────────────────────────────────────

/** 수신자의 알림을 최신순으로 반환한다 (기본: 현재 사용자) */
export async function listNotifications(userId: string = CURRENT_USER_ID): Promise<Notification[]> {
  return clone(
    load()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => b.at.localeCompare(a.at)),
  );
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
