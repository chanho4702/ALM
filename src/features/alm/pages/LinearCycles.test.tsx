import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getIssueByKey, getPlanningSettings, updatePlanningSettings } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import "./BacklogPage";
import "./ProjectSettingsPage";
import "../components/IssueDetailModal";

/** Linear 강점 반영 — 사이클(스프린트 자동화)·추정 척도·인라인 만들기 */
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
afterEach(() => vi.restoreAllMocks());

describe("프로젝트 설정 › 계획(사이클·추정)", () => {
  it("스프린트 자동화(자동 생성·길이·쿨다운·이월 기본값)와 추정 척도를 저장한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/planning");
    const autoCreate = await screen.findByRole("switch", { name: "완료하면 다음 스프린트 자동 생성" });
    await user.click(autoCreate);
    const cooldown = screen.getByLabelText("쿨다운(일)");
    await user.clear(cooldown);
    await user.type(cooldown, "2");
    await user.click(screen.getByRole("radio", { name: "다음 스프린트로" }));
    await user.click(screen.getByRole("button", { name: "스프린트 자동화 저장" }));
    expect(await screen.findByText("스프린트 자동화를 저장했습니다")).toBeInTheDocument();
    expect((await getPlanningSettings("p1")).sprintAutomation).toMatchObject({ autoCreateNext: true, cooldownDays: 2, defaultCarryOver: "next" });

    await user.click(screen.getByRole("combobox", { name: "척도" }));
    await user.click(await screen.findByRole("option", { name: "피보나치" }));
    expect(screen.getByText("허용 값: 0, 1, 2, 3, 5, 8, 13, 21")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "추정 척도 저장" }));
    expect(await screen.findByText("추정 척도를 피보나치(으)로 저장했습니다")).toBeInTheDocument();
    expect((await getPlanningSettings("p1")).estimationScale).toBe("fibonacci");
  });

  it("다른 사람이 먼저 저장했으면(409) 최신 값 불러오기를 권한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/planning");
    await screen.findByRole("switch", { name: "완료하면 다음 스프린트 자동 생성" });
    await updatePlanningSettings("p1", { sprintAutomation: { lengthDays: 7 } }, 0);
    await user.click(screen.getByRole("switch", { name: "완료하면 다음 스프린트 자동 생성" }));
    await user.click(screen.getByRole("button", { name: "스프린트 자동화 저장" }));
    expect(await screen.findByText(/다른 사용자가 먼저 계획 설정을 저장했습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "최신 값 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("스프린트 길이(일)")).toHaveValue(7));
  });
});

describe("스프린트 완료 — 설정 기본값과 결과", () => {
  it("기본 행선지는 설정을 따르고, 완료하면 n건 이월·새 스프린트 자동 생성을 알리고 배너로 그 스프린트를 보여 준다", async () => {
    const user = userEvent.setup();
    await updatePlanningSettings("p1", { sprintAutomation: { autoCreateNext: true, defaultCarryOver: "next" } }, 0);
    renderAt("/projects/p1/backlog");
    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(sprint).getByRole("button", { name: "스프린트 완료" }));
    const dialog = await screen.findByRole("dialog", { name: "스프린트 완료" });
    const next = await within(dialog).findByRole("radio", { name: "다음 스프린트로 (새 스프린트 자동 생성)" });
    await waitFor(() => expect(next).toBeChecked());
    expect(within(dialog).getByText(/완료하면 다음 스프린트를 자동으로 만듭니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "완료 처리" }));

    expect(await screen.findByText("스프린트를 완료했습니다")).toBeInTheDocument();
    const banner = await screen.findByText(/Sprint 1 완료 — 미완료 \d+건을 Sprint 2\(으\)로 이월했습니다 · 새 스프린트 Sprint 2을\(를\) 자동으로 만들었습니다/);
    expect(banner).toBeInTheDocument();
    const created = await screen.findByRole("region", { name: "Sprint 2" });
    expect(within(created).getAllByText(/^ALM-\d+$/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "새 스프린트 보기" }));
    await waitFor(() => expect(screen.queryByText(/Sprint 1 완료 —/)).not.toBeInTheDocument());
  });

  it("설정이 없으면 예전처럼 백로그가 기본값이다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/backlog");
    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(sprint).getByRole("button", { name: "스프린트 완료" }));
    const dialog = await screen.findByRole("dialog", { name: "스프린트 완료" });
    await waitFor(() => expect(within(dialog).getByRole("radio", { name: "백로그로" })).toBeChecked());
    await user.click(within(dialog).getByRole("radio", { name: "다음 스프린트로" }));
    expect(within(dialog).getByText("예정 스프린트가 없고 자동 생성이 꺼져 있어 백로그로 갑니다")).toBeInTheDocument();
  });
});

