/**
 * 내비게이션 UI 상태 저장소 — 최근 방문 프로젝트, 별표(즐겨찾기), 사이드바 접힘.
 * 도메인 데이터(alm.jira.v1)와 분리된 키를 쓴다. 실제 백엔드에서는 사용자 설정 API가 된다.
 */

const STORAGE_KEY = "alm.jira.ui.v1";
const RECENT_LIMIT = 5;

/** uiStore가 바뀔 때마다 window에 발행 — 사이드바 등 구독자가 다시 읽는다 */
export const UI_CHANGED_EVENT = "alm:ui-changed";

interface UiState {
  recentProjectIds: string[];
  starredProjectIds: string[];
  sideNavCollapsed: boolean;
}

const DEFAULT_STATE: UiState = {
  recentProjectIds: [],
  starredProjectIds: [],
  sideNavCollapsed: false,
};

function load(): UiState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      recentProjectIds: parsed.recentProjectIds ?? [],
      starredProjectIds: parsed.starredProjectIds ?? [],
      sideNavCollapsed: parsed.sideNavCollapsed ?? false,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persist(state: UiState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(UI_CHANGED_EVENT));
}

export async function listRecentProjectIds(): Promise<string[]> {
  return load().recentProjectIds;
}

/** 방문한 프로젝트를 맨 앞으로 — 중복 제거, 최대 RECENT_LIMIT개 */
export async function recordProjectVisit(projectId: string): Promise<void> {
  const state = load();
  const next = [projectId, ...state.recentProjectIds.filter((id) => id !== projectId)].slice(
    0,
    RECENT_LIMIT,
  );
  // 이미 맨 앞이면 저장/이벤트 발행을 생략한다 (내비게이션마다 불필요한 재렌더 방지)
  if (next.join() === state.recentProjectIds.join()) return;
  persist({ ...state, recentProjectIds: next });
}

export async function listStarredProjectIds(): Promise<string[]> {
  return load().starredProjectIds;
}

/** 별표 토글 — 토글 후 별표 상태를 반환한다 */
export async function toggleProjectStar(projectId: string): Promise<boolean> {
  const state = load();
  const starred = state.starredProjectIds.includes(projectId);
  const next = starred
    ? state.starredProjectIds.filter((id) => id !== projectId)
    : [...state.starredProjectIds, projectId];
  persist({ ...state, starredProjectIds: next });
  return !starred;
}

export async function isSideNavCollapsed(): Promise<boolean> {
  return load().sideNavCollapsed;
}

export async function setSideNavCollapsed(collapsed: boolean): Promise<void> {
  persist({ ...load(), sideNavCollapsed: collapsed });
}

/** 삭제된 프로젝트를 최근/별표에서 걷어낸다 (프로젝트 삭제 후 호출) */
export async function pruneProject(projectId: string): Promise<void> {
  const state = load();
  persist({
    ...state,
    recentProjectIds: state.recentProjectIds.filter((id) => id !== projectId),
    starredProjectIds: state.starredProjectIds.filter((id) => id !== projectId),
  });
}
