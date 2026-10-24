import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import {
  __resetForTest,
  getIssueByKey,
  listComments,
  resolveSettings,
  setProjectCustom,
  updateProjectCustomSettings,
} from "../store/jiraStore";
import type { WorkflowTransition } from "../store/types";
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

async function useWorkflow(transitions: WorkflowTransition[]) {
  await setProjectCustom("p1", true);
  const { body } = await resolveSettings("p1");
  await updateProjectCustomSettings("p1", { ...body, transitions });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("이슈 상세 — 상태 버튼은 가용 전환 목록 (A2)", () => {
  it("정의된 전환만 '전환 이름 → 대상 상태'로, 못 하는 전환은 흐리게 이유와 함께", async () => {
    await useWorkflow([
      { id: "t-review", name: "검토 요청", from: ["inprogress"], to: "todo" },
      { id: "t-done", name: "끝내기", from: ["inprogress"], to: "done", conditions: [{ type: "assignee" }] },
    ]);
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-2"); // 진행 중, 담당 u2 — 나는 u1
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    await user.click(within(dialog).getByRole("button", { name: "상태: 진행 중" }));

    const menu = await screen.findByRole("menu", { name: "상태 전환" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(["검토 요청 (→ 할 일)", "끝내기 (→ 완료)"]);
    const blocked = within(menu).getByRole("menuitem", { name: "끝내기 (→ 완료)" });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveAccessibleDescription("담당자만 이 전환을 할 수 있습니다");

    // 못 하는 전환을 눌러도 아무 일도 없다 — 목록은 열린 채 남는다
    await user.click(blocked);
    expect((await getIssueByKey("ALM-2"))?.status).toBe("inprogress");

    await user.click(await screen.findByRole("menuitem", { name: "검토 요청 (→ 할 일)" }));
    expect(await within(dialog).findByRole("button", { name: "상태: 할 일" })).toBeInTheDocument();
  });

  it("전환 화면이 있는 전환은 창을 띄우고 해결·코멘트를 한 번에 저장한다 (A4)", async () => {
    await useWorkflow([
      { id: "t-done", name: "끝내기", from: [], to: "done", screenFields: ["resolution", "comment"] },
    ]);
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-5");
    const dialog = await screen.findByRole("dialog", { name: "ALM-5" });
    await user.click(within(dialog).getByRole("button", { name: "상태: 할 일" }));
    await user.click(await screen.findByRole("menuitem", { name: "끝내기 (→ 완료)" }));

    const screenForm = await screen.findByRole("form", { name: "끝내기 전환 화면" });
    await user.click(within(screenForm).getByRole("combobox", { name: "해결" }));
    await user.click(await screen.findByRole("option", { name: "하지 않음" }));
    await user.type(within(screenForm).getByRole("textbox", { name: "코멘트" }), "범위에서 뺍니다");
    await user.click(within(screenForm).getByRole("button", { name: "끝내기" }));

    await waitFor(async () => expect(await getIssueByKey("ALM-5")).toMatchObject({ status: "done", resolution: "wont_do" }));
    const issue = await getIssueByKey("ALM-5");
    expect((await listComments(issue!.id)).map((c) => c.body)).toContain("범위에서 뺍니다");
    expect(await within(dialog).findByRole("button", { name: "상태: 완료" })).toBeInTheDocument();
  });

  it("전환 화면을 취소하면 아무것도 바뀌지 않는다", async () => {
    await useWorkflow([{ id: "t-done", name: "끝내기", from: [], to: "done", screenFields: ["resolution"] }]);
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-5");
    const dialog = await screen.findByRole("dialog", { name: "ALM-5" });
    await user.click(within(dialog).getByRole("button", { name: "상태: 할 일" }));
    await user.click(await screen.findByRole("menuitem", { name: "끝내기 (→ 완료)" }));
    const screenForm = await screen.findByRole("form", { name: "끝내기 전환 화면" });
    await user.click(within(screenForm).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "끝내기 전환 화면" })).not.toBeInTheDocument());
    expect((await getIssueByKey("ALM-5"))?.status).toBe("todo");
  });

  it("검증 필드가 화면 칸이면 비워 둔 채 저장할 수 없다 — 미입력 안내", async () => {
    await useWorkflow([
      { id: "t-done", name: "끝내기", from: [], to: "done", validators: ["dueDate"], screenFields: ["dueDate"] },
    ]);
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-5");
    const dialog = await screen.findByRole("dialog", { name: "ALM-5" });
    await user.click(within(dialog).getByRole("button", { name: "상태: 할 일" }));
    await user.click(await screen.findByRole("menuitem", { name: "끝내기 (→ 완료)" }));
    const screenForm = await screen.findByRole("form", { name: "끝내기 전환 화면" });
    expect(within(screenForm).getByRole("status")).toHaveTextContent("필수 항목 미입력: 마감일");
    expect(within(screenForm).getByRole("button", { name: "끝내기" })).toBeDisabled();
  });
});
