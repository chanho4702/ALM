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

  it("볼 수 없는 프로젝트의 링크 반대편은 잠금 표시로 — 제목 대신 '볼 수 없는 이슈', 열 수 없다", async () => {
    const real = await store.listIssueLinks("i2");
    vi.spyOn(store, "listIssueLinks").mockResolvedValue([
      ...real,
      {
        link: { id: "lx", sourceId: "i2", targetId: "x9", type: "relates" },
        other: { ...real[0].other, id: "x9", key: "SEC-9", title: "볼 수 없는 이슈", description: "" },
        direction: "outward",
        restricted: true,
      },
    ]);
    renderModal("ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const links = await within(dialog).findByTestId("issue-links");
    const row = await within(links).findByTestId("issue-link-restricted");
    expect(row).toHaveTextContent("SEC-9");
    expect(row).toHaveTextContent("볼 수 없는 이슈");
    expect(within(links).queryByRole("button", { name: /SEC-9 볼 수 없는/ })).not.toBeInTheDocument();
    expect(within(links).getByRole("button", { name: "SEC-9 링크 제거" })).toBeInTheDocument();
  });

  it("하위 이슈가 한 페이지를 넘으면 'N건 중 M건'을 알리고, 완료 수·전체 수는 서버 집계로 센다", async () => {
    const page = await store.listChildrenPage("i4"); // 시드: 에픽 ALM-4의 하위
    vi.spyOn(store, "listChildrenPage").mockResolvedValue({ ...page, total: 450, truncated: true });
    const aggregate = vi
      .spyOn(store, "aggregateIssues")
      .mockImplementation(async (criteria) => ({ total: criteria.openOnly ? 300 : 450, buckets: [] }));
    renderModal("ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    const children = within(dialog).getByTestId("issue-children");
    expect(await within(children).findByRole("note")).toHaveTextContent(`하위 이슈 450건 중 ${page.items.length}건만 보입니다`);
    expect(children).toHaveTextContent("(완료 150/450)");
    expect(aggregate).toHaveBeenCalledWith({ parentId: "i4" }, "statusCategory");
  });

  it("복제하면 새 이슈로 넘어가고, 원본과 '복제' 링크로 이어진다 (F-11)", async () => {
    const user = userEvent.setup();
    let current = "ALM-5";
    const view = render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/p1/board?issue=ALM-5"]}>
          <IssueDetailModal issueKey={current} onClose={() => undefined} onIssueChanged={() => undefined} />
        </MemoryRouter>
      </ToastProvider>,
    );
    const dialog = await screen.findByRole("dialog", { name: "ALM-5" });
    await user.click(await within(dialog).findByRole("button", { name: "복제" }));
    const toast = await screen.findByText(/ALM-5을\(를\) ALM-\d+\(으\)로 복제했습니다/);
    current = /(ALM-\d+)\(으\)로/.exec(toast.textContent ?? "")![1];
    view.unmount();
    renderModal(current);
    const copyDialog = await screen.findByRole("dialog", { name: current });
    const links = await within(copyDialog).findByTestId("issue-links");
    expect(await within(links).findByText("ALM-5")).toBeInTheDocument();
  });

  it("웹 링크: 편집자는 URL·표시 이름·종류로 붙이고 새 탭으로 열린다, 같은 URL은 '이미 연결됨' (F-08)", async () => {
    const user = userEvent.setup();
    renderModal("ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });
    const section = await within(dialog).findByTestId("issue-web-links");
    await user.click(within(section).getByRole("button", { name: "웹 링크" }));
    await user.type(within(section).getByLabelText("URL"), "https://wiki.example.com/design");
    await user.type(within(section).getByLabelText("표시 이름"), "설계 문서");
    await user.click(within(section).getByRole("button", { name: "추가" }));
    expect(await screen.findByText("웹 링크를 추가했습니다")).toBeInTheDocument();
    const link = await within(section).findByRole("link", { name: /설계 문서/ });
    expect(link).toHaveAttribute("href", "https://wiki.example.com/design");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(link).getByTestId("web-link-kind-WEB")).toBeInTheDocument();
    expect(link).toHaveTextContent("웹");

    await user.click(within(section).getByRole("button", { name: "웹 링크" }));
    await user.type(within(section).getByLabelText("URL"), "https://wiki.example.com/design");
    await user.click(within(section).getByRole("button", { name: "추가" }));
    expect(await screen.findByText("이미 연결된 링크입니다")).toBeInTheDocument();
    expect(within(section).getAllByRole("link")).toHaveLength(1);
  });

  it("웹 링크: 읽기 권한만 있으면 목록은 보이고 추가·삭제는 없다 (F-08)", async () => {
    await store.updateProjectMemberRole("p1", "u2", "admin");
    await store.updateProjectMemberRole("p1", "u1", "viewer");
    renderModal("ALM-2"); // 시드: ALM-2에 PR 링크 1건
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const section = await within(dialog).findByTestId("issue-web-links");
    expect(await within(section).findByRole("link", { name: /칸반 보드 UI PR/ })).toBeInTheDocument();
    await waitFor(() => expect(within(section).queryByRole("button", { name: "웹 링크" })).not.toBeInTheDocument());
    expect(within(section).queryByRole("button", { name: /웹 링크 제거/ })).not.toBeInTheDocument();
  });
});
