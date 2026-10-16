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
