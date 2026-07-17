import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname+search를 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderHome() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/home"]}>
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

describe("HomePage (For you)", () => {
  it("내 담당 이슈를 보여준다 (시드: 김찬호 = ALM-1, ALM-3)", async () => {
    renderHome();

    const mine = await screen.findByTestId("my-issues");
    expect(within(mine).getByText("ALM-1")).toBeInTheDocument();
    expect(within(mine).getByText("ALM-3")).toBeInTheDocument();
    expect(within(mine).queryByText("ALM-4")).not.toBeInTheDocument(); // 박준영 담당
  });

  it("최근 업데이트 목록을 보여준다", async () => {
    renderHome();

    const recent = await screen.findByTestId("recent-issues");
    expect(within(recent).getAllByText(/ALM-\d+/).length).toBeGreaterThan(0);
  });

  it("이슈를 클릭하면 상세가 열린 이슈 목록으로 이동한다", async () => {
    const user = userEvent.setup();
    renderHome();

    const mine = await screen.findByTestId("my-issues");
    await user.click(within(mine).getByText("이슈 상세 모달 구현")); // ALM-3

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-3");
    });
    expect(await screen.findByRole("dialog", { name: "ALM-3" })).toBeInTheDocument();
  });
});
