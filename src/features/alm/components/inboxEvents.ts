/** 인박스에서 읽음·보관·미루기가 바뀌면 — 상단 벨 배지가 다시 센다(AppShell 구독) */
export const INBOX_CHANGED_EVENT = "alm:inbox-changed";

export function notifyInboxChanged(): void {
  window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
}
