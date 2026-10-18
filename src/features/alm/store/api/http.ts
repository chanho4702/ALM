// alm-backend REST 어댑터 — http (jiraApi.ts에서 분할, 동작 불변)
import { ApiError, extractApiError, type ProjectDto, toBackendId, type IssueDto } from "../mapping";
import { sharedApiFetch as transportFetch } from "../apiClient";

export async function json<T>(response: Response): Promise<T> {
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, extractApiError(response.status, body));
  return body as T;
}

/**
 * 같은 URL의 GET이 동시에 여러 번 나가면(홈·대시보드 가젯이 한꺼번에 뜰 때) 요청 하나를 나눠 쓴다.
 * 공유는 **응답이 오기 전까지만**이다 — 끝나면 바로 지워 다음 호출은 새로 묻는다(캐시가 아니다).
 * 인증은 세션(같은 탭의 같은 사용자) 단위라 다른 사용자와 섞일 일이 없다. 결과 객체는 호출자들이 함께
 * 보므로 매퍼로 새 객체를 만들어 쓰고 원본을 고치지 않는다.
 */
const inflightGets = new Map<string, Promise<unknown>>();

/**
 * 쓰기 세대 — 쓰기 요청이 시작될 때와 끝날 때 올린다. 공유 키에 세대를 넣어, 저장 뒤 다시 읽기가
 * 저장 **전**에 시작된 GET(옛 제목·옛 버전)에 합류하지 못하게 한다.
 */
let mutationGeneration = 0;

/**
 * 설정 세대 — 상태 해석에 영향을 주는 쓰기(설정·스킴·상태 레지스트리·프로젝트 생성/삭제/보관)에서만 올린다.
 * `statusMetaByProject` 캐시가 이 값으로 무효화된다(이슈 저장 같은 쓰기로는 지우지 않는다).
 */
export let settingsGeneration = 0;

const SETTINGS_WRITE_PATH = /\/api\/alm\/(settings\/|projects(\/\d+)?(\/(settings|archive|unarchive|restore|permanent)(\/|$)|$|\?))/;

/** 어댑터의 모든 요청이 지나는 길 — GET이 아니면 쓰기로 보고 세대를 앞뒤로 올린다 */
export async function sharedApiFetch(...args: Parameters<typeof transportFetch>): Promise<Response> {
  // 인자는 그대로 넘긴다(받은 모양 그대로 — 호출 계약을 바꾸지 않는다)
  const method = (args[1]?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return transportFetch(...args);
  const touchesSettings = SETTINGS_WRITE_PATH.test(String(args[0]));
  mutationGeneration += 1;
  if (touchesSettings) settingsGeneration += 1;
  try {
    return await transportFetch(...args);
  } finally {
    mutationGeneration += 1;
    if (touchesSettings) settingsGeneration += 1;
  }
}

export function sharedGet<T>(path: string): Promise<T> {
  const key = `${mutationGeneration}|${path}`;
  const pending = inflightGets.get(key);
  if (pending) return pending as Promise<T>;
  const request = (async () => json<T>(await sharedApiFetch(path)))();
  inflightGets.set(key, request);
  const forget = () => {
    if (inflightGets.get(key) === request) inflightGets.delete(key);
  };
  request.then(forget, forget);
  return request;
}

export async function projectDto(id: string): Promise<ProjectDto> {
  return json(await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`));
}

export async function issueDto(id: string): Promise<IssueDto> {
  return json(await sharedApiFetch(`/api/alm/issues/${toBackendId(id)}`));
}

/** 서버 검색 파라미터 — 목록 값은 반복 파라미터로 보낸다 */
export function searchParams(entries: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params.toString();
}

export const jsonBody = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const postJson = (body: unknown): RequestInit => ({ ...jsonBody(body), method: "POST" });

/** 이 모듈이 파사드 구현일 때의 데이터 출처 — `jiraStore.USE_REST`가 읽는다 */
export const STORE_MODE = "rest" as "mock" | "rest";
