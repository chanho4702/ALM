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

function renderBoard(initialPath: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
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

describe("IssueDetailModal", () => {
  it("?issue= 쿼리로 모달이 열리고, 상태 변경이 Lozenge와 보드 카드에 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4"); // 시드: ALM-4 = todo, 보통, 박준영

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    expect(within(dialog).getByRole("button", { name: "백로그 화면 구현" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("할 일");
    expect(within(dialog).getByLabelText("설명")).toBeInTheDocument();

    // 상태 Select: 할 일 → 완료
    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));

    // 모달 Lozenge 반영
    await waitFor(() => {
      expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("완료");
    });
    // 모달을 연 채로 보드 카드가 완료 컬럼으로 이동 (모달 뒤 보드는 aria-hidden이라 testid로 조회)
    await waitFor(() => {
      expect(within(screen.getByTestId("board-column-done")).getByText("ALM-4")).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("board-column-todo")).queryByText("ALM-4"),
    ).not.toBeInTheDocument();
  });

  it("제목 인라인 편집: 클릭 → 입력 → Enter로 저장하고 보드 카드에도 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "백로그 화면 구현" }));
    const field = within(dialog).getByLabelText("제목");
    await user.clear(field);
    await user.type(field, "백로그 화면 구현 (2차){Enter}");

    // 모달에 저장된 제목으로 복귀
    expect(
      await within(dialog).findByRole("button", { name: "백로그 화면 구현 (2차)" }),
    ).toBeInTheDocument();
    // 보드 카드에도 반영
    await waitFor(() => {
      expect(
        within(screen.getByTestId("board-column-todo")).getByText("백로그 화면 구현 (2차)"),
      ).toBeInTheDocument();
    });
  });

  it("보드 카드를 클릭하면 ?issue= 쿼리와 함께 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board");

    const todo = await screen.findByRole("region", { name: "할 일" });
    await user.click(within(todo).getByText("백로그 화면 구현"));

    expect(await screen.findByRole("dialog", { name: "ALM-4" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board?issue=ALM-4");
  });

  it("모달을 닫으면 ?issue 쿼리가 제거된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("location")).toHaveTextContent(/\/projects\/p1\/board$/);
  });

  it("미존재 이슈 키로 공유된 URL을 열면 모달을 열지 않고 쿼리를 제거한다", async () => {
    renderBoard("/projects/p1/board?issue=NOPE-999");

    // 모달이 열리지 않음 (로드 실패 시 getIssueByKey는 null 반환 → 모달 렌더 안 함)
    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // URL에서 ?issue 쿼리가 제거됨 (onClose → setSearchParams)
    await waitFor(
      () => {
        expect(screen.getByTestId("location")).toHaveTextContent(/\/projects\/p1\/board$/);
      },
      { timeout: 3000 },
    );
  });
});
