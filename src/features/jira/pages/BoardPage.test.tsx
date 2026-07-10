import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, completeSprint } from "../store/jiraStore";

function renderBoard(initialPath = "/projects/p1/board") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("BoardPage", () => {
  it("활성 스프린트의 이슈만 상태별 3컬럼으로 렌더한다", async () => {
    renderBoard();

    // 컬럼별 카드 배치 (시드 기준)
    const todo = await screen.findByRole("region", { name: "할 일" });
    expect(within(todo).getByText("ALM-4")).toBeInTheDocument();
    expect(within(todo).getByText("ALM-5")).toBeInTheDocument();

    const inprogress = screen.getByRole("region", { name: "진행 중" });
    expect(within(inprogress).getByText("ALM-2")).toBeInTheDocument();
    expect(within(inprogress).getByText("ALM-3")).toBeInTheDocument();

    const done = screen.getByRole("region", { name: "완료" });
    expect(within(done).getByText("ALM-1")).toBeInTheDocument();

    // 백로그 이슈(sprintId=null)는 보드에 없다
    expect(screen.queryByText("ALM-6")).not.toBeInTheDocument();
    expect(screen.queryByText("ALM-7")).not.toBeInTheDocument();
    expect(screen.queryByText("ALM-8")).not.toBeInTheDocument();

    // 카드 구성: 제목 · 우선순위 Lozenge(한국어 라벨) · 담당자 Avatar
    expect(within(todo).getByText("백로그 화면 구현")).toBeInTheDocument(); // ALM-4 제목
    expect(within(todo).getByText("보통")).toBeInTheDocument(); // ALM-4 medium
    expect(within(todo).getByText("낮음")).toBeInTheDocument(); // ALM-5 low
    expect(within(todo).getByRole("img", { name: "박준영" })).toBeInTheDocument(); // ALM-4 담당자
    expect(within(done).getByText("높음")).toBeInTheDocument(); // ALM-1 high
  });

  it("활성 스프린트가 없으면 백로그로 유도하는 EmptyState를 보여준다", async () => {
    await completeSprint("s1"); // 시드의 활성 스프린트를 종료시킨다 (첫 호출이 시드도 생성)
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "진행 중인 스프린트가 없습니다" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "백로그로 이동" });
    expect(link).toHaveAttribute("href", "/projects/p1/backlog");
    // 컬럼은 렌더되지 않는다
    expect(screen.queryByRole("region", { name: "할 일" })).not.toBeInTheDocument();
  });
});
