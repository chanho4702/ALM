import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { ApiError } from "../store/mapping";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import type { AgentRunSummary } from "../store/types";

/**
 * P3g 1:1 대화·클릭 이동·그래픽 내 지시(AGP-65) 통합 테스트. 흐름 테스트는 reduced-motion(순간 이동·와이프 없음·타자 없음)으로
 * 결정적으로 돌리고, 다가가기·타자 연출은 실제 시간으로 따로 본다.
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

/**
 * 회의 없음 + 원격 접속 없음 — P3g 흐름은 "휴식 중 운영봇"(유휴 자리에 서 있는 봇) 기준이라 목업의 원격 접속(AGP-63)과
 * 그 외부 MCP 최근 활동을 걷어 낸다. 원격 접속 운영봇은 AiOfficeRemote.test가 본다.
 */
async function quietOffice() {
  const base = await store.fetchOffice("p1");
  const personas = base.personas.map((p) =>
    p.presence ? { ...p, presence: null, lastActivity: p.lastActivity?.origin === "EXTERNAL" ? null : p.lastActivity } : p,
  );
  return vi.spyOn(store, "fetchOffice").mockImplementation(async () => ({ ...base, personas, activeMeeting: null }));
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

const liveOf = (dialog: HTMLElement) => dialog.querySelector('[aria-live="polite"]') as HTMLElement;
/** 긴 발화는 여러 쪽 — 남은 쪽을 건너뛰고(건너뛰기) 메뉴를 찾는다 */
async function menuOf(dialog: HTMLElement, name: string) {
  await waitFor(() => {
    const skip = within(dialog).queryByRole("button", { name: "건너뛰기" });
    if (skip) fireEvent.click(skip);
    expect(within(dialog).getByRole("menu", { name: `${name}에게 할 말` })).toBeInTheDocument();
  });
  return within(dialog).getByRole("menu", { name: `${name}에게 할 말` });
}

async function talkTo(user: ReturnType<typeof userEvent.setup>, button: RegExp, name: string) {
  await user.click(await screen.findByRole("button", { name: button }));
  const dialog = await screen.findByRole("dialog", { name: new RegExp(`^${name}(과|와) 대화$`) });
  return dialog;
}

async function choose(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string, label: string | RegExp) {
  const menu = await menuOf(dialog, name);
  await user.click(within(menu).getByRole("menuitem", { name: label }));
}

describe("말 걸기 — 봇 클릭은 걸어가서 대화(P3g §2.4·§3)", () => {
  beforeEach(reduceMotion);

  it("유휴 봇: 발 타일 아래에서 위를 보고 서고(반걸음 정렬), 모달 장면 + 인사 + 기본 메뉴 5개. '잘 가'로 닫히면 봇 버튼으로 포커스", async () => {
    await quietOffice();
    const user = userEvent.setup();
    const { container } = renderApp(OFFICE_PATH);
    const opener = await screen.findByRole("button", { name: /^운영봇, 운영, 휴식 중 — 말 걸기$/ });
    expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "운영봇과 대화" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // 유휴 #4 (294, 84) → 발 (18, 6) → 대화 위치 (18, 7), 위 보기, x를 봇에 맞춘 반걸음(+6)
    const avatar = container.querySelector<SVGGElement>(".office-user")!;
    expect(avatar.getAttribute("data-facing")).toBe("up");
    expect(avatar.style.getPropertyValue("--ux")).toBe("294");
    expect(avatar.style.getPropertyValue("--uy")).toBe(String(16 * 7 - 8));
    // 장면이 열려 있는 동안 "나" 표는 숨기고, 캔버스 CSS 애니·디렉터는 멈춘다
    expect(container.querySelector(".office-me-tag")).toBeNull();
    expect(container.querySelector(".ai-office-room")).toHaveClass("is-offscreen");

    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 안녕하세요! 뭐 도와드릴까요?"));
    const menu = await menuOf(dialog, "운영봇");
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "지금 뭐 해?",
      "지시하기",
      "이 이슈 맡아줘",
      "그냥 얘기하자",
      "잘 가",
    ]);
    expect(within(menu).queryAllByRole("menuitem", { name: /지시하기|맡아줘/ }).every((m) => !m.hasAttribute("aria-disabled"))).toBe(true);
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "지금 뭐 해?" })).toHaveFocus());

    await user.click(within(menu).getByRole("menuitem", { name: "잘 가" }));
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 또 불러 주세요!");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole("button", { name: /^운영봇, 운영, 휴식 중/ })).toHaveFocus());
    expect(container.querySelector(".office-me-tag")).toHaveTextContent("나");
    expect(container.querySelector(".ai-office-room")).not.toHaveClass("is-offscreen");
  });

  it("책상 봇은 책상 오른쪽 통로에서 왼쪽 보기, 회의 참석 봇은 회의실 문 앞에서 오른쪽 보기 + 회의 인사", async () => {
    const user = userEvent.setup();
    const spy = await quietOffice();
    const { container, unmount } = renderApp(OFFICE_PATH);
    const desk = await talkTo(user, /^기획봇, 기획, 작업 중/, "기획봇");
    const avatar = () => container.querySelector<SVGGElement>(".office-user")!;
    expect(avatar().getAttribute("data-facing")).toBe("left");
    expect(avatar().style.getPropertyValue("--ux")).toBe("48");
    expect(avatar().style.getPropertyValue("--uy")).toBe(String(16 * 3 - 8));
    // 헤더 — 실제 상태 Lozenge(연출과 실제의 분리)
    expect(within(desk).getByText("작업 중")).toBeInTheDocument();
    fireEvent.keyDown(within(desk).getByRole("group", { name: "대화창 — Enter로 넘기기" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
    unmount();
    spy.mockRestore();

    // 목업 회의: 운영봇(원격 접속 중이어도 회의 참석이 위치를 이긴다)은 회의실 좌석 → 문 앞 (21, 9)(방 높이 192 — 문 줄 8·9의 아래 줄)
    const again = renderApp(OFFICE_PATH);
    const meeting = await talkTo(user, /^운영봇, 운영, 원격 접속 중 — 외부 MCP, 최근 활동: .+, 회의 중/, "운영봇");
    const user2 = again.container.querySelector<SVGGElement>(".office-user")!;
    expect(user2.getAttribute("data-facing")).toBe("right");
    expect(user2.style.getPropertyValue("--ux")).toBe(String(16 * 21));
    expect(user2.style.getPropertyValue("--uy")).toBe(String(16 * 9 - 8));
    await waitFor(() => expect(liveOf(meeting)).toHaveTextContent("운영봇: 회의 중이라 잠깐만요! 무슨 일이세요?"));
    expect(within(meeting).getByText("회의 중")).toBeInTheDocument();
  });

  it("팀 카드 '말 걸기' — 사무실 뷰로 바꾸고 그 봇에게 걸어가 대화한다", async () => {
    await quietOffice();
    const user = userEvent.setup();
    renderApp(`${OFFICE_PATH}?view=team`);
    const cards = await screen.findAllByRole("article");
    const ops = cards.find((c) => within(c).queryByRole("heading", { name: "운영봇" }))!;
    await user.click(within(ops).getByRole("button", { name: "운영봇에게 말 걸기" }));
    expect(await screen.findByRole("dialog", { name: "운영봇과 대화" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(new RegExp(`${OFFICE_PATH}$`));
  });
});

describe("다가가기·타자 연출(실제 시간)", () => {
  it("다가가는 동안 대상 머리 위 💬 + 말풍선 숨김, 바닥 클릭은 말 걸기 취소(핀 이동), 같은 봇 두 번 = 건너뛰기, 타자는 Enter로 즉시 완성", async () => {
    await quietOffice();
    const user = userEvent.setup();
    const { container } = renderApp(OFFICE_PATH);
    const planner = await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ });
    expect(screen.getByTestId("office-bubble-101")).toBeInTheDocument();

    await user.click(planner);
    expect(container.querySelectorAll('[data-overlay="talk"]')).toHaveLength(1);
    expect(screen.queryByTestId("office-bubble-101")).not.toBeInTheDocument();
    expect(screen.getByTestId("office-pin")).toBeInTheDocument();

    // 바닥 클릭 — 말 걸기 의도 취소, 핀은 새 목적지로(방 오른쪽 아래 휴게 구역)
    const floor = container.querySelector<HTMLElement>(".office-floor-hit")!;
    fireEvent.click(floor, { clientX: 2 * (16 * 12 + 8), clientY: 2 * (16 * 9 + 8) });
    expect(container.querySelectorAll('[data-overlay="talk"]')).toHaveLength(0);
    expect(screen.getByTestId("office-bubble-101")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="office-pin"] path')).not.toBeNull();

    // 같은 봇을 두 번 — 두 번째는 남은 걸음을 건너뛴다
    await user.click(planner);
    await user.click(planner);
    const avatar = container.querySelector<SVGGElement>(".office-user")!;
    expect(avatar.style.getPropertyValue("--ux")).toBe("48");
    const dialog = await screen.findByRole("dialog", { name: "기획봇과 대화" }, { timeout: 3000 });
    const box = await within(dialog).findByRole("group", { name: "대화창 — Enter로 넘기기" }, { timeout: 3000 });
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 아, 네! 작업하면서 들을게요."), { timeout: 3000 });
    box.focus();
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(box.querySelector(".office-dialog-text")).toHaveTextContent("아, 네! 작업하면서 들을게요."));
  });
});

describe("'지금 뭐 해?'(§5.2)", () => {
  beforeEach(reduceMotion);

  it("데이터 즉답 + 승인 대기면 메뉴 맨 위 '승인 인박스 열기' → 장면을 닫고 게이트 인박스, 답은 장면 종료 때 기록(STATUS)", async () => {
    await quietOffice();
    const save = vi.spyOn(store, "savePersonaDialog");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^프론트봇, 프론트엔드, 승인 대기/, "프론트봇");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("프론트봇: 마침 잘 오셨어요, 승인 기다리던 참이에요."));
    await choose(user, dialog, "프론트봇", "지금 뭐 해?");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent(/ALM-3에서 승인을 기다리고 있어요\. 봐 주실 수 있나요\?/));
    expect(liveOf(dialog)).toHaveTextContent(/PR 생성을 했어요/);
    const menu = await menuOf(dialog, "프론트봇");
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveTextContent("승인 인박스 열기");
    await user.click(within(menu).getByRole("menuitem", { name: "승인 인박스 열기" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`${OFFICE_PATH}/gates?persona=103`));
    expect(save).toHaveBeenCalledWith("103", [expect.objectContaining({ speaker: "PERSONA", kind: "STATUS", issueKey: "ALM-3", runId: "9003" })]);
  });
});

