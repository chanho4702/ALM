import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getIssueByKey, listComments } from "../store/jiraStore";
import "./IssueDetailModal";
import "../pages/BoardPage";

function renderAt(path: string) {
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

describe("이슈 상세 — 플래그·시작일·스토리 포인트 (D2·D3)", () => {
  it("플래그를 이유와 함께 달면 '막힘' 표시와 코멘트가 남고, 해제할 수 있다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-3");
    const dialog = await screen.findByRole("dialog", { name: "ALM-3" });
    await user.click(within(dialog).getByRole("button", { name: "플래그 추가" }));
    const form = await screen.findByRole("form", { name: "플래그 추가" });
    await user.type(within(form).getByRole("textbox", { name: "이유(선택)" }), "API 대기");
    await user.click(within(form).getByRole("button", { name: "플래그 달기" }));

    expect(await within(dialog).findByRole("button", { name: "플래그 해제" })).toBeInTheDocument();
    expect(within(dialog).getByText("막힘")).toBeInTheDocument();
    const issue = await getIssueByKey("ALM-3");
    expect(issue?.flagged).toBe(true);
    expect((await listComments(issue!.id)).at(-1)?.body).toBe("플래그 추가: API 대기");

    await user.click(within(dialog).getByRole("button", { name: "플래그 해제" }));
    await waitFor(async () => expect((await getIssueByKey("ALM-3"))?.flagged).toBe(false));
  });

  it("시작일·스토리 포인트를 속성 패널에서 저장한다 — 시작일이 마감일보다 늦으면 거부 토스트", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-2"); // 마감일 있음(7일 뒤)
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });

    const points = within(dialog).getByLabelText("스토리 포인트");
    await user.type(points, "5");
    fireEvent.blur(points);
    await waitFor(async () => expect((await getIssueByKey("ALM-2"))?.storyPoints).toBe(5));

    fireEvent.change(within(dialog).getByLabelText("시작일"), { target: { value: "2099-01-01" } });
    expect(await screen.findByText("시작일은 마감일보다 늦을 수 없습니다")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("시작일"), { target: { value: "2026-01-01" } });
    await waitFor(async () => expect((await getIssueByKey("ALM-2"))?.startDate).toBe("2026-01-01"));
  });
});
