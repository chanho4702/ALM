import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RichTextEditor } from "./RichTextEditor";
import { clearEditor, editorHtml, typeMarkdown } from "./editorTestUtils";

/**
 * 마크다운 단축 입력(Linear 에디터와 같은 손버릇) — 설명·코멘트 공용 RichTextEditor.
 * 줄 머리 규칙(`#`~`###`, `-`·`*`, `1.`, `[]`, `>`, ```)과 줄 안 규칙(`**굵게**`, `` `코드` ``).
 */
async function setup() {
  render(<RichTextEditor label="설명" value="" onChange={vi.fn()} />);
  await screen.findByRole("textbox", { name: "설명" });
}

const cases: [string, string, RegExp][] = [
  ["# 제목", "# 제목", /^<h2>제목<\/h2>$/],
  ["## 소제목", "## 소제목", /^<h2>소제목<\/h2>$/],
  ["### 작은 제목", "### 작은 제목", /^<h3>작은 제목<\/h3>$/],
  ["- 글머리", "- 항목", /^<ul><li><p>항목<\/p><\/li><\/ul>$/],
  ["* 글머리", "* 항목", /^<ul><li><p>항목<\/p><\/li><\/ul>$/],
  ["1. 번호", "1. 첫째", /^<ol><li><p>첫째<\/p><\/li><\/ol>$/],
  ["[] 체크", "[] 할 일", /^<ul data-type="taskList"><li data-checked="false"[^>]*>.*할 일.*<\/li><\/ul>$/],
  ["> 인용", "> 인용문", /^<blockquote><p>인용문<\/p><\/blockquote>$/],
  ["``` 코드 블록", "``` ", /^<pre><code>/],
  ["**굵게**", "앞 **굵게** ", /<strong>굵게<\/strong>/],
  ["`코드`", "앞 `x+1` ", /<code>x\+1<\/code>/],
];

describe("마크다운 단축 입력", () => {
  it.each(cases)("%s", async (_name, typed, expected) => {
    await setup();
    clearEditor("설명");
    typeMarkdown("설명", typed);
    expect(editorHtml("설명")).toMatch(expected);
  });
});

describe("체크 목록 저장·렌더", () => {
  it("[x] 는 체크된 항목, 읽기 전용 렌더도 체크 상자로 그린다(같은 스키마)", async () => {
    const { RichTextView } = await import("./RichTextView");
    await setup();
    clearEditor("설명");
    typeMarkdown("설명", "[x] 끝난 일");
    const html = editorHtml("설명");
    expect(html).toContain('data-checked="true"');
    const { container } = render(<RichTextView html={html} />);
    await waitFor(() => expect(container.querySelector(".rich-text-readonly input[type='checkbox']")).toBeChecked());
  });
});
