import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import type { AgentOffice, AgentOfficePersona } from "../store/types";

/**
 * P3e 사무실 생동감 — 회의실(좌석·예외·입석·패널 모드), 커피 머신·고양이 클릭, 게시판 "지금 만드는 것", 팀 카드 동등성.
 * 애니는 jsdom에서 돌지 않으므로 구조(좌석 속성·접근 이름·표찰 문구·포스트잇)를 검증한다(스펙 §8).
 */

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderApp(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const OFFICE_PATH = "/projects/p1/ai-office";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mockOffice(change: (base: AgentOffice) => AgentOffice) {
  const base = await store.fetchOffice("p1");
  return vi.spyOn(store, "fetchOffice").mockResolvedValue(change(base));
}

async function stage() {
  await screen.findByRole("button", { name: /^기획봇, 기획/ });
  return screen.getByRole("region", { name: "AI 사무실 평면도" });
}

describe("회의실 — 착석·예외(목업: 기획봇 진행 착수/계획 회의, 참석 4명)", () => {
  it("참석자는 회의실 좌석에 앉고(진행자는 상석) 접근 이름에 '회의 중'이 붙는다. 승인 대기 참석자는 책상에 남는다", async () => {
    const { container } = renderApp(OFFICE_PATH);
    const room = await stage();

    const host = within(room).getByRole("button", { name: /^기획봇, 기획, 작업 중, .*회의 중 — 착수\/계획 회의 — 말 걸기$/ });
    expect(host).toHaveAttribute("data-seat", "far");
    expect(host).toHaveAttribute("data-host", "true");
    // 상석 = 먼 쪽 가운데(x 402) — 버튼은 좌석 좌상단에서 2ap 왼쪽
    expect(host.style.getPropertyValue("--x")).toBe("400");
    expect(host.style.getPropertyValue("--y")).toBe("84");
    const designer = within(room).getByRole("button", { name: /^디자인봇, .*회의 중 — 착수\/계획 회의/ });
    expect(designer).toHaveAttribute("data-seat", "far");
    expect(designer).not.toHaveAttribute("data-host");
    expect(within(room).getByRole("button", { name: /^운영봇, 운영, 휴식 중, 회의 중 — 착수\/계획 회의/ })).toHaveAttribute(
      "data-seat",
      "far",
    );

    // 예외 — 프론트봇은 자기 run이 승인 대기라 책상에 남고(❗ 링크 그대로), 회의 중 표기가 없다
    const waiting = within(room).getByRole("button", { name: /^프론트봇, 프론트엔드, 승인 대기/ });
    expect(waiting).not.toHaveAttribute("data-seat");
    expect(waiting.getAttribute("aria-label")).not.toContain("회의 중");
    expect(within(room).getByRole("link", { name: "프론트봇의 승인 대기 — 승인 인박스 열기" })).toBeInTheDocument();

    // 빈 책상 3개에 포스트잇, 회의실에 간 사람의 P3a 말풍선은 숨김
    expect(container.querySelectorAll(".office-postit")).toHaveLength(3);
    expect(screen.queryByTestId("office-bubble-101")).not.toBeInTheDocument();
    expect(screen.queryByTestId("office-bubble-102")).not.toBeInTheDocument();
    expect(screen.getByTestId("office-bubble-103")).toBeInTheDocument();
    // 앉음 프레임 — 먼 쪽 3명은 테이블이 가리는 정면 앉음
    expect(container.querySelectorAll('.office-avatar[data-pose="seatFar"]')).toHaveLength(3);

    // 표찰·회의실 버튼·시각 숨김 요약
    expect(container.querySelector(".office-meeting-sign")).toHaveTextContent("착수/계획 회의 · 12분째");
    expect(container.querySelector(".office-meeting-sign")).toHaveClass("is-live");
    expect(
      within(room).getByRole("button", { name: "회의실 — 착수/계획 회의 진행 중, 안건 ALM-4, 참석 4명, 12분째" }),
    ).toBeInTheDocument();
    expect(within(room).getByText(/, 회의 중 3$/)).toBeInTheDocument();
  });

  it("회의가 없으면(구 백엔드 포함) 전원 자기 자리 — 좌석·포스트잇 없음, 표찰 '회의실'", async () => {
    await mockOffice((base) => ({ ...base, activeMeeting: null }));
    const { container } = renderApp(OFFICE_PATH);
    const room = await stage();
    expect(container.querySelectorAll("[data-seat]")).toHaveLength(0);
    expect(container.querySelectorAll(".office-postit")).toHaveLength(0);
    expect(container.querySelector(".office-meeting-sign")).toHaveTextContent(/^회의실$/);
    expect(within(room).getByRole("button", { name: "회의실 — 진행 중인 회의 없음" })).toBeInTheDocument();
    expect(within(room).getByText("AI 팀원 6명 — 작업 중 2, 대기열 1, 승인 대기 1, 차단됨 1, 휴식 중 1")).toBeInTheDocument();
  });

  it("9번째 참석자부터는 테이블 아래 입석", async () => {
    const extra = (n: number): AgentOfficePersona => ({
      id: String(200 + n), slug: `extra-${n}`, name: `추가봇${n}`, emoji: null, role: "OPS", active: true,
      currentRun: null, lastActivity: null, todayCostUsd: 0,
    });
    await mockOffice((base) => {
      const personas = [...base.personas, ...Array.from({ length: 6 }, (_, n) => extra(n))];
      return {
        ...base,
        personas,
        activeMeeting: { ...base.activeMeeting!, attendeePersonaIds: ["101", ...personas.map((p) => p.id).filter((id) => id !== "101")] },
      };
    });
    const { container } = renderApp(OFFICE_PATH);
    await stage();
    // 12명 중 프론트봇(승인 대기)·백엔드봇(차단)은 책상 — 10명 착석: 8석 + 입석 2(5열 격자)
    expect(container.querySelectorAll('[data-seat="far"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-seat="near"]')).toHaveLength(3);
    const standees = container.querySelectorAll<HTMLElement>('[data-seat="stand"]');
    expect(standees).toHaveLength(2);
    expect(standees[0].style.getPropertyValue("--y")).toBe("140");
    expect([...standees].map((b) => b.style.getPropertyValue("--x"))).toEqual(["360", "380"]);
  });

  it("팀 카드 — 회의실에 앉은 사람만 '회의 중 · 착수/계획 · ALM-4' 줄(책상 잔류자는 상태 배지가 말한다)", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await stage();
    await user.click(screen.getByRole("tab", { name: "팀 카드" }));
    const cards = await screen.findAllByRole("article");
    const card = (name: string) => cards.find((c) => within(c).queryByRole("heading", { name }))!;
    expect(card("기획봇")).toHaveTextContent("회의 중 · 착수/계획 · ALM-4");
    expect(card("운영봇")).toHaveTextContent("회의 중 · 착수/계획 · ALM-4");
    expect(card("프론트봇")).not.toHaveTextContent("회의 중");
    expect(card("백엔드봇")).not.toHaveTextContent("회의 중");
  });
});

