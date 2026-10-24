import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import "./ReportsPage";
import { __resetForTest, completeSprint, getIssueByKey, updateIssue } from "../store/jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("리포트 — 벨로시티 단위 전환 (스토리 포인트, V30)", () => {
  it("완료한 스프린트의 약속·완료를 스토리 포인트로 보이고, 단위를 바꾸면 서버 집계를 다시 읽는다", async () => {
    const alm1 = await getIssueByKey("ALM-1"); // 완료
    await updateIssue(alm1!.id, { storyPoints: 3 }, alm1!.version);
    const alm3 = await getIssueByKey("ALM-3"); // 진행 중 → 이월
    await updateIssue(alm3!.id, { storyPoints: 5 }, alm3!.version);
    await completeSprint("s1", { moveUnfinishedTo: null });

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/p1/reports"]}>
          <App />
        </MemoryRouter>
      </ToastProvider>,
    );
    await user.click(await screen.findByRole("combobox", { name: "리포트" }));
    await user.click(await screen.findByRole("option", { name: "벨로시티" }));

    const card = await screen.findByRole("region", { name: "벨로시티" });
    expect(card).toHaveTextContent("최근 1개 스프린트 평균 완료 3점");
    const table = within(card).getByRole("table", { name: "벨로시티 값" });
    expect(within(table).getByRole("row", { name: "Sprint 1 8점 3점" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "이슈 수" }));
    expect(await screen.findByText("최근 1개 스프린트 평균 완료 1건")).toBeInTheDocument();
  });
});
