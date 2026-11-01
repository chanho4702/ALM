import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getIssueByKey } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import "./BoardPage";

/** 보드 키보드 이동(`[`·`]`)과 다중 선택 이동 — Space(미리보기)와 겹치지 않는다 */
function renderBoard() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/board"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetCommandScopeForTest();
});
afterEach(() => vi.restoreAllMocks());

const blur = () => (document.activeElement as HTMLElement | null)?.blur();
const column = (name: string) => screen.getByRole("region", { name });

describe("보드 키보드 이동", () => {
  it("가리킨 카드를 ]로 다음 열, [로 이전 열로 옮긴다", async () => {
    const user = userEvent.setup();
    renderBoard();
    const card = await within(await screen.findByRole("region", { name: "할 일" })).findByText("ALM-4");
    await user.hover(card);
    blur();

    await user.keyboard("]");
    await waitFor(() => expect(within(column("진행 중")).getByText("ALM-4")).toBeInTheDocument());
    await waitFor(async () => expect((await getIssueByKey("ALM-4"))?.status).toBe("inprogress"));

    await user.hover(within(column("진행 중")).getByText("ALM-4"));
    blur();
    await user.keyboard("[[");
    await waitFor(async () => expect((await getIssueByKey("ALM-4"))?.status).toBe("todo"));
  });

  it("선택이 있으면 선택 전부를 한 칸씩 — 한 토스트로 알린다", async () => {
    const user = userEvent.setup();
    renderBoard();
    const todo = await screen.findByRole("region", { name: "할 일" });
    await user.keyboard("{Control>}");
    await user.click(await within(todo).findByText("ALM-4"));
    await user.click(within(todo).getByText("ALM-5"));
    await user.keyboard("{/Control}");
    expect(within(await screen.findByRole("toolbar", { name: "대량 작업" })).getByText("2개 선택")).toBeInTheDocument();
    blur();

    await user.keyboard("]");
    expect(await screen.findByText("이슈 2개를 진행 중(으)로 옮겼습니다")).toBeInTheDocument();
    expect((await getIssueByKey("ALM-4"))?.status).toBe("inprogress");
    expect((await getIssueByKey("ALM-5"))?.status).toBe("inprogress");
  });

  it("마지막 열에서 ]는 아무것도 옮기지 않고 알린다", async () => {
    const user = userEvent.setup();
    renderBoard();
    const card = await within(await screen.findByRole("region", { name: "완료" })).findByText("ALM-1");
    await user.hover(card);
    blur();
    await user.keyboard("]");
    expect(await screen.findByText("마지막 열입니다")).toBeInTheDocument();
    expect((await getIssueByKey("ALM-1"))?.status).toBe("done");
  });
});
