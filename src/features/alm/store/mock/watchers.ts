// localStorage 목업 스토어 — watchers (jiraMock.ts에서 분할, 동작 불변)
import type { JiraData } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { load, clone, persist } from "./db";
import { addWatcher } from "./rules";

// ── 워처 ─────────────────────────────────────────────────────

export interface WatchersView {
  watching: boolean;
  watchers: { userId: string; createdAt: string }[];
}

function watchersView(data: JiraData, issueId: string): WatchersView {
  const list = data.watchers
    .filter((w) => w.issueId === issueId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((w) => ({ userId: w.userId, createdAt: w.createdAt }));
  return { watching: list.some((w) => w.userId === CURRENT_USER_ID), watchers: list };
}

export async function listWatchers(issueId: string): Promise<WatchersView> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  return clone(watchersView(data, issueId));
}

/** 관심 등록 — 멱등. 보기 권한이면 된다 */
export async function watchIssue(issueId: string): Promise<WatchersView> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  addWatcher(data, issueId, CURRENT_USER_ID, new Date().toISOString());
  persist();
  return clone(watchersView(data, issueId));
}

export async function unwatchIssue(issueId: string): Promise<WatchersView> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  data.watchers = data.watchers.filter((w) => !(w.issueId === issueId && w.userId === CURRENT_USER_ID));
  persist();
  return clone(watchersView(data, issueId));
}
