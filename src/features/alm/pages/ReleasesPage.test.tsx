import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
// 이 화면은 App에서 lazy()로 쪼개져 있다 — 수집 시점에 미리 올려 병렬 실행에서 청크 대기가 한도를 넘지 않게
import "./ReleasesPage";
import { __versionForTest } from "../store/jiraStore";
import * as store from "../store/jiraStore";
import { __resetForTest, createVersion, getIssueByKey, listVersions, updateIssue, updateVersion } from "../store/jiraStore";

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
    // 만들기 폼은 기본 접힘 — 버튼을 누르면 인라인 폼이 그 자리를 대신한다
    await user.click(screen.getByRole("button", { name: "버전 만들기" }));
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
    await updateIssue(done!.id, { fixVersionId: version.id }, __versionForTest("issue", done!.id));
    await updateIssue(open!.id, { fixVersionId: version.id }, __versionForTest("issue", open!.id));
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
    await updateIssue(open!.id, { fixVersionId: v1.id }, __versionForTest("issue", open!.id));
    renderReleases();

    const list = await screen.findByRole("list", { name: "버전 목록" });
    const row = within(list).getByText("1.0").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "1.0 릴리스" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("미완료 이슈 1건");
    // 미해결 1건의 상태를 아이콘 + 이름으로 그린다 — 텍스트만 두지 않는다
    expect(within(dialog).getAllByTestId(/^status-glyph-/)).toHaveLength(1);
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

  it("⋯ 메뉴의 편집으로 이름·설명·날짜를 고치면 행에 반영된다", async () => {
    const user = userEvent.setup();
    await createVersion("p1", { name: "1.0" });
    renderReleases();

    const list = await screen.findByRole("list", { name: "버전 목록" });
    await user.click(within(list).getByRole("button", { name: "1.0 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "편집" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 수정" });
    const name = within(dialog).getByLabelText("버전 이름");
    expect(name).toHaveValue("1.0");
    await user.clear(name);
    await user.type(name, "1.0 GA");
    await user.type(within(dialog).getByLabelText("설명"), "첫 정식");
    await user.type(within(dialog).getByLabelText("릴리스 예정일"), "2026-11-30");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("버전을 수정했습니다")).toBeInTheDocument();
    const row = within(screen.getByRole("list", { name: "버전 목록" })).getByText("1.0 GA").closest("li")!;
    expect(within(row).getByText("첫 정식")).toBeInTheDocument();
    expect((await listVersions("p1"))[0]).toMatchObject({ name: "1.0 GA", releaseDate: "2026-11-30" });
  });

  it("편집 중 남이 먼저 저장하면 입력을 지키고 해소를 고르게 한다 — 다시 적용은 최신 버전 기준으로 저장한다", async () => {
    const user = userEvent.setup();
    const version = await createVersion("p1", { name: "1.0" });
    renderReleases();

    const list = await screen.findByRole("list", { name: "버전 목록" });
    await user.click(within(list).getByRole("button", { name: "1.0 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "편집" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 수정" });
    await user.type(within(dialog).getByLabelText("설명"), "내 설명");

    await updateVersion(version, { name: "1.0-rc" }); // 다른 사람의 저장
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await within(dialog).findByText(/다른 사용자가 이 버전을 먼저 수정해/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("설명")).toHaveValue("내 설명");
    await user.click(within(dialog).getByRole("button", { name: /내 변경 다시 적용/ }));

    expect(await screen.findByText("버전을 수정했습니다")).toBeInTheDocument();
    expect((await listVersions("p1"))[0]).toMatchObject({ name: "1.0", description: "내 설명" });
  });

  it("미완료가 한 페이지를 넘으면 목록 길이가 아니라 전체 건수를 보이고 일부만 표시라고 알린다 (Codex)", async () => {
    const user = userEvent.setup();
    await createVersion("p1", { name: "1.0" });
    const open = (await getIssueByKey("ALM-5"))!;
    vi.spyOn(store, "findIssues").mockResolvedValue({ items: [open], page: 0, size: 200, total: 250, truncated: true });
    renderReleases();
    const list = await screen.findByRole("list", { name: "버전 목록" });
    await user.click(within(list).getByRole("button", { name: "1.0 릴리스" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("미완료 이슈 250건");
    expect(dialog).toHaveTextContent("일부만 표시 — 총 250건 중 1건");
    expect(dialog).toHaveTextContent("외 245건");
  });

  it("진행률 집계가 실패하면 0건으로 속이지 않고 오류와 다시 시도를 보인다 (Codex)", async () => {
    const user = userEvent.setup();
    await createVersion("p1", { name: "1.0" });
    const aggregate = vi.spyOn(store, "aggregateIssues").mockRejectedValue(new Error("ALM 서비스를 사용할 수 없습니다"));
    renderReleases();
    const list = await screen.findByRole("list", { name: "버전 목록" });
    const row = within(list).getByText("1.0").closest("li")!;
    expect(await within(row).findByRole("alert")).toHaveTextContent("진행률을 불러오지 못했습니다");
    expect(within(row).queryByText("달린 이슈가 없습니다")).not.toBeInTheDocument();
    aggregate.mockRestore();
    await user.click(within(row).getByRole("button", { name: "다시 시도" }));
    expect(await within(row).findByText("달린 이슈가 없습니다")).toBeInTheDocument();
  });
});

afterEach(() => vi.restoreAllMocks());
