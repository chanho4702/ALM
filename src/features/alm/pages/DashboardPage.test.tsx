import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("활성 스프린트 카드가 담은 이슈와 완료 건수를 보여준다", async () => {
    renderDashboard();

    // 시드 Sprint 1(active): i1~i5 중 i1만 완료
    const card = await screen.findByRole("region", { name: "활성 스프린트" });
    expect(within(card).getByText("Sprint 1")).toBeInTheDocument();
    expect(within(card).getByText("5개 중 1개 완료")).toBeInTheDocument();
  });

  it("완료 진행 카드가 완료율과 마감 위험 건수를 보여준다", async () => {
    renderDashboard();

    // 시드: 전체 8건 중 완료 1건 → 13%, 마감 +7일인 미완료 2건(ALM-2·ALM-4)
    const card = await screen.findByRole("region", { name: "완료 진행" });
    expect(within(card).getByText("13%")).toBeInTheDocument();
    expect(within(card).getByText("마감 임박 2건")).toBeInTheDocument();
    expect(within(card).getByText("지연 0건")).toBeInTheDocument();
  });

  it("상태별 분포가 워크플로 상태 순서대로 개수를 보여준다", async () => {
    renderDashboard();

    const card = await screen.findByRole("region", { name: "상태별 분포" });
    const rows = within(card).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "할 일5건",
      "진행 중2건",
      "완료1건",
    ]);
  });

  it("마감 임박 목록의 이슈를 누르면 상세 모달이 열린다", async () => {
    renderDashboard();
    const user = userEvent.setup();

    const card = await screen.findByRole("region", { name: "마감 임박·지연" });
    await user.click(within(card).getByRole("button", { name: /ALM-2/ }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("칸반 보드 UI 구현");
  });

  it("담당자별 이슈 개수를 표시한다 (미지정 포함)", async () => {
    renderDashboard();

    const list = await screen.findByTestId("assignee-stats");
    // 시드: 김찬호 2(i1,i3) / 이서연 1 / 박준영 1 / 최다인 1 / 미지정 3(i5,i7,i8)
    const rowOf = (name: string) => within(list).getByText(name).closest("li")!;
    expect(within(rowOf("김찬호")).getByText("2건")).toBeInTheDocument();
    expect(within(rowOf("이서연")).getByText("1건")).toBeInTheDocument();
    // 미지정은 항상 마지막 행이다
    expect(within(rowOf("미지정")).getByText("3건")).toBeInTheDocument();
    expect(list.lastElementChild).toHaveTextContent("미지정");
  });
});