describe("지시하기(§5.3)", () => {
  beforeEach(reduceMotion);

  it("현재 이슈에 사람 명의 코멘트 — 확인 단계에 '다음 단계부터 반영' 안내, 본문 머리말, 성공 대사 + DIRECTIVE 기록", async () => {
    await quietOffice();
    const add = vi.spyOn(store, "addComment");
    const save = vi.spyOn(store, "savePersonaDialog");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^기획봇, 기획, 작업 중/, "기획봇");
    await choose(user, dialog, "기획봇", "지시하기");
    expect(liveOf(dialog)).toHaveTextContent("기획봇: 네, 말씀하세요.");
    const text = await within(dialog).findByRole("textbox", { name: "지시 내용" });
    await waitFor(() => expect(text).toHaveFocus());
    expect(within(dialog).getByRole("button", { name: "다음" })).toBeDisabled();
    await user.type(text, "로그인 실패 문구는 서버 그대로");
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    expect(liveOf(dialog)).toHaveTextContent("기획봇: 어디에 남길까요?");
    await choose(user, dialog, "기획봇", "지금 하는 ALM-4에 남기기");

    expect(await within(dialog).findByText("ALM-4에 코멘트로 남깁니다")).toBeInTheDocument();
    expect(
      within(dialog).getByText("지금 실행 중인 작업에는 다음 단계(승인 뒤 이어하기·재개·수정 run·다음 작업)부터 반영돼요."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "남기기" }));

    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 알겠어요! 다음 단계에서 꼭 반영할게요."));
    expect(add).toHaveBeenCalledWith("i4", "<p><strong>[AI 사무실 지시 → 기획봇]</strong></p><p>로그인 실패 문구는 서버 그대로</p>");
    const comment = await add.mock.results[0].value;
    expect(save).toHaveBeenCalledWith("101", [
      expect.objectContaining({ speaker: "USER", kind: "DIRECTIVE", issueKey: "ALM-4", commentId: comment.id, text: "로그인 실패 문구는 서버 그대로" }),
    ]);
  });

  it("맡은 이슈가 없으면 '현재 이슈'는 흐림 + 이유, '새 작업으로 맡기기'는 지시문을 들고 이슈 고르기로. 코멘트 403은 곤란 대사", async () => {
    await quietOffice();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    await choose(user, dialog, "운영봇", "지시하기");
    await user.type(await within(dialog).findByRole("textbox", { name: "지시 내용" }), "캐시 정리 먼저");
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    const menu = await menuOf(dialog, "운영봇");
    const current = within(menu).getByRole("menuitem", { name: /지금 하는 이슈에 남기기/ });
    expect(current).toHaveAttribute("aria-disabled", "true");
    expect(current).toHaveAccessibleDescription("지금 맡은 이슈가 없어요");
    await user.click(current);
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 지금 맡은 이슈가 없어요.");
    await choose(user, dialog, "운영봇", "새 작업으로 맡기기");
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 어떤 이슈요?");
    expect(await within(dialog).findByRole("textbox", { name: "지시문" })).toHaveValue("캐시 정리 먼저");
  });

  it("코멘트 권한 없음(403) → '이 이슈엔 코멘트를 남길 권한이 없대요.'", async () => {
    await quietOffice();
    vi.spyOn(store, "addComment").mockRejectedValue(new ApiError(403, "권한이 없습니다."));
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^기획봇, 기획, 작업 중/, "기획봇");
    await choose(user, dialog, "기획봇", "지시하기");
    await user.type(await within(dialog).findByRole("textbox", { name: "지시 내용" }), "테스트");
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    await choose(user, dialog, "기획봇", "지금 하는 ALM-4에 남기기");
    await user.click(await within(dialog).findByRole("button", { name: "남기기" }));
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 이 이슈엔 코멘트를 남길 권한이 없대요."));
    // 입력 유지 — 다시 고르면 그대로
    await choose(user, dialog, "기획봇", "지시하기");
    expect(await within(dialog).findByRole("textbox", { name: "지시 내용" })).toHaveValue("테스트");
  });
});

