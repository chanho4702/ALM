// alm-backend REST 어댑터 — notifications (jiraApi.ts에서 분할, 동작 불변)
import { toBackendId } from "../mapping";
import type { Notification } from "../types";
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

export async function listNotifications(): Promise<Notification[]> {
  const rows = (await json(await sharedApiFetch("/api/alm/notifications"))) as NotificationDto[];
  return rows.map((dto) => ({
    id: String(dto.id),
    userId: "me",
    issueId: dto.issueId === null ? "" : String(dto.issueId),
    issueKey: dto.issueKey,
    actorId: String(dto.actorId),
    type: dto.type.toLowerCase() as Notification["type"],
    message: notificationMessage(dto),
    at: dto.createdAt,
    read: dto.read,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await sharedApiFetch(`/api/alm/notifications/${toBackendId(id)}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await sharedApiFetch("/api/alm/notifications/read-all", { method: "POST" });
}
