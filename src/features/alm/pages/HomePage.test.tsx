import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname+search를 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderHome() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/home"]}>
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

describe("HomePage (For you)", () => {
  it("인사말·이어서 하기 카드·추천 작업(기본 탭)을 보여준다", async () => {
    renderHome();

    expect(
      await screen.findByRole("heading", { name: /안녕하세요, 김찬호님/ }),
    ).toBeInTheDocument();

    // 이어서 하기: 프로젝트 카드 + 최근 이슈 카드
    const resume = screen.getByTestId("resume-cards");
    expect(within(resume).getByText("ALM 플랫폼")).toBeInTheDocument();
    expect(within(resume).getAllByText(/ALM-\d+ ·/).length).toBeGreaterThan(0);

    // 기본 탭 = 추천 작업: 시드의 마감 임박 이슈(ALM-2·ALM-4, due +7일)
    const recommended = screen.getByTestId("recommended-issues");
    expect(within(recommended).getByText(/ALM-2 ·/)).toBeInTheDocument();
    expect(within(recommended).getByText(/ALM-4 ·/)).toBeInTheDocument();
    expect(within(recommended).getAllByText("마감 임박").length).toBe(2);
  });

  it("이어서 하기는 한 줄(최대 4장) — 프로젝트 2장까지, 나머지는 최근 이슈", async () => {
    renderHome();
    await screen.findByRole("heading", { name: /안녕하세요/ });

    const cards = within(screen.getByTestId("resume-cards")).getAllByRole("button");
    expect(cards).toHaveLength(4);
  });

  it("오늘 요약 줄의 '나에게 배정'을 누르면 해당 탭이 열린다", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByRole("heading", { name: /안녕하세요/ });

    // 시드: 김찬호 담당 2건, 마감 임박(7일 내) 2건, 기한 지남 0건
    const summary = screen.getByTestId("home-summary");
    expect(summary).toHaveTextContent("나에게 배정 2");
    expect(summary).toHaveTextContent("기한 지남 0");
    expect(summary).toHaveTextContent("이번 주 마감 2");

    await user.click(within(summary).getByRole("button", { name: /나에게 배정/ }));
    expect(await screen.findByTestId("my-issues")).toBeInTheDocument();
  });

  it("나에게 배정됨 탭: 내 담당 이슈만 보여준다 (시드: 김찬호 = ALM-1, ALM-3)", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByRole("heading", { name: /안녕하세요/ });

    await user.click(screen.getByRole("tab", { name: /나에게 배정됨/ }));
    const mine = await screen.findByTestId("my-issues");
    expect(within(mine).getByText(/ALM-1 ·/)).toBeInTheDocument();
    expect(within(mine).getByText(/ALM-3 ·/)).toBeInTheDocument();
    expect(within(mine).queryByText(/ALM-4 ·/)).not.toBeInTheDocument(); // 박준영 담당
  });

  it("최근 업데이트 탭: 날짜 그룹과 함께 목록을 보여준다", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByRole("heading", { name: /안녕하세요/ });

    await user.click(screen.getByRole("tab", { name: "최근 업데이트" }));
    const recent = await screen.findByTestId("recent-issues");
    expect(within(recent).getAllByText(/ALM-\d+ ·/).length).toBeGreaterThan(0);
    expect(within(recent).getByText("오늘")).toBeInTheDocument(); // 시드 updatedAt = now
  });

  it("이슈를 클릭하면 상세가 열린 이슈 목록으로 이동한다", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByRole("heading", { name: /안녕하세요/ });

    await user.click(screen.getByRole("tab", { name: /나에게 배정됨/ }));
    const mine = await screen.findByTestId("my-issues");
    await user.click(within(mine).getByText("이슈 상세 모달 구현")); // ALM-3

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-3");
    });
    expect(await screen.findByRole("dialog", { name: "ALM-3" })).toBeInTheDocument();
  });
});
