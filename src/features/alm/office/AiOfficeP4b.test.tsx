import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { ApiError } from "../store/mapping";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";

/**
 * P4b(AGP-59·67) — 사무실의 "리뷰어 없음" 경고, 실행 중 지시(대화 "지시하기"·편지 표식·개인 오피스 줄·실행 상세 "사람 지시").
 * 목업: 기획봇(RUNNING 9001)에 전달된 지시 1 + 전달 대기 1, 공용 리뷰봇이 자동 선택된 리뷰어.
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

// 사무실은 라우트 lazy 청크다 — 전체 스위트 병렬 실행에서 첫 테스트가 청크 로드에 findBy 한도를 다 쓰지 않게 미리 받는다
beforeAll(async () => {
  await import("./AiOfficePage");
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("사무실 — 리뷰어 없음 경고(D-P4b-1)", () => {
  it("reviewReady=false면 헤더에 아이콘+텍스트 경고 칩 — 설정의 리뷰어 카드로 가는 링크", async () => {
    store.__setAgentMockScenario({ reviewerActive: false });
    renderApp(OFFICE_PATH);
    const link = await screen.findByRole("link", { name: "리뷰어 없음 — 완료 불가. AI 팀 설정에서 리뷰어 지정" });
    expect(link).toHaveAttribute("href", "/projects/p1/settings/ai-team#reviewer");
    expect(link).toHaveTextContent("리뷰어 없음 — 완료 불가");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("리뷰어가 있거나(자동 선택) 리뷰가 꺼져 있으면 경고 없음", async () => {
    const { unmount } = renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^기획봇, 기획/ });
    expect(screen.queryByRole("link", { name: /리뷰어 없음/ })).not.toBeInTheDocument();
    unmount();

    store.__setAgentMockScenario({ reviewerActive: false, reviewEnabled: false });
    renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^기획봇, 기획/ });
    expect(screen.queryByRole("link", { name: /리뷰어 없음/ })).not.toBeInTheDocument();
  });
});

describe("사무실 — 전달 대기 지시 편지 표식(D-P4b-5)", () => {
  it("전달 대기 지시가 있는 실행 중 봇 책상에만 편지(2프레임) + 접근 이름 — 전달되면 사라진다", async () => {
    const { container, unmount } = renderApp(OFFICE_PATH);
    const planner = await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ });
    expect(planner).toHaveAccessibleName(/전달 대기 중인 사람 지시 1건/);
    const envelopes = container.querySelectorAll('[data-overlay="envelope"]');
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].closest(".office-desk")).not.toBeNull();
    // 2프레임 통통 — reduced-motion이면 CSS가 A만 남긴다
    expect(envelopes[0].querySelectorAll(".f-a, .f-b")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^리뷰봇, 리뷰, 작업 중/ })).not.toHaveAccessibleName(/사람 지시/);
    unmount();

    store.__setAgentMockScenario({ deliverDirectives: true });
    const again = renderApp(OFFICE_PATH);
    await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ });
    expect(again.container.querySelectorAll('[data-overlay="envelope"]')).toHaveLength(0);
  });

  it("구 백엔드(지시 API 없음)면 표식도 접근 이름 부연도 없다", async () => {
    store.__setAgentMockScenario({ directivesApi: false });
    const { container } = renderApp(OFFICE_PATH);
    const planner = await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ });
    expect(planner).not.toHaveAccessibleName(/사람 지시/);
    expect(container.querySelectorAll('[data-overlay="envelope"]')).toHaveLength(0);
  });
});

// ── 대화 "지시하기" ──

const liveOf = (dialog: HTMLElement) => dialog.querySelector('[aria-live="polite"]') as HTMLElement;

async function menuOf(dialog: HTMLElement, name: string) {
  await waitFor(() => {
    const skip = within(dialog).queryByRole("button", { name: "건너뛰기" });
    if (skip) fireEvent.click(skip);
    expect(within(dialog).getByRole("menu", { name: `${name}에게 할 말` })).toBeInTheDocument();
  });
  return within(dialog).getByRole("menu", { name: `${name}에게 할 말` });
}

async function choose(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string, label: string | RegExp) {
  const menu = await menuOf(dialog, name);
  await user.click(within(menu).getByRole("menuitem", { name: label }));
}

/** 회의를 걷어 낸 사무실 — 기획봇이 책상에서 9001을 실행 중 */
function withoutMeeting() {
  const real = store.fetchOffice;
  return vi.spyOn(store, "fetchOffice").mockImplementation(async (projectId?: string) => ({
    ...(await real(projectId)),
    activeMeeting: null,
  }));
}

