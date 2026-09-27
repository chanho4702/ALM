import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import { RUNNER_JAR_URL, runnerCommand } from "./AiTeamExecution";

/**
 * P4a(AGP-69) — 프로젝트 설정 "AI 팀"의 실행 위치·러너 카드와 직원 토큰 만료. 목업: p1 저장 위치 = 내 PC 러너,
 * 러너 = 노트북(온라인, #9006 실행 중)·데스크톱(오프라인)·예전 PC(철회)·공용 빌드 PC(전역, 연결 전).
 */

const PATH = "/projects/p1/settings/ai-team";

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

function rowOf(table: HTMLElement, text: string) {
  const row = within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(text) !== null);
  if (!row) throw new Error(`행 없음: ${text}`);
  return row;
}

async function runnerTable() {
  return screen.findByRole("table", { name: "러너" });
}

describe("실행 위치 카드", () => {
  it("관리자 — 적용 위치를 보여 주고, 서버로 바꿔 저장하면 서버에 싣는다 → 기본값 따름은 null", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(store, "saveExecutionSite");
    renderAt();
    const status = await screen.findByRole("status", { name: "적용 중인 실행 위치" });
    expect(status).toHaveTextContent("이 프로젝트의 새 작업은 내 PC 러너에서 실행됩니다");
    expect(status).not.toHaveTextContent("기본값 따름");

    const group = screen.getByRole("radiogroup", { name: "실행 위치" });
    // 옵션은 아이콘 + 텍스트 + 설명
    const local = within(group).getByRole("radio", { name: /^내 PC 러너/ });
    expect(local).toBeChecked();
    expect(within(group).getByText("24시간 실행, 등록된 LLM API 키로 과금")).toBeInTheDocument();
    expect(within(group).getByText("러너가 켜진 PC의 Claude 구독·키 사용, 그 PC가 켜져 있어야 함")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "실행 위치 저장" });
    expect(saveButton).toBeDisabled();

    await user.click(within(group).getByRole("radio", { name: /^서버/ }));
    await user.click(saveButton);
    expect(await screen.findByText("실행 위치를 저장했습니다")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("p1", "SERVER");
    expect(screen.getByRole("status", { name: "적용 중인 실행 위치" })).toHaveTextContent("서버에서 실행됩니다");

    await user.click(within(group).getByRole("radio", { name: /^기본값 따름 \(서버\)/ }));
    await user.click(screen.getByRole("button", { name: "실행 위치 저장" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith("p1", null));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "적용 중인 실행 위치" })).toHaveTextContent("기본값 따름"),
    );
  });

  it("관리자가 아니면 읽기 전용 — 라디오 잠김·저장 버튼 없음, 러너 목록 API는 부르지 않는다", async () => {
    store.__setAgentMockScenario({ canManage: false });
    const runners = vi.spyOn(store, "listAgentRunners");
    renderAt();
    const group = await screen.findByRole("radiogroup", { name: "실행 위치" });
    for (const radio of within(group).getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(await screen.findByText("실행 위치는 프로젝트 관리자만 바꿀 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실행 위치 저장" })).not.toBeInTheDocument();
    expect(screen.getByText("러너 목록은 프로젝트 관리자만 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "러너 발급" })).not.toBeInTheDocument();
    expect(runners).not.toHaveBeenCalled();
  });

  it("구 백엔드(실행 위치 API 404)면 카드 하나로 '지원 안 함'만 — 러너 카드·라디오 없음", async () => {
    store.__setAgentMockScenario({ executionApi: false });
    renderAt();
    expect(await screen.findByText("이 서버는 실행 위치를 고를 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "실행 위치" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "러너" })).not.toBeInTheDocument();
    // 나머지 구획은 그대로
    expect(await screen.findByRole("table", { name: "직원 토큰" })).toBeInTheDocument();
  });
});

describe("러너 카드", () => {
  it("목록 — 상태는 아이콘+텍스트, 마지막 신호·환경·현재 실행 링크, 철회는 쓸 수 있는 러너에만", async () => {
    renderAt();
    const table = await runnerTable();
    const laptop = rowOf(table, "chanho 노트북");
    expect(within(laptop).getByText("온라인")).toBeInTheDocument();
    expect(within(laptop).getByText("v0.1.0 · Windows 11 · 동시 2")).toBeInTheDocument();
    // 마지막 신호는 초 단위 상대 시간(heartbeat 30초 주기)
    expect(within(laptop).getByText(/^\d+초 전$/)).toBeInTheDocument();
    expect(within(laptop).getByRole("link", { name: "실행 #9006 상세" })).toHaveAttribute(
      "href",
      "/projects/p1/ai-office/runs/9006",
    );
    expect(within(laptop).getByRole("button", { name: "러너 chanho 노트북 철회" })).toBeInTheDocument();

    expect(within(rowOf(table, "사무실 데스크톱")).getByText("오프라인")).toBeInTheDocument();
    expect(within(rowOf(table, "사무실 데스크톱")).getByText("3시간 전")).toBeInTheDocument();
    const old = rowOf(table, "예전 PC");
    expect(within(old).getByText("철회됨")).toBeInTheDocument();
    expect(within(old).queryByRole("button", { name: /철회$/ })).not.toBeInTheDocument();
    // 전역 러너 — 배지, 프로젝트 관리자는 철회 못 함(전역 관리자만). 연결 전이라 신호 "—"
    const shared = rowOf(table, "공용 빌드 PC");
    expect(within(shared).getByText("전역")).toBeInTheDocument();
    expect(within(shared).getByText("연결 전")).toBeInTheDocument();
    expect(within(shared).queryByRole("button", { name: /철회$/ })).not.toBeInTheDocument();
    // 플랫폼 러너는 프로젝트 목록에 없다
    expect(within(table).queryByText("플랫폼 러너")).not.toBeInTheDocument();
    // 켜진 러너가 있으니 경고 없음
    expect(screen.queryByText(/켜진 러너가 없습니다/)).not.toBeInTheDocument();
  });

  it("발급 — 토큰은 한 번만(복사·경고) + 바로 실행할 명령·jar 링크·필요 조건, 닫으면 원문이 사라지고 목록에 '연결 전'", async () => {
    const user = userEvent.setup();
    const issue = vi.spyOn(store, "issueAgentRunner");
    renderAt();
    await runnerTable();
    await user.click(screen.getByRole("button", { name: "러너 발급" }));
    const form = await screen.findByRole("dialog", { name: "러너 발급" });
    // 이름 없이 발급하면 막는다
    await user.click(within(form).getByRole("button", { name: "발급" }));
    expect(within(form).getByText("이름을 입력하세요")).toBeInTheDocument();
    expect(issue).not.toHaveBeenCalled();
    await user.type(within(form).getByLabelText("러너 이름"), "집 데스크톱");
    await user.click(within(form).getByRole("button", { name: "발급" }));

    const dialog = await screen.findByRole("dialog", { name: "러너 토큰이 발급됐습니다" });
    expect(issue).toHaveBeenCalledWith({ name: "집 데스크톱", projectId: "p1" });
    expect(within(dialog).getByText(/이 창을 닫으면 토큰을 다시 볼 수 없습니다/)).toBeInTheDocument();
    const field = within(dialog).getByLabelText("러너 토큰") as HTMLInputElement;
    expect(field.value).toMatch(/^agr_/);
    const secret = field.value;
    const command = within(dialog).getByLabelText("실행 명령");
    expect(command).toHaveTextContent(`java -jar agent-runner.jar --server ${window.location.origin} --token ${secret}`);
    expect(runnerCommand(secret)).toBe(command.textContent);
    expect(within(dialog).getByRole("link", { name: "agent-runner.jar 내려받기" })).toHaveAttribute("href", RUNNER_JAR_URL);
    expect(within(dialog).getByText("Java 24 이상")).toBeInTheDocument();
    expect(within(dialog).getByText(/Claude Code 설치·로그인/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "명령 복사" }));
    expect(await navigator.clipboard.readText()).toBe(command.textContent);
    await user.click(within(dialog).getByRole("button", { name: "복사" }));
    expect(await navigator.clipboard.readText()).toBe(secret);

    await user.click(within(dialog).getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "러너 토큰이 발급됐습니다" })).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain(secret);
    await waitFor(() => expect(within(screen.getByRole("table", { name: "러너" })).getByText("집 데스크톱")).toBeInTheDocument());
    expect(within(rowOf(screen.getByRole("table", { name: "러너" }), "집 데스크톱")).getByText("연결 전")).toBeInTheDocument();
  });

  it("철회는 DS 확인 다이얼로그를 거친다 — 취소하면 그대로, 확인하면 '철회됨'", async () => {
    const user = userEvent.setup();
    const revoke = vi.spyOn(store, "revokeAgentRunner");
    renderAt();
    const table = await runnerTable();
    await user.click(within(rowOf(table, "사무실 데스크톱")).getByRole("button", { name: "러너 사무실 데스크톱 철회" }));
    let dialog = await screen.findByRole("dialog", { name: '러너 "사무실 데스크톱" 철회' });
    expect(within(dialog).getByText(/토큰은 바로 거부됩니다/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /철회/ })).not.toBeInTheDocument());
    expect(revoke).not.toHaveBeenCalled();

    await user.click(within(rowOf(await runnerTable(), "사무실 데스크톱")).getByRole("button", { name: "러너 사무실 데스크톱 철회" }));
    dialog = await screen.findByRole("dialog", { name: '러너 "사무실 데스크톱" 철회' });
    await user.click(within(dialog).getByRole("button", { name: "철회" }));
    expect(await screen.findByText("러너를 철회했습니다")).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith("42");
    await waitFor(() => expect(within(rowOf(screen.getByRole("table", { name: "러너" }), "사무실 데스크톱")).getByText("철회됨")).toBeInTheDocument());
  });

  it("실행 위치가 내 PC 러너인데 켜진 러너가 없으면 경고 — 서버로 두면 경고 없음", async () => {
    store.__setAgentMockScenario({ runnersOnline: false });
    const { unmount } = renderAt();
    await runnerTable();
    expect(await screen.findByText(/실행 위치가 내 PC 러너인데 켜진 러너가 없습니다/)).toBeInTheDocument();
    unmount();

    store.__setAgentMockScenario({ projectSite: "SERVER" });
    renderAt();
    await runnerTable();
    await screen.findByRole("status", { name: "적용 중인 실행 위치" });
    expect(screen.queryByText(/켜진 러너가 없습니다/)).not.toBeInTheDocument();
  });

  it("전역 관리자면 전역 러너도 철회할 수 있다", async () => {
    store.__setAgentMockScenario({ isGlobalAdmin: true });
    renderAt();
    const table = await runnerTable();
    expect(within(rowOf(table, "공용 빌드 PC")).getByRole("button", { name: "러너 공용 빌드 PC 철회" })).toBeInTheDocument();
  });
});

