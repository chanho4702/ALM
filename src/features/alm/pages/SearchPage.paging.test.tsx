import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";

type IssuePage = Awaited<ReturnType<typeof store.queryIssuesPage>>;

function renderSearch(initialPath: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});

afterEach(() => vi.restoreAllMocks());

describe("기본·스마트 검색 — 서버 페이징", () => {
  it("건수는 받은 줄 수가 아니라 서버 total이고, 페이저로 다음 페이지를 서버에 묻는다", async () => {
    const real = await store.queryIssuesPage({ ...(await import("../store/searchQuery")).EMPTY_QUERY }, { page: 0, size: 50 });
    const pages = vi.spyOn(store, "queryIssuesPage").mockImplementation(async (_query, paging) => ({
      ...real, ...paging, total: 130,
    }));
    const user = userEvent.setup();
    renderSearch("/search");

    expect(await screen.findByTestId("search-count")).toHaveTextContent("130개 이슈");
    expect(screen.getByTestId("search-range")).toHaveTextContent("1–50 / 130건");
    const pager = screen.getByRole("navigation", { name: "페이지" });
    await user.click(within(pager).getByRole("button", { name: "다음" }));
    await waitFor(() => expect(pages).toHaveBeenLastCalledWith(expect.anything(), { page: 1, size: 50 }));
    expect(await screen.findByTestId("search-range")).toHaveTextContent("51–100 / 130건");
  });

  it("조건이 바뀌면 첫 페이지로 돌아가고, 늦게 도착한 이전 조건의 응답은 버린다", async () => {
    const real = await store.queryIssuesPage({ ...(await import("../store/searchQuery")).EMPTY_QUERY }, { page: 0, size: 50 });
    const older = deferred<IssuePage>();
    const pages = vi.spyOn(store, "queryIssuesPage").mockImplementation(async (query, paging) => {
      if (query.text === "이전") return older.promise;
      if (query.text === "최신") return { ...real, ...paging, total: 1, items: [{ ...real.items[1], title: "최신 결과" }] };
      return { ...real, ...paging, total: 130 };
    });
    const user = userEvent.setup();
    renderSearch("/search?q=%EC%9D%B4%EC%A0%84"); // q=이전
    await waitFor(() => expect(pages).toHaveBeenCalledWith(expect.objectContaining({ text: "이전" }), { page: 0, size: 50 }));

    await user.click(screen.getByRole("button", { name: "스마트 구문으로 전환" }));
    fireEvent.change(screen.getByRole("textbox", { name: "스마트 검색" }), { target: { value: "최신" } });
    expect(await screen.findByText("최신 결과")).toBeInTheDocument();
    expect(pages).toHaveBeenLastCalledWith(expect.objectContaining({ text: "최신" }), { page: 0, size: 50 });
    // 이전 조건의 응답이 늦게 와도 최신 결과를 덮지 못한다
    await act(async () => older.resolve({ ...real, total: 1, items: [{ ...real.items[0], title: "지난 결과" }] }));
    expect(screen.queryByText("지난 결과")).not.toBeInTheDocument();
    expect(screen.getByText("최신 결과")).toBeInTheDocument();
    expect(screen.getByTestId("search-count")).toHaveTextContent("1개 이슈");
  });
});