describe("이 이슈 맡아줘(§5.4)", () => {
  beforeEach(reduceMotion);

  async function pickIssue(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, key: string) {
    const search = await within(dialog).findByRole("combobox", { name: "이슈 검색" });
    // 빈 검색 = 이 프로젝트의 완료 아닌 이슈 최근 수정순 5개
    expect(await within(dialog).findByRole("listbox", { name: "이슈 검색 결과" })).toBeInTheDocument();
    await user.type(search, key);
    const option = await within(dialog).findByRole("option", { name: new RegExp(`${key} `) }, { timeout: 2000 });
    await user.click(option);
    await waitFor(() => expect(within(dialog).getByRole("option", { name: new RegExp(`${key} `) })).toHaveAttribute("aria-selected", "true"));
  }

  it("createAgentRun 본문(모델 센티널은 생략) — 서버 응답 전에는 봇이 움직이지 않고, 성공하면 장면이 닫힌 뒤 봇이 대기열 자리로", async () => {
    await quietOffice();
    let resolve!: (run: AgentRunSummary) => void;
    const create = vi.spyOn(store, "createAgentRun").mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    const { container } = renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    await choose(user, dialog, "운영봇", "이 이슈 맡아줘");
    await pickIssue(user, dialog, "ALM-7");
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    expect(await within(dialog).findByText(/운영봇에게 ALM-7 활동 로그 표시를 맡깁니다/)).toBeInTheDocument();
    expect(within(dialog).getByText("기본값(프로젝트 정책)")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "맡기기" }));

    expect(create).toHaveBeenCalledWith({ issueKey: "ALM-7", personaSlug: "ops-bot" });
    // 서버 응답 전 — 봇은 유휴 자리 그대로, 장면도 그대로
    const bot = () => container.querySelector<SVGGElement>('.office-avatar[data-persona="105"]')!;
    expect(bot().style.getPropertyValue("--ax")).toBe("294");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      resolve({
        id: "9500", issueKey: "ALM-7", status: "QUEUED", personaId: "105", attempt: 1, model: null,
        startedAt: null, endedAt: null, type: "TASK", trigger: "USER", parentRunId: null,
      });
    });
    await waitFor(() => expect(liveOf(screen.getByRole("dialog"))).toHaveTextContent("운영봇: ALM-7, 바로 시작할게요!"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
    // 낙관적 currentRun(QUEUED) — 책상 셀 #4 (0, 104) 옆 대기열 자리
    await waitFor(() => expect(bot().style.getPropertyValue("--ax")).toBe("44"));
    expect(bot().style.getPropertyValue("--ay")).toBe("114");
    expect(screen.getByRole("button", { name: /^운영봇, 운영, 대기열, 이슈 ALM-7/ })).toBeInTheDocument();
  });

  it("모델을 고르면 본문에 싣고, 409는 '이미 누가 잡고 있어요' + 입력 유지", async () => {
    await quietOffice();
    const create = vi.spyOn(store, "createAgentRun");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    await choose(user, dialog, "운영봇", "이 이슈 맡아줘");
    await pickIssue(user, dialog, "ALM-2");
    // 다른 AI가 작업 중인 이슈 — 행이 흐리고 "AI 작업 중"
    expect(within(dialog).getByRole("option", { name: /ALM-2 / })).toHaveTextContent("AI 작업 중");
    await user.click(within(dialog).getByRole("combobox", { name: "모델" }));
    await user.click(await screen.findByRole("option", { name: "claude-haiku-4-5-20251001" }));
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    await user.click(await within(dialog).findByRole("button", { name: "맡기기" }));
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 그 이슈는 이미 누가 잡고 있어요."));
    expect(create).toHaveBeenCalledWith({ issueKey: "ALM-2", model: "claude-haiku-4-5-20251001", personaSlug: "ops-bot" });
    await choose(user, dialog, "운영봇", "이 이슈 맡아줘");
    expect(await within(dialog).findByRole("option", { name: /ALM-2 /, selected: true })).toBeInTheDocument();
  });
});

