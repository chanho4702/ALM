import { lazy } from "react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import {
  __resetNewVersionForTest,
  getNewVersionState,
  installPreloadErrorHandler,
  isStaleChunkError,
  reloadForNewVersion,
  reportStaleAsset,
} from "./newVersion";
import { NewVersionBanner } from "./NewVersionBanner";
import { LazyPage } from "./LazyContent";

/** 배포 뒤 오래 열어 둔 탭 — 사라진 청크를 받으려다 실패하면 자동 새로고침 대신 안내를 띄운다 */
beforeEach(() => __resetNewVersionForTest());
afterEach(() => vi.restoreAllMocks());

function preloadError(): Event {
  return new Event("vite:preloadError", { cancelable: true });
}

describe("vite:preloadError 처리", () => {
  it("기본 동작(예외로 화면을 깨뜨림)을 막고 새 버전 안내를 띄운다 — 스스로 새로고침하지 않는다", async () => {
    const uninstall = installPreloadErrorHandler(window);
    render(<NewVersionBanner />);
    const event = preloadError();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(getNewVersionState()).toBe("available");
    expect(await screen.findByText(/새 버전이 배포되었습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    uninstall();
  });

  it("새로고침은 사용자가 누를 때만, 닫으면 안내가 사라진다", async () => {
    const user = userEvent.setup();
    render(<NewVersionBanner />);
    act(() => reportStaleAsset());
    const reload = vi.fn();
    act(() => reloadForNewVersion(reload));
    expect(reload).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: /닫기/ }));
    expect(screen.queryByText(/새 버전이 배포되었습니다/)).not.toBeInTheDocument();
  });

  it("방금 새 버전 때문에 새로고침했는데 또 실패하면 다시 새로고침을 권하지 않는다(고리 방지)", () => {
    const now = Date.now();
    reloadForNewVersion(() => {});
    render(<NewVersionBanner />);
    act(() => reportStaleAsset(now + 5_000));
    expect(getNewVersionState()).toBe("persisting");
    expect(screen.getByText(/새로고침한 뒤에도 화면 파일을 받지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로고침" })).not.toBeInTheDocument();
    // 충분히 지난 뒤의 실패는 다시 새 배포로 본다
    act(() => reportStaleAsset(now + 120_000));
    expect(getNewVersionState()).toBe("available");
  });

  it("브라우저별 청크 실패 문구를 알아본다", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: /alm/assets/Board-1a2b.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("이슈를 찾을 수 없습니다"))).toBe(false);
  });
});

describe("지연 화면 로딩 실패", () => {
  it("배포로 사라진 청크면 같은 새 버전 안내와 새로고침 선택지를 보여 준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Stale = lazy<ComponentType>(() =>
      Promise.reject(new TypeError("Failed to fetch dynamically imported module: /alm/assets/Board-old.js")),
    );
    render(
      <MemoryRouter>
        <LazyPage label="보드"><Stale /></LazyPage>
      </MemoryRouter>,
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("새 버전이 배포되었습니다")).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    expect(getNewVersionState()).toBe("available");
  });

  it("다른 로딩 실패는 연결 안내를 유지한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = lazy<ComponentType>(() => Promise.reject(new Error("boom")));
    render(
      <MemoryRouter>
        <LazyPage label="보드"><Broken /></LazyPage>
      </MemoryRouter>,
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("화면을 불러오지 못했습니다")).toBeInTheDocument();
    expect(getNewVersionState()).toBe("none");
  });
});
