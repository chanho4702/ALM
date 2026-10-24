import { Extension, textblockTypeInputRule } from "@tiptap/core";
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import "./taskList.css";

/**
 * 설명·코멘트 저장 포맷(HTML)의 **스키마 확장 단일 원천** — 편집기(RichTextEditor)와 읽기 전용 렌더(RichTextView)가
 * 같은 목록을 쓴다. 갈라지면 편집기에서 만든 노드(체크 목록 등)가 렌더에서 떨어진다.
 *
 * 마크다운 단축 입력(StarterKit 입력 규칙 + 여기): `#`·`##`(제목 2) · `###`(제목 3) · `-`/`*` 글머리 · `1.` 번호 ·
 * `[]`/`[ ]`/`[x]` 체크 목록 · `>` 인용 · ``` 코드 블록 · `**굵게**` · `` `코드` ``.
 */

/** `# ` — 저장 포맷의 제목은 2·3단계뿐이라 한 단계 `#`도 제목 2로 받는다(Linear처럼 `#`로 제목을 연다) */
const SingleHashHeading = Extension.create({
  name: "singleHashHeading",
  addInputRules() {
    const heading = this.editor.schema.nodes.heading;
    if (!heading) return [];
    return [textblockTypeInputRule({ find: /^#\s$/, type: heading, getAttributes: () => ({ level: 2 }) })];
  },
});

export function richTextSchemaExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    TaskList,
    // 체크 목록 안에 다른 목록을 둘 수 있게(편집기·렌더 동일)
    TaskItem.configure({ nested: true }),
    SingleHashHeading,
  ];
}
