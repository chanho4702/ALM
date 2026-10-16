/**
 * 이슈 첨부 크기 상한 — 서버 `ALM_MAX_ATTACHMENT_MB`(기본 20MB) 하나에 맞춘다.
 * 서버 multipart 요청 상한은 파일 상한 + 1MB(경계·헤더 여유), nginx 업로드 경로는 21m이다 —
 * 화면·스토어는 파일 크기만 본다. 상한을 바꾸면 서버 env와 이 값을 함께 바꾼다.
 */
export const ATTACHMENT_MAX_MB = 20;
export const ATTACHMENT_MAX_BYTES = ATTACHMENT_MAX_MB * 1024 * 1024;

/** 너무 큰 파일 — 올리기 전 검사와 서버 413 응답이 같은 문구를 쓴다 */
export const ATTACHMENT_TOO_LARGE_MESSAGE = `첨부 파일은 ${ATTACHMENT_MAX_MB}MB 이하만 올릴 수 있습니다`;

export function isAttachmentTooLarge(file: { size: number }): boolean {
  return file.size > ATTACHMENT_MAX_BYTES;
}

/** 올리기 전 검사 — 상한을 넘으면 파일 이름과 함께 막는다(네트워크로 보내지 않는다) */
export function assertAttachmentSize(file: { name: string; size: number }): void {
  if (isAttachmentTooLarge(file)) throw new Error(`${ATTACHMENT_TOO_LARGE_MESSAGE}: ${file.name}`);
}
