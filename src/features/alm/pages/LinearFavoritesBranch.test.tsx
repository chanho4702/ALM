import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import { listFavorites } from "../store/uiStore";
import "../components/IssueDetailModal";
import "./IssueListPage";

/** Linear 강점 반영 — 즐겨찾기(사이드바)·git 브랜치 이름 복사(⌘⇧. · 팔레트 · 우클릭 · 상세) */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetCommandScopeForTest();
});

afterEach(() => vi.restoreAllMocks());

const globalNav = () => screen.getByRole("navigation", { name: "전역 내비게이션" });
const location = () => screen.getByTestId("location").textContent;

async function openIssueList() {
  renderAt("/projects/p1/issues");
  const table = await screen.findByRole("table", { name: "이슈 목록" });
  await within(table).findByText("ALM-1");
  return table;
}
const rowOf = (table: HTMLElement, key: string) => within(table).getByText(key).closest("tr")!;

describe("즐겨찾기 (Linear Favorites)", () => {
  it("이슈 상세의 별표로 고정하면 사이드바 '즐겨찾기'에 나오고, 누르면 그 이슈가 열리고, 해제하면 사라진다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues?issue=ALM-3");
    const dialog = await screen.findByRole("dialog", { name: /ALM-3|이슈/ });
    const star = await within(dialog).findByRole("button", { name: "즐겨찾기" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(await listFavorites()).toEqual([expect.objectContaining({ kind: "issue", id: "ALM-3", projectId: "p1" })]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const section = await within(globalNav()).findByTestId("nav-favorites");
    const item = within(section).getByRole("button", { name: /^ALM-3 (?!.*즐겨찾기 해제)/ });
    await user.click(item);
    await waitFor(() => expect(location()).toBe("/projects/p1/issues?issue=ALM-3"));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(within(section).getByRole("button", { name: /ALM-3 .* 즐겨찾기 해제/ }));
    await waitFor(() => expect(within(globalNav()).queryByTestId("nav-favorites")).not.toBeInTheDocument());
  });

  it("우클릭 메뉴·팔레트에서 즐겨찾기에 추가 — 프로젝트도 팔레트로 고정하고 Alt+↑로 순서를 바꾼다", async () => {
    const user = userEvent.setup();
    const table = await openIssueList();
    fireEvent.contextMenu(within(rowOf(table, "ALM-2")).getByText("ALM-2"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "즐겨찾기에 추가" }));
    const section = await within(globalNav()).findByTestId("nav-favorites");
    expect(within(section).getByRole("button", { name: /^ALM-2 (?!.*즐겨찾기 해제)/ })).toBeInTheDocument();

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "명령 팔레트" });
    await user.keyboard("프로젝트를 즐겨찾기");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "명령 팔레트" })).not.toBeInTheDocument());
    expect(palette).not.toBeInTheDocument();
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(2));
    const names = () => within(section).getAllByRole("listitem").map((li) => li.getAttribute("data-favorite"));
    expect(names()).toEqual(["issue:ALM-2", "project:p1"]);

    // 끌기 대체 — 항목에서 Alt+↑
    const projectItem = within(section).getByRole("button", { name: "ALM 플랫폼" });
    projectItem.focus();
    fireEvent.keyDown(projectItem, { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(names()).toEqual(["project:p1", "issue:ALM-2"]));
  });

  it("사용자별로 저장된다 — 다른 사용자 자리에는 남의 즐겨찾기가 없다", async () => {
    const { setUiUser, toggleFavorite } = await import("../store/uiStore");
    setUiUser("u1");
    await toggleFavorite({ kind: "issue", id: "ALM-1", label: "ALM-1 x", projectId: "p1" });
    setUiUser("u2");
    expect(await listFavorites()).toEqual([]);
    setUiUser("u1");
    expect((await listFavorites()).map((f) => f.id)).toEqual(["ALM-1"]);
  });
});

describe("git 브랜치 이름 복사", () => {
  it("목록 커서에서 Ctrl+Shift+. — 키 소문자 + 제목 슬러그(음역 없음)를 복사한다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    await user.keyboard("j");
    await user.keyboard("{Control>}{Shift>}.{/Shift}{/Control}");
    // 시드 ALM-1 제목은 한글 — 슬러그가 비어 키만 남는다(README 규칙)
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("alm-1"));
    expect(await screen.findByText(/브랜치 이름 alm-1을\(를\) 복사했습니다/)).toBeInTheDocument();
  });

  it("상세의 브랜치 버튼과 팔레트 명령 '브랜치 이름 복사'", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues?issue=ALM-2");
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "브랜치 이름 복사" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toMatch(/^alm-2/));
    await navigator.clipboard.writeText("");

    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "명령 팔레트" });
    await user.keyboard("브랜치 이름");
    const option = screen.getByRole("option", { name: /브랜치 이름 복사/ });
    expect(option).toHaveAttribute("aria-keyshortcuts");
    await user.keyboard("{Enter}");
    await waitFor(async () => expect(await navigator.clipboard.readText()).toMatch(/^alm-2/));
  });
});