describe("회의실 패널 모드(P3e §2.8)", () => {
  it("회의실을 누르면 종류·안건·진행자·참석자·실행 상세 — 참석자 행은 개인 오피스로, 회의록은 게시판으로", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const room = await stage();
    const button = within(room).getByRole("button", { name: /^회의실 — 착수\/계획 회의 진행 중/ });
    await user.click(button);
    const panel = await screen.findByRole("complementary", { name: "회의실" });
    await waitFor(() => expect(within(panel).getByRole("heading", { level: 2, name: "회의실" })).toHaveFocus());
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByText("진행 중 12분")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "ALM-4" })).toHaveAttribute("href", `${OFFICE_PATH}?issue=ALM-4`);
    expect(within(panel).getByText("기획봇", { selector: ".office-panel-dl span" })).toBeInTheDocument();

    const attendees = within(panel).getByRole("list", { name: "참석자" });
    expect(within(attendees).getAllByRole("listitem")).toHaveLength(4);
    const hostRow = within(attendees).getByRole("button", { name: /기획봇/ });
    expect(within(hostRow).getByText("진행자")).toBeInTheDocument();
    const stayRow = within(attendees).getByRole("button", { name: /프론트봇/ });
    expect(stayRow).toHaveTextContent("승인 대기· 자리에 있음");

    await user.click(within(attendees).getByRole("button", { name: /운영봇/ }));
    const persona = await screen.findByRole("complementary", { name: "운영봇" });
    await waitFor(() => expect(within(persona).getByRole("heading", { level: 2, name: "운영봇" })).toHaveFocus());

    await user.click(button);
    const again = await screen.findByRole("complementary", { name: "회의실" });
    await user.click(within(again).getByRole("button", { name: "게시판에서 회의록 보기" }));
    expect(await screen.findByRole("complementary", { name: "게시판" })).toBeInTheDocument();

    await user.click(button);
    await user.click(within(await screen.findByRole("complementary", { name: "회의실" })).getByRole("button", { name: "실행 상세" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`${OFFICE_PATH}/runs/9007`));
  });

  it("회의가 없으면 안내 + (전역 관리자만) 회의 소집 버튼이 기존 소집 모달을 연다", async () => {
    const user = userEvent.setup();
    await mockOffice((base) => ({ ...base, activeMeeting: null }));
    renderApp(OFFICE_PATH);
    const room = await stage();
    await user.click(within(room).getByRole("button", { name: "회의실 — 진행 중인 회의 없음" }));
    const panel = await screen.findByRole("complementary", { name: "회의실" });
    expect(within(panel).getByText("지금 진행 중인 회의가 없습니다")).toBeInTheDocument();
    expect(within(panel).queryByRole("list", { name: "참석자" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "게시판에서 회의록 보기" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "회의 소집" }));
    expect(await screen.findByRole("dialog", { name: "회의 소집" })).toBeInTheDocument();
  });

  it("이 프로젝트를 관리할 수 없으면 회의실 패널에도 소집 버튼이 없다", async () => {
    const user = userEvent.setup();
    await mockOffice((base) => ({ ...base, activeMeeting: null }));
    store.__setAgentMockScenario({ canManage: false });
    renderApp(OFFICE_PATH);
    const room = await stage();
    await user.click(within(room).getByRole("button", { name: "회의실 — 진행 중인 회의 없음" }));
    const panel = await screen.findByRole("complementary", { name: "회의실" });
    expect(within(panel).queryByRole("button", { name: "회의 소집" })).not.toBeInTheDocument();
  });
});

