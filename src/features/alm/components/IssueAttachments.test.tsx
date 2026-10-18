import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@chanho/react";
import * as store from "../store/jiraStore";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TOO_LARGE_MESSAGE } from "../store/attachmentLimits";
import { IssueAttachments } from "./IssueAttachments";

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});
afterEach(() => vi.restoreAllMocks());

function sized(name: string, size: number): File {
  const file = new File(["x"], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("첨부 크기 상한(20MB)", () => {
  it("상한을 넘는 파일은 올리기 전에 이름과 함께 막고, 나머지 파일만 올린다", async () => {
    const issue = (await store.getIssueByKey("ALM-5"))!;
    const upload = vi.spyOn(store, "uploadAttachment");
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <IssueAttachments issueId={issue.id} userNames={{}} canEdit />
      </ToastProvider>,
    );
    const section = screen.getByRole("region", { name: "첨부" });
    expect(await within(section).findByText("첨부된 파일이 없습니다")).toBeInTheDocument();

    await user.upload(within(section).getByLabelText("파일 올리기"), [
      sized("영상.mp4", ATTACHMENT_MAX_BYTES + 1),
      new File(["hello"], "메모.txt", { type: "text/plain" }),
    ]);

    // 토스트는 화면 문구와 스크린리더 알림(같은 글)으로 두 번 그려진다
    expect((await screen.findAllByText(ATTACHMENT_TOO_LARGE_MESSAGE)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/영상\.mp4 \(20 MB\)/).length).toBeGreaterThan(0);
    await within(section).findByText("메모.txt");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1].name).toBe("메모.txt");
  });

  it("정확히 20MB는 올릴 수 있다(경계 포함)", async () => {
    const issue = (await store.getIssueByKey("ALM-5"))!;
    await expect(store.uploadAttachment(issue.id, sized("경계.bin", ATTACHMENT_MAX_BYTES))).resolves.toMatchObject({
      filename: "경계.bin",
    });
    await expect(store.uploadAttachment(issue.id, sized("초과.bin", ATTACHMENT_MAX_BYTES + 1))).rejects.toThrow(
      ATTACHMENT_TOO_LARGE_MESSAGE,
    );
    await waitFor(async () => expect(await store.listAttachments(issue.id)).toHaveLength(1));
  });
});

describe("첨부 미리보기 (F-09)", () => {
  const urlApi = URL as unknown as { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void };
  let opened: unknown[] = [];

  beforeEach(() => {
    let seq = 0;
    urlApi.createObjectURL = () => `blob:preview-${++seq}`;
    urlApi.revokeObjectURL = () => undefined;
    opened = [];
    vi.spyOn(window, "open").mockImplementation((...args: unknown[]) => {
      opened.push(args);
      return null;
    });
  });
  afterEach(() => {
    delete urlApi.createObjectURL;
    delete urlApi.revokeObjectURL;
  });

  async function renderWith(files: File[]) {
    const issue = (await store.getIssueByKey("ALM-5"))!;
    for (const file of files) await store.uploadAttachment(issue.id, file);
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <IssueAttachments issueId={issue.id} userNames={{}} canEdit />
      </ToastProvider>,
    );
    return { user, section: screen.getByRole("region", { name: "첨부" }) };
  }

  it("이미지는 썸네일(inline API)이 보이고 누르면 큰 미리보기가 열린다 — Esc로 닫힌다", async () => {
    const inline = vi.spyOn(store, "inlineAttachment");
    const { user, section } = await renderWith([new File(["png"], "화면.png", { type: "image/png" })]);
    const thumb = await within(section).findByRole("button", { name: "화면.png 미리보기" });
    expect(inline).toHaveBeenCalledTimes(1);
    await user.click(thumb);
    const dialog = await screen.findByRole("dialog", { name: "화면.png" });
    expect(within(dialog).getByRole("img", { name: "화면.png" })).toHaveAttribute("src", expect.stringMatching(/^blob:preview-/));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "화면.png" })).not.toBeInTheDocument());
  });

  it("PDF는 새 탭에서 브라우저 미리보기로 연다", async () => {
    const { user, section } = await renderWith([new File(["%PDF"], "명세.pdf", { type: "application/pdf" })]);
    await user.click(await within(section).findByRole("button", { name: "명세.pdf 새 탭에서 보기" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect((opened[0] as unknown[])[1]).toBe("_blank");
    expect(within(section).queryByRole("button", { name: "명세.pdf 미리보기" })).not.toBeInTheDocument();
  });

  it("그 밖의 형식은 미리보기 없이 내려받기만", async () => {
    const inline = vi.spyOn(store, "inlineAttachment");
    const { section } = await renderWith([new File(["zip"], "묶음.zip", { type: "application/zip" })]);
    expect(await within(section).findByRole("button", { name: "묶음.zip 내려받기" })).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /묶음\.zip (미리보기|새 탭에서 보기|크게 보기)/ })).not.toBeInTheDocument();
    expect(inline).not.toHaveBeenCalled();
  });

  it("inline API는 이미지 4종만 — 목업도 그 밖은 거부한다", async () => {
    const issue = (await store.getIssueByKey("ALM-5"))!;
    const pdf = await store.uploadAttachment(issue.id, new File(["%PDF"], "명세.pdf", { type: "application/pdf" }));
    await expect(store.inlineAttachment(pdf.id)).rejects.toThrow("미리보기를 지원하지 않는 형식입니다");
  });
});
