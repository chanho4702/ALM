import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import { OFFICE_POLL_MS, useOfficeData } from "./useOfficeData";

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
  vi.useRealTimers();
});

describe("AI 사무실 진입점 — useAiTeamActive일 때만 탭", () => {
  it("에이전트 기능이 활성이면 프로젝트 뷰 탭 맨 끝에 'AI 사무실'이 붙고 이동한다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/issues");
    const tabs = await screen.findByRole("navigation", { name: "프로젝트 뷰" });
    const tab = await within(tabs).findByRole("button", { name: "AI 사무실" });
    const all = within(tabs).getAllByRole("button");
    expect(all[all.length - 1]).toBe(tab);
    await user.click(tab);
    expect(screen.getByTestId("location")).toHaveTextContent(OFFICE_PATH);
    expect(await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ })).toBeInTheDocument();
  });

  it("비활성 플랫폼이면 탭이 없고, URL로 들어와도 빈 상태만 보인다", async () => {
    vi.spyOn(store, "fetchAgentPersonas").mockResolvedValue([]);
    const office = vi.spyOn(store, "fetchOffice");
    renderApp(OFFICE_PATH);
    expect(await screen.findByText("AI 팀이 아직 없습니다")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "프로젝트 뷰" });
    expect(within(tabs).queryByRole("button", { name: "AI 사무실" })).not.toBeInTheDocument();
    expect(office).not.toHaveBeenCalled();
  });
});

describe("사무실 캔버스 — 상태 매핑(목업 6인)", () => {
  it("6상태가 버튼 접근 이름·말풍선·오버레이로 구분된다", async () => {
    const { container } = renderApp(OFFICE_PATH);
    // 로딩 자리표시(같은 이름의 region)가 실제 캔버스로 바뀐 뒤에 region을 잡는다
    await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중, 이슈 ALM-4, 최근 활동: ALM-4 인수 조건 보완/ });
    const stage = screen.getByRole("region", { name: "AI 사무실 평면도" });

    expect(within(stage).getByText("AI 팀원 6명 — 작업 중 2, 대기열 1, 승인 대기 1, 차단됨 1, 휴식 중 1")).toBeInTheDocument();
    expect(within(stage).getByRole("button", { name: /^디자인봇, 디자인, 대기열, 이슈 ALM-2 — / })).toBeInTheDocument();
    expect(within(stage).getByRole("button", { name: /^프론트봇, 프론트엔드, 승인 대기, 이슈 ALM-3/ })).toBeInTheDocument();
    expect(within(stage).getByRole("button", { name: /^백엔드봇, 백엔드, 차단됨, 이슈 ALM-5 — / })).toBeInTheDocument();
    expect(within(stage).getByRole("button", { name: "운영봇, 운영, 휴식 중 — 개인 오피스 열기" })).toBeInTheDocument();
    expect(within(stage).getByRole("button", { name: /^리뷰봇, 리뷰, 작업 중, 이슈 ALM-1/ })).toBeInTheDocument();

    // 말풍선 — 작업 중=이슈키+활동, 리뷰=접두, 대기열·차단=접두만(2행 없음), 유휴=없음
    expect(screen.getByTestId("office-bubble-101")).toHaveTextContent("ALM-4ALM-4 인수 조건 …");
    expect(screen.getByTestId("office-bubble-106")).toHaveTextContent(/^리뷰 · ALM-1/);
    expect(screen.getByTestId("office-bubble-102")).toHaveTextContent(/^대기열 · ALM-2$/);
    expect(screen.getByTestId("office-bubble-104")).toHaveTextContent(/^차단됨 · ALM-5$/);
    expect(screen.queryByTestId("office-bubble-105")).not.toBeInTheDocument();

    // 도트 오버레이 — ❗(승인 대기)·Zz(차단)·⌛(대기열) 각 1개
    expect(container.querySelectorAll('[data-overlay="alert"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-overlay="zz"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-overlay="hourglass"]')).toHaveLength(1);
    // 서기(대기열·유휴) 2명, 앉음 3명, 엎드림 1명
    expect(container.querySelectorAll('.office-avatar[data-pose="stand"]')).toHaveLength(2);
    expect(container.querySelectorAll('.office-avatar[data-pose="seat"]')).toHaveLength(3);
    expect(container.querySelectorAll('.office-avatar[data-pose="slump"]')).toHaveLength(1);

    // ❗는 승인 인박스로 가는 별도 링크
    const alert = within(stage).getByRole("link", { name: "프론트봇의 승인 대기 — 승인 인박스 열기" });
    expect(alert).toHaveAttribute("href", `${OFFICE_PATH}/gates?persona=103`);
  });

  it("요약 바 — 오늘 비용 합·이달/상한·작업 중·승인 대기·킬 스위치", async () => {
    renderApp(OFFICE_PATH);
    const bar = (await screen.findByText("오늘 비용")).closest("dl") as HTMLElement;
    expect(within(bar).getByText("$2.73")).toBeInTheDocument();
    expect(within(bar).getByText("$18.40 / $50.00")).toBeInTheDocument();
    expect(within(bar).getByText("가동 중")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "1" })).toHaveAttribute("href", `${OFFICE_PATH}/gates`);
    expect(screen.getByRole("button", { name: "승인 인박스, 대기 1건" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "지금 새로 고침" })).toBeInTheDocument();
  });

  it("5분 컷은 서버 몫 — lastActivity가 null이면 말풍선이 1행이다", async () => {
    const base = await store.fetchOffice("p1");
    vi.spyOn(store, "fetchOffice").mockResolvedValue({
      ...base,
      personas: base.personas.map((p) => ({ ...p, lastActivity: null })),
    });
    renderApp(OFFICE_PATH);
    expect(await screen.findByTestId("office-bubble-101")).toHaveTextContent(/^ALM-4$/);
  });

  it("킬 스위치가 켜지면 위험 배너를 띄운다", async () => {
    const base = await store.fetchOffice("p1");
    vi.spyOn(store, "fetchOffice").mockResolvedValue({ ...base, budget: { ...base.budget, killSwitch: true } });
    renderApp(OFFICE_PATH);
    expect(
      await screen.findByText("킬 스위치가 켜져 있어 모든 AI 작업이 멈췄습니다. 새 실행은 시작되지 않습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("정지됨")).toBeInTheDocument();
  });

  it("첫 조회가 실패하면 오류 빈 상태 + 다시 시도", async () => {
    const spy = vi.spyOn(store, "fetchOffice").mockRejectedValue(new Error("503"));
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    expect(await screen.findByText("사무실 상태를 불러오지 못했습니다")).toBeInTheDocument();
    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ })).toBeInTheDocument();
  });
});

