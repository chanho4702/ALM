/**
 * 목업(`jiraMock`)과 REST(`jiraApi`)가 함께 쓰는 상수·사전 검증. 어느 한 어댑터에 두면 다른 어댑터가 그 모듈을 통째로
 * 끌어와(번들에 목업이 실리는 원인이었다) 여기로 모은다. 순수 값·함수만 둔다 — 저장소·네트워크 접근 금지.
 */
import type { UserPreferences } from "./types";

// ── 레지스트리 변경 알림 — 화면 훅(useIssueTypes·useLinkTypes·usePriorities)이 듣는다 ──

export const ISSUE_TYPES_CHANGED_EVENT = "alm:issue-types-changed";
export const LINK_TYPES_CHANGED_EVENT = "alm:link-types-changed";
export const PRIORITIES_CHANGED_EVENT = "alm:priorities-changed";
/** 사진을 바꾸면 이미 그려진 아바타(상단바 등)가 갱신되도록 알린다 */
export const AVATAR_CHANGED_EVENT = "alm:avatar-changed";

function emit(name: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

export const notifyIssueTypesChanged = (): void => emit(ISSUE_TYPES_CHANGED_EVENT);
export const notifyLinkTypesChanged = (): void => emit(LINK_TYPES_CHANGED_EVENT);
export const notifyPrioritiesChanged = (): void => emit(PRIORITIES_CHANGED_EVENT);
export const notifyAvatarChanged = (): void => emit(AVATAR_CHANGED_EVENT);

// ── 개인 설정 기본값 ──

export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: { assigned: true, statusChanged: true, commented: true, mentioned: true },
  autoWatch: { created: true, commented: true, edited: false },
  startPage: "home",
  emailEnabled: false,
  // 목업에는 메일 서버가 없다 — 화면이 "구성되지 않음" 안내를 그리는 경로를 그대로 탄다
  mailConfigured: false,
};

// ── 프로필 사진(아바타) 사전 검증 ──

export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** 상한 문구용 — 서버가 "2MB"라고 말하므로 MB 단위가 떨어지면 MB로 쓴다 */
export function formatAvatarLimit(maxBytes: number): string {
  const mb = maxBytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${Math.round(maxBytes / 1024)}KB`;
}

/**
 * 목업·REST 공통 사전 검증. **문구는 서버(alm-backend V20)와 글자까지 같다** — 같은 파일이
 * 모드에 따라 다른 문장으로 거부되면 안 된다.
 *
 * 이건 어디까지나 사전 검증이다. 서버는 확장자·MIME이 아니라 **매직 바이트**로 판별하므로
 * (이름만 .png인 GIF, SVG 등) 여기를 통과해도 400이 날 수 있다 — 화면은 서버 `{error}`를
 * 항상 그대로 띄워야 한다.
 */
export function assertAvatarFile(file: File, maxBytes: number): void {
  if (file.size === 0) throw new Error("빈 파일은 올릴 수 없습니다");
  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다");
  }
  if (file.size > maxBytes) {
    throw new Error(`아바타는 ${formatAvatarLimit(maxBytes)} 이하 이미지여야 합니다`);
  }
}

// ── 변경 이력 ──

/** 변경 이력 한 번 조회의 상한(서버 `IssueChangeLogService`와 같은 기본·최대) */
export const CHANGE_HISTORY_MAX_LIMIT = 20_000;
