import { useEffect, useRef } from "react";
import { isEditableTarget, openDialogs } from "./keyboardShortcuts";
import { selectionRange } from "./useIssueInteractions";

export interface UseRangeSelectionOptions {
  /** 보이는 순서의 id */
  order: string[];
  cursorId: string | null;
  setCursorId: (id: string | null) => void;
  setSelected: (update: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  disabled?: boolean;
  /** 커서가 움직인 뒤(스크롤 등) */
  onCursorMoved?: (id: string) => void;
}

/** Shift+↑/↓·Ctrl+A 판정 — 순수 함수(테스트 대상) */
export function rangeKeyOf(event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">): "up" | "down" | "all" | null {
  if (event.altKey) return null;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "a") return "all";
  if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
    if (event.key === "ArrowDown") return "down";
    if (event.key === "ArrowUp") return "up";
  }
  return null;
}

/**
 * 목록 범위 선택(Linear) — Shift+↑/↓는 기준점(처음 Shift를 누른 행)부터 커서까지를 고르고, ⌘/Ctrl+A는 보이는 행 전부.
 * 입력란·에디터에 포커스가 있거나 창(모달·팝오버)이 열려 있으면 브라우저 기본(글자 선택)에 맡긴다.
 * 수식 키 조합이라 개인 설정 "키보드 단축키 사용"과 무관하다(WCAG 2.1.4는 글자 하나짜리 키만 대상).
 */
export function useRangeSelection({ order, cursorId, setCursorId, setSelected, disabled = false, onCursorMoved }: UseRangeSelectionOptions) {
  const anchor = useRef<string | null>(null);
  const latest = useRef({ order, cursorId, setCursorId, setSelected, disabled, onCursorMoved });
  latest.current = { order, cursorId, setCursorId, setSelected, disabled, onCursorMoved };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const kind = rangeKeyOf(event);
      if (!kind || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (isEditableTarget(event.target) || openDialogs().length > 0) return;
      const { order: ids, cursorId: cursor, setCursorId: moveTo, setSelected: select, disabled: off, onCursorMoved: moved } = latest.current;
      if (off || ids.length === 0) return;
      event.preventDefault();
      if (kind === "all") {
        select(new Set(ids));
        return;
      }
      const index = cursor ? ids.indexOf(cursor) : -1;
      if (anchor.current === null || !ids.includes(anchor.current)) anchor.current = index === -1 ? ids[0] : cursor;
      const next = index === -1 ? ids[0] : ids[Math.min(ids.length - 1, Math.max(0, index + (kind === "down" ? 1 : -1)))];
      moveTo(next);
      moved?.(next);
      select(new Set(selectionRange(ids, anchor.current, next)));
    };
    // Shift를 떼었다 다시 누르면 새 기준점 — Linear처럼 이어 고르기는 ⌘/Ctrl+클릭으로
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") anchor.current = null;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