async function directiveWhere(user: ReturnType<typeof userEvent.setup>, who: RegExp, name: string, text: string) {
  await user.click(await screen.findByRole("button", { name: who }));
  const dialog = await screen.findByRole("dialog", { name: new RegExp(`^${name}(과|와) 대화$`) });
  await choose(user, dialog, name, "지시하기");
  await user.type(await within(dialog).findByRole("textbox", { name: "지시 내용" }), text);
  await user.click(within(dialog).getByRole("button", { name: "다음" }));
  return dialog;
}

describe("대화 '지시하기' — 실행 중이면 바로 전하기(D-P4b-5)", () => {
  beforeEach(reduceMotion);

  it("실행 중인 봇: '바로 전하기'가 맨 위 → 확인(대상 run·안내) → 지시 API + DIRECTIVE 기록(runId) → 헤더 '전달 대기 → 전달됨'", async () => {
    withoutMeeting();
    const send = vi.spyOn(store, "sendRunDirective");
    const save = vi.spyOn(store, "savePersonaDialog");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await directiveWhere(user, /^기획봇, 기획, 작업 중/, "기획봇", "테스트는 통합까지");
    const menu = await menuOf(dialog, "기획봇");
    const items = within(menu).getAllByRole("menuitem").map((m) => m.textContent);
    expect(items[0]).toBe("실행 중인 작업에 바로 전하기");
    // 코멘트(다음 단계부터 반영)도 그대로 고를 수 있다
    expect(items).toContain("지금 하는 ALM-4에 남기기");
    await user.click(within(menu).getByRole("menuitem", { name: "실행 중인 작업에 바로 전하기" }));

    expect(await within(dialog).findByText("실행 중인 #9001에 바로 전합니다")).toBeInTheDocument();
    expect(within(dialog).getByText(/다음 도구 호출 결과에 붙여 바로 전해요/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "전하기" }));

    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 네, 지금 하던 일에 바로 반영할게요!"));
    expect(send).toHaveBeenCalledWith("9001", "테스트는 통합까지");
    expect(save).toHaveBeenCalledWith("101", [
      expect.objectContaining({ speaker: "USER", kind: "DIRECTIVE", runId: "9001", issueKey: "ALM-4", text: "테스트는 통합까지" }),
    ]);
    const header = dialog.querySelector(".office-scene-directive") as HTMLElement;
    expect(header).toHaveTextContent("지시전달 대기");

    // 워커가 도구를 부르면 전달 — 다음 확인(3초)에서 "전달됨"
    store.__setAgentMockScenario({ deliverDirectives: true });
    await waitFor(() => expect(dialog.querySelector(".office-scene-directive")).toHaveTextContent("지시전달됨"), { timeout: 6000 });
    expect(liveOf(dialog)).toHaveTextContent("기획봇: 지시가 전달됐어요");
  });

  it("지시 API 404(구 백엔드) → 코멘트로 폴백을 권하고 '바로 전하기'를 숨긴다(입력 유지)", async () => {
    withoutMeeting();
    vi.spyOn(store, "sendRunDirective").mockRejectedValue(new ApiError(404, "찾을 수 없습니다."));
    const add = vi.spyOn(store, "addComment");
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await directiveWhere(user, /^기획봇, 기획, 작업 중/, "기획봇", "캐시 먼저");
    await choose(user, dialog, "기획봇", "실행 중인 작업에 바로 전하기");
    await user.click(await within(dialog).findByRole("button", { name: "전하기" }));
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 이 서버는 바로 전하기를 못 해요. 코멘트로 남겨 둘까요?"));
    const menu = await menuOf(dialog, "기획봇");
    expect(within(menu).queryByRole("menuitem", { name: "실행 중인 작업에 바로 전하기" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "지금 하는 ALM-4에 남기기" }));
    expect(await within(dialog).findByText(/다음 단계\(승인 뒤 이어하기·재개·수정 run·다음 작업\)부터 반영돼요/)).toBeInTheDocument();
    expect(within(dialog).getByText("캐시 먼저")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "남기기" }));
    await waitFor(() => expect(add).toHaveBeenCalled());
  });

  it("409(이미 실행 중 아님) → '방금 실행이 멈췄나 봐요' + 그 run에는 다시 권하지 않는다", async () => {
    withoutMeeting();
    vi.spyOn(store, "sendRunDirective").mockRejectedValue(new ApiError(409, "실행 중(RUNNING)인 run에만 지시할 수 있습니다(현재: DONE)"));
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    const dialog = await directiveWhere(user, /^기획봇, 기획, 작업 중/, "기획봇", "끝내기 전에");
    await choose(user, dialog, "기획봇", "실행 중인 작업에 바로 전하기");
    await user.click(await within(dialog).findByRole("button", { name: "전하기" }));
    await waitFor(() => expect(liveOf(dialog)).toHaveTextContent("기획봇: 방금 실행이 멈췄나 봐요. 코멘트로 남겨 둘까요?"));
    const menu = await menuOf(dialog, "기획봇");
    expect(within(menu).queryByRole("menuitem", { name: "실행 중인 작업에 바로 전하기" })).not.toBeInTheDocument();
  });

  it("실행 중이 아니거나(승인 대기) 서버에 지시 API가 없으면 처음부터 코멘트만", async () => {
    withoutMeeting();
    const user = userEvent.setup();
    const { unmount } = renderApp(OFFICE_PATH);
    let dialog = await directiveWhere(user, /^프론트봇, 프론트엔드, 승인 대기/, "프론트봇", "문구 확인");
    let menu = await menuOf(dialog, "프론트봇");
    expect(within(menu).queryByRole("menuitem", { name: "실행 중인 작업에 바로 전하기" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "지금 하는 ALM-3에 남기기" })).toBeInTheDocument();
    unmount();

    store.__setAgentMockScenario({ directivesApi: false });
    renderApp(OFFICE_PATH);
    dialog = await directiveWhere(user, /^기획봇, 기획, 작업 중/, "기획봇", "문구 확인");
    menu = await menuOf(dialog, "기획봇");
    expect(within(menu).queryByRole("menuitem", { name: "실행 중인 작업에 바로 전하기" })).not.toBeInTheDocument();
  });

  it("2000자가 넘으면 '바로 전하기'는 흐림 + 이유(코멘트는 4000자까지 가능)", async () => {
    withoutMeeting();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ }));
    const dialog = await screen.findByRole("dialog", { name: "기획봇과 대화" });
    await choose(user, dialog, "기획봇", "지시하기");
    const text = await within(dialog).findByRole("textbox", { name: "지시 내용" });
    fireEvent.change(text, { target: { value: "가".repeat(2001) } });
    await user.click(within(dialog).getByRole("button", { name: "다음" }));
    const menu = await menuOf(dialog, "기획봇");
    const live = within(menu).getByRole("menuitem", { name: /실행 중인 작업에 바로 전하기/ });
    expect(live).toHaveAttribute("aria-disabled", "true");
    expect(live).toHaveAccessibleDescription("바로 전하기는 2,000자까지예요");
  });
});

