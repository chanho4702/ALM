import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";

/**
 * 저장 필터 읽기·삭제만 갈아끼운다 — `jiraStore`는 모듈 로드 때 구현 함수를 상수로 붙들기 때문에
 * (`export const listSavedFilters = impl.listSavedFilters`) 나중 `spyOn`은 화면에 닿지 않는다.
 * 나머지 함수는 전부 실제 목업 그대로다.
 */
const stub = vi.hoisted(() => ({
  list: null as null | (() => Promise<never>),
  remove: null as null | (() => Promise<never>),
}));

vi.mock("../store/jiraStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store/jiraStore")>();
  return {
    ...actual,
    listSavedFilters: () => (stub.list ? stub.list() : actual.listSavedFilters()),
    deleteSavedFilter: (id: string) =>
      stub.remove ? stub.remove() : actual.deleteSavedFilter(id),
  };
});

const { App } = await import("../../../app/App");
const { __resetForTest, createSavedFilter } = await import("../store/jiraStore");

function renderApp() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/home"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const globalNav = () => screen.getByRole("navigation", { name: "전역 내비게이션" });

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  stub.list = null;
  stub.remove = null;
});

describe("전역 사이드바 — 저장 필터 로드 실패", () => {
  it("못 읽으면 섹션을 지우지 않고 이유와 '다시 시도'를 남긴다", async () => {
    const user = userEvent.setup();
    await createSavedFilter({ name: "버그 모음", query: "타입:버그" });
    // 503 한 번 — 그 뒤에는 실제 목업으로 돌아간다
    let failed = false;
    stub.list = () => {
      failed = true;
      stub.list = null;
      return Promise.reject(new Error("서비스를 사용할 수 없습니다"));
    };

    renderApp();
    await screen.findByRole("navigation", { name: "전역 내비게이션" });

    // 실패한 동안에도 "필터가 없다"로 보이지 않는다 — 503이 조용히 빈 목록이 되면 안 된다
    const failure = await within(globalNav()).findByTestId("nav-filters-error");
    expect(failed).toBe(true);
    expect(failure).toHaveTextContent("저장 필터를 불러오지 못했습니다");
    expect(within(globalNav()).queryByTestId("nav-filters")).not.toBeInTheDocument();

    await user.click(within(failure).getByRole("button", { name: "다시 시도" }));

    const filters = await within(globalNav()).findByTestId("nav-filters");
    expect(within(filters).getByRole("button", { name: "버그 모음" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(globalNav()).queryByTestId("nav-filters-error")).not.toBeInTheDocument();
    });
  });

  it("삭제가 실패하면 토스트로 알린다 — 목록에서 조용히 사라지지 않는다", async () => {
    const user = userEvent.setup();
    await createSavedFilter({ name: "버그 모음", query: "타입:버그" });

    renderApp();
    await screen.findByRole("navigation", { name: "전역 내비게이션" });
    const filters = await within(globalNav()).findByTestId("nav-filters");
    stub.remove = () => Promise.reject(new Error("권한이 없습니다"));

    await user.click(within(filters).getByRole("button", { name: "필터 버그 모음 삭제" }));

    expect(await screen.findByText('필터 "버그 모음"를 삭제하지 못했습니다')).toBeInTheDocument();
    expect(within(globalNav()).getByRole("button", { name: "버그 모음" })).toBeInTheDocument();
  });
});
