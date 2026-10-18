// localStorage 목업 스토어 — attachments (jiraMock.ts에서 분할, 동작 불변)
import type { Attachment } from "../types";
import { assertAttachmentSize } from "../attachmentLimits";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { clone, load, nextId, persist } from "./db";
import { assertCanEdit } from "./members";

// ── attachments ──────────────────────────────────────────────

/**
 * 목업의 첨부 바이트는 메모리에만 둔다 — localStorage는 5MB 한계와 base64 팽창 때문에 부적합하다.
 * 새로고침하면 바이트만 사라지고(메타는 남는다) 내려받기가 "저장소에 없음"으로 실패한다. 의도된 한계.
 */
const attachmentBlobs = new Map<string, Blob>();

export async function listAttachments(issueId: string): Promise<Attachment[]> {
  return clone(load().attachments.filter((a) => a.issueId === issueId));
}

export async function uploadAttachment(issueId: string, file: File): Promise<Attachment> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, issue.projectId);
  if (file.size === 0) throw new Error("빈 파일은 올릴 수 없습니다");
  assertAttachmentSize(file); // 서버와 같은 상한(20MB)
  const now = new Date().toISOString();
  const attachment: Attachment = {
    id: nextId(),
    issueId,
    filename: file.name || "unnamed",
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    uploadedBy: CURRENT_USER_ID,
    createdAt: now,
  };
  attachmentBlobs.set(attachment.id, file);
  data.attachments.push(attachment);
  data.activities.push({
    id: nextId(),
    issueId,
    actorId: CURRENT_USER_ID,
    type: "attachment",
    detail: `${attachment.filename} 첨부`,
    at: now,
  });
  issue.updatedAt = now;
  persist();
  return clone(attachment);
}

export async function downloadAttachment(id: string): Promise<Blob> {
  const data = load();
  const attachment = data.attachments.find((a) => a.id === id);
  if (!attachment) throw new Error("첨부를 찾을 수 없습니다");
  const blob = attachmentBlobs.get(id);
  if (!blob) throw new Error("첨부 본문이 저장소에 없습니다 (목업은 새로고침 후 바이트를 잃습니다)");
  return blob;
}

export async function deleteAttachment(id: string): Promise<void> {
  const data = load();
  const attachment = data.attachments.find((a) => a.id === id);
  if (!attachment) throw new Error("첨부를 찾을 수 없습니다");
  const issue = data.issues.find((i) => i.id === attachment.issueId);
  if (issue) assertCanEdit(data, issue.projectId);
  data.attachments = data.attachments.filter((a) => a.id !== id);
  attachmentBlobs.delete(id);
  if (issue) {
    const now = new Date().toISOString();
    data.activities.push({
      id: nextId(),
      issueId: issue.id,
      actorId: CURRENT_USER_ID,
      type: "attachment",
      detail: `${attachment.filename} 첨부 삭제`,
      at: now,
    });
    issue.updatedAt = now;
  }
  persist();
}
