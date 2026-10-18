// localStorage 목업 스토어 — personal (jiraMock.ts에서 분할, 동작 불변)
import type { JiraData, UserPreferences, UserPreferencesPatch, ProjectShortcut, AnnouncementBanner } from "../types";
import { DEFAULT_PREFERENCES, assertAvatarFile, notifyAvatarChanged } from "../shared";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { load, clone, persist, nextId } from "./db";
import { assertCanAdmin } from "./members";

// ── 개인 설정 · 바로 가기 · 공지 배너 (지라 메뉴 대조 2026-08-30) ────────────

const START_PAGES: readonly string[] = ["home", "projects", "last-project"];

export function preferencesOf(data: JiraData, userId: string): UserPreferences {
  const stored = data.preferences[userId];
  return {
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...stored?.notifications },
    autoWatch: { ...DEFAULT_PREFERENCES.autoWatch, ...stored?.autoWatch },
    startPage: stored?.startPage ?? DEFAULT_PREFERENCES.startPage,
    emailEnabled: stored?.emailEnabled ?? DEFAULT_PREFERENCES.emailEnabled,
    mailConfigured: false,
  };
}

export async function getMyPreferences(): Promise<UserPreferences> {
  const data = load();
  return clone({ ...preferencesOf(data, CURRENT_USER_ID), avatarUrl: data.avatars[CURRENT_USER_ID] ?? null });
}

// ── 프로필 사진 (아바타) ─────────────────────────────────────
//
// 목업은 localStorage에 base64 dataURL로 넣는다(첨부와 달리 새로고침해도 남아야 하기 때문).
// 그래서 서버(2MB)보다 훨씬 작은 상한을 둔다 — base64는 약 1.37배로 부풀고 localStorage는 5MB다.

/** 목업 상한. REST 어댑터는 서버와 같은 2MB를 쓴다 — 화면은 이 값을 읽어 안내 문구를 만든다 */
export const AVATAR_MAX_BYTES = 200 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** 올린 사진을 즉시 보여줄 수 있는 URL(목업은 dataURL)로 돌려준다 */
export async function uploadMyAvatar(file: File): Promise<string> {
  assertAvatarFile(file, AVATAR_MAX_BYTES);
  const dataUrl = await readAsDataUrl(file);
  const data = load();
  data.avatars[CURRENT_USER_ID] = dataUrl;
  persist();
  notifyAvatarChanged();
  return dataUrl;
}

export async function removeMyAvatar(): Promise<void> {
  const data = load();
  delete data.avatars[CURRENT_USER_ID];
  persist();
  notifyAvatarChanged();
}

/** 부분 갱신 — 빠진 키는 그대로 */
export async function saveMyPreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  const data = load();
  const current = preferencesOf(data, CURRENT_USER_ID);
  if (patch.startPage !== undefined && !START_PAGES.includes(patch.startPage)) {
    throw new Error("시작 화면은 home/projects/last-project 중 하나입니다");
  }
  const next: UserPreferences = {
    notifications: { ...current.notifications, ...patch.notifications },
    autoWatch: { ...current.autoWatch, ...patch.autoWatch },
    startPage: patch.startPage ?? current.startPage,
    emailEnabled: patch.emailEnabled ?? current.emailEnabled,
    mailConfigured: false,
  };
  data.preferences[CURRENT_USER_ID] = next;
  persist();
  // 아바타는 preferences에 저장하지 않는다(별도 저장소) — 읽기 전용으로 얹어 돌려준다
  return clone({ ...next, avatarUrl: data.avatars[CURRENT_USER_ID] ?? null });
}

export async function listProjectShortcuts(projectId: string): Promise<ProjectShortcut[]> {
  return clone(
    load()
      .shortcuts.filter((s) => s.projectId === projectId)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
  );
}

function validateShortcut(input: { name: string; url: string }): { name: string; url: string } {
  const name = input.name.trim();
  if (!name) throw new Error("바로 가기 이름을 입력하세요");
  if (name.length > 80) throw new Error("바로 가기 이름은 80자 이하여야 합니다");
  const url = input.url.trim();
  if (!/^https?:\/\//.test(url)) throw new Error("바로 가기 URL은 http:// 또는 https://로 시작해야 합니다");
  return { name, url };
}

export async function addProjectShortcut(
  projectId: string,
  input: { name: string; url: string },
): Promise<ProjectShortcut> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, projectId);
  const valid = validateShortcut(input);
  const shortcut: ProjectShortcut = {
    id: nextId(),
    projectId,
    ...valid,
    order: data.shortcuts.filter((s) => s.projectId === projectId).length + 1,
    createdAt: new Date().toISOString(),
  };
  data.shortcuts.push(shortcut);
  persist();
  return clone(shortcut);
}

export async function updateProjectShortcut(
  id: string,
  input: { name: string; url: string },
): Promise<ProjectShortcut> {
  const data = load();
  const shortcut = data.shortcuts.find((s) => s.id === id);
  if (!shortcut) throw new Error("바로 가기를 찾을 수 없습니다");
  assertCanAdmin(data, shortcut.projectId);
  Object.assign(shortcut, validateShortcut(input));
  persist();
  return clone(shortcut);
}

export async function removeProjectShortcut(id: string): Promise<void> {
  const data = load();
  const shortcut = data.shortcuts.find((s) => s.id === id);
  if (!shortcut) throw new Error("바로 가기를 찾을 수 없습니다");
  assertCanAdmin(data, shortcut.projectId);
  data.shortcuts = data.shortcuts.filter((s) => s.id !== id);
  persist();
}

export async function getBanner(): Promise<AnnouncementBanner> {
  return clone(load().banner);
}

/** 관리자만 — 서버는 ADMIN 역할로 막는다. 켤 때는 내용이 필요하다 */
export async function saveBanner(banner: AnnouncementBanner): Promise<AnnouncementBanner> {
  const data = load();
  const message = banner.message.trim();
  if (banner.level !== "info" && banner.level !== "warning") {
    throw new Error("배너 수준은 info/warning 중 하나입니다");
  }
  if (banner.enabled && !message) throw new Error("배너 내용을 입력하세요");
  if (message.length > 500) throw new Error("배너 내용은 500자 이하여야 합니다");
  data.banner = { enabled: banner.enabled, level: banner.level, message };
  persist();
  return clone(data.banner);
}
