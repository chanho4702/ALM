import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";

/**
 * P4b(AGP-59) — 프로젝트 설정 "AI 팀"의 리뷰어 카드. 목업: 지정 없음 → 공용 리뷰봇(106)이 "자동 선택".
 * 해석 순서(프로젝트 > 전역 > 서버 env > 자동 > 없음)와 거부 규칙은 목업이 agent-service ReviewerResolver를 따른다.
 */

const PATH = "/projects/p1/settings/ai-team";
const NONE_TEXT = "리뷰어가 없어 AI 작업이 완료(done)되지 않습니다 — REVIEWER 직원을 만들거나 지정하세요";

function renderAt(path = PATH) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeAll(async () => {
  await Promise.all([import("../pages/ProjectSettingsPage"), import("./AiTeamSettings")]);
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const card = () => document.getElementById("reviewer") as HTMLElement;
const effective = () => screen.findByRole("status", { name: "적용 중인 리뷰어" });

describe("리뷰어 카드", () => {
  it("설명 + 유효 리뷰어(초상·이름·공용) + 출처 아이콘+텍스트 '자동 선택' — 관리자는 지정 저장 → '프로젝트 지정', 해제 → 다시 자동", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(store, "saveReviewSetting");
    const clear = vi.spyOn(store, "clearReviewSetting");
    renderAt();
    const status = await effective();
    expect(within(card()).getByText(/다른 AI 리뷰어가 결과를 검증해 통과시켜야 완료됩니다/)).toBeInTheDocument();
    expect(status).toHaveTextContent("리뷰봇");
    expect(status).toHaveTextContent("@reviewer-bot");
    expect(within(status).getByText("공용")).toBeInTheDocument();
    expect(within(status).getByText("자동 선택")).toBeInTheDocument();
    // 초상(도트) — 이모지만으로 사람을 가리키지 않는다
    expect(status.querySelector(".ai-team-avatar")).not.toBeNull();
    expect(within(card()).getByText(/이 프로젝트 지정 없음/)).toBeInTheDocument();
    expect(screen.queryByText(NONE_TEXT)).not.toBeInTheDocument();
    expect(within(card()).queryByRole("button", { name: "지정 해제(자동/상위 설정 따름)" })).not.toBeInTheDocument();

    const saveButton = within(card()).getByRole("button", { name: "리뷰어 저장" });
    expect(saveButton).toBeDisabled();
    const select = within(card()).getByRole("combobox", { name: "리뷰어" });
    await user.click(select);
    // 후보는 활성 REVIEWER(이 프로젝트 소속 또는 공용)만 — 다른 롤은 없다
    expect(screen.queryByRole("option", { name: /기획봇/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "🔍 리뷰봇 · 공용" }));
    await user.click(saveButton);
    expect(await screen.findByText("리뷰어를 지정했습니다")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("p1", "106");
    await waitFor(() => expect(within(card()).getByText("프로젝트 지정")).toBeInTheDocument());
    expect(within(card()).getByText("이 프로젝트 지정: 리뷰봇")).toBeInTheDocument();

    await user.click(within(card()).getByRole("button", { name: "지정 해제(자동/상위 설정 따름)" }));
    expect(await screen.findByText("리뷰어 지정을 해제했습니다")).toBeInTheDocument();
    expect(clear).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(within(card()).getByText("자동 선택")).toBeInTheDocument());
    expect(within(card()).queryByRole("button", { name: "지정 해제(자동/상위 설정 따름)" })).not.toBeInTheDocument();
  });

  it("상위 설정 출처 — 전역 지정이면 '전역 지정', 서버 env면 '서버 설정'", async () => {
    store.__setAgentMockScenario({ platformReviewer: "106" });
    const { unmount } = renderAt();
    expect(within(await effective()).getByText("전역 지정")).toBeInTheDocument();
    unmount();

    __resetForTest();
    store.__setAgentMockScenario({ envReviewer: "reviewer-bot" });
    renderAt();
    expect(within(await effective()).getByText("서버 설정")).toBeInTheDocument();
  });

  it("리뷰어 없음 — 경고 배너 + '없음' 출처, '직원 추가'는 롤을 REVIEWER로 미리 골라 추가 모달을 연다", async () => {
    const user = userEvent.setup();
    store.__setAgentMockScenario({ reviewerActive: false });
    renderAt();
    const status = await effective();
    expect(status).toHaveTextContent("리뷰어 없음");
    expect(within(status).getByText("없음")).toBeInTheDocument();
    expect(within(card()).getByText(NONE_TEXT)).toBeInTheDocument();
    // 활성 REVIEWER가 없으니 고를 것도 없다
    expect(within(card()).getByRole("combobox", { name: "리뷰어" })).toBeDisabled();
    expect(within(card()).getByText(/지정할 수 있는 REVIEWER 직원이 없습니다/)).toBeInTheDocument();

    await user.click(within(card()).getByRole("button", { name: "직원 추가" }));
    const dialog = await screen.findByRole("dialog", { name: "직원 추가" });
    expect(within(dialog).getByRole("combobox", { name: "롤" })).toHaveTextContent("리뷰");
  });

  it("관리자가 아니면 읽기 전용 — 유효 리뷰어는 보이고 선택·저장·해제·배너 액션은 없다", async () => {
    store.__setAgentMockScenario({ canManage: false, reviewerActive: false });
    const save = vi.spyOn(store, "saveReviewSetting");
    renderAt();
    await effective();
    expect(await within(card()).findByText("리뷰어는 프로젝트 관리자만 지정할 수 있습니다.")).toBeInTheDocument();
    expect(within(card()).getByText(NONE_TEXT)).toBeInTheDocument();
    expect(within(card()).queryByRole("button", { name: "직원 추가" })).not.toBeInTheDocument();
    expect(within(card()).queryByRole("combobox", { name: "리뷰어" })).not.toBeInTheDocument();
    expect(within(card()).queryByRole("button", { name: "리뷰어 저장" })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("서버가 거부(400)하면 문구 그대로 토스트 — 지정은 그대로", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "saveReviewSetting").mockRejectedValue(new Error("리뷰어로 지정할 수 없는 페르소나입니다 — 활성 REVIEWER 롤"));
    renderAt();
    await effective();
    await user.click(within(card()).getByRole("combobox", { name: "리뷰어" }));
    await user.click(await screen.findByRole("option", { name: "🔍 리뷰봇 · 공용" }));
    await user.click(within(card()).getByRole("button", { name: "리뷰어 저장" }));
    expect(await screen.findByText("리뷰어를 지정하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("리뷰어로 지정할 수 없는 페르소나입니다 — 활성 REVIEWER 롤")).toBeInTheDocument();
    expect(within(card()).getByText("자동 선택")).toBeInTheDocument();
  });

  it("구 백엔드(리뷰어 API 404)면 '지원 안 함' 안내만 — 나머지 구획은 그대로", async () => {
    store.__setAgentMockScenario({ reviewApi: false });
    renderAt();
    expect(await screen.findByText("이 서버는 리뷰어를 지정할 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "적용 중인 리뷰어" })).not.toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "AI 직원" })).toBeInTheDocument();
  });

  it("직원이 바뀌면 다시 조회한다 — 리뷰어 없음에서 REVIEWER 직원을 추가하면 그 직원이 자동 선택되고 경고가 사라진다", async () => {
    const user = userEvent.setup();
    store.__setAgentMockScenario({ reviewerActive: false });
    renderAt();
    await effective();
    await user.click(within(card()).getByRole("button", { name: "직원 추가" }));
    const dialog = await screen.findByRole("dialog", { name: "직원 추가" });
    await user.type(within(dialog).getByLabelText("슬러그"), "qa-bot");
    await user.type(within(dialog).getByLabelText("이름"), "QA봇");
    await user.click(within(dialog).getByRole("button", { name: "추가" }));
    expect(await screen.findByText("QA봇을(를) 추가했습니다")).toBeInTheDocument();
    // 추가하면 곧바로 편집 다이얼로그(외형)가 열린다 — 닫고 카드를 본다
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("status", { name: "적용 중인 리뷰어" })).toHaveTextContent("QA봇"));
    expect(within(screen.getByRole("status", { name: "적용 중인 리뷰어" })).getByText("자동 선택")).toBeInTheDocument();
    expect(within(card()).queryByText(NONE_TEXT)).not.toBeInTheDocument();
  });
});
