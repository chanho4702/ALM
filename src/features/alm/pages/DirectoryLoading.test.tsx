import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import type { ReactNode } from "react";
import * as store from "../store/jiraStore";
import type { User } from "../store/types";
import { HomePage } from "./HomePage";
import { ProjectListPage } from "./ProjectListPage";

function renderPage(page: ReactNode) {
  return render(<ToastProvider><MemoryRouter>{page}</MemoryRouter></ToastProvider>);
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("디렉터리 조회와 복구", () => {
  it("이슈 본문 전체 대신 작은 페이지의 total을 개수로 사용한다", async () => {
    const projects = await store.listProjects();
    const page = vi.spyOn(store, "listIssuesPage").mockResolvedValue({ items: [], page: 0, size: 1, total: 1250 });
    const all = vi.spyOn(store, "listIssues");
    renderPage(<ProjectListPage projects={projects} onProjectsChanged={() => {}} />);
    expect(await screen.findByText("1250개")).toBeInTheDocument();
    expect(page).toHaveBeenCalledExactlyOnceWith(projects[0].id, undefined, { page: 0, size: 1 });
    expect(all).not.toHaveBeenCalled();
  });

  it("검색어가 없어도 보관 프로젝트를 숨기고 스위치로 다시 표시한다", async () => {
    const projects = (await store.listProjects()).map((p) => ({ ...p, archivedAt: new Date().toISOString() }));
    const user = userEvent.setup();
    renderPage(<ProjectListPage projects={projects} onProjectsChanged={() => {}} />);
    expect(screen.queryByRole("table", { name: "프로젝트 목록" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "보관된 프로젝트 보기" }));
    const table = await screen.findByRole("table", { name: "프로젝트 목록" });
    expect(within(table).getByText(projects[0].name)).toBeInTheDocument();
    expect(within(table).getByText("보관됨")).toBeInTheDocument();
  });

  it("일부 개수 조회 실패를 0으로 표시하지 않고 성공한 개수는 보존하며 재시도한다", async () => {
    await store.createProject({ key: "PAY", name: "결제 서비스" });
    const projects = await store.listProjects();
    const original = store.listIssuesPage;
    vi.spyOn(store, "listIssuesPage").mockImplementationOnce(async () => { throw new Error("일시 장애"); });
    const user = userEvent.setup();
    renderPage(<ProjectListPage projects={projects} onProjectsChanged={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("1개 프로젝트의 이슈 수를 불러오지 못했습니다");
    const table = screen.getByRole("table", { name: "프로젝트 목록" });
    expect(within(table).getByText("확인 불가")).toBeInTheDocument();
    expect(within(table).getByText("0개")).toBeInTheDocument();
    vi.mocked(store.listIssuesPage).mockImplementation(original);
    await user.click(screen.getByRole("button", { name: "이슈 수 다시 불러오기" }));
    expect(await within(table).findByText("8개")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("홈 로딩", () => {
  it("느린 사용자 조회를 기다리지 않고 목적별 서버 검색을 시작한다(프로젝트 이슈 전량은 읽지 않는다)", async () => {
    const currentUser = await store.getCurrentUser();
    let resolveUser!: (user: User) => void;
    vi.spyOn(store, "getCurrentUser").mockReturnValue(new Promise((resolve) => { resolveUser = resolve; }));
    const all = vi.spyOn(store, "listIssues");
    const search = vi.spyOn(store, "findIssues");
    renderPage(<HomePage />);
    // 최근 15건·기한 지남·마감 임박·담당자 필요 — 사용자 없이도 바로 나간다
    await waitFor(() => expect(search).toHaveBeenCalledTimes(4));
    expect(search).toHaveBeenCalledWith({}, { page: 0, size: 15 }, { field: "updated", dir: "desc" });
    expect(screen.queryByRole("heading", { name: /안녕하세요/ })).not.toBeInTheDocument();
    resolveUser(currentUser);
    expect(await screen.findByRole("heading", { name: /안녕하세요/ })).toBeInTheDocument();
    // "나에게 배정됨"은 사용자를 안 뒤 미완료만, 상한을 두고 묻는다
    expect(search).toHaveBeenCalledWith(
      { assigneeIds: [currentUser.id], openOnly: true },
      { page: 0, size: 50 },
      { field: "updated", dir: "desc" },
    );
    expect(search).toHaveBeenCalledTimes(5);
    expect(all).not.toHaveBeenCalled();
  });

  it("홈 조회 실패 후 무한 로딩 대신 다시 시도할 수 있다", async () => {
    vi.spyOn(store, "listProjects").mockRejectedValueOnce(new Error("연결을 확인해 주세요"));
    const user = userEvent.setup();
    renderPage(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("홈을 불러오지 못했습니다");
    expect(screen.getByText("연결을 확인해 주세요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: /안녕하세요/ })).toBeInTheDocument();
  });
});
