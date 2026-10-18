import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import * as store from "../store/jiraStore";
import { IssueDetailModal } from "./IssueDetailModal";

function renderModal(issueKey: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/projects/p1/board?issue=${issueKey}`]}>
        <IssueDetailModal issueKey={issueKey} onClose={() => undefined} onIssueChanged={() => undefined} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("IssueDetailModal 조회 범위 — 프로젝트 전체 이슈를 읽지 않는다 (A-06)", () => {
  it("열 때도, 하위 이슈를 추가할 때도 listIssues를 부르지 않고 컴포넌트는 모달 수명 동안 한 번만 읽는다", async () => {
    const listIssues = vi.spyOn(store, "listIssues");
    const listComponents = vi.spyOn(store, "listComponents");
    const user = userEvent.setup();
    renderModal("ALM-2"); // 시드: ALM-2의 상위 = ALM-4(에픽)

    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const path = await within(dialog).findByRole("navigation", { name: "상위 항목 경로" });
    expect(await within(path).findByRole("button", { name: /ALM-4/ })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "하위 이슈" }));
    await user.type(within(dialog).getByLabelText("하위 이슈 추가"), "범위 확인");
    await user.click(within(dialog).getByRole("button", { name: "추가" }));
    expect(await within(dialog).findByText("범위 확인")).toBeInTheDocument();

    expect(listIssues).not.toHaveBeenCalled();
    expect(listComponents).toHaveBeenCalledTimes(1);
  });

  it("후보가 한 페이지를 넘으면 상위 항목 검색 칸이 나타나고, 서버 검색으로 오래된 이슈도 고를 수 있다", async () => {
    for (let n = 0; n < 55; n++) {
      await store.createIssue({ projectId: "p1", title: `채우기 ${n}` });
    }
    const user = userEvent.setup();
    renderModal("ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });

    const search = await within(dialog).findByRole("searchbox", { name: "상위 항목 검색" });
    // 최근 수정 50건 안에는 시드 에픽(ALM-4)이 없다
    await user.click(within(dialog).getByRole("combobox", { name: "상위 항목" }));
    expect(screen.queryByRole("option", { name: /ALM-4 / })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.type(search, "백로그 화면");
    await user.click(within(dialog).getByRole("combobox", { name: "상위 항목" }));
    await user.click(await screen.findByRole("option", { name: /ALM-4 / }));
    expect(await screen.findByText("상위 항목을 변경했습니다")).toBeInTheDocument();
    await waitFor(async () => expect((await store.getIssueByKey("ALM-1"))?.parentId).toBe("i4"));
  }, 30_000);

  it("링크 대상도 서버 검색 한 페이지 — 폼을 열기 전에는 묻지 않는다", async () => {
    const find = vi.spyOn(store, "findIssues");
    const user = userEvent.setup();
    renderModal("ALM-3");
    const dialog = await screen.findByRole("dialog", { name: "ALM-3" });
    await waitFor(() => expect(find).toHaveBeenCalledTimes(1)); // 상위 항목 후보만

    const links = await within(dialog).findByTestId("issue-links");
    await user.click(within(links).getByRole("button", { name: "링크" }));
    await waitFor(() => expect(find).toHaveBeenCalledTimes(2));
    await user.click(within(links).getByRole("combobox", { name: "대상 이슈" }));
    expect(await screen.findByRole("option", { name: /ALM-5/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /ALM-3 / })).not.toBeInTheDocument();
  });
});
