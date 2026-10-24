import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getIssueByKey, listIssues } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import { getCreateIssueDraft } from "../store/uiStore";
import { rangeKeyOf } from "../components/useRangeSelection";
import { groupCreatePatch } from "../components/views/viewGrouping";
import "../components/IssueDetailModal";
import "../components/CreateIssueModal";
import "./IssueListPage";

/** Linear 강점 반영 — 범위 선택(Shift+↑↓·Ctrl+A), 인라인 만들기(목록·그룹 머리글), 이슈 만들기 초안 보존 */
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
  __resetCommandScopeForTest();
});

type User = ReturnType<typeof userEvent.setup>;

async function openList() {
  renderAt("/projects/p1/issues");
  const table = await screen.findByRole("table", { name: "이슈 목록" });
  await within(table).findByText("ALM-1");
  return table;
}

const bulkCount = () => screen.getByText(/^\d+개 선택$/).textContent;

describe("범위 선택", () => {
  it("판정 — Shift+↑↓, ⌘/Ctrl+A만(Alt·Shift+Ctrl 조합은 아니다)", () => {
    const base = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
    expect(rangeKeyOf({ ...base, key: "ArrowDown", shiftKey: true })).toBe("down");
    expect(rangeKeyOf({ ...base, key: "ArrowUp", shiftKey: true })).toBe("up");
    expect(rangeKeyOf({ ...base, key: "a", ctrlKey: true })).toBe("all");
    expect(rangeKeyOf({ ...base, key: "A", metaKey: true })).toBe("all");
    expect(rangeKeyOf({ ...base, key: "ArrowDown" })).toBeNull();
    expect(rangeKeyOf({ ...base, key: "a", ctrlKey: true, shiftKey: true })).toBeNull();
    expect(rangeKeyOf({ ...base, key: "ArrowDown", shiftKey: true, altKey: true })).toBeNull();
  });

  it("Shift+↓로 커서부터 아래로 넓히고 Shift+↑로 줄인다 — 선택은 체크박스·대량 작업 바와 같다", async () => {
    const user = userEvent.setup();
    const table = await openList();
    await user.keyboard("j");
    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    await waitFor(() => expect(bulkCount()).toBe("3개 선택"));
    const checked = within(table).getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked && c.getAttribute("aria-label") !== "모두 선택");
    expect(checked).toHaveLength(3);
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    await waitFor(() => expect(bulkCount()).toBe("2개 선택"));
  });

  it("⌘/Ctrl+A는 보이는 행 전부 — 입력란에서는 글자 선택(브라우저 기본)", async () => {
    const user = userEvent.setup();
    const table = await openList();
    const rows = within(table).getAllByText(/^ALM-\d+$/).length;
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Control>}a{/Control}");
    await waitFor(() => expect(bulkCount()).toBe(`${rows}개 선택`));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/^\d+개 선택$/)).not.toBeInTheDocument());

    const search = within(screen.getByRole("region", { name: "프로젝트 이슈" })).getByRole("textbox", { name: "검색" });
    search.focus();
    fireEvent.keyDown(search, { key: "a", ctrlKey: true });
    expect(screen.queryByText(/^\d+개 선택$/)).not.toBeInTheDocument();
  });
});

describe("인라인 만들기", () => {
  it("목록 끝 — 제목만 적고 Enter로 연달아 만든다", async () => {
    const user = userEvent.setup();
    const table = await openList();
    await user.click(screen.getByRole("button", { name: "목록에 이슈 만들기" }));
    const input = screen.getByRole("textbox", { name: "목록 새 이슈 제목" });
    await user.type(input, "목록 인라인{Enter}");
    expect(await screen.findByText(/를 만들었습니다$/)).toBeInTheDocument();
    await waitFor(async () => expect((await listIssues("p1")).some((i) => i.title === "목록 인라인")).toBe(true));
    expect(screen.getByRole("textbox", { name: "목록 새 이슈 제목" })).toHaveValue("");
    expect(table).toBeInTheDocument();
  });

  it("그룹 머리글 — 그 그룹 값(담당자)으로 만든다", async () => {
    const user = userEvent.setup();
    await openList();
    await user.keyboard("{Shift>}V{/Shift}");
    const panel = within(await screen.findByRole("dialog", { name: "표시 옵션" }));
    await user.click(panel.getByRole("combobox", { name: "그룹" }));
    await user.click(await screen.findByRole("option", { name: "담당자" }));
    await user.keyboard("{Escape}");
    const group = await screen.findByRole("region", { name: /^김찬호 \d+건$/ });
    await user.click(within(group).getByRole("button", { name: "김찬호에 이슈 만들기" }));
    await user.type(within(group).getByRole("textbox", { name: "김찬호 새 이슈 제목" }), "그룹 인라인{Enter}");
    await waitFor(async () => {
      const created = (await listIssues("p1")).find((i) => i.title === "그룹 인라인");
      expect(created?.assigneeId).toBe("u1");
    });
    expect(await screen.findByRole("region", { name: /^김찬호 3건$/ })).toBeInTheDocument();
  });

  it("그룹 값 → 만들기 값", () => {
    expect(groupCreatePatch("status", "inprogress")).toEqual({ status: "inprogress" });
    expect(groupCreatePatch("assignee", null)).toEqual({ assigneeId: null });
    expect(groupCreatePatch("label", "backend")).toEqual({ labels: ["backend"] });
    expect(groupCreatePatch("epic", "i9")).toEqual({ parentId: "i9" });
    expect(groupCreatePatch("label", null)).toEqual({});
    expect(groupCreatePatch("none", null)).toEqual({});
  });
});

describe("이슈 만들기 초안 보존", () => {
  async function openCreate(user: User) {
    await user.keyboard("c");
    return screen.findByRole("dialog", { name: "이슈 만들기" });
  }

  it("닫아도 프로젝트별 초안으로 남고, 다시 열면 복원 — 초안 삭제로 비운다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-2");
    let dialog = await openCreate(user);
    await user.type(within(dialog).getByLabelText("요약 *"), "반쯤 쓴 이슈");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "이슈 만들기" })).not.toBeInTheDocument());
    await waitFor(async () => expect((await getCreateIssueDraft("p1"))?.title).toBe("반쯤 쓴 이슈"));

    dialog = await openCreate(user);
    await waitFor(() => expect(within(dialog).getByLabelText("요약 *")).toHaveValue("반쯤 쓴 이슈"));
    expect(within(dialog).getByText(/저장해 둔 초안을 불러왔습니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "초안 삭제" }));
    expect(within(dialog).getByLabelText("요약 *")).toHaveValue("");
    await waitFor(async () => expect(await getCreateIssueDraft("p1")).toBeNull());
  });

  it("만들면 초안은 지워진다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-2");
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByLabelText("요약 *"), "끝까지 쓴 이슈");
    await waitFor(async () => expect((await getCreateIssueDraft("p1"))?.title).toBe("끝까지 쓴 이슈"));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "이슈 만들기" })).not.toBeInTheDocument());
    expect(await getCreateIssueDraft("p1")).toBeNull();
    expect((await listIssues("p1")).some((i) => i.title === "끝까지 쓴 이슈")).toBe(true);
    expect(await getIssueByKey("ALM-2")).not.toBeNull();
  });
});
