import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";

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

// 설정 페이지·AI 팀 구획 둘 다 lazy 청크 — 첫 테스트가 콜드 변환 비용을 떠안지 않게 미리 데운다
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

async function staffTable() {
  return screen.findByRole("table", { name: "AI 직원" });
}

function rowOf(table: HTMLElement, name: string) {
  const row = within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name) !== null);
  if (!row) throw new Error(`행 없음: ${name}`);
  return row;
}

describe("AI 팀 설정 — 진입", () => {
  it("에이전트 기능이 활성이면 프로젝트 설정 메뉴에 'AI 팀'이 있고 그 구획으로 간다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/general");
    const menu = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await user.click(await within(menu).findByRole("button", { name: "AI 팀" }));
    expect(await staffTable()).toBeInTheDocument();
  });

  it("비활성 플랫폼이면 메뉴에 없고, URL로 들어와도 빈 상태만 보인다", async () => {
    vi.spyOn(store, "fetchAgentPersonas").mockResolvedValue([]);
    const list = vi.spyOn(store, "listAgentTeamPersonas");
    renderAt();
    expect(await screen.findByText("AI 팀이 아직 없습니다")).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "설정 메뉴" });
    expect(within(menu).queryByRole("button", { name: "AI 팀" })).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});

describe("AI 팀 설정 — 권한 게이트(canManage)", () => {
  it("관리할 수 없으면 읽기 전용 — 안내 배너, 추가·토글·토큰·키 편집 UI가 없고 관리 API도 부르지 않는다", async () => {
    store.__setAgentMockScenario({ canManage: false });
    const tokens = vi.spyOn(store, "listAgentTokens");
    const credential = vi.spyOn(store, "fetchProjectCredential");
    renderAt();
    const table = await staffTable();
    expect(await screen.findByText(/프로젝트 관리자만 변경할 수 있습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "직원 추가" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("switch")).not.toBeInTheDocument();
    // 상태는 아이콘 + 텍스트 Lozenge로만
    expect(within(rowOf(table, "기획봇")).getByText("활성")).toBeInTheDocument();
    expect(screen.getByText("토큰 목록은 프로젝트 관리자만 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("키 설정은 프로젝트 관리자만 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Anthropic API 키")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "발급" })).not.toBeInTheDocument();
    expect(tokens).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
  });
});

describe("AI 팀 설정 — 직원", () => {
  it("이 프로젝트 직원 + 전사 공용(배지·편집 불가) — 롤 글리프·토큰 수(철회 제외)", async () => {
    renderAt();
    const table = await staffTable();
    const planner = rowOf(table, "기획봇");
    expect(within(planner).getByText("@planner-bot")).toBeInTheDocument();
    expect(within(planner).getByText("기획")).toBeInTheDocument();
    expect(within(planner).getByRole("switch", { name: "기획봇 활성" })).toBeChecked();
    // 기획봇 토큰은 철회된 1개뿐 → 0
    await waitFor(() => expect(within(planner).getAllByRole("cell").at(-1)).toHaveTextContent("0"));
    expect(within(rowOf(table, "프론트봇")).getAllByRole("cell").at(-1)).toHaveTextContent("1");

    const ops = rowOf(table, "운영봇");
    expect(within(ops).getByText("공용")).toBeInTheDocument();
    expect(within(ops).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(ops).getAllByRole("cell").at(-1)).toHaveTextContent("—");
    // 이 프로젝트 직원이 공용보다 먼저
    const names = within(table).getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(names.findIndex((t) => t.includes("운영봇"))).toBeGreaterThan(names.findIndex((t) => t.includes("백엔드봇")));
  });

  it("직원 추가 — 기본 권한 '이 프로젝트 편집' 1행이 미리 채워지고, 만들면 목록에 붙는다", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(store, "createAgentPersona");
    renderAt();
    await staffTable();
    await user.click(screen.getByRole("button", { name: "직원 추가" }));
    const dialog = await screen.findByRole("dialog", { name: "직원 추가" });
    const grant = within(dialog).getByRole("group", { name: "권한 1" });
    expect(within(grant).getByRole("combobox", { name: "자원" })).toHaveTextContent("ALM 프로젝트");
    expect(within(grant).getByLabelText("프로젝트 id")).toHaveValue("p1");
    expect(within(grant).getByRole("combobox", { name: "역할" })).toHaveTextContent("편집");

    // 빈 폼은 화면이 막는다
    await user.click(within(dialog).getByRole("button", { name: "추가" }));
    expect(within(dialog).getByText("이름을 입력하세요")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("슬러그"), "qa-bot");
    await user.type(within(dialog).getByLabelText("이름"), "QA봇");
    await user.click(within(dialog).getByRole("combobox", { name: "롤" }));
    await user.click(await screen.findByRole("option", { name: "매니저" }));
    await user.type(within(dialog).getByLabelText("말투"), "짧게");
    await user.click(within(dialog).getByRole("button", { name: "추가" }));

    expect(await screen.findByText("QA봇을(를) 추가했습니다")).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({
      slug: "qa-bot",
      role: "MANAGER",
      name: "QA봇",
      emoji: undefined,
      voicePrompt: "짧게",
      projectId: "p1",
      grants: [{ resourceType: "PROJECT", resourceId: "p1", role: "EDITOR" }],
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "직원 추가" })).not.toBeInTheDocument());
    const row = rowOf(await staffTable(), "QA봇");
    expect(within(row).getByText("매니저")).toBeInTheDocument();
    expect(within(row).queryByText("공용")).not.toBeInTheDocument();
  });

  it("관리하지 않는 스페이스 권한을 넣으면 서버 403 문구를 토스트로 보여 주고 다이얼로그는 남는다", async () => {
    const user = userEvent.setup();
    renderAt();
    await staffTable();
    await user.click(screen.getByRole("button", { name: "직원 추가" }));
    const dialog = await screen.findByRole("dialog", { name: "직원 추가" });
    await user.type(within(dialog).getByLabelText("슬러그"), "doc-bot");
    await user.type(within(dialog).getByLabelText("이름"), "문서봇");
    await user.click(within(dialog).getByRole("button", { name: "권한 추가" }));
    const second = within(dialog).getByRole("group", { name: "권한 2" });
    expect(within(second).getByRole("combobox", { name: "자원" })).toHaveTextContent("위키 스페이스");
    await user.type(within(second).getByLabelText("스페이스 id"), "9");
    await user.click(within(dialog).getByRole("button", { name: "추가" }));

    expect(await screen.findByText("직원을 추가하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("관리하지 않는 자원 권한은 부여할 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "직원 추가" })).toBeInTheDocument();
  });

  it("활성 토글은 확인 다이얼로그를 거쳐 바뀐다(취소하면 그대로)", async () => {
    const user = userEvent.setup();
    const toggle = vi.spyOn(store, "setAgentPersonaActive");
    renderAt();
    const table = await staffTable();
    await user.click(within(rowOf(table, "기획봇")).getByRole("switch", { name: "기획봇 활성" }));
    let dialog = await screen.findByRole("dialog", { name: "기획봇 비활성화" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "기획봇 비활성화" })).not.toBeInTheDocument());
    expect(toggle).not.toHaveBeenCalled();
    expect(within(rowOf(await staffTable(), "기획봇")).getByRole("switch")).toBeChecked();

    await user.click(within(rowOf(await staffTable(), "기획봇")).getByRole("switch", { name: "기획봇 활성" }));
    dialog = await screen.findByRole("dialog", { name: "기획봇 비활성화" });
    await user.click(within(dialog).getByRole("button", { name: "비활성화" }));
    expect(await screen.findByText("기획봇을(를) 비활성화했습니다")).toBeInTheDocument();
    expect(toggle).toHaveBeenCalledWith("101", false);
    await waitFor(() =>
      expect(within(rowOf(screen.getByRole("table", { name: "AI 직원" }), "기획봇")).getByRole("switch")).not.toBeChecked(),
    );
  });
});

