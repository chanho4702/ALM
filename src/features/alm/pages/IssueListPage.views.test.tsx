import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import {
  __resetForTest,
  createIssue,
  createView,
  getView,
  listProjectViews,
  setIssueFlag,
  updateProjectMemberRole,
  updateView,
} from "../store/jiraStore";
// 지연 로드 청크를 미리 올린다(병렬 실행에서 첫 findBy가 변환을 기다리다 한도를 넘지 않게)
import "../components/IssueDetailModal";
import "./IssueListPage";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderIssues(initialPath = "/projects/p1/issues") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

const toolbar = () => within(screen.getByRole("toolbar", { name: "이슈 목록 도구" }));

async function openDisplay(user: User) {
  await user.click(toolbar().getByRole("button", { name: "표시" }));
  return screen.findByRole("dialog", { name: "표시 옵션" });
}

async function pick(user: User, scope: ReturnType<typeof within>, label: string, option: string) {
  await user.click(scope.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

async function saveView(user: User, name: string) {
  await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
  await user.click(await screen.findByRole("menuitem", { name: "보기로 저장" }));
  const dialog = within(await screen.findByRole("dialog", { name: "보기로 저장" }));
  await user.type(dialog.getByLabelText("이름"), name);
  await user.click(dialog.getByRole("button", { name: "저장" }));
}

const currentViewId = () => new URLSearchParams(screen.getByTestId("location").textContent!.split("?")[1] ?? "").get("view");

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("이슈 목록 — 표시 옵션 (D1)", () => {
  it("Shift+V로 열고, 담당자로 묶으면 표 대신 건수 달린 그룹이 나온다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });

    await user.keyboard("{Shift>}V{/Shift}");
    const panel = within(await screen.findByRole("dialog", { name: "표시 옵션" }));
    await pick(user, panel, "그룹", "담당자");

    expect(await screen.findByRole("region", { name: "김찬호 2건" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "미지정 3건" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "이슈 목록" })).not.toBeInTheDocument();
    const mine = within(screen.getByRole("region", { name: "김찬호 2건" }));
    expect(mine.getByText("ALM-1")).toBeInTheDocument();
    expect(mine.getByText("ALM-3")).toBeInTheDocument();

    // 그룹을 접으면 행이 숨는다
    await user.keyboard("{Escape}");
    await user.click(mine.getByRole("button", { expanded: true }));
    expect(mine.queryByText("ALM-1")).not.toBeInTheDocument();
  });

  it("보드 레이아웃은 그룹을 열로, 이슈를 카드로 그린다 — 기본값으로 누르면 표로 돌아온다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    const panel = within(await openDisplay(user));
    await pick(user, panel, "그룹", "상태");
    await user.click(panel.getByRole("radio", { name: "보드" }));

    const board = await screen.findByLabelText("이슈 보드 보기");
    const todo = within(within(board).getByRole("region", { name: "할 일 5건" }));
    expect(todo.getByText("코멘트 기능 구현")).toBeInTheDocument();
    expect(within(board).getByRole("region", { name: "진행 중 2건" })).toBeInTheDocument();

    await user.click(panel.getByRole("button", { name: "기본값으로" }));
    expect(await screen.findByRole("table", { name: "이슈 목록" })).toBeInTheDocument();
  });

  it("AQL 필터 flagged = true면 플래그 켠 이슈만 남는다 — 표의 제목 칸에도 막힘 표시", async () => {
    await setIssueFlag("i3", true);
    const user = userEvent.setup();
    renderIssues();
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    const row3 = within(within(table).getByText("ALM-3").closest("tr")!);
    expect(row3.getByText("이슈 상세 모달 구현")).toBeInTheDocument();
    expect(row3.getByText("막힘")).toBeInTheDocument();

    const panel = within(await openDisplay(user));
    await user.type(panel.getByLabelText("필터 (AQL)"), "flagged = true");
    await waitFor(() => expect(screen.queryByRole("table", { name: "이슈 목록" })).not.toBeInTheDocument());
    const list = await screen.findByLabelText("이슈 그룹 보기");
    await waitFor(() => expect(within(list).queryByText("ALM-1")).not.toBeInTheDocument());
    expect(within(list).getByText("ALM-3")).toBeInTheDocument();
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("틀린 AQL은 적용하지 않고 오류를 보여 준다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    const panel = within(await openDisplay(user));
    await user.type(panel.getByLabelText("필터 (AQL)"), "flagged ==");
    await waitFor(() => expect(panel.getByLabelText("필터 (AQL)")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("table", { name: "이슈 목록" })).toBeInTheDocument();
  });

  it("하위 이슈 표시를 끄면 하위 작업이 빠진다", async () => {
    const sub = await createIssue({ projectId: "p1", title: "보드 드래그 하위 작업", type: "subtask", parentId: "i2" });
    const user = userEvent.setup();
    renderIssues();
    expect(await screen.findByText(sub.key)).toBeInTheDocument();
    const panel = within(await openDisplay(user));
    await user.click(panel.getByRole("switch", { name: "하위 이슈 표시" }));
    const list = await screen.findByLabelText("이슈 그룹 보기");
    expect(within(list).getByText("ALM-1")).toBeInTheDocument();
    expect(within(list).queryByText(sub.key)).not.toBeInTheDocument();
  });

  it("표시 옵션은 내 브라우저에 남아 다시 열어도 유지된다", async () => {
    const user = userEvent.setup();
    const first = renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    const panel = within(await openDisplay(user));
    await pick(user, panel, "그룹", "우선순위");
    await screen.findByRole("region", { name: "보통 3건" });
    first.unmount();

    renderIssues();
    expect(await screen.findByRole("region", { name: "보통 3건" })).toBeInTheDocument();
  });
});

describe("이슈 목록 — 저장된 보기 (D1)", () => {
  it("보기로 저장 → 고르기·사이드바에 나오고, ?view= 로 다시 열면 그 보기가 복원된다", async () => {
    const user = userEvent.setup();
    const first = renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    const panel = within(await openDisplay(user));
    await pick(user, panel, "그룹", "담당자");
    await user.click(panel.getByRole("radio", { name: "보드" }));
    await user.keyboard("{Escape}");
    await saveView(user, "담당자 보드");

    await waitFor(() => expect(currentViewId()).not.toBeNull());
    expect(await toolbar().findByRole("button", { name: "보기: 담당자 보드" })).toBeInTheDocument();
    const nav = within(await screen.findByTestId("nav-views"));
    expect(nav.getByRole("button", { name: "담당자 보드" })).toBeInTheDocument();

    // 고르기 목록 — 개인 보기라 공유 배지가 없다
    await user.click(toolbar().getByRole("button", { name: "보기: 담당자 보드" }));
    const picker = within(await screen.findByRole("dialog", { name: "저장된 보기 목록" }));
    expect(picker.getByRole("button", { name: "담당자 보드" })).toHaveAttribute("aria-current", "true");
    expect(picker.queryByText("프로젝트 공유")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    // 보기 닫기 → 평소 표(내 표시 옵션은 보기에 담겼으니 기본값)
    await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
    await user.click(await screen.findByRole("menuitem", { name: "보기 닫기" }));
    expect(await screen.findByRole("table", { name: "이슈 목록" })).toBeInTheDocument();

    const id = (await listProjectViews("p1"))[0].id;
    first.unmount();
    renderIssues(`/projects/p1/issues?view=${id}`);
    const board = await screen.findByLabelText("이슈 보드 보기");
    expect(within(board).getByRole("region", { name: "김찬호 2건" })).toBeInTheDocument();
    expect(toolbar().getByRole("button", { name: "보기: 담당자 보드" })).toBeInTheDocument();
  });

  it("바꾼 보기를 업데이트하고, 삭제하면 표로 돌아간다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    let panel = within(await openDisplay(user));
    await pick(user, panel, "그룹", "담당자");
    await user.keyboard("{Escape}");
    await saveView(user, "내 보기");
    await waitFor(() => expect(currentViewId()).not.toBeNull());
    const id = currentViewId()!;
    await screen.findByRole("button", { name: "보기: 내 보기" });

    panel = within(await openDisplay(user));
    await pick(user, panel, "그룹", "상태");
    await user.keyboard("{Escape}");
    expect(await toolbar().findByText("변경됨")).toBeInTheDocument();
    await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
    await user.click(await screen.findByRole("menuitem", { name: "현재 보기 업데이트" }));
    await waitFor(() => expect(toolbar().queryByText("변경됨")).not.toBeInTheDocument());
    expect((await getView(id)).display.groupBy).toBe("status");

    await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
    await user.click(await screen.findByRole("menuitem", { name: "보기 삭제" }));
    const confirm = within(await screen.findByRole("dialog", { name: "보기 삭제" }));
    await user.click(confirm.getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("table", { name: "이슈 목록" })).toBeInTheDocument();
    expect(await listProjectViews("p1")).toEqual([]);
    await waitFor(() => expect(screen.queryByTestId("nav-views")).not.toBeInTheDocument());
  });

  it("남이 먼저 고친 보기를 업데이트하면(409) 최신 보기를 다시 불러올지 묻는다", async () => {
    const view = await createView({ name: "충돌 보기", projectId: "p1", display: { groupBy: "assignee" } });
    const user = userEvent.setup();
    renderIssues(`/projects/p1/issues?view=${view.id}`);
    await screen.findByRole("region", { name: "김찬호 2건" });
    const panel = within(await openDisplay(user));
    await pick(user, panel, "그룹", "상태");
    await user.keyboard("{Escape}");
    await updateView(view.id, { display: { groupBy: "priority" } }, view.version); // 다른 탭에서 먼저 저장

    await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
    await user.click(await screen.findByRole("menuitem", { name: "현재 보기 업데이트" }));
    const conflict = within(await screen.findByRole("dialog", { name: "다른 사람이 먼저 보기를 수정했습니다" }));
    await user.click(conflict.getByRole("button", { name: "최신 보기 불러오기" }));
    expect(await screen.findByRole("region", { name: "보통 3건" })).toBeInTheDocument();
    expect(toolbar().queryByText("변경됨")).not.toBeInTheDocument();
  });

  it("프로젝트 공유로 저장하면 배지가 붙고, 뷰어는 프로젝트 공유를 고를 수 없다", async () => {
    const user = userEvent.setup();
    const first = renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
    await user.click(await screen.findByRole("menuitem", { name: "보기로 저장" }));
    let dialog = within(await screen.findByRole("dialog", { name: "보기로 저장" }));
    await user.type(dialog.getByLabelText("이름"), "팀 보기");
    await waitFor(() => expect(dialog.getByRole("radio", { name: "프로젝트 공유" })).toBeEnabled());
    await user.click(dialog.getByRole("radio", { name: "프로젝트 공유" }));
    await user.click(dialog.getByRole("button", { name: "저장" }));
    await screen.findByRole("button", { name: "보기: 팀 보기" });
    await user.click(toolbar().getByRole("button", { name: "보기: 팀 보기" }));
    const picker = within(await screen.findByRole("dialog", { name: "저장된 보기 목록" }));
    expect(within(picker.getByRole("button", { name: /팀 보기/ })).getByText("프로젝트 공유")).toBeInTheDocument();
    first.unmount();

    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "viewer");
    renderIssues();
    await screen.findByRole("table", { name: "이슈 목록" });
    await user.click(toolbar().getByRole("button", { name: "보기 작업" }));
    await user.click(await screen.findByRole("menuitem", { name: "보기로 저장" }));
    dialog = within(await screen.findByRole("dialog", { name: "보기로 저장" }));
    expect(dialog.getByRole("radio", { name: "프로젝트 공유" })).toBeDisabled();
    expect(dialog.getByText(/편집 권한이 있어야/)).toBeInTheDocument();
  });
});
