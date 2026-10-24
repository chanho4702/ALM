/**
 * 내비게이션 UI 상태 저장소 — 최근 방문 프로젝트, 최근 본 이슈, 별표(즐겨찾기), 사이드바 접힘.
 * 도메인 데이터(alm.jira.v1)와 분리된 키를 쓴다. 실제 백엔드에서는 사용자 설정 API가 된다.
 */

import { parseAndCheck } from "./aql/validate";

const STORAGE_KEY = "alm.jira.ui.v1";
const RECENT_LIMIT = 5;
/** 최근 본 이슈 보관 건수 — 지라 For you "Viewed" 탭 */
const VIEWED_LIMIT = 20;

/** 최근 본 이슈 한 건 — 키와 마지막으로 연 시각(ISO) */
export interface ViewedIssue {
  key: string;
  viewedAt: string;
}

export const SIDENAV_MIN_WIDTH = 180;
export const SIDENAV_MAX_WIDTH = 400;
export const SIDENAV_DEFAULT_WIDTH = 240;

/** uiStore가 바뀔 때마다 window에 발행 — 사이드바 등 구독자가 다시 읽는다 */
export const UI_CHANGED_EVENT = "alm:ui-changed";
/** 최근 본 이슈 기록이 바뀜 — 사이드바는 구독하지 않고(UI_CHANGED_EVENT를 내지 않는 이유) 홈 "최근 본" 탭만 듣는다 */
export const VIEWED_ISSUES_CHANGED_EVENT = "alm:viewed-issues-changed";
/** 사용자별 UI 자리(즐겨찾기·초안)의 주인이 바뀜 — `setUiUser` */
export const UI_USER_CHANGED_EVENT = "alm:ui-user-changed";

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
  /** 조직 전체에 공유(F-12) — 누구나 실행하지만 결과는 실행하는 사람의 권한으로 걸러진다. 없으면 비공개 */
  shared?: boolean;
  /** 내 필터인가 — 남이 공유한 필터는 false(수정·삭제 불가). 옛 저장분·목업 내 필터는 true */
  mine?: boolean;
  /** 만든 사람 — 남이 공유한 필터의 출처 표시용 */
  ownerId?: string;
}

/** 저장 필터 입력 — 서버 `POST /api/alm/me/filters` 본문과 같은 모양 */
export interface SavedFilterInput {
  name: string;
  query: string;
  kind?: "smart" | "aql";
  /** 만들 때 생략하면 비공개, 고칠 때 생략하면 그대로 */
  shared?: boolean;
}

/** 남의 공유 필터를 고치거나 지우려 할 때 — 서버 403 문구와 같다 */
export const SHARED_FILTER_OWNER_ONLY = "공유된 필터는 만든 사람만 수정·삭제할 수 있습니다";

/**
 * 목업의 "남이 공유한 필터" — 목업에는 다른 사용자의 저장소가 없어 고정 목록으로 흉내 낸다(이서연 u2 소유).
 * REST는 `GET /api/alm/filters/shared`.
 */
const MOCK_SHARED_FILTERS: readonly SavedFilter[] = [
  { id: "shared-u2-1", name: "팀 버그 (이서연)", query: "버그", kind: "smart", shared: true, mine: false, ownerId: "u2" },
];

const ownerOnly = () => Object.assign(new Error(SHARED_FILTER_OWNER_ONLY), { status: 403 });

const FILTER_NAME_MAX = 60;
const FILTER_QUERY_MAX = 4000;

/** 테이블별 열 순서·너비·숨김 — order/widths는 DS Table의 columnOrder/columnWidths와 같은 모양 */
export interface TablePrefs {
  order?: string[];
  widths?: Record<string, number>;
  /** 숨긴 열 key(지라 목록 보기의 "열" 선택) — 없거나 빈 배열이면 전부 보인다 */
  hidden?: string[];
}

/**
 * 즐겨찾기(Linear Favorites) — 사이드바 "즐겨찾기" 섹션의 항목. 저장된 보기·프로젝트·이슈를 고정한다.
 * id: 프로젝트·보기는 그 id, 이슈는 **키**(키는 불변이라 링크·브랜치처럼 박아도 된다).
 * label은 고정할 때의 이름(표시 폴백) — 프로젝트는 사이드바가 현재 이름으로 다시 그린다.
 */
export type FavoriteKind = "project" | "issue" | "view";

export interface Favorite {
  kind: FavoriteKind;
  id: string;
  label: string;
  /** 이슈·보기가 속한 프로젝트 — 열 때 경로를 만든다 */
  projectId?: string;
}