describe("추정 척도별 스토리 포인트 입력", () => {
  it("피보나치 — 숫자 칩, 고르면 바로 저장하고 다시 누르면 지운다", async () => {
    const user = userEvent.setup();
    await updatePlanningSettings("p1", { estimationScale: "fibonacci" }, 0);
    renderAt("/projects/p1/backlog?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const group = await within(dialog).findByRole("group", { name: "스토리 포인트" });
    expect(within(group).getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(["0", "1", "2", "3", "5", "8", "13", "21"]);
    await user.click(within(group).getByRole("button", { name: "5포인트" }));
    await waitFor(async () => expect((await getIssueByKey("ALM-2"))?.storyPoints).toBe(5));
    await waitFor(() => expect(within(group).getByRole("button", { name: "5포인트" })).toHaveAttribute("aria-pressed", "true"));
    await user.click(within(group).getByRole("button", { name: "5포인트" }));
    await waitFor(async () => expect((await getIssueByKey("ALM-2"))?.storyPoints).toBeNull());
  });

  it("T셔츠 — XS~XL, 저장값은 매핑한 숫자", async () => {
    const user = userEvent.setup();
    await updatePlanningSettings("p1", { estimationScale: "tshirt" }, 0);
    renderAt("/projects/p1/backlog?issue=ALM-3");
    const dialog = await screen.findByRole("dialog", { name: "ALM-3" });
    const group = await within(dialog).findByRole("group", { name: "스토리 포인트" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["XS", "S", "M", "L", "XL"]);
    await user.click(within(group).getByRole("button", { name: "L — 5포인트" }));
    await waitFor(async () => expect((await getIssueByKey("ALM-3"))?.storyPoints).toBe(5));
    expect(await within(group).findByText("= 5포인트")).toBeInTheDocument();
  });

  it("직접 정의 — 정의한 값만, 척도 밖 옛 값은 '척도 밖' 칩으로 남는다", async () => {
    const store = await import("../store/jiraStore");
    const issue = (await getIssueByKey("ALM-4"))!;
    await store.updateIssue(issue.id, { storyPoints: 7 }, issue.version);
    await updatePlanningSettings("p1", { estimationScale: "custom", customValues: [1, 4, 8] }, 0);
    renderAt("/projects/p1/backlog?issue=ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    const group = await within(dialog).findByRole("group", { name: "스토리 포인트" });
    expect(within(group).getByRole("button", { name: "7포인트 (척도 밖 값)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "4포인트" })).toBeInTheDocument();
  });

  it("수직선(기본) — 숫자 입력 그대로", async () => {
    renderAt("/projects/p1/backlog?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    expect(await within(dialog).findByRole("spinbutton", { name: "스토리 포인트" })).toBeInTheDocument();
  });
});

describe("인라인 만들기 — 스프린트 패널", () => {
  it("제목만 적고 Enter — 그 스프린트에 만들고 입력은 열린 채로 다음 제목을 받는다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/backlog");
    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(sprint).getByRole("button", { name: "Sprint 1에 이슈 만들기" }));
    const input = within(sprint).getByRole("textbox", { name: "Sprint 1 새 이슈 제목" });
    await user.type(input, "결제 버그{Enter}");
    expect(await within(sprint).findByText("결제 버그")).toBeInTheDocument();
    await waitFor(() => expect(within(sprint).getByRole("textbox", { name: "Sprint 1 새 이슈 제목" })).toHaveValue(""));
    await user.type(within(sprint).getByRole("textbox", { name: "Sprint 1 새 이슈 제목" }), "두 번째{Enter}");
    expect(await within(sprint).findByText("두 번째")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(within(sprint).queryByRole("textbox", { name: "Sprint 1 새 이슈 제목" })).not.toBeInTheDocument());
  });
});
