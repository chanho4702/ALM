import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest, getIssueByKey } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
// 지연 로드 청크를 미리 올린다 — 병렬 실행에서 첫 findBy가 청크 변환을 기다리다 한도를 넘지 않게
import "../components/IssueDetailModal";
import "./IssueListPage";
import "./BoardPage";
import "./BacklogPage";

/**
 * 웨이브 B(리니어 조작감) 통합 — 명령 팔레트(⌘K), 미리보기(Space), 우클릭 메뉴, 보드·백로그 다중 선택,
 * 속성 단축키(s/p/a/l), 스켈레톤 자리. 앱 전체를 목업 스토어로 띄운다.
 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetCommandScopeForTest();
});

afterEach(() => vi.restoreAllMocks());

const location = () => screen.getByTestId("location").textContent;
const blur = () => (document.activeElement as HTMLElement | null)?.blur();

async function openIssueList() {
  renderAt("/projects/p1/issues");
  const table = await screen.findByRole("table", { name: "이슈 목록" });
  await within(table).findByText("ALM-1");
  return table;
}

/** 행 하나 — 키 칸에서 tr로 올라간다 */
const rowOf = (table: HTMLElement, key: string) => within(table).getByText(key).closest("tr")!;

describe("명령 팔레트 (⌘K / Ctrl+K)", () => {
  it("Ctrl+K로 열고, 검색한 이동 명령을 Enter로 실행하면 닫히고 화면이 바뀐다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "명령 팔레트" });
    // 단축키가 있는 명령은 키 힌트를 함께 알린다
    expect(within(palette).getByRole("option", { name: /이슈 만들기/ })).toHaveAttribute("aria-keyshortcuts", "C");
    await user.keyboard("백로그");
    const option = within(palette).getByRole("option", { name: /^백로그/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "명령 팔레트" })).not.toBeInTheDocument());
    await waitFor(() => expect(location()).toBe("/projects/p1/backlog"));
  });

  it("입력란에 있어도 열리고, 다시 누르면 닫힌다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    await user.click(screen.getByRole("textbox", { name: "검색" }));
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "명령 팔레트" })).toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "명령 팔레트" })).not.toBeInTheDocument());
  });

  it("커서 이슈의 상태를 하위 페이지에서 바꾸면 화면에 바로 반영되고 스토어에 저장된다", async () => {
    const user = userEvent.setup();
    const table = await openIssueList();
    blur();
    await user.keyboard("j"); // 커서 = ALM-1(완료)
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "명령 팔레트" });
    const statusCommand = within(palette).getByRole("option", { name: /상태 변경…/ });
    expect(statusCommand).toHaveAttribute("aria-keyshortcuts", "S");
    await user.click(statusCommand);
    await user.click(within(palette).getByRole("option", { name: /^진행 중/ }));
    expect(await screen.findByText("상태를 진행 중(으)로 바꿨습니다")).toBeInTheDocument();
    await waitFor(async () => expect((await getIssueByKey("ALM-1"))?.status).toBe("inprogress"));
    expect(within(rowOf(table, "ALM-1")).getByText("진행 중")).toBeInTheDocument();
  });

  it("고른 이슈가 여럿이면 팔레트 명령이 선택 전부에 적용된다(일괄 API)", async () => {
    const user = userEvent.setup();
    const bulk = vi.spyOn(store, "bulkUpdateIssues");
    await openIssueList();
    await user.click(screen.getByRole("checkbox", { name: "ALM-6 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "ALM-7 선택" }));
    blur();
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "명령 팔레트" });
    expect(within(palette).getByRole("group", { name: "선택한 2개 이슈" })).toBeInTheDocument();
    await user.click(within(palette).getByRole("option", { name: /우선순위 변경…/ }));
    await user.click(within(palette).getByRole("option", { name: /^최상/ }));
    await waitFor(() => expect(bulk).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ key: "ALM-6" }), expect.objectContaining({ key: "ALM-7" })]),
      { priority: "highest" },
    ));
    await waitFor(async () => expect((await getIssueByKey("ALM-7"))?.priority).toBe("highest"));
  });

  it("상단바 버튼으로도 열린다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    await user.click(screen.getByRole("button", { name: "명령 팔레트" }));
    expect(await screen.findByRole("dialog", { name: "명령 팔레트" })).toBeInTheDocument();
  });
});

