import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal, useToast } from "@chanho/react";
import { Download, Eye, FileText, Paperclip, Trash2 } from "lucide-react";
import type { Attachment } from "../store/types";
import {
  deleteAttachment,
  downloadAttachment,
  inlineAttachment,
  listAttachments,
  uploadAttachment,
} from "../store/jiraStore";
import { ATTACHMENT_TOO_LARGE_MESSAGE, attachmentPreviewKind, isAttachmentTooLarge } from "../store/attachmentLimits";
import { settleWithConcurrency } from "../store/concurrency";
import { formatDate } from "./time";

const revokeUrl = (url: string) => {
  if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
};

/** 사람이 읽는 크기 — 1024 단위, 소수 한 자리 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

/**
 * 이슈 첨부 섹션 — 올리기·목록·내려받기·삭제. 내려받기는 인증 헤더가 필요해 링크가 아니라
 * Blob을 받아 object URL로 저장한다(스토어 계약이 목업·REST 모두 Blob이다).
 */
export function IssueAttachments({
  issueId,
  userNames,
  canEdit,
  onChanged,
}: {
  issueId: string;
  userNames: Record<string, string>;
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  /** 이미지 첨부 썸네일(F-09) — attachmentId → object URL. 언마운트·목록 변경 때 해제한다 */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  /** 라이트박스로 크게 보는 이미지 */
  const [viewing, setViewing] = useState<Attachment | null>(null);

  // 이미지 첨부만 inline API로 받아 썸네일을 만든다(동시성 상한). 실패한 것은 썸네일 없이 이름만 남는다
  useEffect(() => {
    if (!items) return;
    const images = items.filter((a) => attachmentPreviewKind(a.contentType) === "image");
    // object URL을 못 만드는 환경(테스트 jsdom 등)에서는 썸네일 없이 이름만 — 미리보기 때문에 목록이 깨지면 안 된다
    if (images.length === 0 || typeof URL.createObjectURL !== "function") return;
    let alive = true;
    const created: string[] = [];
    void settleWithConcurrency(images, (a) => inlineAttachment(a.id)).then((results) => {
      const next: Record<string, string> = {};
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const url = URL.createObjectURL(result.value);
        created.push(url);
        next[images[index].id] = url;
      });
      if (alive) setThumbs(next);
      else created.forEach(revokeUrl);
    });
    return () => {
      alive = false;
      created.forEach(revokeUrl);
    };
  }, [items]);

  /** PDF — 내려받은 Blob을 새 탭의 브라우저 미리보기로 연다 */
  const openPdf = (attachment: Attachment) =>
    void run("미리보기 실패", async () => {
      const blob = await downloadAttachment(attachment.id);
      const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => revokeUrl(url), 60_000);
    });

  const generation = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++generation.current;
    const list = await listAttachments(issueId);
    if (mine === generation.current) setItems(list);
  }, [issueId]);

  useEffect(() => {
    setItems(null);
    void reload();
  }, [reload]);

  const run = async (failTitle: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChanged?.();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // 상한을 넘는 파일은 올리기 전에 걸러 이름과 함께 알린다 — 몇 분 업로드한 뒤 413으로 실패하지 않게
    const tooLarge = Array.from(files).filter(isAttachmentTooLarge);
    const picked = Array.from(files).filter((file) => !isAttachmentTooLarge(file));
    if (tooLarge.length > 0) {
      toast({
        title: ATTACHMENT_TOO_LARGE_MESSAGE,
        description: tooLarge.map((file) => `${file.name} (${formatBytes(file.size)})`).join(" · "),
        appearance: "danger",
      });
    }
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;
    void run("첨부 올리기 실패", async () => {
      for (const file of picked) await uploadAttachment(issueId, file);
      toast({ title: `${picked.length}개 파일을 첨부했습니다`, appearance: "success" });
    });
  };

  const handleDownload = (attachment: Attachment) =>
    void run("내려받기 실패", async () => {
      const blob = await downloadAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      // 저장 대화상자가 URL을 잡은 뒤 해제한다
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  return (
    <section className="issue-attachments" aria-label="첨부">
      <div className="issue-attachments-head">
        <h4>
          <Paperclip size={14} aria-hidden /> 첨부{items ? ` ${items.length}` : ""}
        </h4>
        {canEdit ? (
          <>
            {/* 실제 input은 시각적으로 숨기고 라벨이 버튼 역할 — 키보드·스크린리더 모두 라벨로 닿는다 */}
            <label className="issue-attachments-upload">
              <input
                ref={inputRef}
                type="file"
                multiple
                aria-label="파일 올리기"
                disabled={busy}
                onChange={(e) => handleFiles(e.target.files)}
              />
              <span className="issue-attachments-upload-text">파일 올리기</span>
            </label>
          </>
        ) : null}
      </div>

      {items === null ? (
        <p className="dash-empty">첨부 불러오는 중</p>
      ) : items.length === 0 ? (
        <p className="dash-empty">첨부된 파일이 없습니다</p>
      ) : (
        <ul className="issue-attachment-list">
          {items.map((attachment) => (
            <li key={attachment.id} className="issue-attachment-row">
              {thumbs[attachment.id] ? (
                <button
                  type="button"
                  className="issue-attachment-thumb"
                  aria-label={`${attachment.filename} 미리보기`}
                  onClick={() => setViewing(attachment)}
                >
                  <img src={thumbs[attachment.id]} alt="" />
                </button>
              ) : null}
              <span className="issue-attachment-name" title={attachment.filename}>
                {attachment.filename}
              </span>
              <span className="issue-attachment-meta">
                {`${formatBytes(attachment.sizeBytes)} · ${userNames[attachment.uploadedBy] ?? "사용자"} · ${formatDate(attachment.createdAt)}`}
              </span>
              {attachmentPreviewKind(attachment.contentType) === "pdf" ? (
                <Button
                  variant="subtle"
                  size="small"
                  iconOnly
                  aria-label={`${attachment.filename} 새 탭에서 보기`}
                  disabled={busy}
                  onClick={() => openPdf(attachment)}
                >
                  <FileText size={16} />
                </Button>
              ) : null}
              {thumbs[attachment.id] ? (
                <Button
                  variant="subtle"
                  size="small"
                  iconOnly
                  aria-label={`${attachment.filename} 크게 보기`}
                  onClick={() => setViewing(attachment)}
                >
                  <Eye size={16} />
                </Button>
              ) : null}
              <Button
                variant="subtle"
                size="small"
                iconOnly
                aria-label={`${attachment.filename} 내려받기`}
                disabled={busy}
                onClick={() => handleDownload(attachment)}
              >
                <Download size={16} />
              </Button>
              {canEdit ? (
                <Button
                  variant="subtle"
                  size="small"
                  iconOnly
                  aria-label={`${attachment.filename} 삭제`}
                  disabled={busy}
                  onClick={() =>
                    void run("첨부 삭제 실패", () => deleteAttachment(attachment.id))
                  }
                >
                  <Trash2 size={16} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {viewing && thumbs[viewing.id] ? (
        <Modal
          trigger={<span hidden />}
          title={viewing.filename}
          open
          onOpenChange={(next) => {
            if (!next) setViewing(null);
          }}
          className="issue-attachment-lightbox"
        >
          <img className="issue-attachment-lightbox-image" src={thumbs[viewing.id]} alt={viewing.filename} />
        </Modal>
      ) : null}
    </section>
  );
}
