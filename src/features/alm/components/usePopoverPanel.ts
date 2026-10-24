import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

/** 패널 안에서 화살표로 오가는 항목 — 검색 입력·체크박스·라디오·버튼 */
const ITEM_SELECTOR =
  'input[type="search"], input:not([type="hidden"]):not(:disabled), [role="checkbox"]:not([data-disabled]):not(:disabled), [role="radio"], button:not(:disabled)';

const EDGE = 8;
/** 패널 최소 폭 — 트리거가 좁아도("타입") 항목이 한 줄에 들어가게 */
const MIN_PANEL_WIDTH = 200;

/**
 * 앱 쪽 팝오버 패널(필터·열 선택)의 공통 동작 — 지라 드롭다운 기준.
 *
 * - 바깥 클릭으로 닫기, Esc로 닫고 **트리거로 포커스 복귀**
 * - 열면 패널 안 첫 항목(검색 입력이 있으면 그것)으로 포커스 이동, ↑↓·Home·End로 항목 이동
 * - 트리거 폭을 최소 폭으로, 화면 오른쪽·아래 가장자리에서는 반대쪽으로 뒤집는다
 *
 * DS에는 열린 채 여러 개를 고르는 팝오버가 없어서(Dropdown은 고르면 닫힌다) 앱이 갖는다.
 */
export function usePopoverPanel() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ alignEnd: boolean; above: boolean; minWidth: number }>({
    alignEnd: false,
    above: false,
    minWidth: 0,
  });

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close(rootRef.current?.contains(document.activeElement) ?? false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // 열린 직후 한 번 — 자리 잡기(뒤집기)와 첫 항목 포커스
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const width = Math.max(p.width, t.width);
    setPlacement({
      alignEnd: t.left + width > window.innerWidth - EDGE && t.right - width >= EDGE,
      above: t.bottom + 4 + p.height > window.innerHeight - EDGE && t.top - 4 - p.height >= EDGE,
      minWidth: Math.round(Math.max(MIN_PANEL_WIDTH, t.width)),
    });
    const first =
      panel.querySelector<HTMLElement>('input[type="search"]') ??
      panel.querySelector<HTMLElement>('[aria-checked="true"]') ??
      panel.querySelector<HTMLElement>(ITEM_SELECTOR);
    first?.focus();
  }, [open]);

  const onPanelKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter((el) => el.offsetParent !== null || el === document.activeElement);
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
  }, []);

  const panelClassName = [
    "filter-dropdown-panel",
    placement.alignEnd ? "is-align-end" : "",
    placement.above ? "is-above" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // 최소 폭은 트리거 폭 — 계산값이라 인라인(순수 기능값)
  const panelStyle: CSSProperties | undefined = placement.minWidth ? { minWidth: placement.minWidth } : undefined;

  return { open, setOpen, close, rootRef, triggerRef, panelRef, panelClassName, panelStyle, onPanelKeyDown };
}
