// alm-backend REST 어댑터 — users (jiraApi.ts에서 분할, 동작 불변)
import type { User, OrgMemberStatus, OrgProfile } from "../types";
import { sharedAuthClient } from "../apiClient";
import { assertAvatarFile, notifyAvatarChanged } from "../shared";
import { json, sharedApiFetch } from "./http";

// ── 사용자 — 디렉터리 서비스가 아직 없다. 현재 사용자는 /api/me, 목록은 현재 사용자뿐 ──

let cachedMe: User | null = null;

/** JWT sub가 사용자 id(서버의 actorId/assigneeId와 같은 숫자 문자열). 아바타는 캐시하지 않는다 */
export async function getCurrentUser(): Promise<User> {
  if (!cachedMe) {
    const me = await sharedAuthClient.fetchMe();
    cachedMe = { id: me.sub ?? me.email, name: me.name ?? me.email };
  }
  return { ...cachedMe, avatarUrl: await myAvatarObjectUrl() };
}

// ── 프로필 사진 (아바타 — org-service V7 `member_profile`) ───────────────────────────
//
// 아바타는 ALM이 아니라 **org-service**가 가진다(위키·보드도 같은 사진을 본다). 경로는
// `PUT/DELETE /api/org/me/avatar`(내 사진), `GET /api/org/members/{id}/avatar`(바이트)이고
// 사용자 목록(`GET /api/org/members`)·내 프로필(`GET /api/org/me`)이 `avatarUrl`을 함께 준다 —
// ALM 전용 `/api/alm/users/avatars` 병합은 없다.
//
// 바이트는 **Bearer 토큰이 필요해 `<img src="/api/...">`로 직접 열 수 없다.** 인증은 메모리
// access token이고(`auth/client.ts`) 쿠키는 refresh 전용이라 브라우저가 `<img>` 요청에
// Authorization 헤더를 붙이지 않는다 — 첨부 내려받기와 같은 제약이다. 그래서 fetch로 받아
// object URL로 바꾸고 캐시한다.
//
// 경로는 **서버가 준 `avatarUrl`을 그대로 쓴다**(프론트가 조립하지 않는다). 그 문자열에 버전이
// 들어 있어 사진이 바뀌면 경로가 달라지고, 그때 이전 object URL을 revoke하고 새로 받는다.
// 바이트 응답에 `Cache-Control: private, max-age=300`이 붙어 있어 브라우저 HTTP 캐시도 함께 탄다.

/** 서버 상한 — 목업(200KB)과 달리 오브젝트 스토리지라 2MB까지 받는다(경계 포함) */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** memberId → { 서버가 준 경로, 표시용 object URL } */
const avatarUrls = new Map<string, { path: string; url: string }>();

/**
 * `/api/org/me` 응답은 **캐시하지 않는다** — 캐시하면 내가 다른 탭에서 바꾼 사진이 영원히
 * 안 보인다. 대신 진행 중인 요청만 합쳐(in-flight dedup) 한 번의 화면 로드에서 여러 번 부르지
 * 않게 한다. 비싼 쪽은 바이트이고 그건 아래 `avatarUrls`가 경로 단위로 막는다.
 */
let myProfileInFlight: Promise<OrgMeDto> | null = null;

/** 이전 object URL을 브라우저에 돌려준다 — 사진 교체·삭제 때 쌓이지 않게 */
function releaseAvatar(userId: string): void {
  const entry = avatarUrls.get(userId);
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  avatarUrls.delete(userId);
}

/**
 * 테스트 전용: 모듈 캐시(현재 사용자·진행 중 프로필 요청·object URL)를 비운다.
 * 목업의 같은 이름 함수와 짝이며, 파사드는 테스트에서 항상 목업 쪽을 고른다.
 */
export function __resetForTest(): void {
  cachedMe = null;
  myProfileInFlight = null;
  for (const userId of [...avatarUrls.keys()]) releaseAvatar(userId);
}

/**
 * 아바타 경로를 담은 org-service 응답 조각 — `/api/org/members` 행, `/api/org/me`,
 * `PUT /api/org/me/avatar` 응답이 모두 이 모양을 포함한다.
 */
export interface OrgAvatarFields {
  /** 바이트 경로(`/api/org/members/{id}/avatar?v=…`). 서버가 만든 것을 그대로 쓴다 */
  avatarUrl?: string | null;
  /** ISO-8601. 목록·프로필 응답의 이름 */
  avatarUpdatedAt?: string | null;
  /** ISO-8601. 업로드 응답(`{memberId, avatarUrl, updatedAt}`)의 이름 */
  updatedAt?: string | null;
}

/** `GET /api/org/me` — 목록에 나 자신이 없을 수도 있어 별도 경로로 읽는다 */
interface OrgMeDto extends OrgAvatarFields {
  id: number | string;
  displayName?: string | null;
  email?: string | null;
  status?: string | null;
  kind?: string | null;
  globalRoles?: string[] | null;
  teams?: { id: number | string; name: string; role: string }[] | null;
  joinedVia?: string | null;
}

/** `PUT /api/org/me/avatar` 응답 */
interface AvatarUploadDto extends OrgAvatarFields {
  memberId: number | string;
}

/** 사진이 없으면 null — 서버가 경로를 안 줄 때만 시각으로 조립한다(`?v`는 캐시버스터) */
export function avatarPathOf(memberId: string, row: OrgAvatarFields): string | null {
  if (row.avatarUrl) return row.avatarUrl;
  const updatedAt = row.avatarUpdatedAt ?? row.updatedAt;
  if (!updatedAt) return null;
  return `/api/org/members/${encodeURIComponent(memberId)}/avatar?v=${encodeURIComponent(updatedAt)}`;
}

