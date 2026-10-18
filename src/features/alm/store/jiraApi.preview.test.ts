import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { inlineAttachment } from "./jiraApi";
import { attachmentPreviewKind } from "./attachmentLimits";

afterEach(() => vi.restoreAllMocks());

describe("첨부 미리보기 계약 (F-09)", () => {
  it("이미지 바이트는 /attachments/{id}/inline에서 Blob으로, 실패는 서버 문구로", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(new Response("png", { status: 200, headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "미리보기를 지원하지 않는 형식입니다" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const blob = await inlineAttachment("12");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/attachments/12/inline");
    expect(blob.size).toBe(3);
    await expect(inlineAttachment("13")).rejects.toThrow("미리보기를 지원하지 않는 형식입니다");
  });

  it("미리보기 방식 — 이미지 4종·PDF·그 밖", () => {
    expect(["image/png", "image/jpeg", "image/gif", "image/webp"].map(attachmentPreviewKind)).toEqual(["image", "image", "image", "image"]);
    expect(attachmentPreviewKind("image/svg+xml")).toBeNull();
    expect(attachmentPreviewKind("application/pdf")).toBe("pdf");
    expect(attachmentPreviewKind("IMAGE/PNG; charset=binary")).toBe("image");
    expect(attachmentPreviewKind("application/zip")).toBeNull();
  });
});
