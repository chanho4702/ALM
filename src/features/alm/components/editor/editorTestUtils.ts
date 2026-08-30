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
