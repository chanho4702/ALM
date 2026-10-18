// alm-backend REST 어댑터 — savedFilters (jiraApi.ts에서 분할, 동작 불변)
import { type SavedFilter, UI_CHANGED_EVENT, localSavedFilters, clearLocalSavedFilters, compareSavedFilters, type SavedFilterInput } from "../uiStore";
import { AqlError } from "../aql/types";
import { extractApiError, toBackendId } from "../mapping";
import type { UserPreferences, UserPreferencesPatch, AnnouncementBanner } from "../types";
import { DEFAULT_PREFERENCES } from "../shared";
import { sharedApiFetch, json } from "./http";
import type { AqlErrorDto } from "./aql";
import { myAvatarObjectUrl } from "./users";

// ── 저장 필터 (`/api/alm/me/filters`) ────────────────────────

interface SavedFilterDto {
  id: number;
  name: string;
  kind: string;
  query: string;
  createdAt?: string;
  updatedAt?: string;
  /** F-12(2026-10-18) — 구 서버에는 없다(= 내 비공개 필터) */
  shared?: boolean;
  ownerId?: number;
  mine?: boolean;
}

function mapSavedFilter(dto: SavedFilterDto): SavedFilter {
  return {
    id: String(dto.id),
    name: dto.name,
    query: dto.query,
    kind: dto.kind === "aql" ? "aql" : "smart",
    shared: dto.shared === true,
    mine: dto.mine !== false,
    ...(dto.ownerId !== undefined && dto.ownerId !== null ? { ownerId: String(dto.ownerId) } : {}),
  };
}

/** 사이드바가 듣는 변경 신호 — 목업은 `persist()`가, REST는 각 쓰기가 직접 발행한다 */
function notifyFiltersChanged(): void {
  window.dispatchEvent(new Event(UI_CHANGED_EVENT));
}

/**
 * 저장 필터 쓰기의 오류 — `kind=aql` 문법 오류는 서버가 `/query`와 **같은 계약**
 * (`{error, position, expected}`)으로 준다. 그래서 자리를 주는 400은 `AqlError`로 올려
 * 화면이 에디터와 같은 밑줄·같은 문구 자리로 보여 줄 수 있게 한다. 나머지(409·404·검증)는 평범한 Error다.
 */
async function savedFilterWrite(path: string, init: RequestInit): Promise<SavedFilterDto> {
  const response = await sharedApiFetch(path, init);
  if (response.ok) return (await response.json()) as SavedFilterDto;
  const body = (await response.json().catch(() => null)) as AqlErrorDto | null;
  const failure =
    typeof body?.position === "number"
      ? new AqlError(
          extractApiError(response.status, body),
          body.position,
          Array.isArray(body.expected) ? body.expected : [],
        )
      : new Error(extractApiError(response.status, body));
  // 상태코드를 실어 보낸다 — 이관이 "이 필터가 틀렸다(4xx)"와 "지금 서버가 문제다(5xx)"를 갈라야 한다
  throw Object.assign(failure, { status: response.status });
}

/**
 * 서버 계약(alm-backend `SavedFilterController` + common-starter 예외 매핑)에서 "다시 보내도 같은 답"인
 * 거절만 — **400**(이름·질의 검증, AQL 문법, 본문 형식)과 **409**(같은 이름의 필터). 이 둘만 그 필터를 버린다.
 *
 * 나머지는 전부 재시도 대상이다: 401·403은 세션·권한이 바뀌면 통과하고, 404는 옛 배포에 라우트가
 * 없는 것이며, 408·425·429는 스로틀, 5xx·네트워크·상태 없음은 서버 사정이다. 2026-09-13 이전에는
 * 4xx 전부를 영구 실패로 봐서 세션 만료 한 번에 로컬 필터를 통째로 비웠다.
 */
const PERMANENT_REJECTION_STATUSES: ReadonlySet<number> = new Set([400, 409]);

function isPermanentRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && PERMANENT_REJECTION_STATUSES.has(status);
}

/**
 * 로컬(localStorage)에 남은 옛 저장 필터를 서버로 한 번 옮긴다. "한 번"을 보장하는 것은 플래그가
 * 아니라 비워진 로컬 키다 — 다 처리하면 키를 비우므로 다음 조회는 아무 일도 하지 않는다.
 *
 * 실패를 두 갈래로 가른다.
 * - **400·409**: 그 필터 자체가 서버 규칙에 안 맞는다(옛 `saveFilter`가 막지 않던 빈 질의, 61자 이름,
 *   경합으로 생긴 중복 이름). 다시 보내도 같은 답이라 **그 한 건만 버리고** 넘어간다 —
 *   남겨 두면 나쁜 필터 하나가 목록 조회를 영원히 막는다.
 * - **그 외 전부(401·403·404·429·5xx·네트워크·모르는 상태)**: 지금은 안 되지만 필터 탓이 아니다.
 *   로컬을 남겨 다음 조회에서 다시 시도한다.
 */