describe("커피 머신·고양이(P3e §4.2·§4.6)", () => {
  it("커피 머신 — 누르면 오늘 커피값 + 재미 카피 팝과 라이브 알림, 다시 누르면 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const room = await stage();
    const coffee = within(room).getByRole("button", { name: "커피 머신 — 오늘 AI 비용 $2.73" });
    await user.click(coffee);
    const pop = screen.getByTestId("office-coffee-pop");
    expect(pop).toHaveTextContent("오늘 커피값 $2.73");
    expect(pop).toHaveTextContent("적당히 마시는 중");
    expect(coffee).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("오늘 커피값 $2.73 — 적당히 마시는 중");
    await user.click(coffee);
    expect(screen.queryByTestId("office-coffee-pop")).not.toBeInTheDocument();
  });

  it("킬 스위치면 전원등이 꺼지고 카피가 '전원이 꺼져 있어요'", async () => {
    const user = userEvent.setup();
    await mockOffice((base) => ({ ...base, budget: { ...base.budget, killSwitch: true } }));
    const { container } = renderApp(OFFICE_PATH);
    const room = await stage();
    expect(container.querySelector(".ai-office-room")).toHaveClass("is-killed");
    await user.click(within(room).getByRole("button", { name: /^커피 머신/ }));
    expect(screen.getByTestId("office-coffee-pop")).toHaveTextContent("커피 머신 전원이 꺼져 있어요 (킬 스위치)");
  });

  it("고양이 — 탭 순서 맨 끝, 누르면 깨서 '야옹'(라이브 알림), 세 번째부터 '…야옹?'", async () => {
    const user = userEvent.setup();
    const { container } = renderApp(OFFICE_PATH);
    const room = await stage();
    const buttons = within(room).getAllByRole("button");
    const cat = within(room).getByRole("button", { name: "사무실 고양이" });
    expect(buttons[buttons.length - 1]).toBe(cat);
    // 캔버스 탭 순서(P3g §2.6 정정): 나 → 게시판 → 회의실 → 커피 머신 → 페르소나
    expect(buttons.slice(0, 4).map((b) => b.getAttribute("aria-label")?.split(" — ")[0])).toEqual([
      "나",
      "게시판",
      "회의실",
      "커피 머신",
    ]);

    await user.click(cat);
    expect(screen.getByTestId("office-cat-bubble")).toHaveTextContent(/^야옹$/);
    expect(container.querySelector(".office-cat")).toHaveAttribute("data-cat", "CAT_AWAKE");
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("고양이: 야옹");
    await user.click(cat);
    await user.click(cat);
    expect(screen.getByTestId("office-cat-bubble")).toHaveTextContent("…야옹?");
  });
});

