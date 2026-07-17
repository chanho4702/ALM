import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/settings"]}>
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

describe("ProjectSettingsPage", () => {
  it("이름/설명을 수정하면 전역 사이드바에도 반영된다 (키는 읽기 전용 표시)", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole("heading", { name: "프로젝트 설정" })).toBeInTheDocument();
    expect(screen.getByText("ALM", { selector: ".issue-key-cell" })).toBeInTheDocument(); // 키 표시
    expect(screen.queryByLabelText("키")).not.toBeInTheDocument(); // 입력 필드는 아님

    const nameField = screen.getByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "ALM 플랫폼 v2");
    await user.click(screen.getByRole("button", { name: "저장" }));

    const projectSection = within(
      screen.getByRole("navigation", { name: "전역 내비게이션" }),
    ).getByTestId("nav-projects");
    await waitFor(() => {
      expect(
        within(projectSection).getByRole("button", { name: "ALM 플랫폼 v2" }),
      ).toBeInTheDocument();
    });
  });

  it("위험 구역에서 삭제하면 확인 후 디렉터리로 이동한다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "프로젝트 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "프로젝트 삭제" });
    expect(within(dialog).getByText(/이슈 8\s*개가 함께 삭제됩니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
    // 마지막 프로젝트였으므로 빈 상태
    expect(
      await screen.findByRole("heading", { name: "아직 프로젝트가 없습니다" }),
    ).toBeInTheDocument();
  });
});
