import { afterEach, describe, expect, it } from "vitest";
import { createSequenceMatcher, isEditableTarget, shouldIgnoreKey, SEQUENCE_TIMEOUT_MS } from "./keyboardShortcuts";

function keydown(target: Element, init: KeyboardEventInit & { keyCode?: number } = {}): KeyboardEvent {
  let captured: KeyboardEvent | null = null;
  const listener = (event: Event) => {
    captured = event as KeyboardEvent;
  };
  window.addEventListener("keydown", listener);
  const event = new KeyboardEvent("keydown", { key: "c", bubbles: true, ...init });
  if (init.keyCode !== undefined) Object.defineProperty(event, "keyCode", { value: init.keyCode });
  target.dispatchEvent(event);
  window.removeEventListener("keydown", listener);
  return captured!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("단축키 무시 조건", () => {
  it("입력란·에디터·선택 상자에 포커스가 있으면 무시한다", () => {
    document.body.innerHTML = `
      <input id="input" />
      <textarea id="textarea"></textarea>
      <select id="select"><option>a</option></select>
      <div contenteditable="true"><p id="editor">글</p></div>
      <button role="combobox" id="combo">담당자</button>
      <div role="listbox"><div role="option" id="option">a</div></div>
      <div contenteditable="false"><span id="readonly">읽기</span></div>
      <button id="button">버튼</button>`;
    for (const id of ["input", "textarea", "select", "editor", "combo", "option"]) {
      expect(isEditableTarget(document.getElementById(id)), id).toBe(true);
      expect(shouldIgnoreKey(keydown(document.getElementById(id)!)), id).toBe(true);
    }
    expect(shouldIgnoreKey(keydown(document.getElementById("readonly")!))).toBe(false);
    expect(shouldIgnoreKey(keydown(document.getElementById("button")!))).toBe(false);
    expect(shouldIgnoreKey(keydown(document.body))).toBe(false);
  });

  it("IME 조합 중(isComposing·keyCode 229)이면 무시한다", () => {
    expect(shouldIgnoreKey(keydown(document.body, { isComposing: true }))).toBe(true);
    expect(shouldIgnoreKey(keydown(document.body, { keyCode: 229 }))).toBe(true);
  });

  it("Ctrl/Meta/Alt 조합은 건드리지 않고, Shift(?)는 허용한다", () => {
    expect(shouldIgnoreKey(keydown(document.body, { ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreKey(keydown(document.body, { metaKey: true }))).toBe(true);
    expect(shouldIgnoreKey(keydown(document.body, { altKey: true }))).toBe(true);
    expect(shouldIgnoreKey(keydown(document.body, { key: "?", shiftKey: true }))).toBe(false);
  });

  it("키를 누르고 있는 반복 입력은 무시한다", () => {
    expect(shouldIgnoreKey(keydown(document.body, { repeat: true }))).toBe(true);
  });
});

describe("시퀀스 매처", () => {
  const bindings = { c: "create", "g d": "dashboards", "g b": "board" };

  it("단일 키는 바로 완성된다", () => {
    const matcher = createSequenceMatcher(bindings);
    expect(matcher.feed("c", 0)).toEqual({ kind: "match", action: "create" });
  });

  it("g 다음 d는 대기 → 완성이다", () => {
    const matcher = createSequenceMatcher(bindings);
    expect(matcher.feed("g", 0)).toEqual({ kind: "pending" });
    expect(matcher.feed("d", 500)).toEqual({ kind: "match", action: "dashboards" });
    // 완성 뒤에는 버퍼가 비어 d 하나는 아무것도 아니다
    expect(matcher.feed("d", 600)).toEqual({ kind: "none" });
  });

  it(`시퀀스 사이가 ${SEQUENCE_TIMEOUT_MS}ms를 넘으면 버린다`, () => {
    const matcher = createSequenceMatcher(bindings);
    matcher.feed("g", 0);
    expect(matcher.feed("d", SEQUENCE_TIMEOUT_MS + 1)).toEqual({ kind: "none" });
  });

  it("이어지지 않는 키는 시퀀스를 버리고 그 키 하나로 본다", () => {
    const matcher = createSequenceMatcher(bindings);
    matcher.feed("g", 0);
    expect(matcher.feed("c", 100)).toEqual({ kind: "match", action: "create" });
    matcher.feed("g", 200);
    expect(matcher.feed("x", 300)).toEqual({ kind: "none" });
    expect(matcher.feed("d", 400)).toEqual({ kind: "none" });
  });

  it("reset은 대기 중인 시퀀스를 버린다", () => {
    const matcher = createSequenceMatcher(bindings);
    matcher.feed("g", 0);
    matcher.reset();
    expect(matcher.feed("d", 10)).toEqual({ kind: "none" });
  });
});
