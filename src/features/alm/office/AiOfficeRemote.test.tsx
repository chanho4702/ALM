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
 * AGP-63 원격 접속·감사 출처 통합 테스트 — 목업 운영봇(105)은 워커 run 없이 외부 MCP(사람이 발급한 페르소나 토큰)로 일하는 중.
 * 회의 참석이 위치를 이기므로(P3e) 캔버스 장면은 회의를 뺀 사무실에서 본다.
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
const REMOTE_NAME = "운영봇, 운영, 원격 접속 중 — 외부 MCP, 최근 활동: projectId=1 (검색어 생략) — 말 걸기";

async function officeWith(change: (office: AgentOffice) => AgentOffice = (o) => o) {
  const base = await store.fetchOffice("p1");
  return vi.spyOn(store, "fetchOffice").mockResolvedValue(change({ ...base, activeMeeting: null }));
}

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

async function openPanelViaDialog(user: ReturnType<typeof userEvent.setup>, avatar: HTMLElement, name: string) {
  await user.click(avatar);
  const dialog = await screen.findByRole("dialog", { name: new RegExp(`^${name}(과|와) 대화$`) });
  await user.click(within(dialog).getByRole("button", { name: "개인 오피스 열기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
  return screen.findByRole("complementary", { name });
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

describe("캔버스 — 원격 접속은 휴게 구역이 아니라 자기 책상", () => {
  it("책상에 앉고(서기 아님) 신호 오버레이 2프레임 + 명패 '· 원격' + 말풍선 '원격 작업 중 / 도구 라벨' + 접근 이름", async () => {
    await officeWith();
    const { container } = renderApp(OFFICE_PATH);
    const button = await screen.findByRole("button", { name: REMOTE_NAME });
    // 책상 버튼(서 있는 봇의 아바타 버튼이 아님) — 정렬 인덱스 4 = 둘째 줄 첫 셀(x0 0, y0 104)
    expect(button).toHaveAttribute("data-state", "REMOTE");
    expect(button.style.getPropertyValue("--x")).toBe("4");
    expect(button.style.getPropertyValue("--y")).toBe("103");

    const avatar = container.querySelector<SVGGElement>('.office-avatar[data-persona="105"]')!;
    expect(avatar).toHaveAttribute("data-pose", "seat");
    expect(avatar.style.getPropertyValue("--ax")).toBe("16");
    expect(avatar.style.getPropertyValue("--ay")).toBe("104");

    const signal = container.querySelectorAll('[data-overlay="remote"]');
    expect(signal).toHaveLength(1);
    expect(signal[0].querySelector(".f-a")).not.toBeNull();
    expect(signal[0].querySelector(".f-b")).not.toBeNull();
    // 모니터는 꺼져 있다(워커가 타이핑하는 게 아니다) — 타이핑 루프 없음
    expect(container.querySelector('.office-desk[data-state="REMOTE"] .office-loop')).toBeNull();

    expect(screen.getByTestId("office-bubble-105")).toHaveTextContent(/^원격 작업 중이슈 검색$/);
    const plate = [...container.querySelectorAll(".office-nameplate")].find((el) => el.textContent?.startsWith("운영봇"));
    expect(plate).toHaveTextContent("운영봇 · 원격");
  });

  it("활성 run이 있으면 run 상태가 이긴다 — presence가 같이 와도 작업 중(신호 없음)", async () => {
    await officeWith((o) => ({
      ...o,
      personas: o.personas.map((p) => (p.id === "101" ? { ...p, presence: "EXTERNAL" as const } : p)),
    }));
    const { container } = renderApp(OFFICE_PATH);
    expect(await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중, 이슈 ALM-4/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-overlay="remote"]')).toHaveLength(1);
    expect(screen.getByTestId("office-bubble-101")).toHaveTextContent(/^ALM-4/);
  });

  it("구 백엔드(presence 없음)면 원격 접속을 모른다 — 휴식 중으로 휴게 구역에 선다", async () => {
    await officeWith((o) => ({
      ...o,
      personas: o.personas.map(({ presence: _drop, ...p }) => (p.id === "105" ? { ...p, lastActivity: null } : p)),
    }));
    const { container } = renderApp(OFFICE_PATH);
    expect(await screen.findByRole("button", { name: "운영봇, 운영, 휴식 중 — 말 걸기" })).toBeInTheDocument();
    expect(container.querySelector('.office-avatar[data-persona="105"]')).toHaveAttribute("data-pose", "stand");
    expect(container.querySelectorAll('[data-overlay="remote"]')).toHaveLength(0);
    expect(screen.queryByTestId("office-bubble-105")).not.toBeInTheDocument();
  });
});

describe("팀 카드 — 상태 아이콘+텍스트", () => {
  it("원격 접속은 Lozenge '원격 접속 중' + 이슈 줄 대신 '원격 접속 중 — 외부 MCP', 유휴는 여전히 '진행 중인 작업 없음'", async () => {
    await officeWith((o) => ({
      ...o,
      personas: [...o.personas, { ...o.personas.find((p) => p.id === "105")!, id: "107", slug: "ops-2", name: "운영봇2", presence: null, lastActivity: null }],
    }));
    renderApp(`${OFFICE_PATH}?view=team`);
    const cards = await screen.findAllByRole("article");
    const card = (name: string) => cards.find((c) => within(c).queryByRole("heading", { name }))!;
    const ops = card("운영봇");
    expect(within(ops).getByText("원격 접속 중")).toBeInTheDocument();
    expect(within(ops).getByText("원격 접속 중 — 외부 MCP")).toBeInTheDocument();
    expect(within(ops).queryByText("진행 중인 작업 없음")).not.toBeInTheDocument();
    expect(within(ops).getByText("projectId=1 (검색어 생략)")).toBeInTheDocument();
    const idle = card("운영봇2");
    expect(within(idle).getByText("휴식 중")).toBeInTheDocument();
    expect(within(idle).getByText("진행 중인 작업 없음")).toBeInTheDocument();
  });
});

describe("개인 오피스 '오늘 한 일' — 출처 배지", () => {
  beforeEach(reduceMotion);

  it("외부 MCP·시스템 배지, 출처 미상(과거 기록)은 배지 없음 — 원격 접속 봇은 현재 작업 대신 원격 안내", async () => {
    await officeWith();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const panel = await openPanelViaDialog(user, await screen.findByRole("button", { name: REMOTE_NAME }), "운영봇");
    expect(within(panel).getByText("원격 접속 중")).toBeInTheDocument();
    expect(within(panel).getByText("워커 실행 없이 외부 MCP로 원격 작업 중입니다")).toBeInTheDocument();
    const list = (await within(panel).findByRole("heading", { name: /오늘 한 일/ })).closest("section")!.querySelector("ul")!;
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText("외부 MCP")).toBeInTheDocument();
    expect(within(rows[1]).getByText("외부 MCP")).toBeInTheDocument();
    expect(within(rows[2]).getByText("시스템")).toBeInTheDocument();
    expect(rows[3].querySelector(".office-audit-origin")).toBeNull();
    // 외부 MCP·시스템은 링크가 아니다
    expect(within(list).queryByRole("link")).not.toBeInTheDocument();
  });

  it("워커 감사는 '워커 실행 #runId' — run 상세로 가는 링크(출처 미상 행은 배지 없음)", async () => {
    await officeWith();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const panel = await openPanelViaDialog(user, await screen.findByRole("button", { name: /^백엔드봇, 백엔드, 차단됨/ }), "백엔드봇");
    const list = (await within(panel).findByRole("heading", { name: /오늘 한 일/ })).closest("section")!.querySelector("ul")!;
    const links = within(list).getAllByRole("link", { name: "워커 실행 #9004 — 실행 상세" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", `${OFFICE_PATH}/runs/9004`);
    expect(links[0]).toHaveTextContent("워커 실행 #9004");
    const rows = within(list).getAllByRole("listitem");
    expect(rows[rows.length - 1].querySelector(".office-audit-origin")).toBeNull();
  });
});

describe("대화 '지금 뭐 해?' — 원격 분기", () => {
  beforeEach(reduceMotion);

  it("'지금 밖에서 원격으로 작업 중이에요 — …' + 최신 외부 MCP 활동", async () => {
    await officeWith();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: REMOTE_NAME }));
    const dialog = await screen.findByRole("dialog", { name: "운영봇과 대화" });
    const live = dialog.querySelector('[aria-live="polite"]') as HTMLElement;
    await waitFor(() => {
      const skip = within(dialog).queryByRole("button", { name: "건너뛰기" });
      if (skip) fireEvent.click(skip);
      expect(within(dialog).getByRole("menu", { name: "운영봇에게 할 말" })).toBeInTheDocument();
    });
    await user.click(within(within(dialog).getByRole("menu", { name: "운영봇에게 할 말" })).getByRole("menuitem", { name: "지금 뭐 해?" }));
    await waitFor(() => expect(live).toHaveTextContent(/지금 밖에서 원격으로 작업 중이에요 — 외부 MCP로 연결돼 있어요\./));
    expect(live).toHaveTextContent(/이슈 검색을 했어요/);
  });
});