/**
 * `GET /api/org/me` 원본 — **실패하면 던진다**. 계정 상태 게이트는 조회 실패를 알아야 한다
 * (삼키면 정지된 계정이 정상으로 보인다). 아바타 쪽은 아래 `myProfile()`이 따로 삼킨다.
 */
function fetchMyProfile(): Promise<OrgMeDto> {
  if (myProfileInFlight) return myProfileInFlight;
  myProfileInFlight = (async () => {
    try {
      return await json<OrgMeDto>(await sharedApiFetch("/api/org/me"));
    } finally {
      myProfileInFlight = null;
    }
  })();
  return myProfileInFlight;
}

function myProfile(): Promise<OrgMeDto | null> {
  // 아바타는 부가 정보다 — 프로필 조회가 실패해도 화면은 이니셜로 그린다
  return fetchMyProfile().catch(() => null);
}

const ORG_STATUSES: OrgMemberStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"];

/**
 * 계정 상태·전역 역할의 단일 진실 소스(설계 §3.3). 예전의 `/api/org/me/permissions` GLOBAL ADMIN
 * 조회를 대신한다 — 위키와 같은 응답을 보므로 두 앱의 관리자 판정이 갈라지지 않는다.
 *
 * 서버가 아직 필드를 안 주면(구버전) 상태는 ACTIVE로, 역할은 빈 배열로 읽는다. 상태를 모른 채
 * PENDING으로 가정하면 멀쩡한 사용자가 승인 대기 화면에 갇힌다.
 */
export async function getMyOrgProfile(): Promise<OrgProfile> {
  const dto = await fetchMyProfile();
  const status = ORG_STATUSES.find((value) => value === dto.status) ?? "ACTIVE";
  return {
    id: String(dto.id),
    displayName: dto.displayName ?? "",
    email: dto.email ?? null,
    status,
    kind: dto.kind === "AGENT" ? "AGENT" : "HUMAN",
    globalRoles: Array.isArray(dto.globalRoles) ? dto.globalRoles : [],
    teams: (dto.teams ?? []).map((team) => ({
      id: String(team.id),
      name: team.name,
      role: team.role === "LEAD" ? "LEAD" : "MEMBER",
    })),
    joinedVia: dto.joinedVia ?? null,
  };
}

async function avatarObjectUrl(userId: string, path: string): Promise<string | null> {
  const cached = avatarUrls.get(userId);
  if (cached?.path === path) return cached.url;
  releaseAvatar(userId); // 사진이 바뀌었다
  try {
    const response = await sharedApiFetch(path);
    // 목록에 있던 사용자가 404면 그 사이 지워진 경합이다 — 조용히 이니셜로 떨어진다
    if (!response.ok) return null;
    const url = URL.createObjectURL(await response.blob());
    avatarUrls.set(userId, { path, url });
    return url;
  } catch {
    return null;
  }
}

/** 사용자 하나에 표시용 avatarUrl을 채운다 — 사진이 있는 사람만 바이트를 받는다 */
export async function withAvatar(user: User, path: string | null): Promise<User> {
  if (!path) {
    releaseAvatar(user.id); // 사진이 지워졌다
    return { ...user, avatarUrl: null };
  }
  return { ...user, avatarUrl: await avatarObjectUrl(user.id, path) };
}

/** 내 사진의 표시용 object URL — 없으면 null. 식별은 `/api/org/me`가 준 id를 쓴다 */
export async function myAvatarObjectUrl(): Promise<string | null> {
  const profile = await myProfile();
  if (!profile) return null;
  const memberId = String(profile.id);
  const path = avatarPathOf(memberId, profile);
  if (!path) {
    releaseAvatar(memberId);
    return null;
  }
  return avatarObjectUrl(memberId, path);
}

/**
 * multipart PUT — Content-Type은 브라우저가 boundary와 함께 붙이므로 직접 쓰지 않는다.
 * 사전 검증(`assertAvatarFile`)을 통과해도 서버가 매직 바이트로 거부할 수 있다(이름만 .png인
 * GIF·SVG 등) — 그 `{error}` 문구는 그대로 위로 던져 화면이 띄운다.
 */
export async function uploadMyAvatar(file: File): Promise<string> {
  assertAvatarFile(file, AVATAR_MAX_BYTES);
  const body = new FormData();
  body.append("file", file, file.name);
  const saved = await json<AvatarUploadDto | null>(
    await sharedApiFetch("/api/org/me/avatar", { method: "PUT", body }),
  );
  const userId = saved ? String(saved.memberId) : (await getCurrentUser()).id;
  releaseAvatar(userId);
  // 방금 올린 바이트는 이미 로컬에 있다 — 왕복 없이 미리보기를 만들고, 응답이 준 새 경로로
  // 캐시에 등록해 다음 목록 조회도 이 URL을 재사용한다(바이트를 두 번 받지 않는다).
  const url = URL.createObjectURL(file);
  // 응답 본문이 없어도(계약 밖 200) URL을 캐시에 등록해 둬야 다음 교체·삭제 때 revoke된다 — 누수 방지
  const path = (saved && avatarPathOf(userId, saved)) ?? `local:${Date.now()}`;
  avatarUrls.set(userId, { path, url });
  notifyAvatarChanged();
  return url;
}

export async function removeMyAvatar(): Promise<void> {
  await json(await sharedApiFetch("/api/org/me/avatar", { method: "DELETE" }));
  // 캐시된 object URL은 다음 조회에서 withAvatar가 놓아준다(경로가 사라지므로)
  notifyAvatarChanged();
}
