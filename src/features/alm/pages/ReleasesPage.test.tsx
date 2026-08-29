import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
// 이 화면은 App에서 lazy()로 쪼개져 있다 — 수집 시점에 미리 올려 병렬 실행에서 청크 대기가 한도를 넘지 않게
import "./ReleasesPage";
import { __resetForTest, createVersion, getIssueByKey, updateIssue } from "../store/jiraStore";

function renderReleases() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/releases"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("ReleasesPage", () => {
  it("버전이 없으면 안내와 함께 만들기 폼을 보여주고, 만들면 목록에 나타난다", async () => {
    const user = userEvent.setup();
    renderReleases();

    expect(await screen.findByText("아직 버전이 없습니다")).toBeInTheDocument();
    await user.type(screen.getByLabelText("버전 이름"), "1.0");
    await user.click(screen.getByRole("button", { name: "버전 만들기" }));

    const list = await screen.findByRole("list", { name: "버전 목록" });
    expect(within(list).getByText("1.0")).toBeInTheDocument();
    expect(within(list).getByText("미릴리스")).toBeInTheDocument();
  });

  it("버전 행이 진행률(완료/전체)을 보여준다", async () => {
    const version = await createVersion("p1", { name: "1.0" });
    const done = await getIssueByKey("ALM-1");
    const open = await getIssueByKey("ALM-5");
    await updateIssue(done!.id, { fixVersionId: version.id });
    await updateIssue(open!.id, { fixVersionId: version.id });
    renderReleases();

    const list = await screen.findByRole("list", { name: "버전 목록" });
    const row = within(list).getByText("1.0").closest("li")!;
    expect(within(row).getByText("2개 중 1개 완료")).toBeInTheDocument();
  });

  it("릴리스 확인에서 미완료 이슈 행선지를 고르고 릴리스하면 상태가 바뀐다", async () => {
    const user = userEvent.setup();
    const v1 = await createVersion("p1", { name: "1.0" });
    await createVersion("p1", { name: "1.1" });
    const open = await getIssueByKey("ALM-5");
    await updateIssue(open!.id, { fixVersionId: v1.id });
    renderReleases();

    const list = await screen.findByRole("list", { name: "버전 목록" });
    const row = within(list).getByText("1.0").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "1.0 릴리스" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("미완료 이슈 1건");
    await user.click(within(dialog).getByRole("radio", { name: "1.1" }));
    await user.click(within(dialog).getByRole("button", { name: "릴리스" }));

    await waitFor(() => {
      const updatedRow = within(screen.getByRole("list", { name: "버전 목록" }))
        .getByText("1.0")
        .closest("li")!;
      expect(within(updatedRow).getByText("릴리스됨")).toBeInTheDocument();
    });
    expect((await getIssueByKey("ALM-5"))!.fixVersionId).not.toBe(v1.id);
  });

  it("보관하면 목록에서 보관됨으로 표시되고 릴리스 버튼이 사라진다", async () => {
    const user = userEvent.setup();
    await createVersion("p1", { name: "0.9" });
    renderReleases();

    const list = await screen.findByRole("list", { name: "버전 목록" });
    const row = within(list).getByText("0.9").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "0.9 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "보관" }));

    await waitFor(() => {
      const updatedRow = within(screen.getByRole("list", { name: "버전 목록" }))
        .getByText("0.9")
        .closest("li")!;
      expect(within(updatedRow).getByText("보관됨")).toBeInTheDocument();
      expect(within(updatedRow).queryByRole("button", { name: "0.9 릴리스" })).not.toBeInTheDocument();
    });
  });
});
