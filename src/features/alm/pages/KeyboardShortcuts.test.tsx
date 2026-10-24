import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getCurrentUser, getIssueByKey } from "../store/jiraStore";
import { keyboardShortcutsEnabled, setKeyboardShortcutsEnabled } from "../store/uiStore";
// 지연 로드 청크를 미리 올린다 — 병렬 실행에서 첫 findBy가 청크 변환을 기다리다 한도를 넘지 않게
import "../components/IssueDetailModal";
import "../components/CreateIssueModal";
import "./IssueListPage";
import "./GlobalSettingsPage";

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

const location = () => screen.getByTestId("location").textContent;

describe("전역 단축키 (지라 클라우드 기준)", () => {
  it("c는 이슈 만들기, ?는 단축키 도움말을 연다", async () => {
    const user = userEvent.setup();
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    await user.keyboard("?");
    const help = await screen.findByRole("dialog", { name: "키보드 단축키" });
    expect(within(help).getByRole("table", { name: "이동 단축키" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "키보드 단축키" })).not.toBeInTheDocument());

    await user.keyboard("c");
    expect(await screen.findByRole("dialog", { name: "이슈 만들기" })).toBeInTheDocument();
  });

  it("/는 상단바 검색란에 포커스한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });
    await user.keyboard("/");
    expect(screen.getByRole("searchbox", { name: "전역 검색" })).toHaveFocus();
  });

  it("입력란에 포커스가 있으면 동작하지 않는다", async () => {
    const user = userEvent.setup();
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });
    await user.click(screen.getByRole("searchbox", { name: "전역 검색" }));
    // 검색란에 친 c는 글자다 — 만들기 모달이 아니라 검색 모달이 열린다(검색란 기본 동작)
    await user.keyboard("c");
    expect(screen.queryByRole("dialog", { name: "이슈 만들기" })).not.toBeInTheDocument();
  });

  it("IME 조합 중인 키와 Ctrl 조합은 무시한다", async () => {
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });
    fireEvent.keyDown(document.body, { key: "c", isComposing: true });
    fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "c", metaKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog", { name: "이슈 만들기" })).not.toBeInTheDocument();
  });

  it("모달이 열려 있으면 Esc 외 단축키는 무시한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });
    await user.keyboard("?");
    const help = await screen.findByRole("dialog", { name: "키보드 단축키" });
    // 모달 안에서도 포커스는 입력란이 아니다 — 그래도 c·g d는 먹지 않는다
    fireEvent.keyDown(help, { key: "c" });
    fireEvent.keyDown(help, { key: "g" });
    fireEvent.keyDown(help, { key: "d" });
    expect(screen.queryByRole("dialog", { name: "이슈 만들기" })).not.toBeInTheDocument();
    expect(location()).toBe("/projects");
  });

  it("g 다음 d·p·b·i로 화면을 옮긴다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues");
    await screen.findByRole("table", { name: "이슈 목록" });

    await user.keyboard("gb");
    await waitFor(() => expect(location()).toMatch(/^\/projects\/p1\/boards?\//));
    await user.keyboard("gi");
    await waitFor(() => expect(location()).toBe("/projects/p1/issues"));
    await user.keyboard("gd");
    await waitFor(() => expect(location()).toBe("/dashboards"));
    // 프로젝트 밖의 g i는 이슈 검색
    await user.keyboard("gi");
    await waitFor(() => expect(location()).toBe("/search"));
    await user.keyboard("gp");
    await waitFor(() => expect(location()).toBe("/projects"));
  });

  it("g 다음 키가 1초 안에 오지 않으면 시퀀스를 버린다", async () => {
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(10_000);
    fireEvent.keyDown(document.body, { key: "g" });
    now.mockReturnValue(11_500);
    fireEvent.keyDown(document.body, { key: "d" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(location()).toBe("/projects");
    // 1초 안이면 이동한다
    now.mockReturnValue(20_000);
    fireEvent.keyDown(document.body, { key: "g" });
    now.mockReturnValue(20_600);
    fireEvent.keyDown(document.body, { key: "d" });
    await waitFor(() => expect(location()).toBe("/dashboards"));
  });

  it("개인 설정에서 끄면 단축키가 멈추고, 설정은 저장된다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/personal");
    const toggle = await screen.findByRole("switch", { name: "키보드 단축키 사용" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(keyboardShortcutsEnabled()).toBe(false);

    await user.keyboard("?");
    await user.keyboard("c");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("꺼 둔 설정은 새로 열어도 유지된다", async () => {
    await setKeyboardShortcutsEnabled(false);
    renderAt("/settings/personal");
    expect(await screen.findByRole("switch", { name: "키보드 단축키 사용" })).not.toBeChecked();
  });
});

describe("이슈 목록 단축키", () => {
  it("j/k로 행을 고르고 o로 연다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    const keys = () => within(table).getAllByText(/^ALM-\d+$/);
    const current = () => keys().find((el) => el.getAttribute("aria-current") === "true")?.textContent;

    await user.keyboard("j");
    expect(current()).toBe(keys()[0].textContent);
    await user.keyboard("j");
    expect(current()).toBe(keys()[1].textContent);
    await user.keyboard("k");
    const chosen = keys()[0].textContent!;
    expect(current()).toBe(chosen);
    // 맨 위에서 k는 그대로
    await user.keyboard("k");
    expect(current()).toBe(chosen);

    await user.keyboard("o");
    expect(await screen.findByRole("dialog", { name: chosen })).toBeInTheDocument();
    // 상세가 열린 동안 j는 목록을 움직이지 않는다(모달 열림 중 무시)
    await user.keyboard("j");
    expect(current()).toBe(chosen);
  });
});

describe("이슈 상세 단축키", () => {
  it("i는 나에게 할당한다", async () => {
    const user = userEvent.setup();
    const me = await getCurrentUser();
    const before = await getIssueByKey("ALM-4");
    renderAt("/projects/p1/issues?issue=ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await within(dialog).findByRole("combobox", { name: "담당자" });
    if (before?.assigneeId === me.id) {
      // 시드가 바뀌어 이미 내 이슈면 먼저 미지정으로 돌린다
      await user.click(within(dialog).getByRole("combobox", { name: "담당자" }));
      await user.click(await screen.findByRole("option", { name: "미지정" }));
      await screen.findByText("담당자를 변경했습니다");
    }
    // 포커스를 입력란 밖(모달 본문)에 둔다
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("i");
    expect(await screen.findByText("나에게 할당했습니다")).toBeInTheDocument();
    await waitFor(async () => expect((await getIssueByKey("ALM-4"))?.assigneeId).toBe(me.id));
  });

  it("e는 제목 편집, l은 라벨 입력, m은 코멘트 입력으로 들어간다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues?issue=ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await within(dialog).findByRole("button", { name: "제목 편집" });
    (document.activeElement as HTMLElement | null)?.blur();

    await user.keyboard("e");
    const titleInput = await within(dialog).findByRole("textbox", { name: "제목" });
    expect(titleInput).toBeInTheDocument();
    // 편집을 취소하고 나온다. DS 0.13.0부터 InlineEdit의 저장·취소는 포털 팝오버라 모달 밖(document.body)에 있다
    await user.click(screen.getByRole("button", { name: "취소" }));
    await within(dialog).findByRole("button", { name: "제목 편집" });
    (document.activeElement as HTMLElement | null)?.blur();

    await user.keyboard("l");
    expect(within(dialog).getByLabelText("라벨 추가")).toHaveFocus();
    (document.activeElement as HTMLElement | null)?.blur();

    await user.keyboard("m");
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "코멘트" })).toHaveFocus());
  });

  it("a는 담당자 선택지를 펼친다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues?issue=ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await within(dialog).findByRole("combobox", { name: "담당자" });
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("a");
    expect(await screen.findByRole("option", { name: "미지정" })).toBeInTheDocument();
  });
});