describe("속성 단축키 s/p/a/l", () => {
  it("목록 커서에서 a는 담당자 페이지로 팔레트를 열고, 고르면 바뀐다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    blur();
    await user.keyboard("j");
    await user.keyboard("a");
    const palette = await screen.findByRole("dialog", { name: "명령 팔레트 — 담당자 변경" });
    await user.click(within(palette).getByRole("option", { name: /^미지정/ }));
    await waitFor(async () => expect((await getIssueByKey("ALM-1"))?.assigneeId).toBeNull());
  });

  it("l은 라벨 페이지 — 없는 라벨은 검색어로 새로 붙인다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    blur();
    await user.keyboard("j");
    await user.keyboard("l");
    const palette = await screen.findByRole("dialog", { name: "명령 팔레트 — 라벨" });
    await user.keyboard("urgent");
    await user.click(within(palette).getByRole("option", { name: /새 라벨 "urgent" 붙이기/ }));
    await waitFor(async () => expect((await getIssueByKey("ALM-1"))?.labels).toContain("urgent"));
  });

  it("대상이 없으면(커서·선택 없음) 열지 않는다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    blur();
    await user.keyboard("s");
    expect(screen.queryByRole("dialog", { name: /명령 팔레트/ })).not.toBeInTheDocument();
  });

  it("상세에서 s는 상태, p는 우선순위 선택지를 펼친다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues?issue=ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await within(dialog).findByRole("combobox", { name: "상태" });
    blur();
    await user.keyboard("s");
    expect(await screen.findByRole("option", { name: "진행 중" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("option", { name: "진행 중" })).not.toBeInTheDocument());
    blur();
    await user.keyboard("p");
    expect(await screen.findByRole("option", { name: "최상" })).toBeInTheDocument();
  });
});

describe("미리보기 (Space)", () => {
  it("커서 이슈를 Space로 열고, j로 이웃 이슈로 바꾸고, Space로 닫는다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    blur();
    await user.keyboard("j");
    await user.keyboard(" ");
    const peek = await screen.findByRole("complementary", { name: "ALM-1 미리보기" });
    expect(within(peek).getByRole("heading", { name: "프로젝트 스캐폴드 구성" })).toBeInTheDocument();
    // 모달이 아니다 — 목록 단축키가 계속 동작한다
    await user.keyboard("j");
    expect(await screen.findByRole("complementary", { name: "ALM-2 미리보기" })).toBeInTheDocument();
    await user.keyboard(" ");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: /미리보기/ })).not.toBeInTheDocument());
  });

  it("Esc로 닫고, 미리보기 중 Enter는 상세를 연다", async () => {
    const user = userEvent.setup();
    await openIssueList();
    blur();
    await user.keyboard("j");
    await user.keyboard(" ");
    await screen.findByRole("complementary", { name: "ALM-1 미리보기" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: /미리보기/ })).not.toBeInTheDocument());
    await user.keyboard(" ");
    await screen.findByRole("complementary", { name: "ALM-1 미리보기" });
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "ALM-1" })).toBeInTheDocument();
  });

  it("버튼에 포커스가 있으면 Space는 버튼을 누른다(가로채지 않는다)", async () => {
    const user = userEvent.setup();
    await openIssueList();
    await user.keyboard("j");
    screen.getByRole("button", { name: "열" }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("group", { name: "표시할 열" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /미리보기/ })).not.toBeInTheDocument();
  });

  it("보드에서는 마우스가 가리킨 카드를 연다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    const card = await screen.findByText("ALM-3");
    await user.hover(card);
    blur();
    await user.keyboard(" ");
    expect(await screen.findByRole("complementary", { name: "ALM-3 미리보기" })).toBeInTheDocument();
  });
});