/** 이슈 만들기 모달 초안(Linear 초안 보존) — 닫아도 프로젝트별로 남는다 */
export interface CreateIssueDraft {
  type?: string;
  title?: string;
  description?: string;
  priority?: string;
  assigneeId?: string | null;
  labels?: string;
  dueDate?: string;
  estimateHours?: string;
  storyPoints?: string;
  savedAt?: string;
}

interface UiState {
  tablePrefs: Record<string, TablePrefs>;
  recentProjectIds: string[];
  /** 사용자 id → 최근 본 이슈(최신순). 한 브라우저를 여러 계정이 쓰면 서로 섞이지 않게 사용자별로 둔다 */
  viewedIssuesByUser: Record<string, ViewedIssue[]>;
  starredProjectIds: string[];
  sideNavCollapsed: boolean;
  sideNavWidth: number;
  savedFilters: SavedFilter[];
  /** 키보드 단축키(c·/·?·g 시퀀스 등) 사용 — 기본 켬, 개인 설정에서 끈다 */
  keyboardShortcuts: boolean;
  /** 사용자 id → 즐겨찾기(사이드바 순서) */
  favoritesByUser: Record<string, Favorite[]>;
  /** 사용자 id → 프로젝트 id → 이슈 만들기 초안 */
  createDraftsByUser: Record<string, Record<string, CreateIssueDraft>>;
}

const DEFAULT_STATE: UiState = {
  tablePrefs: {},
  recentProjectIds: [],
  viewedIssuesByUser: {},
  starredProjectIds: [],
  sideNavCollapsed: false,
  sideNavWidth: SIDENAV_DEFAULT_WIDTH,
  savedFilters: [],
  keyboardShortcuts: true,
  favoritesByUser: {},
  createDraftsByUser: {},
};

