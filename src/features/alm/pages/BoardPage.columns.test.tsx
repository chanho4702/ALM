import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getBoard, getIssueByKey, setIssueFlag, updateBoard, updateIssue } from "../store/jiraStore";
import "./BoardPage";

function renderBoard(path = "/projects/p1/boards/b1") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("보드 열 매핑 (C4)", () => {
  it("열 하나에 여러 상태 — 두 상태의 카드가 한 열에, 미매핑 상태는 안내하고 보이지 않는다", async () => {
    await updateBoard("b1", {
      columns: [
        { status: "inprogress", name: "진행·검토", statuses: ["inprogress", "done"], wipLimit: null },
      ],
    });
    renderBoard();
    const column = await screen.findByRole("region", { name: "진행·검토" });
    expect(within(column).getByText("ALM-2")).toBeInTheDocument();
    expect(within(column).getByText("ALM-1")).toBeInTheDocument(); // 완료
    expect(screen.queryByText("ALM-5")).not.toBeInTheDocument(); // 할 일 = 미매핑
    expect(screen.getByRole("note")).toHaveTextContent("어느 열에도 없는 상태 1개(할 일)의 이슈는 이 보드에 보이지 않습니다");
  });

  it("보드 설정에서 매핑 형식으로 바꾸고 열을 지우면 그 상태가 미매핑 칸으로 간다", async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole("region", { name: "할 일" });
    await user.click(screen.getByRole("button", { name: "보드 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "보드 설정" }));
    const dialog = await screen.findByRole("dialog", { name: "보드 설정" });

    await user.click(within(dialog).getByRole("radio", { name: "열에 상태 묶기(지라 열 매핑)" }));
    const unmapped = within(dialog).getByRole("region", { name: "미매핑 상태" });
    expect(unmapped).toHaveTextContent("모든 상태가 열에 들어 있습니다.");

    await user.click(within(dialog).getByRole("button", { name: "할 일 열 삭제" }));
    expect(within(unmapped).getByText("할 일")).toBeInTheDocument();

    // 미매핑된 상태를 다른 열에 넣는다 — 진행 중 열에 할 일 추가
    await user.click(within(dialog).getByRole("combobox", { name: "진행 중에 상태 넣기" }));
    await user.click(await screen.findByRole("option", { name: "할 일" }));
    expect(within(dialog).getByRole("list", { name: "진행 중 열의 상태" })).toHaveTextContent("할 일");

    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    const merged = await screen.findByRole("region", { name: "진행 중" });
    await waitFor(() => expect(within(merged).getByText("ALM-5")).toBeInTheDocument());
    expect(within(merged).getByText("ALM-3")).toBeInTheDocument();
    const saved = await getBoard("b1");
    expect(saved?.columnMode).toBe("mapped");
    expect(saved?.resolvedColumns.map((c) => c.statuses)).toEqual([["inprogress", "todo"], ["done"]]);
  });

  it("카드에 플래그(막힘)와 스토리 포인트가 아이콘·텍스트로 보인다 (D2)", async () => {
    const alm3 = await getIssueByKey("ALM-3");
    await setIssueFlag(alm3!.id, true);
    await updateIssue(alm3!.id, { storyPoints: 5 }, alm3!.version);
    renderBoard();
    const column = await screen.findByRole("region", { name: "진행 중" });
    const card = within(column).getByText("이슈 상세 모달 구현").closest(".issue-card") as HTMLElement;
    expect(within(card).getByText("막힘")).toBeInTheDocument();
    expect(within(card).getByLabelText("스토리 포인트 5")).toHaveTextContent("5");
  });
});
