/**
 * 내비게이션 UI 상태 저장소 — 최근 방문 프로젝트, 별표(즐겨찾기), 사이드바 접힘.
 * 도메인 데이터(alm.jira.v1)와 분리된 키를 쓴다. 실제 백엔드에서는 사용자 설정 API가 된다.
 */

import { parseAndCheck } from "./aql/validate";

const STORAGE_KEY = "alm.jira.ui.v1";
const RECENT_LIMIT = 5;

export const SIDENAV_MIN_WIDTH = 180;
export const SIDENAV_MAX_WIDTH = 400;
export const SIDENAV_DEFAULT_WIDTH = 240;

/** uiStore가 바뀔 때마다 window에 발행 — 사이드바 등 구독자가 다시 읽는다 */
export const UI_CHANGED_EVENT = "alm:ui-changed";

/**
 * 저장 필터 — query는 스마트 검색 문자열 또는 AQL 문자열 (URL·사이드바에서 재사용).
 *
 * **화면은 이 모듈이 아니라 `jiraStore`의 파사드 4함수를 쓴다**(목업 = 여기, REST = `/api/alm/me/filters`).
 * 여기 있는 구현은 목업 쪽 절반이고, 저장 키는 나머지 UI 상태와 같은 `alm.jira.ui.v1`이다.
 */
export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  /** 없으면 스마트(`?q=`). AQL 필터는 `?aql=`로 연다 — 옛 저장분은 kind가 없어 자동으로 스마트가 된다 */
  kind?: "smart" | "aql";
}

/** 저장 필터 입력 — 서버 `POST /api/alm/me/filters` 본문과 같은 모양 */
export interface SavedFilterInput {
  name: string;
  query: string;
  kind?: "smart" | "aql";
}

const FILTER_NAME_MAX = 60;
const FILTER_QUERY_MAX = 4000;

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

/**
 * 저장 필터 이름 비교자 — 서버 Java `Collator(ko, PRIMARY)`가 **실제로 내는 순서**를 재현한다:
 * 숫자 → 영문 → 한글, 대소문자·악센트는 같은 것으로 본다(1차 강도 = `sensitivity: "base"`).
 *
 * 로케일을 `"ko"`로 주면 안 된다 — CLDR의 한국어 대조는 한글을 라틴 **앞으로** 재배치하므로
 * (`[reorder Hang]`) 영문·한글 순서가 서버와 거꾸로 뒤집힌다. 실측(Node 24 / ICU 78):
 * `"ko"` → `가나다 < Apple`, 서버 Java Collator → `Apple < 가나다`. Java의 Collator에는 그 재배치가 없다.
 * 로케일을 생략해도 안 된다 — 돌리는 기계의 기본 로케일을 타서 CI와 로컬이 갈린다.
 */
const NAME_COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

/** 이름이 동률이면 **id ASC**로 갈라 순서가 조회마다 흔들리지 않게 한다(서버와 같은 2차 키) */
export function compareSavedFilters(a: SavedFilter, b: SavedFilter): number {
  const byName = NAME_COLLATOR.compare(a.name, b.name);
  return byName !== 0 ? byName : a.id.localeCompare(b.id);
}

export async function listSavedFilters(): Promise<SavedFilter[]> {
  return [...load().savedFilters].sort(compareSavedFilters);
}

/**
 * 이름·질의 검증 — 서버와 **같은 상한·같은 문구**로 막는다(400/409를 왕복하지 않는다).
 * `kind === "aql"`이면 서버처럼 문법까지 본다 — 틀리면 `AqlError`(message + position)라
 * 화면이 에디터와 같은 밑줄 경로로 보여 줄 수 있다.
 */
function checkFilter(name: string, query: string, kind: "smart" | "aql"): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("필터 이름을 입력하세요");
  if (trimmed.length > FILTER_NAME_MAX) throw new Error(`필터 이름은 ${FILTER_NAME_MAX}자 이하여야 합니다`);
  if (!query.trim()) throw new Error("필터 질의를 입력하세요");
  if (query.length > FILTER_QUERY_MAX) {
    throw new Error(`필터 질의는 ${FILTER_QUERY_MAX}자 이하여야 합니다`);
  }
  if (kind === "aql") parseAndCheck(query);
  return trimmed;
}

export async function createSavedFilter(input: SavedFilterInput): Promise<SavedFilter> {
  const kind = input.kind ?? "smart";
  const name = checkFilter(input.name, input.query, kind);
  const state = load();
  if (state.savedFilters.some((f) => f.name === name)) throw new Error("같은 이름의 필터가 있습니다");
  const filter: SavedFilter = { id: crypto.randomUUID(), name, query: input.query, kind };
  persist({ ...state, savedFilters: [...state.savedFilters, filter] });
  return { ...filter };
}

export async function updateSavedFilter(
  id: string,
  patch: Partial<SavedFilterInput>,
): Promise<SavedFilter> {
  const state = load();
  const existing = state.savedFilters.find((f) => f.id === id);
  if (!existing) throw new Error("필터를 찾을 수 없습니다");
  const next: SavedFilter = {
    ...existing,
    name: (patch.name ?? existing.name).trim(),
    query: patch.query ?? existing.query,
    kind: patch.kind ?? existing.kind,
  };
  // 이름만 바꿔도 질의만 바꿔도 전체를 다시 본다 — 부분 갱신이 규칙을 비켜 가면 안 된다
  next.name = checkFilter(next.name, next.query, next.kind ?? "smart");
  if (state.savedFilters.some((f) => f.id !== id && f.name === next.name)) {
    throw new Error("같은 이름의 필터가 있습니다");
  }
  persist({ ...state, savedFilters: state.savedFilters.map((f) => (f.id === id ? next : f)) });
  return { ...next };
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const state = load();
  // 서버는 없는 id(또는 남의 것)에 404다 — 목업이 조용히 성공하면 화면이 "지워졌다"고 거짓말한다
  if (!state.savedFilters.some((f) => f.id === id)) {
    throw new Error(`저장 필터를 찾을 수 없습니다: ${id}`);
  }
  persist({ ...state, savedFilters: state.savedFilters.filter((f) => f.id !== id) });
}

/**
 * REST 1회 이관용 — 로컬에 남은 옛 저장 필터를 그대로 읽는다(정렬·가공 없음).
 * 서버로 옮긴 뒤에는 `clearLocalSavedFilters()`로 지운다.
 */
export function localSavedFilters(): SavedFilter[] {
  return load().savedFilters.map((f) => ({ ...f }));
}

export function clearLocalSavedFilters(): void {
  persist({ ...load(), savedFilters: [] });
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
