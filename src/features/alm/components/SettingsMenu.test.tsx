import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const realLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location")!;

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

afterEach(() => {
  Object.defineProperty(window, "location", realLocationDescriptor);
});

describe("⚙ 설정 메뉴 (지라 설정 드롭다운 구조)", () => {
  it("그룹 제목 아래 아이콘·이름·설명 항목이 있고, 고르면 해당 설정 화면으로 간다", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects"]}>
          <App />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>,
    );
    await screen.findByRole("table", { name: "프로젝트 목록" });
    await user.click(screen.getByRole("button", { name: "설정" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("개인 설정")).toBeInTheDocument();
    expect(within(menu).getByText("ALM 관리자 설정")).toBeInTheDocument();
    const notifications = within(menu).getByRole("menuitem", { name: /알림 설정/ });
    expect(notifications).toHaveTextContent("앱 내 알림을 받을지");
    expect(within(menu).getByRole("menuitem", { name: /이슈 항목/ })).toHaveTextContent("워크플로 스킴");
    await user.click(notifications);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/settings/notifications");
    });
    expect(await screen.findByRole("switch", { name: "이슈가 나에게 배정될 때" })).toBeInTheDocument();
    // 설정 사이드바는 그룹으로 묶인다
    const nav = screen.getByRole("navigation", { name: "설정 메뉴" });
    expect(within(nav).getByText("이슈 항목")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "알림 설정" })).toHaveAttribute("aria-current", "page");
  });

  it("개인 설정 그룹의 'API 토큰'은 계정 포털로 전체 페이지 이동한다", async () => {
    const assign = vi.fn();
    // 토큰 화면은 다른 SPA(myFront /app)라 라우터가 아니라 window.location으로 나간다.
    // jsdom의 실제 assign은 "Not implemented"를 던지므로 스텁으로 바꿔 호출만 확인한다.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects"]}>
          <App />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>,
    );
    await screen.findByRole("table", { name: "프로젝트 목록" });
    await user.click(screen.getByRole("button", { name: "설정" }));
    const menu = await screen.findByRole("menu");
    const tokens = within(menu).getByRole("menuitem", { name: /API 토큰/ });
    expect(tokens).toHaveTextContent("개인 토큰");
    await user.click(tokens);
    expect(assign).toHaveBeenCalledWith("/app/tokens");
    // 라우터는 그대로 — 전체 이동이라 SPA 경로는 바뀌지 않는다
    expect(screen.getByTestId("location")).toHaveTextContent("/projects");
  });
});
