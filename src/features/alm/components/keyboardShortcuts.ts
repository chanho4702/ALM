/**
 * 키보드 단축키 규칙(지라 클라우드 동작 기준) — 순수 함수만 둔다. 등록은 `useKeyboardShortcuts`.
 *
 * - 입력란·에디터·선택 상자(input/textarea/select/contenteditable, 열린 목록·메뉴, Select 트리거)에
 *   포커스가 있으면 무시한다 — 글자를 치는 중이다.
 * - IME 조합 중(`isComposing`, keyCode 229)은 무시한다 — 한글 입력의 첫 자모가 단축키로 새지 않게.
 * - Ctrl/Meta/Alt 조합은 건드리지 않는다(브라우저·OS·표 열 이동 Alt+화살표의 몫). Shift는 `?` 때문에 허용.
 * - 시퀀스(`g` 다음 키)는 SEQUENCE_TIMEOUT_MS 안에 이어져야 한다.
 */

export const SEQUENCE_TIMEOUT_MS = 1000;

/** 글자 입력을 받는 자리 — 여기서 친 키는 단축키가 아니다 */
const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  // 열린 드롭다운·메뉴(타입어헤드)와 Radix Select 트리거(닫힌 상태에서도 글자로 옵션을 고른다)
  "[role='listbox']",
  "[role='menu']",
  "[role='combobox']",
].join(",");

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(EDITABLE_SELECTOR) !== null;
}

/** Space·Enter로 스스로 동작하는 컨트롤 — 버튼·링크·체크박스·탭·메뉴 항목 */
const ACTIVATABLE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  "[role='button']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='radio']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
].join(",");

/**
 * Space·Enter가 포커스된 컨트롤의 기본 동작(누르기)인가 — 그러면 단축키(미리보기·상세 열기)가 가로채지 않는다.
 * 이슈 요소 자체(`data-issue-key`가 붙은 보드 카드 래퍼·백로그 행, 그 안의 카드 버튼)만 예외다.
 */
export function activatesFocusedControl(event: Pick<KeyboardEvent, "key" | "target">): boolean {
  if (event.key !== " " && event.key !== "Enter") return false;
  if (!(event.target instanceof Element)) return false;
  const control = event.target.closest(ACTIVATABLE_SELECTOR);
  if (!control) return false;
  return !(control.hasAttribute("data-issue-key") || control.matches("[data-issue-key] .issue-card"));
}

/** 단축키 처리 대상이 아닌 키 입력인가(모달 여부는 따로 본다 — `openDialogs`) */
export function shouldIgnoreKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  if (event.isComposing || event.keyCode === 229) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (event.repeat) return true;
  if (activatesFocusedControl(event)) return true;
  return isEditableTarget(event.target);
}

/** 지금 열려 있는 모달 — 열린 순서대로(마지막이 맨 위) */
export function openDialogs(): Element[] {
  return [...document.querySelectorAll("[role='dialog'], [role='alertdialog']")];
}

/**
 * 바인딩 문법의 키 이름 — `event.key` 그대로이되 공백은 시퀀스 구분자와 겹치므로 `"Space"`로 적는다.
 * 그래서 미리보기 토글은 `"Space"`, 선택 해제는 `"Escape"`, 이웃 이동은 `"ArrowDown"`처럼 바인딩한다.
 */
export function shortcutKeyName(event: Pick<KeyboardEvent, "key">): string {
  return event.key === " " ? "Space" : event.key;
}

/**
 * 명령 팔레트 열기(⌘K / Ctrl+K) — 수식 키 조합이라 위 `shouldIgnoreKey`(수식 키는 무시)와 따로 본다.
 * 글자 단축키가 아니므로 개인 설정 "키보드 단축키 사용"을 꺼도 동작한다(WCAG 2.1.4는 글자 하나짜리 키만 대상).
 * 입력란 안에서도 열린다(리니어와 같다) — 다만 리치 에디터(contenteditable)는 링크 등 자기 몫으로 남긴다.
 */
export function isCommandPaletteKey(event: KeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return false;
  const target = event.target;
  return !(target instanceof Element && target.closest("[contenteditable]:not([contenteditable='false'])"));
}

export type SequenceResult<T> =
  | { kind: "match"; action: T }
  | { kind: "pending" }
  | { kind: "none" };

/**
 * 단축키 → 동작 매처. 바인딩 키는 `"c"`, `"?"`, `"g d"`(공백 = 시퀀스)처럼 적는다.
 * `feed`는 키 하나를 받아 완성(match)·대기(pending)·무관(none)을 돌려준다.
 */
export function createSequenceMatcher<T>(bindings: Record<string, T>, timeoutMs = SEQUENCE_TIMEOUT_MS) {
  const sequences = Object.keys(bindings).map((combo) => combo.split(" "));
  let buffer: string[] = [];
  let lastAt = 0;

  const lookup = (keys: string[]): SequenceResult<T> => {
    const combo = keys.join(" ");
    if (combo in bindings) return { kind: "match", action: bindings[combo] };
    const prefix = sequences.some(
      (seq) => seq.length > keys.length && keys.every((key, index) => seq[index] === key),
    );
    return prefix ? { kind: "pending" } : { kind: "none" };
  };

  return {
    feed(key: string, now: number): SequenceResult<T> {
      if (buffer.length > 0 && now - lastAt > timeoutMs) buffer = [];
      lastAt = now;
      let keys = [...buffer, key];
      let result = lookup(keys);
      // 이어지지 않는 키면 시퀀스를 버리고 그 키 하나로 다시 본다(`g` 다음 `c` = 만들기)
      if (result.kind === "none" && buffer.length > 0) {
        keys = [key];
        result = lookup(keys);
      }
      buffer = result.kind === "pending" ? keys : [];
      return result;
    },
    reset() {
      buffer = [];
    },
  };
}