describe("그냥 얘기하자(§5.5)", () => {
  beforeEach(reduceMotion);

  it("성공 — 사람 발화는 즉시, 봇 답은 live로, 세션 유지. 작업 요청이면 메뉴에 '지시하기로 전하기'(마지막 말을 채움)", async () => {
    await quietOffice();
    const chat = vi.spyOn(store, "sendPersonaChat");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    await choose(user, dialog, "운영봇", "그냥 얘기하자");
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 좋아요, 무슨 얘기 할까요?");
    const input = await within(dialog).findByRole("textbox", { name: "할 말" });
    await user.type(input, "요즘 어때?");
    await user.click(within(dialog).getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 그렇군요! 저는 오늘도 이슈들을 하나씩 정리하는 중이에요."));
    expect(chat).toHaveBeenLastCalledWith("105", { message: "요즘 어때?", sessionId: undefined, projectId: "p1" });

    await user.type(within(dialog).getByRole("textbox", { name: "할 말" }), "배포 스크립트 고쳐줘");
    await user.click(within(dialog).getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent(/'지시하기'로 남겨 주시면/));
    expect(chat).toHaveBeenLastCalledWith("105", { message: "배포 스크립트 고쳐줘", sessionId: "c-1", projectId: "p1" });
    await user.click(within(dialog).getByRole("button", { name: "그만" }));
    const menu = await menuOf(dialog, "운영봇");
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveTextContent("지시하기로 전하기");
    await user.click(within(menu).getByRole("menuitem", { name: "지시하기로 전하기" }));
    expect(await within(dialog).findByRole("textbox", { name: "지시 내용" })).toHaveValue("배포 스크립트 고쳐줘");
  });

  it("수다 꺼짐(features.chat=false)은 선택지를 흐리지 않고 봇이 안내, 429·409·503은 대사로 번역", async () => {
    store.__setAgentMockScenario({ chat: false });
    await quietOffice();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    const menu = await menuOf(dialog, "운영봇");
    expect(within(menu).getByRole("menuitem", { name: "그냥 얘기하자" })).not.toHaveAttribute("aria-disabled");
    await user.click(within(menu).getByRole("menuitem", { name: "그냥 얘기하자" }));
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 지금은 수다 모드가 꺼져 있어요. 관리자가 켜 주면 얘기해요!");
    expect(within(dialog).queryByRole("textbox", { name: "할 말" })).not.toBeInTheDocument();
  });

  it("오류 번역 — 429 잠깐 쉬기(수다 유지) · 409 모두 멈춤(메뉴로) · 503 꺼짐 · 그 밖은 입력 되돌림", async () => {
    await quietOffice();
    const user = userEvent.setup();
    const office = await store.fetchOffice("p1");
    vi.spyOn(store, "fetchOffice").mockResolvedValue({ ...office, activeMeeting: null, features: { chat: true } });
    const chat = vi.spyOn(store, "sendPersonaChat");
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    await choose(user, dialog, "운영봇", "그냥 얘기하자");
    const send = async (text: string) => {
      await user.type(await within(dialog).findByRole("textbox", { name: "할 말" }), text);
      await user.click(within(dialog).getByRole("button", { name: "보내기" }));
    };
    chat.mockRejectedValueOnce(new ApiError(429, "잠시 뒤 다시 시도하세요"));
    await send("하나");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 잠깐 쉬었다 얘기해요."));
    chat.mockRejectedValueOnce(new Error("network"));
    await send("둘");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 말이 잘 안 나오네요… 다시 해 볼까요?"));
    expect(within(dialog).getByRole("textbox", { name: "할 말" })).toHaveValue("둘");
    await user.clear(within(dialog).getByRole("textbox", { name: "할 말" }));
    chat.mockRejectedValueOnce(new ApiError(409, "킬 스위치"));
    await send("셋");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 지금은 모두 멈춘 상태라 수다도 쉬어요."));
    await choose(user, dialog, "운영봇", "그냥 얘기하자");
    chat.mockRejectedValueOnce(new ApiError(503, "수다 기능이 꺼져 있습니다"));
    await send("넷");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("운영봇: 지금은 수다 모드가 꺼져 있어요."));
  });
});