function load(): UiState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      tablePrefs: parsed.tablePrefs ?? {},
      recentProjectIds: parsed.recentProjectIds ?? [],
      viewedIssuesByUser: parsed.viewedIssuesByUser ?? {},
      starredProjectIds: parsed.starredProjectIds ?? [],
      sideNavCollapsed: parsed.sideNavCollapsed ?? false,
      sideNavWidth: parsed.sideNavWidth ?? SIDENAV_DEFAULT_WIDTH,
      savedFilters: parsed.savedFilters ?? [],
      keyboardShortcuts: parsed.keyboardShortcuts ?? true,
      favoritesByUser: parsed.favoritesByUser ?? {},
      createDraftsByUser: parsed.createDraftsByUser ?? {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** notify=false는 구독자(사이드바 등)가 보지 않는 값만 바꿀 때 — 이슈를 열 때마다 사이드바가 다시 읽지 않게 */
function persist(state: UiState, notify = true): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (notify) window.dispatchEvent(new Event(UI_CHANGED_EVENT));
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

/** 키보드 단축키 사용 여부 — 동기 판정이 필요한 keydown 처리기도 쓸 수 있게 동기로 둔다 */
export function keyboardShortcutsEnabled(): boolean {
  return load().keyboardShortcuts;
}

export async function setKeyboardShortcutsEnabled(enabled: boolean): Promise<void> {
  persist({ ...load(), keyboardShortcuts: enabled });
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

/** 최근 본 이슈(최신순, 최대 VIEWED_LIMIT건) */
export async function listViewedIssues(userId: string): Promise<ViewedIssue[]> {
  return (load().viewedIssuesByUser[userId] ?? []).map((v) => ({ ...v }));
}

/** 이슈 상세를 열 때 — 맨 앞으로 올리고 시각을 갱신한다(중복 제거, 최대 VIEWED_LIMIT건) */
export async function recordIssueView(userId: string, issueKey: string): Promise<void> {
  const state = load();
  const current = state.viewedIssuesByUser[userId] ?? [];
  const next = [
    { key: issueKey, viewedAt: new Date().toISOString() },
    ...current.filter((v) => v.key !== issueKey),
  ].slice(0, VIEWED_LIMIT);
  persist({ ...state, viewedIssuesByUser: { ...state.viewedIssuesByUser, [userId]: next } }, false);
  window.dispatchEvent(new Event(VIEWED_ISSUES_CHANGED_EVENT));
}

/** 더는 열 수 없는 이슈(삭제·프로젝트 삭제·키 변경)를 최근 본 목록에서 걷어낸다 */
export async function forgetViewedIssues(userId: string, issueKeys: readonly string[]): Promise<void> {
  if (issueKeys.length === 0) return;
  const state = load();
  const current = state.viewedIssuesByUser[userId] ?? [];
  const next = current.filter((v) => !issueKeys.includes(v.key));
  if (next.length === current.length) return;
  persist({ ...state, viewedIssuesByUser: { ...state.viewedIssuesByUser, [userId]: next } }, false);
}

// ── 즐겨찾기 · 이슈 만들기 초안 — 사용자별 ─────────────────────────────

/** 로그인 사용자를 알기 전의 자리 — 사용자가 정해지면 그 사용자 자리로 옮긴다 */
const ANONYMOUS_UI_USER = "__local__";
let uiUserId = ANONYMOUS_UI_USER;

/**
 * 사용자별 UI 상태(즐겨찾기·초안)의 주인을 정한다 — 셸이 현재 사용자를 읽으면 부른다.
 * 그 사용자 자리가 비어 있으면 익명 자리(로그인 전에 고정한 것)를 물려받는다.
 */
export function setUiUser(userId: string): void {
  if (!userId || userId === uiUserId) return;
  uiUserId = userId;
  const state = load();
  let changed = false;
  if (!state.favoritesByUser[userId] && state.favoritesByUser[ANONYMOUS_UI_USER]) {
    state.favoritesByUser[userId] = state.favoritesByUser[ANONYMOUS_UI_USER];
    delete state.favoritesByUser[ANONYMOUS_UI_USER];
    changed = true;
  }
  if (!state.createDraftsByUser[userId] && state.createDraftsByUser[ANONYMOUS_UI_USER]) {
    state.createDraftsByUser[userId] = state.createDraftsByUser[ANONYMOUS_UI_USER];
    delete state.createDraftsByUser[ANONYMOUS_UI_USER];
    changed = true;
  }
  if (changed) persist(state, false);
  // 사용자별 값(즐겨찾기)만 다시 읽게 — 사이드바 전체 갱신(UI_CHANGED_EVENT)은 내지 않는다(저장 필터를 다시 부르지 않게)
  window.dispatchEvent(new Event(UI_USER_CHANGED_EVENT));
}

/** 테스트 격리용 — 사용자 자리를 익명으로 되돌린다 */
export function __resetUiUserForTest(): void {
  uiUserId = ANONYMOUS_UI_USER;
}

function favoritesOf(state: UiState): Favorite[] {
  const own = state.favoritesByUser[uiUserId];
  if (own) return own;
  // 옛 전역 별표(starredProjectIds) — 그 사용자의 첫 즐겨찾기 쓰기 때 프로젝트 항목으로 옮겨 적는다
  return state.starredProjectIds.map((id) => ({ kind: "project" as const, id, label: "" }));
}

function writeFavorites(state: UiState, favorites: Favorite[]): void {
  persist({
    ...state,
    favoritesByUser: { ...state.favoritesByUser, [uiUserId]: favorites },
    // 옛 키는 비운다 — 즐겨찾기가 정본이다
    starredProjectIds: [],
  });
}

const sameFavorite = (kind: FavoriteKind, id: string) => (f: Favorite) => f.kind === kind && f.id === id;

/** 즐겨찾기(사이드바 순서) */
export async function listFavorites(): Promise<Favorite[]> {
  return favoritesOf(load()).map((f) => ({ ...f }));
}

/** 동기 판정 — 메뉴·팔레트 항목 이름("즐겨찾기에 추가/빼기")을 그릴 때 */
export function isFavoriteSync(kind: FavoriteKind, id: string): boolean {
  return favoritesOf(load()).some(sameFavorite(kind, id));
}

/** 고정/해제 토글 — 토글 뒤 고정 상태를 돌려준다. 새 항목은 맨 끝에 붙는다 */
export async function toggleFavorite(favorite: Favorite): Promise<boolean> {
  const state = load();
  const current = favoritesOf(state);
  const pinned = current.some(sameFavorite(favorite.kind, favorite.id));
  writeFavorites(
    state,
    pinned ? current.filter((f) => !sameFavorite(favorite.kind, favorite.id)(f)) : [...current, { ...favorite }],
  );
  return !pinned;
}

export async function removeFavorite(kind: FavoriteKind, id: string): Promise<void> {
  const state = load();
  const current = favoritesOf(state);
  if (!current.some(sameFavorite(kind, id))) return;
  writeFavorites(state, current.filter((f) => !sameFavorite(kind, id)(f)));
}

/** 순서 바꾸기 — `toIndex`(0부터, 범위 밖이면 양끝)로 옮긴다 */
export async function moveFavorite(kind: FavoriteKind, id: string, toIndex: number): Promise<void> {
  const state = load();
  const current = [...favoritesOf(state)];
  const from = current.findIndex(sameFavorite(kind, id));
  if (from === -1) return;
  const [item] = current.splice(from, 1);
  current.splice(Math.max(0, Math.min(current.length, toIndex)), 0, item);
  writeFavorites(state, current);
}

/** 프로젝트 별표 = 프로젝트 즐겨찾기(디렉터리·프로젝트 헤더의 별 버튼) */
export async function listStarredProjectIds(): Promise<string[]> {
  return favoritesOf(load())
    .filter((f) => f.kind === "project")
    .map((f) => f.id);
}

/** 별표 토글 — 토글 후 별표 상태를 반환한다 */
export async function toggleProjectStar(projectId: string, label = ""): Promise<boolean> {
  return toggleFavorite({ kind: "project", id: projectId, label });
}

/** 이슈 만들기 초안 — 없으면 null */
export async function getCreateIssueDraft(projectId: string): Promise<CreateIssueDraft | null> {
  const draft = load().createDraftsByUser[uiUserId]?.[projectId];
  return draft ? { ...draft } : null;
}

/** 초안 저장 — 쓴 내용(제목·설명·라벨·날짜·추정)이 하나도 없으면 지운다. 사이드바가 볼 값이 아니라 이벤트는 내지 않는다 */
export async function saveCreateIssueDraft(projectId: string, draft: CreateIssueDraft): Promise<void> {
  const state = load();
  const mine = { ...(state.createDraftsByUser[uiUserId] ?? {}) };
  const meaningful = Boolean(
    draft.title?.trim() ||
      draft.description?.trim() ||
      draft.labels?.trim() ||
      draft.dueDate ||
      draft.estimateHours ||
      draft.storyPoints,
  );
  if (meaningful) mine[projectId] = { ...draft, savedAt: new Date().toISOString() };
  else delete mine[projectId];
  persist({ ...state, createDraftsByUser: { ...state.createDraftsByUser, [uiUserId]: mine } }, false);
}

export async function clearCreateIssueDraft(projectId: string): Promise<void> {
  const state = load();
  const mine = state.createDraftsByUser[uiUserId];
  if (!mine?.[projectId]) return;
  const next = { ...mine };
  delete next[projectId];
  persist({ ...state, createDraftsByUser: { ...state.createDraftsByUser, [uiUserId]: next } }, false);
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
  return load()
    .savedFilters.map((f) => ({ ...f, shared: f.shared ?? false, mine: true }))
    .sort(compareSavedFilters);
}

/** 남이 공유한 필터(이름순) — 내 필터는 listSavedFilters */
export async function listSharedFilters(): Promise<SavedFilter[]> {
  return MOCK_SHARED_FILTERS.map((f) => ({ ...f })).sort(compareSavedFilters);
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
  const filter: SavedFilter = { id: crypto.randomUUID(), name, query: input.query, kind, shared: input.shared ?? false };
  persist({ ...state, savedFilters: [...state.savedFilters, filter] });
  return { ...filter, mine: true };
}

export async function updateSavedFilter(
  id: string,
  patch: Partial<SavedFilterInput>,
): Promise<SavedFilter> {
  if (MOCK_SHARED_FILTERS.some((f) => f.id === id)) throw ownerOnly();
  const state = load();
  const existing = state.savedFilters.find((f) => f.id === id);
  if (!existing) throw new Error("필터를 찾을 수 없습니다");
  const next: SavedFilter = {
    ...existing,
    name: (patch.name ?? existing.name).trim(),
    query: patch.query ?? existing.query,
    kind: patch.kind ?? existing.kind,
    shared: patch.shared ?? existing.shared ?? false,
  };
  // 이름만 바꿔도 질의만 바꿔도 전체를 다시 본다 — 부분 갱신이 규칙을 비켜 가면 안 된다
  next.name = checkFilter(next.name, next.query, next.kind ?? "smart");
  if (state.savedFilters.some((f) => f.id !== id && f.name === next.name)) {
    throw new Error("같은 이름의 필터가 있습니다");
  }
  persist({ ...state, savedFilters: state.savedFilters.map((f) => (f.id === id ? next : f)) });
  return { ...next, mine: true };
}

export async function deleteSavedFilter(id: string): Promise<void> {
  if (MOCK_SHARED_FILTERS.some((f) => f.id === id)) throw ownerOnly();
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
  const favoritesByUser = Object.fromEntries(
    Object.entries(state.favoritesByUser).map(([user, list]) => [
      user,
      list.filter((f) => !(f.kind === "project" ? f.id === projectId : f.projectId === projectId)),
    ]),
  );
  persist({
    ...state,
    recentProjectIds: state.recentProjectIds.filter((id) => id !== projectId),
    starredProjectIds: state.starredProjectIds.filter((id) => id !== projectId),
    favoritesByUser,
  });
}
