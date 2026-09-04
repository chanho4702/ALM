import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
// 이 화면은 App에서 lazy()로 쪼개져 있다. 전체 스위트를 병렬로 돌릴 때 첫 findBy가 청크 로딩까지
// 기다리다 한도(5s)를 넘기므로, 수집 시점에 미리 올려 lazy 해석이 즉시 끝나게 한다.
import "./TimelinePage";
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

  it("SVG 계측이 없는 환경에서는 그래픽 대신 사유와 표를 보여준다", async () => {
    renderTimeline();

    // jsdom에는 getBBox가 없다 — 침묵 실패가 아니라 상태로 드러나야 한다
    expect(await screen.findByText(/간트 그래픽을 그릴 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "일정 표" })).toBeInTheDocument();
  });

  // 보기 단위 전환 자체는 간트가 그려지는 환경에서만 의미가 있다(jsdom은 항상 대체본).
  // 여기서는 "차트가 없을 때 차트 전용 조작을 감추는지"를 지킨다.
  it("대체본에서는 오늘·보기 단위 같은 차트 전용 조작을 감춘다", async () => {
    renderTimeline();

    await screen.findByTestId("timeline");
    expect(screen.queryByRole("group", { name: "보기 단위" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "오늘" })).not.toBeInTheDocument();
    // 요약은 남는다 — 몇 건이 어느 기간에 걸쳐 있는지는 표에서도 유효하다
    expect(screen.getByText(/이슈 8개/)).toBeInTheDocument();
  });
});