async function migrateLocalSavedFilters(server: SavedFilter[]): Promise<SavedFilter[]> {
  const local = localSavedFilters();
  if (local.length === 0) return server;
  const taken = new Set(server.map((f) => f.name));
  const added: SavedFilter[] = [];
  let retryLater = false;
  for (const filter of local) {
    if (taken.has(filter.name)) continue;
    taken.add(filter.name);
    try {
      added.push(
        await postSavedFilter({ name: filter.name, query: filter.query, kind: filter.kind }),
      );
    } catch (error) {
      if (!isPermanentRejection(error)) {
        retryLater = true;
        break;
      }
      console.warn(
        `저장 필터 "${filter.name}"를 서버가 받지 않아 이관에서 뺍니다`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  // 변경 신호는 이관 끝에 **한 번만** 나간다 — POST마다 발행하면 사이드바가 그때마다 다시 조회해
  // 이관에 재진입한다. 로컬을 비우는 `clearLocalSavedFilters()`의 persist가 이미 그 한 번을 낸다.
  if (!retryLater) {
    clearLocalSavedFilters(); // 옮겼든 버렸든 다 처리했을 때만. 신호는 여기서 나간다
  } else if (added.length > 0) {
    notifyFiltersChanged();
  }
  return [...server, ...added].sort(compareSavedFilters);
}

export async function listSavedFilters(): Promise<SavedFilter[]> {
  const rows = await json<SavedFilterDto[]>(await sharedApiFetch("/api/alm/me/filters"));
  const server = rows.map(mapSavedFilter);
  try {
    return await migrateLocalSavedFilters(server);
  } catch (error) {
    // 이관은 곁다리다 — 실패해도 서버 목록은 그대로 돌려준다(사이드바를 빈 화면으로 만들지 않는다)
    console.warn("저장 필터 이관에 실패했습니다 — 서버 목록만 보여 줍니다", error);
    return server;
  }
}

/** 남이 공유한 필터(이름순, `GET /api/alm/filters/shared`) — 내 필터는 listSavedFilters */
export async function listSharedFilters(): Promise<SavedFilter[]> {
  const rows = await json<SavedFilterDto[]>(await sharedApiFetch("/api/alm/filters/shared"));
  return rows.map(mapSavedFilter);
}

/** POST 한 번 — 변경 신호는 발행하지 않는다(이관이 끝에 한 번만 알리려고 이 조각을 쓴다) */
async function postSavedFilter(input: SavedFilterInput): Promise<SavedFilter> {
  return mapSavedFilter(
    await savedFilterWrite("/api/alm/me/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name.trim(),
        kind: input.kind ?? "smart",
        query: input.query,
        ...(input.shared !== undefined ? { shared: input.shared } : {}),
      }),
    }),
  );
}

export async function createSavedFilter(input: SavedFilterInput): Promise<SavedFilter> {
  const created = await postSavedFilter(input);
  notifyFiltersChanged();
  return created;
}

export async function updateSavedFilter(
  id: string,
  patch: Partial<SavedFilterInput>,
): Promise<SavedFilter> {
  const body: Record<string, string | boolean> = {};
  if (patch.shared !== undefined) body.shared = patch.shared;
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.kind !== undefined) body.kind = patch.kind;
  if (patch.query !== undefined) body.query = patch.query;
  const updated = mapSavedFilter(
    await savedFilterWrite(`/api/alm/me/filters/${toBackendId(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  notifyFiltersChanged();
  return updated;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  await json(
    await sharedApiFetch(`/api/alm/me/filters/${toBackendId(id)}`, { method: "DELETE" }),
  );
  notifyFiltersChanged();
}

interface PreferenceDto {
  notifications?: Partial<UserPreferences["notifications"]> | null;
  autoWatch?: Partial<UserPreferences["autoWatch"]> | null;
  startPage?: string | null;
  emailEnabled?: boolean | null;
  /** 읽기 전용 — 요청에 실어도 서버가 무시한다 */
  mailConfigured?: boolean | null;
}

function mapPreferences(dto: PreferenceDto): UserPreferences {
  const startPage = dto.startPage;
  return {
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(dto.notifications ?? {}) },
    autoWatch: { ...DEFAULT_PREFERENCES.autoWatch, ...(dto.autoWatch ?? {}) },
    startPage:
      startPage === "projects" || startPage === "last-project" ? startPage : "home",
    emailEnabled: dto.emailEnabled === true,
    mailConfigured: dto.mailConfigured === true,
  };
}

/** 사진을 뺀 설정 문서 — 저장이 "현재 값 위에 패치"를 만들 때 쓴다(아바타 왕복 없음) */
async function fetchPreferences(): Promise<UserPreferences> {
  return mapPreferences(await json<PreferenceDto>(await sharedApiFetch("/api/alm/me/preferences")));
}

export async function getMyPreferences(): Promise<UserPreferences> {
  const prefs = await fetchPreferences();
  // 사진은 org-service가 가진다(`/api/org/me`) — 없으면 목업과 같은 shape(null)로 이니셜 표시
  prefs.avatarUrl = await myAvatarObjectUrl();
  return prefs;
}

/** 서버는 전체 문서를 받는다 — 현재 값 위에 패치를 얹어 보낸다 */
export async function saveMyPreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  const current = await fetchPreferences();
  const next: PreferenceDto = {
    notifications: { ...current.notifications, ...patch.notifications },
    autoWatch: { ...current.autoWatch, ...patch.autoWatch },
    startPage: patch.startPage ?? current.startPage,
    emailEnabled: patch.emailEnabled ?? current.emailEnabled,
  };
  const response = await sharedApiFetch("/api/alm/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  return mapPreferences(await json(response));
}

export async function getBanner(): Promise<AnnouncementBanner> {
  const dto = await json<Partial<AnnouncementBanner>>(await sharedApiFetch("/api/alm/banner"));
  return {
    enabled: dto.enabled === true,
    level: dto.level === "warning" ? "warning" : "info",
    message: dto.message ?? "",
  };
}

export async function saveBanner(banner: AnnouncementBanner): Promise<AnnouncementBanner> {
  const response = await sharedApiFetch("/api/alm/admin/banner", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(banner),
  });
  const dto = await json<Partial<AnnouncementBanner>>(response);
  return {
    enabled: dto.enabled === true,
    level: dto.level === "warning" ? "warning" : "info",
    message: dto.message ?? "",
  };
}
