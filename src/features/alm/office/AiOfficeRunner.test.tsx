import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import type { AgentOffice } from "../store/types";

/**
 * P4a(AGP-69, D-P4-4) 사무실 표지 — 목업: 리뷰봇(106) run은 내 PC 러너(모니터에 도트 집), 디자인봇(102) QUEUED run은
 * 서버 러너 대기(인프로세스 꺼짐 + 플랫폼 러너 오프라인). 상태 우선순위는 그대로 — "러너 대기"는 QUEUED의 하위 상태.
 */

function renderApp(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const OFFICE_PATH = "/projects/p1/ai-office";

async function officeWith(change: (office: AgentOffice) => AgentOffice = (o) => o) {
  const base = await store.fetchOffice("p1");
  return vi.spyOn(store, "fetchOffice").mockResolvedValue(change({ ...base, activeMeeting: null }));
}

/** 디자인봇 run을 내 PC 러너 대기로 */
const localWait = (o: AgentOffice): AgentOffice => ({
  ...o,
  personas: o.personas.map((p) =>
    p.id === "102" && p.currentRun ? { ...p, currentRun: { ...p.currentRun, executionSite: "LOCAL", awaitingRunner: true } } : p,
  ),
});

function reduceMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("캔버스 — 내 PC 러너·러너 대기", () => {
  it("내 PC 러너 run은 그 책상 모니터에 도트 집(정지 1프레임) — 서버 run 책상에는 없다", async () => {
    await officeWith();
    const { container } = renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^리뷰봇, 리뷰, 작업 중, .*내 PC 러너에서 실행 — 말 걸기$/ });
    const houses = container.querySelectorAll('[data-overlay="house"]');
    expect(houses).toHaveLength(1);
    // 리뷰봇 책상(작업 중) 안에 있고, 2프레임 루프가 아니다
    expect(houses[0].closest(".office-desk")).toHaveAttribute("data-state", "RUNNING");
    expect(houses[0].querySelector(".f-b")).toBeNull();
    expect(houses[0].querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("reduced-motion에서도 집은 그대로 보인다", async () => {
    reduceMotion();
    await officeWith();
    const { container } = renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^리뷰봇, 리뷰/ });
    expect(container.querySelectorAll('[data-overlay="house"]')).toHaveLength(1);
  });

  it("서버 러너 대기 — 상태는 대기열 그대로(⌛·서기), 말풍선 접두 '러너 대기' + 2행 '플랫폼 러너 연결 대기'", async () => {
    await officeWith();
    const { container } = renderApp(OFFICE_PATH);
    const button = await screen.findByRole("button", {
      name: "디자인봇, 디자인, 대기열, 이슈 ALM-2, 서버 러너 대기 — 플랫폼 러너가 연결되면 시작합니다 — 말 걸기",
    });
    expect(button).toHaveAttribute("data-state", "QUEUED");
    expect(container.querySelectorAll('[data-overlay="hourglass"]')).toHaveLength(1);
    expect(screen.getByTestId("office-bubble-102")).toHaveTextContent(/^러너 대기 · ALM-2플랫폼 러너 연결 대기$/);
  });

  it("내 PC 러너 대기 — 말풍선 2행 '내 PC 러너를 켜 주세요', 대기 중에는 집을 그리지 않는다(아직 어디서도 안 돈다)", async () => {
    await officeWith(localWait);
    const { container } = renderApp(OFFICE_PATH);
    await screen.findByRole("button", {
      name: "디자인봇, 디자인, 대기열, 이슈 ALM-2, 러너 대기 — 내 PC 러너가 켜지면 시작합니다 — 말 걸기",
    });
    expect(screen.getByTestId("office-bubble-102")).toHaveTextContent(/^러너 대기 · ALM-2내 PC 러너를 켜 주세요$/);
    // 집은 리뷰봇 책상 하나뿐 — 대기 중인 디자인봇 책상은 아니다
    const houses = container.querySelectorAll('[data-overlay="house"]');
    expect(houses).toHaveLength(1);
    expect(houses[0].closest(".office-desk")).toHaveAttribute("data-state", "RUNNING");
  });

  it("구 백엔드(실행 위치 필드 없음)면 표지 없음 — 대기열 말풍선 그대로", async () => {
    await officeWith((o) => ({
      ...o,
      personas: o.personas.map((p) =>
        p.currentRun ? { ...p, currentRun: { ...p.currentRun, executionSite: undefined, awaitingRunner: undefined } } : p,
      ),
    }));
    const { container } = renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^디자인봇, 디자인, 대기열, 이슈 ALM-2 — 말 걸기$/ });
    expect(screen.getByTestId("office-bubble-102")).toHaveTextContent(/^대기열 · ALM-2$/);
    expect(container.querySelectorAll('[data-overlay="house"]')).toHaveLength(0);
  });
});

