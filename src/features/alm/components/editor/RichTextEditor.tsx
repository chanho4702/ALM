import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import { Bold, Code, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from "lucide-react";
import type { User } from "../../store/types";
import { isEmptyHtml, toEditorHtml } from "../../store/richText";
import { editorRegistry } from "./editorTestRegistry";

const MAX_SUGGESTIONS = 8;

export interface RichTextEditorProps {
  /** 접근 가능한 이름 — 에디터 본문(role=textbox)의 aria-label이자 테스트 레지스트리 키 */
  label: string;
  /** 저장 포맷(HTML). 평문(옛 데이터)도 받아 문단화한다 */
  value: string;
  /** 비어 있으면 "" — `<p></p>` 껍데기는 걸러 준다 */
  onChange: (html: string) => void;
  /** `@` 멘션 후보 */
  users?: User[];
  placeholder?: string;
  /** 최소 높이(px) — 코멘트는 낮게, 설명은 높게 */
  minHeight?: number;
  autoFocus?: boolean;
}

interface SuggestionState {
  items: User[];
  highlight: number;
  left: number;
  top: number;
  command: (user: User) => void;
}

/** 이름 부분일치 — 후보는 8명까지 */
export function filterMentionCandidates(users: User[], query: string): User[] {
  const q = query.trim().toLowerCase();
  return users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
}

/**
 * 설명·코멘트용 리치 텍스트 에디터 — TipTap(StarterKit + 링크 + 플레이스홀더 + `@`멘션).
 * 저장값은 HTML 문자열이며, 멘션은 `<span data-type="mention" data-id="…">@이름</span>`으로 남는다
 * (알림 대상은 richText.extractMentionIds가 이 태그에서 뽑는다).
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  users = [],
  placeholder,
  minHeight = 96,
  autoFocus = false,
}: RichTextEditorProps) {
  const usersRef = useRef(users);
  usersRef.current = users;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const suggestionRef = useRef<SuggestionState | null>(null);
  const setSuggestionState = (next: SuggestionState | null) => {
    suggestionRef.current = next;
    setSuggestion(next);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Mention.configure({
        HTMLAttributes: { class: "user-mention" },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
        suggestion: {
          char: "@",
          allowSpaces: false,
          items: ({ query }) => filterMentionCandidates(usersRef.current, query),
          command: ({ editor: ed, range, props }) => {
            const user = props as unknown as User;
            ed.chain()
              .focus()
              .insertContentAt(range, [
                { type: "mention", attrs: { id: user.id, label: user.name } },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => {
            const apply = (props: SuggestionProps, highlight: number) => {
              const items = props.items as unknown as User[];
              if (items.length === 0) {
                setSuggestionState(null);
                return;
              }
              // 모달처럼 transform이 걸린 조상 안에서는 fixed가 뷰포트 기준이 아니므로 래퍼 기준 절대 좌표로 둔다
              const rect = props.clientRect?.() ?? null;
              const base = wrapperRef.current?.getBoundingClientRect();
              setSuggestionState({
                items,
                highlight: Math.min(highlight, items.length - 1),
                left: rect && base ? rect.left - base.left : 0,
                top: rect && base ? rect.bottom - base.top + 4 : 0,
                command: (user) => props.command(user as unknown as Record<string, unknown>),
              });
            };
            return {
              onStart: (props) => apply(props, 0),
              onUpdate: (props) => apply(props, suggestionRef.current?.highlight ?? 0),
              onKeyDown: ({ event }) => {
                const current = suggestionRef.current;
                if (!current) return false;
                if (event.key === "Escape") {
                  setSuggestionState(null);
                  return true;
                }
                if (event.key === "ArrowDown") {
                  setSuggestionState({ ...current, highlight: (current.highlight + 1) % current.items.length });
                  return true;
                }
                if (event.key === "ArrowUp") {
                  setSuggestionState({
                    ...current,
                    highlight: (current.highlight - 1 + current.items.length) % current.items.length,
                  });
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  current.command(current.items[current.highlight]);
                  return true;
                }
                return false;
              },
              onExit: () => setSuggestionState(null),
            };
          },
        },
      }),
    ],
    content: toEditorHtml(value),
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: "rich-text-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChangeRef.current(isEmptyHtml(html) ? "" : html);
    },
  });

  // 제어형 동기화 — 바깥 value가 바뀌었는데(저장 후 리셋 등) 에디터 내용과 다르면 맞춘다
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalizedCurrent = isEmptyHtml(current) ? "" : current;
    if (normalizedCurrent !== (value ?? "")) {
      editor.commands.setContent(toEditorHtml(value), false);
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editorRegistry.set(label, editor);
    return () => {
      if (editorRegistry.get(label) === editor) editorRegistry.delete(label);
    };
  }, [editor, label]);

  if (!editor) return null;

  return (
    <div className="rich-text-editor" ref={wrapperRef}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} style={{ minHeight }} className="rich-text-editor-body" />
      {suggestion ? (
        <ul
          className="editor-suggestions rich-text-suggestions"
          role="listbox"
          aria-label="멘션 후보"
          style={{ left: suggestion.left, top: suggestion.top }}
        >
          {suggestion.items.map((user, index) => (
            <li key={user.id} role="option" aria-selected={index === suggestion.highlight} aria-label={user.name}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => {
                  event.preventDefault();
                  suggestion.command(user);
                }}
              >
                @{user.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const TOOLS: { label: string; icon: typeof Bold; isActive: (e: Editor) => boolean; run: (e: Editor) => void }[] = [
  { label: "굵게", icon: Bold, isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { label: "기울임", icon: Italic, isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: "취소선", icon: Strikethrough, isActive: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { label: "제목 서식", icon: Heading2, isActive: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "글머리 목록", icon: List, isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "번호 목록", icon: ListOrdered, isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: "인용", icon: Quote, isActive: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "코드 블록", icon: Code, isActive: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() },
];

function Toolbar({ editor }: { editor: Editor }) {
  // 선택이 바뀔 때 활성 상태를 다시 그리려고 트랜잭션마다 리렌더한다
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);
  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label="서식">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const active = tool.isActive(editor);
        return (
          <button
            key={tool.label}
            type="button"
            className={active ? "rich-text-tool is-active" : "rich-text-tool"}
            aria-label={tool.label}
            aria-pressed={active}
            title={tool.label}
            onMouseDown={(event) => {
              event.preventDefault();
              tool.run(editor);
            }}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
