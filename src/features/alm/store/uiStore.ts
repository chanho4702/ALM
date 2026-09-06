/**
 * 내비게이션 UI 상태 저장소 — 최근 방문 프로젝트, 별표(즐겨찾기), 사이드바 접힘.
 * 도메인 데이터(alm.jira.v1)와 분리된 키를 쓴다. 실제 백엔드에서는 사용자 설정 API가 된다.
 */

const STORAGE_KEY = "alm.jira.ui.v1";
const RECENT_LIMIT = 5;

export const SIDENAV_MIN_WIDTH = 180;
export const SIDENAV_MAX_WIDTH = 400;
export const SIDENAV_DEFAULT_WIDTH = 240;

/** uiStore가 바뀔 때마다 window에 발행 — 사이드바 등 구독자가 다시 읽는다 */
export const UI_CHANGED_EVENT = "alm:ui-changed";

/** 저장 필터 — query는 스마트 검색 문자열 또는 AQL 문자열 (URL·사이드바에서 재사용) */
export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  /** 없으면 스마트(`?q=`). AQL 필터는 `?aql=`로 연다 — 옛 저장분은 kind가 없어 자동으로 스마트가 된다 */
  kind?: "smart" | "aql";
}

/** 테이블별 열 순서·너비 — DS Table의 columnOrder/columnWidths와 같은 모양 */
export interface TablePrefs {
  order?: string[];
  widths?: Record<string, number>;
}

interface UiState {
  tablePrefs: Record<string, TablePrefs>;
  recentProjectIds: string[];
  starredProjectIds: string[];
  sideNavCollapsed: boolean;
  sideNavWidth: number;
  savedFilters: SavedFilter[];
}

const DEFAULT_STATE: UiState = {
  tablePrefs: {},
  recentProjectIds: [],
  starredProjectIds: [],
  sideNavCollapsed: false,
  sideNavWidth: SIDENAV_DEFAULT_WIDTH,
  savedFilters: [],
};

function load(): UiState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      tablePrefs: parsed.tablePrefs ?? {},
      recentProjectIds: parsed.recentProjectIds ?? [],
      starredProjectIds: parsed.starredProjectIds ?? [],
      sideNavCollapsed: parsed.sideNavCollapsed ?? false,
      sideNavWidth: parsed.sideNavWidth ?? SIDENAV_DEFAULT_WIDTH,
      savedFilters: parsed.savedFilters ?? [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persist(state: UiState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(UI_CHANGED_EVENT));
}

export async function getTablePrefs(tableId: string): Promise<TablePrefs> {
  return { ...(load().tablePrefs[tableId] ?? {}) };
}

/** 부분 갱신 — order만 또는 widths만 바꿔도 나머지는 남는다 */
export async function setTablePrefs(tableId: string, patch: TablePrefs): Promise<void> {
  const state = load();
  state.tablePrefs = { ...state.tablePrefs, [tableId]: { ...(state.tablePrefs[tableId] ?? {}), ...patch } };
  persist(state);
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

export async function getSideNavWidth(): Promise<number> {
  return load().sideNavWidth;
}

/** 사이드바 너비 저장 — MIN/MAX로 클램프한다 */
export async function setSideNavWidth(width: number): Promise<void> {
  const clamped = Math.min(SIDENAV_MAX_WIDTH, Math.max(SIDENAV_MIN_WIDTH, Math.round(width)));
  persist({ ...load(), sideNavWidth: clamped });
}

export async function listSavedFilters(): Promise<SavedFilter[]> {
  return load().savedFilters;
}

/** 저장 필터 추가 — 같은 이름이 있으면 쿼리를 덮어쓴다 */
export async function saveFilter(
  name: string,
  query: string,
  kind: "smart" | "aql" = "smart",
): Promise<SavedFilter> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("필터 이름을 입력하세요");
  const state = load();
  const existing = state.savedFilters.find((f) => f.name === trimmed);
  if (existing) {
    existing.query = query;
    existing.kind = kind;
    persist(state);
    return existing;
  }
  const filter: SavedFilter = { id: crypto.randomUUID(), name: trimmed, query, kind };
  persist({ ...state, savedFilters: [...state.savedFilters, filter] });
  return filter;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const state = load();
  persist({ ...state, savedFilters: state.savedFilters.filter((f) => f.id !== id) });
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
