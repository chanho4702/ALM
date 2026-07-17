import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createProject } from "../store/jiraStore";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderProjects() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects"]}>
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

describe("ProjectListPage (프로젝트 디렉터리)", () => {
  it("프로젝트 카드에 이름/키/설명/이슈 수를 보여준다", async () => {
    renderProjects();

    const card = (await screen.findByRole("heading", { name: "ALM 플랫폼" })).closest(
      ".project-card",
    ) as HTMLElement;
    expect(within(card).getByText("ALM")).toBeInTheDocument();
    expect(within(card).getByText("스틸 블루 디자인 시스템 기반 ALM 데모")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(card).getByText("이슈 8개")).toBeInTheDocument();
    });
  });

  it("카드의 보드 버튼 → 해당 프로젝트 보드로 이동한다", async () => {
    const user = userEvent.setup();
    renderProjects();
    await screen.findByRole("heading", { name: "ALM 플랫폼" });

    await user.click(screen.getByRole("button", { name: "보드" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board");
    });
  });

  it("관리 Dropdown의 설정 → 설정 페이지로 이동한다", async () => {
    const user = userEvent.setup();
    renderProjects();
    await screen.findByRole("heading", { name: "ALM 플랫폼" });

    await user.click(screen.getByRole("button", { name: "ALM 플랫폼 관리" }));
    await user.click(await screen.findByRole("menuitem", { name: "설정" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/settings");
    });
  });

  it("삭제는 이슈 개수를 경고한 뒤 프로젝트를 제거한다", async () => {
    await createProject({ key: "PAY", name: "결제 서비스" }); // 삭제 후에도 카드가 남도록 2번째 프로젝트
    const user = userEvent.setup();
    renderProjects();
    await screen.findByRole("heading", { name: "결제 서비스" });

    await user.click(screen.getByRole("button", { name: "ALM 플랫폼 관리" }));
    await user.click(await screen.findByRole("menuitem", { name: "삭제" }));

    const dialog = await screen.findByRole("dialog", { name: "프로젝트 삭제" });
    expect(within(dialog).getByText(/이슈 8개가 함께 삭제됩니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "ALM 플랫폼" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "결제 서비스" })).toBeInTheDocument();
  });
});
