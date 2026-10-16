import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { AppShell } from "./AppShell";
import { __resetForTest, listProjects } from "../store/jiraStore";
import { isSideNavCollapsed, setSideNavCollapsed } from "../store/uiStore";

let mobile: boolean;
let resize: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  mobile = true;
  resize = undefined;
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return mobile; },
    addEventListener: (_: string, listener: () => void) => { resize = listener; },
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => vi.unstubAllGlobals());

function LocationProbe() {
  const { pathname } = useLocation();
  return <p data-testid="mobile-location">{pathname}</p>;
}

async function renderShell(path = "/home") {
  const projects = await listProjects();
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell projects={projects} onProjectsChanged={() => {}} />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("모바일 셸", () => {
  it("메뉴가 기본 닫힘이고 Escape로 닫으면 메뉴 버튼에 포커스를 돌려준다", async () => {
    const user = userEvent.setup();
    await renderShell();
    expect(screen.queryByRole("navigation", { name: "전역 내비게이션" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "내비게이션 열기" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "내비게이션" });
    expect(within(dialog).getByRole("navigation", { name: "전역 내비게이션" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "설정" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("경로를 선택하면 메뉴를 닫고 설정 화면에서는 설정 메뉴를 연다", async () => {
    const user = userEvent.setup();
    await renderShell("/settings/personal");
    await user.click(screen.getByRole("button", { name: "내비게이션 열기" }));
    const dialog = await screen.findByRole("dialog", { name: "내비게이션" });
    const settings = within(dialog).getByRole("navigation", { name: "설정 메뉴" });
    await user.click(within(settings).getByRole("button", { name: "알림 설정" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("mobile-location")).toHaveTextContent("/settings/notifications");
  });

  it("모바일 메뉴는 펼쳐 보이고 넓은 화면으로 돌아가면 저장한 접힘 설정을 유지한다", async () => {
    const user = userEvent.setup();
    await setSideNavCollapsed(true);
    await renderShell("/projects/p1/board");
    await user.click(screen.getByRole("button", { name: "내비게이션 열기" }));
    const dialog = await screen.findByRole("dialog", { name: "내비게이션" });
    expect(within(dialog).getByRole("button", { name: "백로그" })).toBeInTheDocument();
    expect(await isSideNavCollapsed()).toBe(true);
    await act(async () => {
      mobile = false;
      resize?.();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "사이드바 펼치기" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "전역 검색" })).toBeInTheDocument();
  });

  it("검색 아이콘으로 입력 가능한 전역 검색 모달을 연다", async () => {
    const user = userEvent.setup();
    await renderShell();
    await user.click(screen.getByRole("button", { name: "이슈 검색 열기" }));
    await act(async () => vi.dynamicImportSettled());
    const dialog = await screen.findByRole("dialog", { name: "이슈 검색" });
    const input = within(dialog).getByRole("textbox", { name: "검색어" });
    expect(input).toHaveFocus();
    await user.type(input, "칸반");
    expect(await within(dialog).findByText("칸반 보드 UI 구현")).toBeInTheDocument();
  });
});
