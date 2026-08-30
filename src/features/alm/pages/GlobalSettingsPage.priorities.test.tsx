import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, listPriorities } from "../store/jiraStore";

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

describe("전역 관리 > 우선순위 (지라 우선 순위 + 구성표)", () => {
  it("기본 5단계가 순서대로 보이고, 커스텀 우선순위를 추가하면 이슈 만들기 선택지에 나타난다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/priorities");
    const list = await screen.findByRole("list", { name: "우선순위 목록" });
    const rows = await within(list).findAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByLabelText("최상 이름")).toHaveValue("최상");
    expect(within(rows[0]).getByRole("button", { name: "최상 삭제" })).toBeDisabled();

    await user.type(screen.getByLabelText("새 우선순위 이름"), "긴급");
    await user.click(screen.getByRole("button", { name: "우선순위 추가" }));
    expect(await screen.findByText("우선순위를 추가했습니다")).toBeInTheDocument();
    expect(await listPriorities()).toHaveLength(6);

    // 스킴에서 켜기 전이라 만들기 Select에는 이름이 뜨되(레지스트리), 서버/목업이 생성 시 거부한다 — 여기선 목록만 확인
    await user.click(screen.getByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.click(within(dialog).getByRole("combobox", { name: "우선순위" }));
    expect(await screen.findByRole("option", { name: "긴급" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "최하" })).toBeInTheDocument();
  });
});