describe("권한(§5.7)", () => {
  beforeEach(reduceMotion);

  it("canManage=false면 지시하기·맡아줘가 흐림(aria-disabled + 이유), 골라도 흐름 대신 봇이 이유를 말한다", async () => {
    await quietOffice();
    store.__setAgentMockScenario({ canManage: false });
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    const menu = await menuOf(dialog, "운영봇");
    for (const name of ["지시하기", "이 이슈 맡아줘"]) {
      const item = within(menu).getByRole("menuitem", { name: new RegExp(`^${name}`) });
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAccessibleDescription("프로젝트 관리자만 AI 팀원에게 일을 시킬 수 있어요");
    }
    await user.click(within(menu).getByRole("menuitem", { name: /^지시하기/ }));
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 그건 프로젝트 관리자만 시킬 수 있어요. 대신 지금 뭐 하는지는 알려 드릴게요!");
    expect(within(dialog).queryByRole("textbox", { name: "지시 내용" })).not.toBeInTheDocument();
  });
});

describe("대화 기록(§6)", () => {
  beforeEach(reduceMotion);

  it("장면 백로그 = 이전 기록 + 이번 장면(오늘 만났으면 '또 오셨네요!'), Esc는 백로그만 닫는다", async () => {
    await quietOffice();
    await store.savePersonaDialog("101", [
      { speaker: "USER", kind: "DIRECTIVE", text: "문구 그대로", issueKey: "ALM-4", commentId: "77" },
    ]);
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^기획봇, 기획, 작업 중/, "기획봇");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 또 오셨네요! 아, 네! 작업하면서 들을게요."));
    const toggle = within(dialog).getByRole("button", { name: "대화 기록" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const log = within(dialog).getByRole("log", { name: "기획봇과의 대화 기록" });
    expect(within(log).getByText(/에 지시를 남겼어요/)).toBeInTheDocument();
    expect(within(log).getByRole("link", { name: "ALM-4" })).toBeInTheDocument();
    expect(within(log).getByText("또 오셨네요! 아, 네! 작업하면서 들을게요.")).toBeInTheDocument();
    fireEvent.keyDown(log, { key: "Escape" });
    expect(within(dialog).queryByRole("log")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("개인 오피스 '대화 기록' 탭 — 서버 기록 날짜 묶음, 구 백엔드(404)면 메모리 폴백 + 안내", async () => {
    await quietOffice();
    store.__setAgentMockScenario({ dialogApi: false });
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^백엔드봇, 백엔드, 차단됨/, "백엔드봇");
    await choose(user, dialog, "백엔드봇", "지금 뭐 해?");
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent(/ALM-5에서 막혔어요/));
    await user.click(within(dialog).getByRole("button", { name: "개인 오피스 열기" }));
    const panel = await screen.findByRole("complementary", { name: "백엔드봇" });
    await user.click(within(panel).getByRole("tab", { name: "대화 기록" }));
    expect(await within(panel).findByText("이 서버는 대화 기록을 저장하지 않아요 — 화면을 떠나면 사라져요")).toBeInTheDocument();
    const today = within(panel).getByRole("list", { name: "오늘 대화" });
    expect(within(today).getByText(/ALM-5에서 막혔어요/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "말 걸기" })).toBeInTheDocument();
  });
});

describe("키보드·포커스(§2.6·§8.2)", () => {
  beforeEach(reduceMotion);

  it("'나'는 방향키로 한 칸(막힌 쪽은 보기만), 구역이 바뀔 때만 알림, Enter로 옆 팀원과 대화 — 닫히면 '나'로 포커스", async () => {
    await quietOffice();
    const user = userEvent.setup();
    const { container } = renderApp(OFFICE_PATH);
    const me = await screen.findByRole("button", { name: /^나 — 입구\. 방향키로 이동, Enter로 옆 팀원에게 말 걸기$/ });
    me.focus();
    const avatar = () => container.querySelector<SVGGElement>(".office-user")!;
    await user.keyboard("{Enter}");
    expect(document.querySelector(".ai-office-sr[aria-live]")).toHaveTextContent("근처에 말 걸 팀원이 없어요 — Tab으로 팀원을 고르세요");
    await user.keyboard("{ArrowDown}");
    expect(avatar().getAttribute("data-facing")).toBe("down");
    expect(avatar().style.getPropertyValue("--uy")).toBe(String(16 * 11 - 8));
    // (7, 11) → (7, 5): 디자인봇(대기열 #1, 발 (7, 4))의 대화 위치
    for (let i = 0; i < 6; i += 1) await user.keyboard("{ArrowUp}");
    expect(avatar().style.getPropertyValue("--uy")).toBe(String(16 * 5 - 8));
    expect(document.querySelector(".ai-office-sr[aria-live]")).toHaveTextContent("나 — 업무 구역");
    expect(screen.getByRole("button", { name: /^나 — 업무 구역/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "디자인봇과 대화" });
    await choose(user, dialog, "디자인봇", "잘 가");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole("button", { name: /^나 — / })).toHaveFocus());
  });

  it("모달 포커스 트랩(끝에서 처음으로) · Esc 계층(폼 → 메뉴, 메뉴 → 잘 가) · 입력 중이면 끝내기 확인", async () => {
    await quietOffice();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await talkTo(user, /^운영봇, 운영, 휴식 중/, "운영봇");
    const box = await within(dialog).findByRole("group", { name: "대화창 — Enter로 넘기기" });
    await menuOf(dialog, "운영봇");
    box.focus();
    fireEvent.keyDown(box, { key: "Tab" });
    const first = within(dialog).getByRole("button", { name: "대화 기록" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(box).toHaveFocus();
    // 선택지 메뉴는 하나의 탭 정지(안은 방향키) — 대화창 바로 앞
    const menu = await menuOf(dialog, "운영봇");
    within(menu).getByRole("menuitem", { name: "지금 뭐 해?" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(within(menu).getByRole("menuitem", { name: "지시하기" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(within(menu).getByRole("menuitem", { name: "잘 가" })).toHaveFocus();

    await choose(user, dialog, "운영봇", "지시하기");
    const text = await within(dialog).findByRole("textbox", { name: "지시 내용" });
    await user.type(text, "초안");
    await user.keyboard("{Escape}");
    expect(await menuOf(dialog, "운영봇")).toBeInTheDocument();
    // 입력이 남은 흐름으로 돌아가 닫기를 누르면 확인
    await choose(user, dialog, "운영봇", "지시하기");
    await within(dialog).findByRole("textbox", { name: "지시 내용" });
    await user.click(within(dialog).getByRole("button", { name: "대화 끝내기" }));
    expect(await within(dialog).findByText("입력한 내용이 사라져요. 대화를 끝낼까요?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "계속하기" }));
    expect(await within(dialog).findByRole("textbox", { name: "지시 내용" })).toHaveValue("초안");
    await user.keyboard("{Escape}");
    await menuOf(dialog, "운영봇");
    await user.keyboard("{Escape}");
    expect(liveOf(dialog)).toHaveTextContent("운영봇: 또 불러 주세요!");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
  });
});
