import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

function renderTimeline() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/timeline"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("TimelinePage", () => {
  it("프로젝트 이슈 전체가 행으로 렌더되고 에픽 하위가 붙는다", async () => {
    renderTimeline();

    await screen.findByTestId("timeline");
    const legend = screen.getByRole("list", { name: "타임라인 이슈" });
    for (const key of ["ALM-1", "ALM-4", "ALM-8"]) {
      expect(within(legend).getByText(key)).toBeInTheDocument();
    }
    expect(within(legend).getAllByRole("listitem")).toHaveLength(8);
    // 에픽(ALM-4) 바로 다음에 그 하위(ALM-2)가 온다
    const keys = within(legend)
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    const epicIndex = keys.findIndex((text) => text.includes("ALM-4"));
    expect(keys[epicIndex + 1]).toContain("ALM-2");
  });

  it("일정 표는 시작·종료일을 보여주고 행을 누르면 상세가 열린다", async () => {
    const user = userEvent.setup();
    renderTimeline();

    const table = await screen.findByRole("table", { name: "일정 표" });
    const row = within(table).getByText("ALM-4").closest("tr")!;
    // 마감일이 있는 이슈는 종료일이 시작일과 다르다
    const cells = within(row).getAllByRole("cell");
    expect(cells[1].textContent).not.toBe(cells[2].textContent);

    await user.click(within(table).getByRole("button", { name: /ALM-4/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("백로그 화면 구현");
  });

  it("보기 단위를 바꿀 수 있다", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(await screen.findByRole("radio", { name: "주" }));

    expect(screen.getByRole("radio", { name: "주" })).toBeChecked();
  });
});
