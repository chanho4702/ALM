import type { KeyboardEvent } from "react";

/** 팝오버 목록 안에서 화살표로 오가는 항목 — 검색 입력·체크박스·라디오·버튼 */
const ITEM_SELECTOR =
  'input[type="search"], input:not([type="hidden"]):not(:disabled), [role="checkbox"]:not([data-disabled]):not(:disabled), [role="radio"], button:not(:disabled)';

/**
 * 필터·열 선택 팝오버 목록의 ↑↓·Home·End — 열기·닫기·바깥 클릭·Esc·포커스 이동/복귀·가장자리 뒤집기는
 * DS `Popover`(react 0.14.0)가 맡고, 목록 안 항목 이동만 앱이 붙인다(지라 드롭다운처럼 끝에서 순환).
 */
export function onPopoverListKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
  if (items.length === 0) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
  items[next]?.focus();
}
