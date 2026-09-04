import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getIssueByKey, listIssueLinks, listIssues } from "../store/jiraStore";

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

describe("이슈 만들기 (지라식 대화상자)", () => {
  it("상위 항목·연결 이슈를 함께 지정해 만들고, '계속 만들기'면 대화상자가 열린 채 요약만 비워진다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });

    await user.type(within(dialog).getByLabelText("요약 *"), "연결과 상위가 있는 이슈");
    await user.click(within(dialog).getByRole("button", { name: "나에게 할당" }));

    await user.click(within(dialog).getByRole("combobox", { name: "상위 항목" }));
    await user.click(await screen.findByRole("option", { name: /ALM-4/ }));

    const links = within(dialog).getByRole("group", { name: "연결 이슈" });
    await user.click(within(links).getByRole("combobox", { name: "종류" }));
    await user.click(await screen.findByRole("option", { name: "관련됨" }));
    await user.click(within(links).getByRole("combobox", { name: "대상 이슈" }));
    await user.click(await screen.findByRole("option", { name: /ALM-5/ }));
    await user.click(within(links).getByRole("button", { name: "추가" }));
    expect(within(links).getByRole("list", { name: "추가할 연결" })).toHaveTextContent("관련됨 ALM-5");

    await user.click(within(dialog).getByRole("checkbox", { name: "다른 이슈 계속 만들기" }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    expect(await screen.findByText(/를 만들었습니다/)).toBeInTheDocument();
    // 계속 만들기 — 대화상자는 그대로, 요약은 비워진다
    expect(screen.getByRole("dialog", { name: "이슈 만들기" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("요약 *")).toHaveValue("");

    const created = (await listIssues("p1")).find((i) => i.title === "연결과 상위가 있는 이슈")!;
    const epic = await getIssueByKey("ALM-4");
    expect(created.parentId).toBe(epic!.id);
    expect(created.assigneeId).not.toBeNull();
    await waitFor(async () => {
      const linkList = await listIssueLinks(created.id);
      expect(linkList.map((l) => l.other.key)).toContain("ALM-5");
    });
  }, 30_000); // 만들기 대화상자 왕복 2회 + Select 여러 개 — 병렬 워커 부하에서 기본 15s를 넘긴다
});
