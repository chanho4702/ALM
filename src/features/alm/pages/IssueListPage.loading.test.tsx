import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { ToastProvider } from "@chanho/react";
import * as store from "../store/jiraStore";
import { IssueListPage } from "./IssueListPage";

type IssuePage = Awaited<ReturnType<typeof store.listIssuesPage>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderIssues() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/issues"]}>
        <Routes>
          <Route path="/projects/:projectId/issues" element={<IssueListPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function pickFilter(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  const filters = within(screen.getByTestId("issue-filter-bar"));
  await user.click(filters.getByRole("button", { name }));
  // 패널은 DS Popover(포털) — 필터 줄 밖에 그려진다
  const panel = await screen.findByRole("radiogroup", { name: `${name} 필터` });
  await user.click(within(panel).getByRole("radio", { name: value }));
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});

afterEach(() => vi.restoreAllMocks());

describe("IssueListPage 조회 수명주기", () => {
  it("전체 라벨 조회가 지연되어도 첫 페이지와 담당자를 먼저 보여주고 준비되지 않은 작업만 잠근다", async () => {
    const initial = await store.listIssuesPage("p1", {}, { page: 0, size: 50 });
    const labels = deferred<string[]>();
    const pages = vi.spyOn(store, "listIssuesPage").mockImplementation(async (_id, _filter, paging) => ({
      ...initial, ...paging, total: 51,
    }));
    vi.spyOn(store, "listProjectLabels").mockReturnValue(labels.promise);
    const all = vi.spyOn(store, "listIssues");
    renderIssues();

    const table = await screen.findByRole("table", { name: "이슈 목록" });
    expect(within(table).getByText("ALM-1")).toBeInTheDocument();
    expect(await within(table).findByText("박준영")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "필터 정보 불러오는 중" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ALM-1 선택" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^CSV 내보내기/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CSV 가져오기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "다음" }));
    await waitFor(() => expect(pages).toHaveBeenLastCalledWith("p1", expect.anything(), { page: 1, size: 50 }, undefined));

    await act(async () => labels.resolve(["frontend"]));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "ALM-1 선택" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "CSV 가져오기" })).toBeEnabled();
    // 라벨 선택지는 서버 DISTINCT — 프로젝트 이슈 전량을 읽지 않는다
    expect(all).not.toHaveBeenCalled();
  });

  it("연속 입력은 한 번 검색하고 필터·초기화에서 프로젝트 메타데이터를 다시 조회하지 않는다", async () => {
    const user = userEvent.setup();
    const pages = vi.spyOn(store, "listIssuesPage");
    const metadata = [
      vi.spyOn(store, "listUsers"), vi.spyOn(store, "listProjectLabels"),
      vi.spyOn(store, "listSprints"), vi.spyOn(store, "listProjectStatuses"),
      vi.spyOn(store, "listComponents"), vi.spyOn(store, "resolveSettings"),
    ];
    renderIssues();
    await screen.findByText("ALM-1");

    const search = screen.getByRole("textbox", { name: "검색" });
    fireEvent.change(search, { target: { value: "구" } });
    fireEvent.change(search, { target: { value: "구현" } });
    await waitFor(() => expect(screen.queryByText("ALM-1")).not.toBeInTheDocument());
    expect(pages).toHaveBeenCalledTimes(2);
    expect(pages).toHaveBeenLastCalledWith("p1", expect.objectContaining({ text: "구현" }), { page: 0, size: 50 }, undefined);

    await pickFilter(user, "상태", "할 일");
    await waitFor(() => expect(screen.queryByText("ALM-2")).not.toBeInTheDocument());
    expect(screen.getByText("2개 조건 적용")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "필터 초기화" }));
    await screen.findByText("ALM-1");
    expect(search).toHaveValue("");
    expect(pages).toHaveBeenCalledTimes(4);
    metadata.forEach((request) => expect(request).toHaveBeenCalledTimes(1));
  });

  it("조회 중 이전 결과를 표시하되 작업을 잠그고 늦게 도착한 이전 검색 응답을 버린다", async () => {
    const initial = await store.listIssuesPage("p1", {}, { page: 0, size: 50 });
    const older = deferred<IssuePage>();
    const newer = deferred<IssuePage>();
    const pages = vi.spyOn(store, "listIssuesPage").mockImplementation(async (_id, filter) => {
      if (filter?.text === "이전") return older.promise;
      if (filter?.text === "최신") return newer.promise;
      return initial;
    });
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");
    await user.click(screen.getByRole("checkbox", { name: "ALM-1 선택" }));

    const search = screen.getByRole("textbox", { name: "검색" });
    fireEvent.change(search, { target: { value: "이전" } });
    await waitFor(() => expect(pages).toHaveBeenCalledTimes(2));
    expect(screen.getByText("결과 업데이트 중 · 이전 결과 표시")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ALM-1 선택" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "대량 변경" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^CSV 내보내기/ })).toBeDisabled();

    fireEvent.change(search, { target: { value: "최신" } });
    await waitFor(() => expect(pages).toHaveBeenCalledTimes(3));
    await act(async () => newer.resolve({ ...initial, items: [{ ...initial.items[1], title: "최신 결과" }], total: 1 }));
    await screen.findByText("최신 결과");
    await act(async () => older.resolve({ ...initial, items: [{ ...initial.items[0], title: "지난 결과" }], total: 1 }));
    expect(screen.getByText("최신 결과")).toBeInTheDocument();
    expect(screen.queryByText("지난 결과")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^CSV 내보내기/ })).toBeEnabled();
  });

  it("최초 조회 실패를 빈 목록으로 숨기지 않고 재시도로 복구한다", async () => {
    vi.spyOn(store, "listIssuesPage").mockRejectedValueOnce(new Error("네트워크 연결을 확인해 주세요"));
    const user = userEvent.setup();
    renderIssues();
    expect(await screen.findByRole("alert")).toHaveTextContent("네트워크 연결을 확인해 주세요");
    expect(screen.queryByText("아직 이슈가 없습니다")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("ALM-1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("필터 정보 실패를 알리고 별도로 다시 불러온다", async () => {
    vi.spyOn(store, "listComponents").mockRejectedValueOnce(new Error("필터 서비스에 연결할 수 없습니다"));
    const pages = vi.spyOn(store, "listIssuesPage");
    const user = userEvent.setup();
    renderIssues();
    expect(await screen.findByRole("alert")).toHaveTextContent("필터 정보를 불러오지 못했습니다");
    await screen.findByText("ALM-1");
    expect(screen.getByRole("button", { name: "CSV 가져오기" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "필터 다시 불러오기" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "CSV 가져오기" })).toBeEnabled());
    expect(pages).toHaveBeenCalledTimes(1);
  });

  it("다음 페이지에서 컴포넌트를 바꾸면 한 번의 조회로 첫 페이지와 빈 결과 도구를 보여준다", async () => {
    const initial = await store.listIssuesPage("p1", {}, { page: 0, size: 50 });
    vi.spyOn(store, "listComponents").mockResolvedValue([{
      id: "c1", projectId: "p1", name: "API", description: "", leadId: null,
      defaultAssignee: "project", issueCount: 0, createdAt: "2026-10-16T00:00:00Z",
    }]);
    const pages = vi.spyOn(store, "listIssuesPage").mockImplementation(async (_id, filter, paging) => (
      filter?.componentId
        ? { items: [], total: 0, truncated: false, ...paging }
        : { ...initial, total: 51, ...paging, items: paging.page === 0 ? initial.items : [initial.items[0]] }
    ));
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");
    await user.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("51–51 / 51건");
    pages.mockClear();
    await pickFilter(user, "컴포넌트", "API");
    await screen.findByText("조건에 맞는 이슈가 없습니다");
    expect(pages).toHaveBeenCalledTimes(1);
    expect(pages).toHaveBeenLastCalledWith("p1", expect.objectContaining({ componentId: "c1" }), { page: 0, size: 50 }, undefined);
    expect(screen.getByRole("toolbar", { name: "이슈 목록 도구" })).toHaveTextContent("0건");
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CSV 가져오기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^CSV 내보내기/ })).toBeDisabled();
  });

  it("정렬은 서버로 보내 첫 페이지부터 다시 읽고, 늦게 온 이전 정렬 응답은 버린다", async () => {
    const initial = await store.listIssuesPage("p1", {}, { page: 0, size: 50 });
    const byTitle = deferred<IssuePage>();
    const pages = vi.spyOn(store, "listIssuesPage").mockImplementation(async (_id, _filter, paging, sort) => {
      if (sort?.field === "title" && sort.dir === "asc") return byTitle.promise;
      if (sort?.field === "title") return { ...initial, ...paging, total: 51, items: [{ ...initial.items[0], title: "제목 내림차순 결과" }] };
      return { ...initial, ...paging, total: 51 };
    });
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");
    await user.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("51–51 / 51건");

    await user.click(screen.getByRole("button", { name: /^제목/ }));
    await waitFor(() =>
      expect(pages).toHaveBeenLastCalledWith("p1", expect.anything(), { page: 0, size: 50 }, { field: "title", dir: "asc" }),
    );
    await user.click(screen.getByRole("button", { name: /^제목/ }));
    await screen.findByText("제목 내림차순 결과");
    expect(pages).toHaveBeenLastCalledWith("p1", expect.anything(), { page: 0, size: 50 }, { field: "title", dir: "desc" });
    // 오름차순 응답이 늦게 와도 화면을 덮지 못한다
    await act(async () => byTitle.resolve({ ...initial, items: [{ ...initial.items[0], title: "늦은 오름차순 결과" }], total: 51 }));
    expect(screen.getByText("제목 내림차순 결과")).toBeInTheDocument();
    expect(screen.queryByText("늦은 오름차순 결과")).not.toBeInTheDocument();
  });

  it("담당자 열은 서버가 정렬하지 못하므로 정렬 버튼을 내지 않는다", async () => {
    renderIssues();
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    const header = within(table).getByRole("columnheader", { name: /담당자/ });
    expect(within(header).queryByRole("button", { name: /담당자/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: /^수정일/ })).toBeInTheDocument();
  });

  it("CSV 내보내기는 범위(현재 페이지·선택)를 버튼과 알림에 그대로 밝힌다", async () => {
    const initial = await store.listIssuesPage("p1", {}, { page: 0, size: 50 });
    vi.spyOn(store, "listIssuesPage").mockResolvedValue({ ...initial, total: 120 });
    // jsdom에는 object URL이 없다 — 이 테스트 동안만 붙인다
    const urlApi = URL as unknown as { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void };
    urlApi.createObjectURL = () => "blob:csv";
    urlApi.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");
    const exportButton = await screen.findByRole("button", { name: `CSV 내보내기 (현재 페이지 ${initial.items.length}건)` });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await user.click(exportButton);
    expect(await screen.findByText(`현재 페이지의 ${initial.items.length}개 이슈를 CSV로 내보냈습니다`)).toBeInTheDocument();
    expect(screen.getByText(`조건에 맞는 전체 120건 중 ${initial.items.length}건입니다.`)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "ALM-1 선택" }));
    expect(screen.getByRole("button", { name: "CSV 내보내기 (선택 1건)" })).toBeInTheDocument();
    delete urlApi.createObjectURL;
    delete urlApi.revokeObjectURL;
  });
});
