import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextView } from "./RichTextView";
import { insertMention, typeInEditor } from "./editorTestUtils";
import { extractMentionIds, htmlToText, isEmptyHtml, newMentionIds, textToHtml } from "../../store/richText";

const users = [
  { id: "u1", name: "김찬호", email: "a@x", avatarColor: "blue" },
  { id: "u2", name: "이서연", email: "b@x", avatarColor: "green" },
] as never[];

describe("RichTextEditor", () => {
  it("입력하면 HTML로 onChange되고, 멘션은 data-type=mention 태그로 남아 id를 뽑을 수 있다", async () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="코멘트" value="" onChange={onChange} users={users} />);
    expect(await screen.findByRole("textbox", { name: "코멘트" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "서식" })).toBeInTheDocument();

    typeInEditor("코멘트", "확인 부탁드립니다 ");
    insertMention("코멘트", { id: "u2", name: "이서연" });
    await waitFor(() => {
      const html = onChange.mock.calls.at(-1)?.[0] as string;
      expect(html).toContain('data-type="mention"');
      expect(extractMentionIds(html)).toEqual(["u2"]);
      expect(htmlToText(html)).toBe("확인 부탁드립니다 @이서연");
    });
  });

  it("바깥 value가 비워지면 에디터도 비워진다 (저장 후 리셋)", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichTextEditor label="코멘트" value="<p>초안</p>" onChange={onChange} />);
    expect(await screen.findByRole("textbox", { name: "코멘트" })).toHaveTextContent("초안");
    rerender(<RichTextEditor label="코멘트" value="" onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "코멘트" })).toHaveTextContent("");
    });
  });
});

describe("RichTextView", () => {
  it("저장 HTML을 스키마로 파싱해 그린다 — script 같은 위험 태그는 떨어진다", async () => {
    render(<RichTextView html='<p>본문 <strong>강조</strong></p><script>window.x=1</script>' />);
    expect(await screen.findByText("강조")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("옛 평문 설명은 문단으로 감싸 보여준다", async () => {
    render(<RichTextView html={"첫 줄\n둘째 줄"} />);
    expect(await screen.findByText(/첫 줄/)).toBeInTheDocument();
  });
});

describe("richText 헬퍼", () => {
  it("textToHtml/htmlToText 왕복, 빈 껍데기 판정, 새 멘션 diff", () => {
    expect(textToHtml("a\n\nb")).toBe("<p>a</p><p>b</p>");
    expect(htmlToText("<p>a</p><p>b &amp; c</p>")).toBe("a\nb & c");
    expect(isEmptyHtml("<p></p>")).toBe(true);
    expect(isEmptyHtml("<p>x</p>")).toBe(false);
    const before = '<p><span data-type="mention" data-id="u1">@김찬호</span></p>';
    const after = '<p><span data-type="mention" data-id="u1">@김찬호</span> <span class="user-mention" data-type="mention" data-id="u2">@이서연</span></p>';
    expect(newMentionIds(before, after)).toEqual(["u2"]);
  });
});