describe("AI 팀 설정 — 토큰", () => {
  it("발급하면 원문을 한 번만 보여 주고(복사·경고) 닫으면 사라진다 — 목록엔 이름만 남는다", async () => {
    const user = userEvent.setup();
    renderAt();
    const tokens = await screen.findByRole("table", { name: "직원 토큰" });
    expect(within(tokens).getByText("Claude Desktop — 프론트봇")).toBeInTheDocument();
    // 공용 페르소나(운영봇) 토큰은 이 프로젝트 목록에 없다
    expect(within(tokens).queryByText("운영봇 CI")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "연결 가이드" })).toHaveAttribute("href", "/wiki/spaces/5/pages/47");

    const issueButton = screen.getByRole("button", { name: "발급" });
    expect(issueButton).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "직원" }));
    await user.click(await screen.findByRole("option", { name: "백엔드봇" }));
    await user.type(screen.getByLabelText("토큰 이름"), "내 노트북");
    await user.click(issueButton);

    const dialog = await screen.findByRole("dialog", { name: "토큰이 발급됐습니다" });
    expect(within(dialog).getByText(/이 창을 닫으면 토큰을 다시 볼 수 없습니다/)).toBeInTheDocument();
    const field = within(dialog).getByLabelText("토큰") as HTMLInputElement;
    expect(field.value).toMatch(/^chanho_pat_/);
    const secret = field.value;
    await user.click(within(dialog).getByRole("button", { name: "복사" }));
    expect(await screen.findByText("토큰을 복사했습니다")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(secret);

    await user.click(within(dialog).getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "토큰이 발급됐습니다" })).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
    const updated = screen.getByRole("table", { name: "직원 토큰" });
    expect(within(updated).getByText("내 노트북")).toBeInTheDocument();
    // 발급 폼은 비워진다
    expect(screen.getByLabelText("토큰 이름")).toHaveValue("");
  });

  it("철회는 확인 후 '철회됨'으로 바뀌고 토큰 수에서 빠진다", async () => {
    const user = userEvent.setup();
    renderAt();
    const tokens = await screen.findByRole("table", { name: "직원 토큰" });
    await user.click(within(tokens).getByRole("button", { name: "Claude Desktop — 프론트봇 철회" }));
    const dialog = await screen.findByRole("dialog", { name: '토큰 "Claude Desktop — 프론트봇" 철회' });
    await user.click(within(dialog).getByRole("button", { name: "철회" }));
    expect(await screen.findByText("토큰을 철회했습니다")).toBeInTheDocument();
    const row = rowOf(screen.getByRole("table", { name: "직원 토큰" }), "Claude Desktop — 프론트봇");
    await waitFor(() => expect(within(row).getByText("철회됨")).toBeInTheDocument());
    expect(within(row).queryByRole("button", { name: /철회/ })).not.toBeInTheDocument();
  });
});