describe("팀 카드·개인 오피스 — 텍스트 동등 대안", () => {
  it("팀 카드 — 러너 대기 사유 줄, 내 PC 러너 run은 '내 PC 러너에서 실행' 줄", async () => {
    await officeWith(localWait);
    renderApp(`${OFFICE_PATH}?view=team`);
    const designer = await screen.findByRole("article", { name: "디자인봇" });
    expect(within(designer).getByText("러너 대기 — 내 PC 러너가 켜지면 시작합니다")).toBeInTheDocument();
    // 상태 배지는 대기열 그대로
    expect(within(designer).getByText("대기열")).toBeInTheDocument();
    const reviewer = screen.getByRole("article", { name: "리뷰봇" });
    expect(within(reviewer).getByText("내 PC 러너에서 실행")).toBeInTheDocument();
    const planner = screen.getByRole("article", { name: "기획봇" });
    expect(within(planner).queryByText(/러너/)).not.toBeInTheDocument();
  });

  it("팀 카드 — 서버 러너 대기", async () => {
    await officeWith();
    renderApp(`${OFFICE_PATH}?view=team`);
    const designer = await screen.findByRole("article", { name: "디자인봇" });
    expect(within(designer).getByText("서버 러너 대기 — 플랫폼 러너가 연결되면 시작합니다")).toBeInTheDocument();
  });

  it("개인 오피스 — 현재 작업에 러너 대기 안내 + 실행 위치(아이콘+텍스트)", async () => {
    await officeWith(localWait);
    const user = userEvent.setup();
    renderApp(`${OFFICE_PATH}?view=team`);
    const designer = await screen.findByRole("article", { name: "디자인봇" });
    await user.click(within(designer).getByRole("button", { name: "디자인봇 개인 오피스 열기" }));
    const panel = await screen.findByRole("complementary", { name: "디자인봇" });
    expect(await within(panel).findByText("러너 대기 — 내 PC 러너가 켜지면 시작합니다")).toBeInTheDocument();
    const site = within(panel).getByText("실행 위치").nextElementSibling as HTMLElement;
    expect(site).toHaveTextContent("내 PC 러너");
    expect(site.querySelector("svg")).not.toBeNull();
  });
});

describe("맡기기 — 실행 위치 덮어쓰기", () => {
  beforeEach(reduceMotion);

  async function menuOf(dialog: HTMLElement, name: string) {
    await waitFor(() => {
      const skip = within(dialog).queryByRole("button", { name: "건너뛰기" });
      if (skip) fireEvent.click(skip);
      expect(within(dialog).getByRole("menu", { name: `${name}에게 할 말` })).toBeInTheDocument();
    });
    return within(dialog).getByRole("menu", { name: `${name}에게 할 말` });
  }

  it("기본은 '프로젝트 설정 따름(내 PC 러너)'이라 생략하고, 서버를 고르면 executionSite를 싣는다", async () => {
    // 휴식 중인 운영봇에게 맡긴다(원격 접속·회의 걷어 냄)
    await officeWith((o) => ({
      ...o,
      personas: o.personas.map((p) => (p.presence ? { ...p, presence: null, lastActivity: null } : p)),
    }));
    const create = vi.spyOn(store, "createAgentRun");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: /^운영봇, 운영, 휴식 중/ }));
    const dialog = await screen.findByRole("dialog", { name: /^운영봇(과|와) 대화$/ });
    const menu = await menuOf(dialog, "운영봇");
    await user.click(within(menu).getByRole("menuitem", { name: "이 이슈 맡아줘" }));

    const site = await within(dialog).findByRole("combobox", { name: "실행 위치" });
    expect(site).toHaveTextContent("프로젝트 설정 따름(내 PC 러너)");
    await user.click(site);
    expect(await screen.findByRole("option", { name: "서버" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "서버" }));

    const search = within(dialog).getByRole("combobox", { name: "이슈 검색" });
    await user.type(search, "ALM-7");
    await user.click(await within(dialog).findByRole("option", { name: /ALM-7 / }, { timeout: 2000 }));
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    // 확인 단계에 실행 위치가 보인다
    expect(await within(dialog).findByText("서버")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "맡기기" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ issueKey: "ALM-7", personaSlug: "ops-bot", executionSite: "SERVER" }),
    );
  });
});

describe("회의 소집 — 실행 위치 덮어쓰기", () => {
  it("고르지 않으면 생략(프로젝트 설정), 내 PC 러너를 고르면 싣는다", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(store, "createMeeting");
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: "회의 소집" }));
    const dialog = await screen.findByRole("dialog", { name: "회의 소집" });
    const site = await within(dialog).findByRole("combobox", { name: "실행 위치" });
    expect(site).toHaveTextContent("프로젝트 설정 따름(내 PC 러너)");
    await user.click(site);
    await user.click(await screen.findByRole("option", { name: "내 PC 러너" }));
    await user.type(within(dialog).getByLabelText("안건 지시 (선택)"), "러너 점검");
    await user.click(within(dialog).getByRole("button", { name: "소집" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ agenda: "러너 점검", executionSite: "LOCAL" })));
  });

  it("구 백엔드(실행 위치 없음)면 칸이 없다", async () => {
    store.__setAgentMockScenario({ executionApi: false });
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: "회의 소집" }));
    const dialog = await screen.findByRole("dialog", { name: "회의 소집" });
    await within(dialog).findByRole("combobox", { name: "종류" });
    expect(within(dialog).queryByRole("combobox", { name: "실행 위치" })).not.toBeInTheDocument();
  });
});
