import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, listLinkTypes } from "../store/jiraStore";

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

describe("전역 관리 > 링크 타입 (지라 업무 항목 연결)", () => {
  it("기본 5종이 보이고, 커스텀 타입을 추가하면 이슈 상세의 링크 종류에 양방향 문구로 나타난다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/link-types");
    const list = await screen.findByRole("list", { name: "링크 타입 목록" });
    expect(await within(list).findAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getByLabelText("관련 나가는 문구")).toHaveValue("관련됨");

    await user.type(screen.getByLabelText("새 타입 이름"), "의존");
    await user.type(screen.getByLabelText("나가는 문구"), "의존함");
    await user.type(screen.getByLabelText("들어오는 문구"), "의존됨");
    await user.click(screen.getByRole("button", { name: "링크 타입 추가" }));
    expect(await screen.findByText("링크 타입을 추가했습니다")).toBeInTheDocument();
    expect(await listLinkTypes()).toHaveLength(6);

    // 이슈 상세 링크 종류 Select에 새 타입의 두 방향이 뜬다
    renderAt("/projects/p1/issues?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: /ALM-2/ });
    await user.click(within(dialog).getByRole("combobox", { name: "종류" }));
    expect(await screen.findByRole("option", { name: "의존함" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "의존됨" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "중복함" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "관련됨" })).toHaveLength(1); // 대칭은 하나
  });
});
