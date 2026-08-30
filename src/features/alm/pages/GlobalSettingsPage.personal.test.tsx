import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getMyPreferences, saveBanner, saveMyPreferences } from "../store/jiraStore";
import { recordProjectVisit } from "../store/uiStore";

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
  sessionStorage.clear();
  __resetForTest();
});

describe("개인 설정 (지라 개인 설정 > 일반·알림)", () => {
  it("알림 토글과 시작 화면을 저장하면 스토어에 반영된다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/personal");
    expect(await screen.findByRole("heading", { name: "개인 설정" })).toBeInTheDocument();
    const commented = await screen.findByRole("switch", { name: "관찰 중인 이슈에 코멘트가 달릴 때" });
    expect(commented).toBeChecked();
    await user.click(commented);
    await user.click(screen.getByRole("switch", { name: "내가 수정한 이슈" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("개인 설정을 저장했습니다")).toBeInTheDocument();
    const prefs = await getMyPreferences();
    expect(prefs.notifications.commented).toBe(false);
    expect(prefs.autoWatch.edited).toBe(true);
  });

  it("시작 화면이 '마지막으로 본 프로젝트'면 루트 진입이 그 프로젝트 보드로 간다", async () => {
    await saveMyPreferences({ startPage: "last-project" });
    await recordProjectVisit("p1");
    renderAt("/");
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects\/p1\/boards?/);
    });
  });

  it("시작 화면이 홈(기본)이면 루트 진입이 홈으로 간다", async () => {
    renderAt("/");
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/home");
    });
  });
});

describe("공지 배너", () => {
  it("켜진 배너는 모든 화면 상단에 뜨고 닫으면 이 세션에서 숨는다", async () => {
    const user = userEvent.setup();
    await saveBanner({ enabled: true, level: "warning", message: "오늘 22시 점검" });
    renderAt("/projects");
    const banner = await screen.findByTestId("announcement-banner");
    expect(within(banner).getByText("오늘 22시 점검")).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "공지 닫기" }));
    expect(screen.queryByTestId("announcement-banner")).not.toBeInTheDocument();
  });

  it("관리 화면에서 배너를 켜면 바로 상단에 나타난다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/banner");
    expect(await screen.findByRole("heading", { name: "공지 배너" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "배너 표시" }));
    await user.type(screen.getByLabelText("내용"), "배포 중입니다");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("공지 배너를 켰습니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-banner")).toHaveTextContent("배포 중입니다");
    });
  });
});
