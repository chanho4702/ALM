import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
// 설정 화면은 lazy 청크 — 수집 시점에 미리 올려 첫 findBy가 청크 로딩을 기다리지 않게 한다
import "../pages/ProjectSettingsPage";
import { __resetForTest } from "../store/jiraStore";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
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
});

describe("설정 셸 — 설정은 뷰 탭이 아니라 전용 사이드바가 있는 별도 페이지다", () => {
  it("프로젝트 설정: /general로 열리고, 뷰 탭·전역 사이드바 대신 설정 메뉴가 선다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings");

    const nav = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/settings/general");
    });
    expect(screen.queryByRole("navigation", { name: "프로젝트 뷰" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "전역 내비게이션" })).not.toBeInTheDocument();
    expect(within(nav).getByText("ALM 플랫폼")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();

    // 메뉴로 구획 이동 — URL이 바뀌고 해당 구획만 보인다
    await user.click(within(nav).getByRole("button", { name: "워크플로" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/settings/workflow");
    expect(await screen.findByTestId("statuses-readonly")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "일반" })).not.toBeInTheDocument();

    // 돌아가기 — 프로젝트 보드로, 전역 사이드바가 다시 선다
    await user.click(within(nav).getByRole("button", { name: "프로젝트로 돌아가기" }));
    expect(await screen.findByRole("navigation", { name: "전역 내비게이션" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects\/p1\/boards\//);
    });
  });

  it("전역 관리: /settings/types로 열리고 사이드바 메뉴로 측면을 바꾼다", async () => {
    const user = userEvent.setup();
    renderAt("/settings");

    const nav = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/settings/types");
    });
    expect(screen.queryByRole("navigation", { name: "전역 내비게이션" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "이슈 타입 편집" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "워크플로 스킴" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/settings/workflows");
    expect(await screen.findByRole("button", { name: "기본 스킴 워크플로 편집" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "홈으로" }));
    expect(await screen.findByRole("heading", { name: /안녕하세요/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "전역 내비게이션" })).toBeInTheDocument();
  });
});
