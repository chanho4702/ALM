import { Button, EmptyState, Modal } from "@chanho/react";
import type { Notification } from "../store/types";
import { formatDateTime } from "./time";

export interface NotificationsModalProps {
  notifications: Notification[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 알림 클릭 — 셸이 읽음 처리 후 이슈 상세로 이동시킨다 */
  onNavigate: (notification: Notification) => void;
  onMarkAllRead: () => void;
}

/** 지라의 알림 패널 — 최신순, 미읽음 점 표시, 모두 읽음 */
export function NotificationsModal({
  notifications,
  open,
  onOpenChange,
  onNavigate,
  onMarkAllRead,
}: NotificationsModalProps) {
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Modal
      trigger={<span hidden />}
      title="알림"
      open={open}
      onOpenChange={onOpenChange}
      className="search-modal"
    >
      <div className="notifications-body">
        {notifications.length > 0 ? (
          <div className="notifications-toolbar">
            <span className="notifications-unread">미읽음 {unread}개</span>
            <Button size="small" variant="ghost" onClick={onMarkAllRead} disabled={unread === 0}>
              모두 읽음
            </Button>
          </div>
        ) : null}
        {notifications.length === 0 ? (
          <EmptyState
            title="알림이 없습니다"
            description="담당 이슈의 변경과 코멘트가 여기에 모입니다."
          />
        ) : (
          <ul className="notification-list" data-testid="notification-list">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className={
                    notification.read
                      ? "search-result-row notification-row"
                      : "search-result-row notification-row is-unread"
                  }
                  onClick={() => onNavigate(notification)}
                >
                  <span className="notification-dot" aria-hidden />
                  <span className="notification-message">
                    {notification.message}
                    <span className="notification-time">{formatDateTime(notification.at)}</span>
                  </span>
                  <span className="issue-key-cell">{notification.issueKey}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