describe("개인 오피스 — 전달 대기 지시 줄", () => {
  beforeEach(reduceMotion);

  it("현재 작업에 '사람 지시 — 전달 대기 N건'(아이콘+텍스트)", async () => {
    withoutMeeting();
    const user = userEvent.setup();
    renderApp(OFFICE_PATH);
    await user.click(await screen.findByRole("button", { name: /^기획봇, 기획, 작업 중/ }));
    const dialog = await screen.findByRole("dialog", { name: "기획봇과 대화" });
    await user.click(within(dialog).getByRole("button", { name: "개인 오피스 열기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
    const panel = await screen.findByRole("complementary", { name: "기획봇" });
    expect(within(panel).getByText("사람 지시")).toBeInTheDocument();
    const line = within(panel).getByText(/전달 대기 1건 — 다음 도구 호출 때 전달돼요/);
    expect(line.querySelector("svg")).not.toBeNull();
  });
});

// ── 실행 상세 "사람 지시" ──

const RUN_PATH = "/projects/p1/ai-office/runs/9001";

describe("실행 상세 — 사람 지시(D-P4b-5)", () => {
  it("목록(전달 상태 아이콘+텍스트·보낸/전달 시각·본문) + 관리자 작성 칸 → 보내면 '전달 대기'로 목록에 붙는다", async () => {
    const send = vi.spyOn(store, "sendRunDirective");
    const user = userEvent.setup();
    renderApp(RUN_PATH);
    const list = await screen.findByRole("list", { name: "사람 지시 목록" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("전달됨")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(/보냄 \d+분 전 · 전달 \d+분 전/);
    expect(within(items[0]).getByText("ALM-4 인수 조건에 비로그인 사용자 경우도 넣어 주세요")).toBeInTheDocument();
    expect(within(items[1]).getByText("전달 대기")).toBeInTheDocument();
    expect(items[1]).not.toHaveTextContent(/· 전달/);

    const box = screen.getByRole("textbox", { name: "지시 내용" });
    const submit = screen.getByRole("button", { name: "지시 보내기" });
    expect(submit).toBeDisabled();
    await user.type(box, "끝나면 PR 링크 남겨 주세요");
    await user.click(submit);
    expect(await screen.findByText("지시를 보냈습니다")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith("9001", "끝나면 PR 링크 남겨 주세요");
    await waitFor(() => expect(within(screen.getByRole("list", { name: "사람 지시 목록" })).getAllByRole("listitem")).toHaveLength(3));
    const added = within(screen.getByRole("list", { name: "사람 지시 목록" })).getAllByRole("listitem")[2];
    expect(within(added).getByText("끝나면 PR 링크 남겨 주세요")).toBeInTheDocument();
    expect(within(added).getByText("전달 대기")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("관리자가 아니면 본문은 가려지고 작성 칸이 없다", async () => {
    store.__setAgentMockScenario({ canManage: false });
    renderApp(RUN_PATH);
    const list = await screen.findByRole("list", { name: "사람 지시 목록" });
    expect(within(list).getAllByText("(관리자만 볼 수 있는 지시)")).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "지시 내용" })).not.toBeInTheDocument();
  });

  it("끝난 실행은 작성 칸 대신 안내, 지시가 없으면 빈 상태", async () => {
    renderApp("/projects/p1/ai-office/runs/8990");
    expect(await screen.findByText("이 실행에 보낸 지시가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText(/실행 중일 때만 지시할 수 있습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "지시 내용" })).not.toBeInTheDocument();
  });

  it("끝난 실행의 미전달 지시는 '전달 안 됨 — run 종료'(더는 전달되지 않는다)", async () => {
    vi.spyOn(store, "fetchRunDirectives").mockResolvedValue([
      { id: "1", runId: "8990", text: "먼저 보낸 것", createdAt: new Date(Date.now() - 600_000).toISOString(), deliveredAt: new Date(Date.now() - 590_000).toISOString() },
      { id: "2", runId: "8990", text: "늦게 보낸 것", createdAt: new Date(Date.now() - 60_000).toISOString(), deliveredAt: null },
    ]);
    renderApp("/projects/p1/ai-office/runs/8990");
    const items = within(await screen.findByRole("list", { name: "사람 지시 목록" })).getAllByRole("listitem");
    expect(within(items[0]).getByText("전달됨")).toBeInTheDocument();
    expect(within(items[1]).getByText("전달 안 됨 — run 종료")).toBeInTheDocument();
    expect(within(items[1]).queryByText("전달 대기")).not.toBeInTheDocument();
  });

  it("보내기 409(그새 끝남)면 서버 문구 토스트 + run을 다시 읽는다", async () => {
    vi.spyOn(store, "sendRunDirective").mockRejectedValue(new ApiError(409, "실행 중(RUNNING)인 run에만 지시할 수 있습니다(현재: DONE)"));
    const runs = vi.spyOn(store, "fetchAgentRuns");
    const user = userEvent.setup();
    renderApp(RUN_PATH);
    await user.type(await screen.findByRole("textbox", { name: "지시 내용" }), "x");
    const before = runs.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "지시 보내기" }));
    expect(await screen.findByText("지시를 보내지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("실행 중(RUNNING)인 run에만 지시할 수 있습니다(현재: DONE)")).toBeInTheDocument();
    await waitFor(() => expect(runs.mock.calls.length).toBeGreaterThan(before));
  });

  it("구 백엔드(목록 404)면 '사람 지시' 구획 자체가 없다", async () => {
    store.__setAgentMockScenario({ directivesApi: false });
    renderApp(RUN_PATH);
    await screen.findByText("실행 요약").catch(() => undefined);
    await screen.findByRole("heading", { name: "계보" });
    // 조회가 끝날 시간을 준 뒤에도 없다
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("heading", { name: "사람 지시" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "지시 내용" })).not.toBeInTheDocument();
  });
});