describe("게시판 '지금 만드는 것'(P3e §3)", () => {
  it("에픽별 n/m 완료·도트 진행바·지금 붙은 AI 수 — 게시판을 연 뒤 버튼 이름에 목표 수가 붙는다", async () => {
    const user = userEvent.setup();
    const epic = await store.createIssue({ projectId: "p1", title: "결제 모듈 개편", type: "epic", status: "inprogress" });
    const a = await store.createIssue({ projectId: "p1", title: "결제 API", parentId: epic.id, status: "done" });
    await store.createIssue({ projectId: "p1", title: "결제 화면", parentId: epic.id, status: "inprogress" });
    await store.createIssue({ projectId: "p1", title: "환불", parentId: epic.id, status: "todo" });
    await store.createIssue({ projectId: "p1", title: "온보딩 가이드", type: "epic", status: "todo" });
    await store.createIssue({ projectId: "p1", title: "검색 개선", type: "epic", status: "done" });
    await mockOffice((base) => ({
      ...base,
      personas: base.personas.map((p) =>
        p.id === "106" ? { ...p, currentRun: { ...p.currentRun!, issueKey: a.key } } : p,
      ),
    }));

    renderApp(OFFICE_PATH);
    const room = await stage();
    const board = within(room).getByRole("button", { name: /^게시판 — 회의록 4건/ });
    await user.click(board);
    const panel = await screen.findByRole("complementary", { name: "게시판" });
    const goals = await within(panel).findByRole("list", { name: "개발 목표" });
    // 진행 중 → 할 일 순(시드의 할 일 에픽 1개 포함), 완료 에픽은 접혀 있다
    const titles = () => within(goals).getAllByRole("listitem").map((r) => within(r).getAllByRole("link")[0].textContent);
    expect(titles()[0]).toBe("결제 모듈 개편");
    expect(titles()).toContain("온보딩 가이드");
    expect(titles()).not.toContain("검색 개선");
    const pay = screen.getByTestId(`office-goal-${epic.key}`);
    expect(pay).toHaveTextContent("1/3 완료");
    expect(pay).toHaveTextContent("진행 중");
    const bar = within(pay).getByRole("progressbar", { name: "결제 모듈 개편 진행" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(bar.querySelectorAll("i.is-filled")).toHaveLength(3);
    expect(within(pay).getByText("AI 1명 작업 중")).toHaveAttribute("title", "리뷰봇");
    expect(within(goals).getByText("하위 이슈 없음")).toBeInTheDocument();

    const pending = titles().length;
    await user.click(within(panel).getByRole("button", { name: "완료된 목표 1개 더 보기" }));
    expect(titles()[pending]).toBe("검색 개선");
    await waitFor(() =>
      expect(
        within(room).getByRole("button", { name: new RegExp(`^게시판 — 진행 중 목표 ${pending}개, 회의록 4건`) }),
      ).toBeInTheDocument(),
    );
  });

  it("목표를 못 불러오면 섹션 자리에 오류 + 다시 시도(나머지 섹션은 그대로)", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(store, "listIssues").mockRejectedValue(new Error("503"));
    renderApp(OFFICE_PATH);
    const room = await stage();
    await user.click(within(room).getByRole("button", { name: /^게시판/ }));
    const panel = await screen.findByRole("complementary", { name: "게시판" });
    expect(await within(panel).findByText("목표를 불러오지 못했습니다")).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: "회의록 게시물" })).toBeInTheDocument();
    spy.mockRestore();
    await user.click(within(panel).getByRole("button", { name: "다시 시도" }));
    expect(await within(panel).findByRole("list", { name: "개발 목표" })).toBeInTheDocument();
    expect(within(panel).queryByText("목표를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("에픽도 하위가 있는 최상위 이슈도 없으면 빈 문구", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "listIssues").mockResolvedValue([]);
    renderApp(OFFICE_PATH);
    const room = await stage();
    await user.click(within(room).getByRole("button", { name: /^게시판/ }));
    const panel = await screen.findByRole("complementary", { name: "게시판" });
    expect(await within(panel).findByText("아직 목표(에픽)가 없습니다")).toBeInTheDocument();
  });
});
