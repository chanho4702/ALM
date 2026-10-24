import { act } from "@testing-library/react";
import { editorRegistry } from "./editorTestRegistry";

/** 라벨로 에디터를 찾아 commands로 입력한다 — jsdom에서 contenteditable 타이핑 대체 */
function editorOf(label: string) {
  const editor = editorRegistry.get(label);
  if (!editor) throw new Error(`에디터를 찾을 수 없습니다: ${label}`);
  return editor;
}

export function typeInEditor(label: string, text: string): void {
  act(() => {
    editorOf(label).commands.insertContent(text);
  });
}

export function clearEditor(label: string): void {
  act(() => {
    editorOf(label).commands.clearContent(true);
  });
}

export function setEditorHtml(label: string, html: string): void {
  act(() => {
    editorOf(label).commands.setContent(html, true);
  });
}

export function insertMention(label: string, user: { id: string; name: string }): void {
  act(() => {
    editorOf(label)
      .chain()
      .focus()
      .insertContent([{ type: "mention", attrs: { id: user.id, label: user.name } }, { type: "text", text: " " }])
      .run();
  });
}

/**
 * 실제 타이핑처럼 한 글자씩 — 에디터 플러그인의 `handleTextInput`(TipTap 입력 규칙: `## `, `- `, `**굵게**` …)을
 * 거친다. 아무 플러그인도 받지 않으면 글자를 그대로 넣는다(브라우저 기본 입력과 같다).
 */
export function typeMarkdown(label: string, text: string): void {
  act(() => {
    const view = editorOf(label).view;
    for (const ch of text) {
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
      if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  });
}

/** 문단 나누기(Enter) — 목록 항목·코드 블록 안에서 다음 줄로 */
export function pressEnter(label: string): void {
  act(() => {
    editorOf(label).commands.enter();
  });
}

export function editorHtml(label: string): string {
  return editorOf(label).getHTML();
}