describe("게시판 — BLOCKED run 중복 방지", () => {
  it("currentRun과 recentRuns 양쪽의 BLOCKED run은 게시판 보고서에 나오지 않는다", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const board = await screen.findByRole("button", { name: "게시판 — 최근 작업 보고서 4건" });
    await user.click(board);
    const panel = await screen.findByRole("complementary", { name: "게시판" });
    expect(within(panel).getByRole("link", { name: "ALM-6" })).toBeInTheDocument();
    expect(within(panel).queryByText("ALM-5")).not.toBeInTheDocument();
    expect(within(panel).getAllByText("완료").length).toBeGreaterThan(0);
    expect(within(panel).getAllByRole("listitem")).toHaveLength(4);
  });
});

describe("개인 오피스 패널", () => {
  it("아바타를 누르면 비모달 패널이 열리고 제목으로 포커스, Esc로 닫고 연 버튼으로 돌아간다", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const avatar = await screen.findByRole("button", { name: /^백엔드봇, 백엔드, 차단됨/ });
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    await user.click(avatar);

    const panel = await screen.findByRole("complementary", { name: "백엔드봇" });
    const title = within(panel).getByRole("heading", { level: 2, name: "백엔드봇" });
    await waitFor(() => expect(title).toHaveFocus());
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByText("차단됨 — 다음 조치가 필요합니다.")).toBeInTheDocument();
    expect(within(panel).getByText("3회")).toBeInTheDocument();
    expect(await within(panel).findByRole("heading", { name: /오늘 한 일/ })).toBeInTheDocument();
    expect(within(panel).getByText("(검색어 생략)")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: /최근 실행/ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "백엔드봇" })).not.toBeInTheDocument());
    await waitFor(() => expect(avatar).toHaveFocus());
  });

  it("다른 아바타를 누르면 패널 내용만 바뀌고, 닫기 버튼으로도 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: /^운영봇, 운영, 휴식 중/ }));
    const idle = await screen.findByRole("complementary", { name: "운영봇" });
    expect(within(idle).getByText("지금 진행 중인 작업이 없습니다")).toBeInTheDocument();
    expect(await within(idle).findByText("오늘 기록된 활동이 없습니다")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^프론트봇, 프론트엔드, 승인 대기/ }));
    const waiting = await screen.findByRole("complementary", { name: "프론트봇" });
    expect(within(waiting).getByText("사람의 승인을 기다리고 있습니다.")).toBeInTheDocument();
    await user.click(within(waiting).getByRole("button", { name: "개인 오피스 닫기" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
  });
});

