import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createComponent, createIssue, listComponents, listIssues } from "../store/jiraStore";

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

describe("컴포넌트 (지라 Components)", () => {
  it("프로젝트 설정에서 컴포넌트를 추가하고 목록에 보인다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/components");
    expect(await screen.findByRole("heading", { name: "컴포넌트" })).toBeInTheDocument();
    await user.type(await screen.findByLabelText("새 컴포넌트 이름"), "API");
    await user.click(screen.getByRole("button", { name: "컴포넌트 추가" }));
    expect(await screen.findByText("컴포넌트를 추가했습니다")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "컴포넌트 목록" });
    expect(within(list).getByLabelText("API 이름")).toHaveValue("API");
    expect(await listComponents("p1")).toHaveLength(1);
  });

  it("이슈 만들기에서 컴포넌트를 고르면 이슈에 붙고 목록 필터로 걸러진다", async () => {
    const user = userEvent.setup();
    const api = await createComponent("p1", { name: "API" });
    await createComponent("p1", { name: "UI" });
    renderAt("/projects/p1/issues");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "API 이슈");
    await user.click(await within(dialog).findByRole("checkbox", { name: "API" }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    expect(await screen.findByText(/를 만들었습니다/)).toBeInTheDocument();
    const created = (await listIssues("p1")).find((i) => i.title === "API 이슈");
    expect(created?.componentIds).toEqual([api.id]);
  });

  it("목록의 컴포넌트 필터로 거른다", async () => {
    const user = userEvent.setup();
    const api = await createComponent("p1", { name: "API" });
    await createIssue({ projectId: "p1", title: "API 이슈", componentIds: [api.id] });
    renderAt("/projects/p1/issues");
    await screen.findByRole("table");
    await user.click(await screen.findByRole("combobox", { name: "컴포넌트" }));
    await user.click(await screen.findByRole("option", { name: "API" }));
    const table = await screen.findByRole("table");
    expect(await within(table).findByText("API 이슈")).toBeInTheDocument();
    expect(within(table).queryByText("칸반 보드 UI 구현")).not.toBeInTheDocument();
  });
});
