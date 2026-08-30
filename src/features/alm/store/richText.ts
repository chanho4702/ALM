/**
 * 리치 텍스트(설명·코멘트) 저장 포맷 — TipTap이 만든 HTML 문자열.
 * 옛 데이터(평문)는 `textToHtml`로 문단화해 읽고, 검색·CSV는 `htmlToText`로 태그를 벗겨 쓴다.
 * 화면은 이 HTML을 innerHTML로 꽂지 않고 TipTap 읽기 전용 에디터로 파싱해 그린다(원시 HTML 주입 금지).
 */

const MENTION_TAG_RE = /<span\b[^>]*\bdata-type="mention"[^>]*>/g;
const DATA_ID_RE = /\bdata-id="([^"]*)"/;

/** `<` 로 시작하면 HTML로 본다 — 평문 설명은 `<`로 시작하는 경우가 사실상 없다 */
export function looksLikeHtml(value: string): boolean {
  return /^\s*</.test(value);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 평문 → 문단 HTML(빈 줄은 문단 경계, 줄바꿈은 <br>) */
export function textToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** 저장값이 평문이든 HTML이든 에디터에 넣을 HTML로 */
export function toEditorHtml(value: string): string {
  if (!value) return "";
  return looksLikeHtml(value) ? value : textToHtml(value);
}

/** 내용이 없는 HTML(`<p></p>` 같은 껍데기)인가 */
export function isEmptyHtml(html: string): boolean {
  return htmlToText(html).trim() === "";
}

/** 태그를 벗긴 평문 — 검색·CSV·미리보기용. 블록 경계는 줄바꿈으로 */
export function htmlToText(value: string): string {
  if (!value) return "";
  if (!looksLikeHtml(value)) return value;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 본문에 멘션된 사용자 id(중복 제거, 등장 순) */
export function extractMentionIds(html: string): string[] {
  const ids: string[] = [];
  for (const tag of html.match(MENTION_TAG_RE) ?? []) {
    const id = DATA_ID_RE.exec(tag)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** 이전 본문에 없던 새 멘션만 — 설명 수정 때 같은 사람에게 매번 알리지 않기 위해 */
export function newMentionIds(before: string, after: string): string[] {
  const previous = new Set(extractMentionIds(before));
  return extractMentionIds(after).filter((id) => !previous.has(id));
}
