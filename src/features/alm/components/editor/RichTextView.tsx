import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import { toEditorHtml } from "../../store/richText";

export interface RichTextViewProps {
  /** 저장값(HTML 또는 옛 평문) */
  html: string;
  className?: string;
  /** 빈 본문일 때 보여줄 안내 */
  emptyText?: string;
}

/**
 * 리치 텍스트 읽기 전용 렌더 — 저장 HTML을 innerHTML로 꽂지 않고 TipTap 스키마로 파싱해 그린다.
 * 스키마에 없는 태그·속성(script, on*)은 파싱 단계에서 떨어진다.
 */
export function RichTextView({ html, className, emptyText }: RichTextViewProps) {
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: true, autolink: false }),
      Mention.configure({
        HTMLAttributes: { class: "user-mention" },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      }),
    ],
    content: toEditorHtml(html),
    editorProps: { attributes: { class: "rich-text-content rich-text-readonly" } },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(toEditorHtml(html), false);
  }, [editor, html]);

  if (!html.trim() && emptyText) return <p className="rich-text-empty">{emptyText}</p>;
  if (!editor) return null;
  return <EditorContent editor={editor} className={["rich-text-view", className].filter(Boolean).join(" ")} />;
}
