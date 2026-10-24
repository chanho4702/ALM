import { useEffect, useRef, type RefObject } from "react";
import { keyboardShortcutsEnabled } from "../store/uiStore";
import { createSequenceMatcher, openDialogs, shouldIgnoreKey } from "./keyboardShortcuts";

export type ShortcutBindings = Record<string, () => void>;

export interface UseKeyboardShortcutsOptions {
  /**
   * 모달 안 단축키(이슈 상세)면 그 모달 안의 요소 ref — 이 모달이 **유일하게 열린 모달**일 때만 동작한다
   * (삭제 확인 같은 중첩 모달이 뜨면 멈춘다). 생략하면 화면 단축키: 모달이 하나라도 열려 있으면 무시한다.
   */
  dialogRef?: RefObject<Element | null>;
}

/**
 * 창 전체 keydown에 단축키를 건다. 바인딩 키 문법·무시 조건은 `keyboardShortcuts.ts`.
 * 개인 설정 "키보드 단축키 사용"을 끄면 전부 멈춘다(키를 누를 때마다 읽는다 — 다른 탭에서 바꿔도 따라간다).
 * Esc는 여기서 다루지 않는다 — 모달·메뉴가 스스로 닫는다(DS/Radix).
 */
export function useKeyboardShortcuts(bindings: ShortcutBindings, options: UseKeyboardShortcutsOptions = {}) {
  // 바인딩은 렌더마다 새 함수다 — 리스너는 한 번만 걸고 최신 값은 ref로 읽는다
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });
  const { dialogRef } = options;
  const comboKey = Object.keys(bindings).sort().join("|");

  useEffect(() => {
    const combos = comboKey.split("|").filter(Boolean);
    const matcher = createSequenceMatcher(Object.fromEntries(combos.map((combo) => [combo, combo])));
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKey(event) || !keyboardShortcutsEnabled()) {
        matcher.reset();
        return;
      }
      const dialogs = openDialogs();
      if (dialogRef) {
        const own = dialogRef.current?.closest("[role='dialog'], [role='alertdialog']");
        if (!own || dialogs.length !== 1 || dialogs[0] !== own) return;
      } else if (dialogs.length > 0) {
        matcher.reset();
        return;
      }
      const result = matcher.feed(event.key, Date.now());
      if (result.kind === "pending") {
        event.preventDefault();
      } else if (result.kind === "match") {
        event.preventDefault(); // `/`가 브라우저 빠른 찾기로 새지 않게
        latest.current[result.action]?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [comboKey, dialogRef]);
}
