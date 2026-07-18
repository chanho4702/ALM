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
  it("프로젝트 이슈 전체가 행으로 렌더되고, 마감일 있는 이슈는 여러 날 막대를 가진다", async () => {
    renderTimeline();

    const timeline = await screen.findByTestId("timeline");
    // 시드 이슈 8개 = 좌측 행 8개
    for (const key of ["ALM-1", "ALM-4", "ALM-8"]) {
      expect(within(timeline).getByText(key)).toBeInTheDocument();
    }
    // 막대 8개 (마감일 없는 이슈도 하루짜리 막대)
    const bars = within(timeline).getAllByRole("button", { name: /타임라인 막대/ });
    expect(bars).toHaveLength(8);

    // 마감일 있는 ALM-4(오늘~+7일)는 하루짜리(ALM-7)보다 넓다
    const wide = bars.find((b) => b.getAttribute("aria-label")?.startsWith("ALM-4"))!;
    const dot = bars.find((b) => b.getAttribute("aria-label")?.startsWith("ALM-7"))!;
    expect(parseInt(wide.style.width)).toBeGreaterThan(parseInt(dot.style.width));
  });

  it("막대를 클릭하면 이슈 상세 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderTimeline();

    const timeline = await screen.findByTestId("timeline");
    await user.click(
      within(timeline)
        .getAllByRole("button", { name: /타임라인 막대/ })
        .find((b) => b.getAttribute("aria-label")?.startsWith("ALM-2"))!,
    );
    expect(await screen.findByRole("dialog", { name: "ALM-2" })).toBeInTheDocument();
  });
});

describe("타임라인 에픽 그룹핑", () => {
  it("에픽 행 바로 아래에 자식이 들여쓰기로 나열된다", async () => {
    renderTimeline();
    const timeline = await screen.findByTestId("timeline");

    const rowButtons = Array.from(
      timeline.querySelectorAll<HTMLButtonElement>(".timeline-issue"),
    );
    const keys = rowButtons.map((b) => b.textContent?.match(/ALM-\d+/)?.[0]);
    // 에픽 ALM-4가 먼저, 자식 ALM-2가 바로 다음
    const epicIndex = keys.indexOf("ALM-4");
    expect(epicIndex).toBeGreaterThanOrEqual(0);
    expect(keys[epicIndex + 1]).toBe("ALM-2");
    expect(rowButtons[epicIndex + 1]).toHaveClass("is-child");
    expect(rowButtons[epicIndex]).not.toHaveClass("is-child");
  });
});