describe("우클릭 메뉴", () => {
  it("목록 행 우클릭 — 아이콘+텍스트 항목과 단축키 힌트, 하위 메뉴에서 우선순위를 바꾼다", async () => {
    const user = userEvent.setup();
    const table = await openIssueList();
    fireEvent.contextMenu(within(rowOf(table, "ALM-5")).getByText("이슈 목록 필터 구현"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("ALM-5 이슈 목록 필터 구현")).toBeInTheDocument();
    const priority = within(menu).getByRole("menuitem", { name: "우선순위 변경" });
    // 하위 메뉴 트리거의 키 힌트는 보이는 글자(kbd)로만 — 접근 이름에는 섞지 않는다
    expect(within(priority).getByText("P")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "나에게 할당" })).toHaveAttribute("aria-keyshortcuts", "I");
    expect(within(menu).getByRole("menuitem", { name: "키 복사" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "삭제" })).toBeInTheDocument();
    await user.click(priority);
    // 하위 메뉴 항목은 fireEvent로 — jsdom엔 레이아웃이 없어 Radix 하위 메뉴의 포인터 유예 영역 계산이 메뉴를 닫는다
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "높음" }));
    await waitFor(async () => expect((await getIssueByKey("ALM-5"))?.priority).toBe("high"));
  });

  it("고른 이슈 중 하나를 우클릭하면 선택 전체(n개 이슈)에 적용된다", async () => {
    const user = userEvent.setup();
    const table = await openIssueList();
    await user.click(screen.getByRole("checkbox", { name: "ALM-6 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "ALM-8 선택" }));
    fireEvent.contextMenu(within(rowOf(table, "ALM-6")).getByText("코멘트 기능 구현"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("2개 이슈")).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "담당자 변경" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "미지정" }));
    await waitFor(async () => {
      expect((await getIssueByKey("ALM-6"))?.assigneeId).toBeNull();
      expect((await getIssueByKey("ALM-8"))?.assigneeId).toBeNull();
    });
  });

  it("삭제는 확인 창을 거친다", async () => {
    const user = userEvent.setup();
    const table = await openIssueList();
    fireEvent.contextMenu(within(rowOf(table, "ALM-7")).getByText("활동 로그 표시"));
    await user.click(await screen.findByRole("menuitem", { name: "삭제" }));
    const confirm = await screen.findByRole("dialog", { name: "ALM-7를 삭제할까요?" });
    await user.click(within(confirm).getByRole("button", { name: "삭제" }));
    await waitFor(async () => expect(await getIssueByKey("ALM-7")).toBeNull());
  });

  it("실패하면 낙관적으로 바꾼 값을 되돌리고 이유를 알린다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "bulkUpdateIssues").mockRejectedValue(new Error("서버가 응답하지 않습니다"));
    const table = await openIssueList();
    fireEvent.contextMenu(within(rowOf(table, "ALM-5")).getByText("이슈 목록 필터 구현"));
    await user.click(await screen.findByRole("menuitem", { name: "상태 변경" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "완료" }));
    expect(await screen.findByText("서버가 응답하지 않습니다")).toBeInTheDocument();
    expect(within(rowOf(table, "ALM-5")).getByText("할 일")).toBeInTheDocument();
  });
});