describe("직원 토큰 — 만료(D-P4-3b)", () => {
  async function tokenTable() {
    return screen.findByRole("table", { name: "직원 토큰" });
  }

  it("목록 — 만료일·'곧 만료'·'무기한' 경고, run 토큰은 '실행용'으로 표시하고 철회 버튼이 없다", async () => {
    renderAt();
    const table = await tokenTable();
    const soon = rowOf(table, "Claude Desktop — 프론트봇");
    // 만료 칸(4번째) = 날짜 + 곧 만료 배지
    expect(within(soon).getAllByRole("cell")[3]).toHaveTextContent(/^\d{4}-\d{2}-\d{2}곧 만료$/);
    expect(within(rowOf(table, "백엔드봇 CI")).getByText("무기한")).toBeInTheDocument();
    const run = rowOf(table, "run:9003");
    expect(within(run).getByText("실행용")).toBeInTheDocument();
    expect(within(run).getByText("실행 끝나면 철회")).toBeInTheDocument();
    expect(within(run).queryByRole("button", { name: /철회$/ })).not.toBeInTheDocument();
    // 사람 토큰이 먼저, run 토큰은 맨 뒤
    const labels = within(table).getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(labels.at(-1)).toContain("run:9003");
    // 철회된 토큰에는 곧 만료 배지를 달지 않는다
    expect(within(rowOf(table, "예전 노트북")).queryByText("곧 만료")).not.toBeInTheDocument();
  });

  it("만료 기본 90일 — 프로젝트 관리자에게는 '무기한'이 없고, 30일·직접 입력(1~365)을 싣는다", async () => {
    const user = userEvent.setup();
    const issue = vi.spyOn(store, "issueAgentToken");
    renderAt();
    await tokenTable();
    const expiry = screen.getByRole("combobox", { name: "만료" });
    expect(expiry).toHaveTextContent("90일 (기본)");
    await user.click(expiry);
    expect(await screen.findByRole("option", { name: "30일" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "무기한" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "30일" }));

    await user.click(screen.getByRole("combobox", { name: "직원" }));
    await user.click(await screen.findByRole("option", { name: "백엔드봇" }));
    await user.type(screen.getByLabelText("토큰 이름"), "한 달짜리");
    await user.click(screen.getByRole("button", { name: "발급" }));
    await screen.findByRole("dialog", { name: "토큰이 발급됐습니다" });
    expect(issue).toHaveBeenLastCalledWith({ label: "한 달짜리", personaSlug: "backend-bot", expiresInDays: 30 });
    await user.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // 직접 입력 — 범위 밖이면 발급을 막고, 범위 안이면 그 일수
    await user.click(screen.getByRole("combobox", { name: "만료" }));
    await user.click(await screen.findByRole("option", { name: "직접 입력" }));
    await user.click(screen.getByRole("combobox", { name: "직원" }));
    await user.click(await screen.findByRole("option", { name: "백엔드봇" }));
    await user.type(screen.getByLabelText("토큰 이름"), "직접");
    const days = screen.getByLabelText("만료 일수");
    await user.type(days, "400");
    expect(screen.getByText("1~365일 사이 정수로 입력하세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발급" })).toBeDisabled();
    await user.clear(days);
    await user.type(days, "45");
    await user.click(screen.getByRole("button", { name: "발급" }));
    await screen.findByRole("dialog", { name: "토큰이 발급됐습니다" });
    expect(issue).toHaveBeenLastCalledWith({ label: "직접", personaSlug: "backend-bot", expiresInDays: 45 });
  });

  it("전역 관리자는 '무기한'을 고를 수 있고, 고르면 경고가 뜨며 noExpiry로 싣는다", async () => {
    const user = userEvent.setup();
    store.__setAgentMockScenario({ isGlobalAdmin: true });
    const issue = vi.spyOn(store, "issueAgentToken");
    renderAt();
    await tokenTable();
    await user.click(screen.getByRole("combobox", { name: "만료" }));
    await user.click(await screen.findByRole("option", { name: "무기한" }));
    expect(screen.getByText(/무기한 토큰은 철회하기 전까지 계속 유효합니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "직원" }));
    await user.click(await screen.findByRole("option", { name: "백엔드봇" }));
    await user.type(screen.getByLabelText("토큰 이름"), "영구");
    await user.click(screen.getByRole("button", { name: "발급" }));
    const dialog = await screen.findByRole("dialog", { name: "토큰이 발급됐습니다" });
    expect(issue).toHaveBeenLastCalledWith({ label: "영구", personaSlug: "backend-bot", noExpiry: true });
    expect(within(dialog).getByText(/무기한/)).toBeInTheDocument();
  });
});