describe("팀 카드 토글", () => {
  it("팀 카드 탭은 ?view=team으로 남고, 6장 카드가 상태를 아이콘+텍스트로 보인다. 연 패널은 탭을 바꿔도 유지된다", async () => {
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^기획봇/ });
    await user.click(screen.getByRole("tab", { name: "팀 카드" }));
    expect(screen.getByTestId("location")).toHaveTextContent(`${OFFICE_PATH}?view=team`);

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(6);
    const backend = cards.find((c) => within(c).queryByRole("heading", { name: "백엔드봇" }))!;
    expect(within(backend).getByText("차단됨")).toBeInTheDocument();
    expect(within(backend).getByRole("link", { name: "ALM-5" })).toBeInTheDocument();
    expect(within(backend).getByText("오늘 $1.05")).toBeInTheDocument();
    const frontend = cards.find((c) => within(c).queryByRole("heading", { name: "프론트봇" }))!;
    expect(within(frontend).getByRole("button", { name: "승인 인박스" })).toBeInTheDocument();
    const ops = cards.find((c) => within(c).queryByRole("heading", { name: "운영봇" }))!;
    expect(within(ops).getByText("진행 중인 작업 없음")).toBeInTheDocument();

    await user.click(within(ops).getByRole("button", { name: "운영봇 개인 오피스 열기" }));
    expect(await screen.findByRole("complementary", { name: "운영봇" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "사무실" }));
    expect(await screen.findByRole("region", { name: "AI 사무실 평면도" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "운영봇" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(new RegExp(`${OFFICE_PATH}$`));
  });
});

describe("폴링 — 10초, 탭이 숨으면 멈춤", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  afterEach(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("10초마다 조회하고, 숨겨지면 멈췄다가 다시 보이면 즉시 1회 조회 후 재개한다", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(store, "fetchOffice");
    const { result, unmount } = renderHook(() => useOfficeData("p1", null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS);
    });
    expect(spy).toHaveBeenCalledTimes(2);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS * 3);
    });
    expect(spy).toHaveBeenCalledTimes(2);

    await act(async () => {
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS);
    });
    expect(spy).toHaveBeenCalledTimes(4);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS * 2);
    });
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("패널이 열려 있으면 활동도 같은 타이머로 함께 조회하고, 이후 실패는 마지막 데이터를 유지한다(stale)", async () => {
    vi.useFakeTimers();
    const office = vi.spyOn(store, "fetchOffice");
    const activity = vi.spyOn(store, "fetchPersonaActivity");
    const { result } = renderHook(() => useOfficeData("p1", "104"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.activityStatus).toBe("ready");
    const before = activity.mock.calls.length;

    office.mockRejectedValueOnce(new Error("503"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS);
    });
    expect(activity.mock.calls.length).toBe(before + 1);
    expect(result.current.stale).toBe(true);
    expect(result.current.office?.personas).toHaveLength(6);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS);
    });
    expect(result.current.stale).toBe(false);
  });
});