describe("보드·백로그 다중 선택", () => {
  it("보드 — Ctrl+클릭으로 하나씩, Shift+클릭으로 범위, Esc로 해제", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-4");
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("ALM-4"));
    await user.click(screen.getByText("ALM-5"));
    await user.keyboard("{/Control}");
    const bar = await screen.findByRole("toolbar", { name: "대량 작업" });
    expect(within(bar).getByText("2개 선택")).toBeInTheDocument();
    // 상세는 열리지 않는다
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Shift+클릭 — 기준점(ALM-5)부터 보이는 순서로 ALM-3까지(할 일 → 진행 중: ALM-5, ALM-2, ALM-3)
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("ALM-3"));
    await user.keyboard("{/Shift}");
    expect(within(bar).getByText("4개 선택")).toBeInTheDocument();
    blur();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "대량 작업" })).not.toBeInTheDocument());
  });

  it("보드 — 고른 카드에 대량 변경을 적용한다(기존 일괄 편집 모달)", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-4");
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("ALM-4"));
    await user.click(screen.getByText("ALM-5"));
    await user.keyboard("{/Control}");
    await user.click(within(screen.getByRole("toolbar", { name: "대량 작업" })).getByRole("button", { name: "대량 변경" }));
    const modal = await screen.findByRole("dialog", { name: "대량 변경" });
    expect(within(modal).getByText("2개 이슈에 같은 변경을 적용합니다. 손대지 않은 항목은 그대로 둡니다.")).toBeInTheDocument();
  });

  it("백로그 — x로 포커스한 행을 고르고, Shift+클릭으로 범위를 넓힌다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/backlog");
    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    const row = (key: string) => within(backlog).getByText(key).closest<HTMLElement>("[data-issue-key]")!;
    act(() => row("ALM-6").focus());
    await user.keyboard("x");
    const bar = await screen.findByRole("toolbar", { name: "대량 작업" });
    expect(within(bar).getByText("1개 선택")).toBeInTheDocument();
    await user.keyboard("{Shift>}");
    await user.click(within(row("ALM-8")).getByText("다크 테마 점검"));
    await user.keyboard("{/Shift}");
    expect(within(bar).getByText("3개 선택")).toBeInTheDocument();
    // 다시 x면 빠진다
    act(() => row("ALM-6").focus());
    await user.keyboard("x");
    expect(within(bar).getByText("2개 선택")).toBeInTheDocument();
  });

  it("백로그 행 Enter는 상세, Space는 미리보기", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/backlog");
    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    const row = within(backlog).getByText("ALM-7").closest<HTMLElement>("[data-issue-key]")!;
    act(() => row.focus());
    await user.keyboard(" ");
    expect(await screen.findByRole("complementary", { name: "ALM-7 미리보기" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("스켈레톤 자리", () => {
  it("보드 로딩은 실제와 같은 컬럼 4 × 카드 3 자리를 잡고, 상태 이름을 알린다", async () => {
    let release: () => void = () => {};
    const original = store.getBoard;
    vi.spyOn(store, "getBoard").mockImplementation(
      (id) => new Promise((resolve) => (release = () => void original(id).then(resolve))),
    );
    renderAt("/projects/p1/boards/b1");
    const status = await screen.findByRole("status", { name: "보드 불러오는 중" });
    expect(status).toHaveAttribute("aria-busy", "true");
    const columns = status.querySelectorAll(".board-columns > .board-column");
    expect(columns).toHaveLength(4);
    columns.forEach((column) => expect(column.querySelectorAll(".skeleton-board-card")).toHaveLength(3));
    await act(async () => release());
    await waitFor(() => expect(screen.queryByRole("status", { name: "보드 불러오는 중" })).not.toBeInTheDocument());
  });

  it("이슈 목록 첫 조회는 머리글을 둔 채 행 10개 자리를 그린다", async () => {
    let release: () => void = () => {};
    const original = store.listIssuesPage;
    vi.spyOn(store, "listIssuesPage").mockImplementation(
      (...args) => new Promise((resolve) => (release = () => void original(...args).then(resolve))),
    );
    renderAt("/projects/p1/issues");
    const placeholder = await screen.findByRole("table", { name: "이슈 목록 (불러오는 중)" });
    expect(placeholder).toHaveAttribute("aria-busy", "true");
    expect(within(placeholder).getAllByRole("columnheader").length).toBeGreaterThan(3);
    expect(placeholder.querySelectorAll("tbody tr")).toHaveLength(10);
    await act(async () => release());
    expect(await screen.findByRole("table", { name: "이슈 목록" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "이슈 목록 (불러오는 중)" })).not.toBeInTheDocument();
  });
});
