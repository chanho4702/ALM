/**
 * 배포 후 오래 열어 둔 탭 — 예전 index가 가리키는 해시 청크가 서버에서 사라지면 지연 로딩이 실패한다.
 * Vite는 그때 `vite:preloadError`를 window에 보낸다(https://vite.dev/guide/build.html#load-error-handling).
 *
 * 공식 예시는 곧바로 `location.reload()`지만, 여기서는 **자동 새로고침하지 않는다** — 이슈 설명·스프린트 계획처럼
 * 저장하지 않은 초안이 있을 수 있어서다. 대신 "새 버전이 배포되었습니다 — 새로고침" 안내를 띄우고 사용자가 고른다.
 * 새로고침 직후 같은 오류가 또 나면(배포가 덜 끝났거나 자산이 정말 없다) 다시 새로고침을 권하지 않고 그 사실을 알린다 —
 * 새로고침 고리를 만들지 않기 위해서다.
 */

export type NewVersionState = "none" | "available" | "persisting";

/** 사용자가 새 버전 때문에 새로고침한 시각 — 그 직후의 같은 오류는 "새로고침해도 안 됨"으로 본다 */
const RELOAD_MARK_KEY = "alm.newVersionReloadAt";
const RELOAD_LOOP_WINDOW_MS = 30_000;

let state: NewVersionState = "none";
const listeners = new Set<() => void>();

function emit(next: NewVersionState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

export function getNewVersionState(): NewVersionState {
  return state;
}

export function subscribeNewVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function reloadedRecently(now: number): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARK_KEY));
    return Number.isFinite(at) && at > 0 && now - at < RELOAD_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
}

/** 청크·CSS를 못 받았다 — 새 버전 안내를 띄운다(방금 그 때문에 새로고침했다면 "계속 실패"로) */
export function reportStaleAsset(now = Date.now()): void {
  emit(reloadedRecently(now) ? "persisting" : "available");
}

/** 사용자가 고른 새로고침 — 고리 감지를 위해 시각을 남긴다 */
export function reloadForNewVersion(reload: () => void = () => window.location.reload()): void {
  try {
    sessionStorage.setItem(RELOAD_MARK_KEY, String(Date.now()));
  } catch {
    // 저장소를 못 써도 새로고침은 한다 — 고리 감지만 빠진다
  }
  reload();
}

export function dismissNewVersion(): void {
  emit("none");
}

/** 지연 로딩 실패가 "배포로 사라진 파일" 때문인지 — 브라우저마다 문구가 다르다 */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Outdated Optimize Dep/i.test(
    message,
  );
}

/** 앱 시작 때 한 번 — 기본 동작(예외로 화면을 깨뜨림)을 막고 안내로 바꾼다. 해제 함수를 돌려준다 */
export function installPreloadErrorHandler(target: Window = window): () => void {
  const handler = (event: Event) => {
    event.preventDefault();
    reportStaleAsset();
  };
  target.addEventListener("vite:preloadError", handler);
  return () => target.removeEventListener("vite:preloadError", handler);
}

/** 테스트 전용 */
export function __resetNewVersionForTest(): void {
  state = "none";
  listeners.clear();
  try {
    sessionStorage.removeItem(RELOAD_MARK_KEY);
  } catch {
    // 무시
  }
}