describe("AI 팀 설정 — LLM 키", () => {
  it("기본(전역 키 설정됨) — 적용 출처를 크게 '전역 키 사용 중 (…1234)'", async () => {
    renderAt();
    const source = await screen.findByRole("status", { name: "적용 중인 키" });
    expect(source).toHaveTextContent("이 프로젝트는 전역 키 사용 중 (…1234)");
    expect(screen.getByText("설정 안 함 — 전역 키를 따릅니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "프로젝트 키 삭제" })).not.toBeInTheDocument();
  });

  it("키가 어디에도 없으면 '키 없음 — 호스트 구독 세션, 자유 대화 꺼짐'", async () => {
    store.__setAgentMockScenario({ platformKeyHint: null });
    renderAt();
    const source = await screen.findByRole("status", { name: "적용 중인 키" });
    expect(source).toHaveTextContent("키 없음 — 워커는 호스트 구독 세션으로 일하고, 자유 대화는 꺼집니다");
  });

  it("프로젝트 키가 있으면 '프로젝트 전용 키 (…abcd)' + 갱신자·시각 + 교체", async () => {
    store.__setAgentMockScenario({ projectKeyHint: "abcd" });
    renderAt();
    const source = await screen.findByRole("status", { name: "적용 중인 키" });
    expect(source).toHaveTextContent("이 프로젝트는 프로젝트 전용 키 사용 중 (…abcd)");
    expect(await screen.findByText(/이서연/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "교체" })).toBeInTheDocument();
  });

  it("저장하면 입력을 즉시 비우고 출처가 프로젝트 키로 바뀐다 → 삭제(확인)하면 전역 키로 돌아간다", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(store, "saveProjectCredential");
    renderAt();
    await screen.findByRole("status", { name: "적용 중인 키" });
    const input = screen.getByLabelText("Anthropic API 키");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("checkbox", { name: "저장 시 검증" })).toBeChecked();
    await user.type(input, "sk-ant-test-abcd");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("프로젝트 키를 저장했습니다")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("p1", { apiKey: "sk-ant-test-abcd", validate: true });
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "적용 중인 키" })).toHaveTextContent("프로젝트 전용 키 사용 중 (…abcd)"),
    );
    expect(screen.getByLabelText("새 Anthropic API 키")).toHaveValue("");
    expect(screen.queryByDisplayValue("sk-ant-test-abcd")).not.toBeInTheDocument();
    expect(screen.getByText("김찬호", { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "프로젝트 키 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "프로젝트 키 삭제" });
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("프로젝트 키를 삭제했습니다")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "적용 중인 키" })).toHaveTextContent("전역 키 사용 중 (…1234)"),
    );
  });

  it("검증 실패도 서버 문구를 토스트로 보여 주고 입력은 비운다(원문 잔류 금지)", async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole("status", { name: "적용 중인 키" });
    const input = screen.getByLabelText("Anthropic API 키");
    await user.type(input, "not-a-real-key");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("키를 저장하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("API 키 검증에 실패했습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Anthropic API 키")).toHaveValue(""));
    expect(screen.getByRole("status", { name: "적용 중인 키" })).toHaveTextContent("전역 키 사용 중");
  });
});
