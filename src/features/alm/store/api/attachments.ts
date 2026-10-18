// alm-backend REST 어댑터 — attachments (jiraApi.ts에서 분할, 동작 불변)
import type { Attachment } from "../types";
import { type AttachmentDto, toBackendId, mapAttachment, ApiError, extractApiError } from "../mapping";
import { assertAttachmentSize, ATTACHMENT_TOO_LARGE_MESSAGE } from "../attachmentLimits";
import { json, sharedApiFetch } from "./http";

// ── 첨부 ─────────────────────────────────────────────────────

export async function listAttachments(issueId: string): Promise<Attachment[]> {
  const rows = await json<AttachmentDto[]>(
    await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/attachments`),
  );
  return rows.map(mapAttachment);
}

/**
 * multipart — Content-Type은 브라우저가 boundary와 함께 붙이므로 직접 쓰지 않는다.
 * 상한(20MB)을 넘는 파일은 보내지 않고, 프록시·서버가 413으로 막으면(본문이 JSON이 아닐 수 있다) 같은 문구로 알린다.
 */
export async function uploadAttachment(issueId: string, file: File): Promise<Attachment> {
  assertAttachmentSize(file);
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/attachments`, {
    method: "POST",
    body,
  });
  if (response.status === 413) throw new ApiError(413, `${ATTACHMENT_TOO_LARGE_MESSAGE}: ${file.name}`);
  return mapAttachment(await json(response));
}

/**
 * 바이트는 인증 헤더가 필요해 <a href>로 직접 열 수 없다 — fetch로 받아 Blob으로 돌려주고
 * 화면이 object URL로 저장한다(목업과 같은 계약).
 */
export async function downloadAttachment(id: string): Promise<Blob> {
  const response = await sharedApiFetch(`/api/alm/attachments/${toBackendId(id)}`);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(extractApiError(response.status, body));
  }
  return response.blob();
}

export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}

/**
 * 이미지 미리보기 바이트(F-09) — `GET /api/alm/attachments/{id}/inline`(png·jpeg·gif·webp만). 인증 헤더가 필요해
 * `<img src>`로 직접 못 열고 Blob으로 받아 화면이 object URL로 그린다.
 */
export async function inlineAttachment(id: string): Promise<Blob> {
  const response = await sharedApiFetch(`/api/alm/attachments/${toBackendId(id)}/inline`);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(extractApiError(response.status, body));
  }
  return response.blob();
}
