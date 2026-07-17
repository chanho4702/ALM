import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

function renderDashboard() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/dashboard"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("DashboardPage", () => {
  it("상태별 이슈 개수를 표시한다 (시드: 전체 8 / 할 일 5 / 진행 중 2 / 완료 1)", async () => {
    renderDashboard();

    expect(await screen.findByTestId("stat-total")).toHaveTextContent("8");
    expect(screen.getByTestId("stat-todo")).toHaveTextContent("5");
    expect(screen.getByTestId("stat-inprogress")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-done")).toHaveTextContent("1");
  });

  it("담당자별 이슈 개수를 표시한다 (미지정 포함)", async () => {
    renderDashboard();

    const list = await screen.findByTestId("assignee-stats");
    // 시드: 김찬호 2(i1,i3) / 이서연 1 / 박준영 1 / 최다인 1 / 미지정 3(i5,i7,i8)
    const rowOf = (name: string) => within(list).getByText(name).closest("li")!;
    expect(within(rowOf("김찬호")).getByText("2개")).toBeInTheDocument();
    expect(within(rowOf("이서연")).getByText("1개")).toBeInTheDocument();
    expect(within(rowOf("미지정")).getByText("3개")).toBeInTheDocument();
  });
});
