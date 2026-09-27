import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";

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

const BASE = "/projects/p1/ai-office";

async function runsTable() {
  return screen.findByRole("table", { name: "실행 기록" });
}

/** 상세 머리(제목)는 로드 전에도 뜬다 — 데이터가 들어온 뒤(요약 칸)까지 기다린다 */
async function detailLoaded(runId: string) {
  await screen.findByRole("heading", { name: `실행 #${runId}`, level: 2 });
  return screen.findByLabelText("실행 요약");
}

/** 표의 데이터 행(헤더 제외) */
function dataRows(table: HTMLElement) {
  return within(table).getAllByRole("row").slice(1);
}

// lazy 라우트 모듈을 미리 데워 둔다 — 첫 테스트만 콜드 변환 비용(폰트·매트릭스 포함)을 떠안지 않게
beforeAll(async () => {
  await Promise.all([
    import("./AiOfficePage"),
    import("./AgentRunsPage"),
    import("./AgentRunDetailPage"),
    import("./AgentGatesPage"),
  ]);
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("감독 화면 라우트 — useAiTeamActive 게이트", () => {
  it("사무실의 '실행 기록' 버튼이 확정 라우트로 가고, 돌아가기 링크는 사무실을 가리킨다", async () => {
    const user = userEvent.setup();
    renderApp(BASE);
    await screen.findByRole("button", { name: "승인 인박스, 대기 1건" });
    await user.click(screen.getByRole("button", { name: "실행 기록" }));
    // lazy 청크 전환은 트랜지션이라 새 화면이 뜬 뒤에 위치가 바뀐다
    expect(await screen.findByRole("heading", { name: "실행 기록", level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(`${BASE}/runs`);
    expect(screen.getByRole("link", { name: "AI 사무실" })).toHaveAttribute("href", BASE);
  });

  it("사무실의 '승인 인박스' 버튼이 확정 라우트로 간다", async () => {
    const user = userEvent.setup();
    renderApp(BASE);
    await user.click(await screen.findByRole("button", { name: "승인 인박스, 대기 1건" }));
    expect(await screen.findByRole("heading", { name: "승인 인박스", level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(`${BASE}/gates`);
  });

  it("감독 화면에서도 프로젝트 뷰 탭의 'AI 사무실'이 활성으로 남는다", async () => {
    renderApp(`${BASE}/runs`);
    await runsTable();
    const tabs = screen.getByRole("navigation", { name: "프로젝트 뷰" });
    expect(within(tabs).getByRole("button", { name: "AI 사무실" })).toHaveAttribute("aria-current", "page");
  });

  it.each([`${BASE}/runs`, `${BASE}/runs/9004`, `${BASE}/gates`])(
    "비활성 플랫폼이면 %s도 빈 상태만 보이고 조회하지 않는다",
    async (path) => {
      vi.spyOn(store, "fetchAgentPersonas").mockResolvedValue([]);
      const runs = vi.spyOn(store, "fetchAgentRuns");
      const gates = vi.spyOn(store, "fetchAgentGates");
      renderApp(path);
      expect(await screen.findByText("AI 팀이 아직 없습니다")).toBeInTheDocument();
      expect(runs).not.toHaveBeenCalled();
      expect(gates).not.toHaveBeenCalled();
    },
  );
});

describe("실행 기록(AGP-12) — 목록·필터", () => {
  it("기본은 이 프로젝트(ALM) run만, 열마다 아이콘+텍스트 값", async () => {
    renderApp(`${BASE}/runs`);
    const table = await runsTable();
    // 진행 중 착수/계획 회의 run(9007, P3e 목업)까지 12건
    expect(screen.getByText("12건")).toBeInTheDocument();
    expect(within(table).queryByText("WEB-2")).not.toBeInTheDocument();

    const row = within(table).getByRole("link", { name: "실행 #9006 상세" }).closest("tr")!;
    const cells = within(row);
    expect(cells.getByRole("link", { name: "ALM-1" })).toHaveAttribute("href", `${BASE}/runs?issue=ALM-1`);
    expect(cells.getByText("리뷰봇")).toBeInTheDocument();
    expect(cells.getByText("리뷰")).toBeInTheDocument();
    expect(cells.getByText("자동")).toBeInTheDocument();
    expect(cells.getByText("실행 중")).toBeInTheDocument();
    expect(cells.getByText("claude-opus-5-5")).toBeInTheDocument();

    // 시작 전(대기열) run은 시작·종료가 "—"(Invalid Date 없음)
    const queued = within(table).getByRole("link", { name: "실행 #9002 상세" }).closest("tr")!;
    expect(within(queued).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(queued).getByText("수동")).toBeInTheDocument();
    expect(table).not.toHaveTextContent("Invalid Date");
  });

  it("상태 필터(활성/종결)와 범위(전체 프로젝트)가 URL 쿼리에 남는다", async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/runs`);
    await runsTable();

    await user.click(screen.getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "활성" }));
    expect(screen.getByText("6건")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("group=active");
    const active = await runsTable();
    expect(dataRows(active)).toHaveLength(6);
    expect(within(active).queryByText("완료")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "종결" }));
    expect(screen.getByText("6건")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "범위" }));
    await user.click(await screen.findByRole("option", { name: "전체 프로젝트" }));
    expect(screen.getByTestId("location")).toHaveTextContent("scope=all");
    const all = await runsTable();
    expect(within(all).getByText("WEB-2")).toBeInTheDocument();
    expect(within(all).getByText("이슈 없음")).toBeInTheDocument();
    expect(screen.getByText("8건")).toBeInTheDocument();
  });

  it("run 조회가 처음부터 실패하면 오류 상태 + 다시 시도(빈 목록으로 삼키지 않는다)", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(store, "fetchAgentRuns").mockRejectedValueOnce(new Error("서비스를 사용할 수 없습니다"));
    renderApp(`${BASE}/runs`);
    expect(await screen.findByText("실행 기록을 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText(/서비스를 사용할 수 없습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await runsTable()).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("실행 상세(AGP-12) — 요약·계보·관리자 액션", () => {
  it("같은 이슈의 run을 시도 순 타임라인으로, 현재 run은 aria-current", async () => {
    renderApp(`${BASE}/runs/9004`);
    await detailLoaded("9004");
    const fields = screen.getByLabelText("실행 요약");
    expect(within(fields).getByRole("link", { name: "ALM-5" })).toBeInTheDocument();
    expect(within(fields).getByText("백엔드봇")).toBeInTheDocument();

    const timeline = screen.getByRole("list", { name: "ALM-5 실행 타임라인" });
    const steps = within(timeline).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent?.match(/시도 \d/)?.[0])).toEqual(["시도 1", "시도 2", "시도 3"]);
    expect(steps[2]).toHaveAttribute("aria-current", "true");
    expect(within(steps[0]).getByRole("link", { name: "실행 #8982 상세" })).toHaveAttribute("href", `${BASE}/runs/8982`);
  });

  it("리뷰 run은 부모 run 링크를, 부모는 파생 run을 보여 준다", async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/runs/9006`);
    await detailLoaded("9006");
    const lineage = screen.getByRole("region", { name: "계보" });
    // 부모 칸 + 같은 이슈 타임라인 양쪽에 나온다 — 첫째가 부모 칸
    await user.click(within(lineage).getAllByRole("link", { name: "실행 #8985 상세" })[0]);
    await detailLoaded("8985");
    const children = within(screen.getByRole("region", { name: "계보" })).getAllByRole("list")[0];
    expect(within(children).getByRole("link", { name: "실행 #9006 상세" })).toBeInTheDocument();
  });

  it("BLOCKED run — 재개·취소가 보이고, 재개는 확인 후 새 시도로 이어지고 재조회된다", async () => {
    const user = userEvent.setup();
    const resume = vi.spyOn(store, "resumeRun");
    renderApp(`${BASE}/runs/9004`);
    await detailLoaded("9004");
    expect(screen.getByRole("button", { name: "실행 취소" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "재개" }));
    const dialog = await screen.findByRole("dialog", { name: "실행 #9004 재개" });
    await user.click(within(dialog).getByRole("button", { name: "재개" }));

    expect(resume).toHaveBeenCalledWith("9004");
    expect(await screen.findByText("실행 #9004 — 재개했습니다")).toBeInTheDocument();
    // 재조회 — 원 run은 닫히고(취소됨), 타임라인에 시도 4(대기열)가 붙는다
    const timeline = await screen.findByRole("list", { name: "ALM-5 실행 타임라인" });
    await waitFor(() => expect(within(timeline).getAllByRole("listitem")).toHaveLength(4));
    expect(within(timeline).getByText("시도 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재개" })).not.toBeInTheDocument();
  });

  it("서버가 409로 거부하면 {error} 문구를 토스트로 보여 주고 다시 조회한다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "cancelRun").mockRejectedValueOnce(
      new Error("취소할 수 없는 상태의 run입니다(현재: DONE): run=9004"),
    );
    const runs = vi.spyOn(store, "fetchAgentRuns");
    renderApp(`${BASE}/runs/9004`);
    await detailLoaded("9004");
    const before = runs.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "실행 취소" }));
    const dialog = await screen.findByRole("dialog", { name: "실행 #9004 취소" });
    await user.click(within(dialog).getByRole("button", { name: "실행 취소" }));

    expect(await screen.findByText("취소하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("취소할 수 없는 상태의 run입니다(현재: DONE): run=9004")).toBeInTheDocument();
    await waitFor(() => expect(runs.mock.calls.length).toBeGreaterThan(before));
  });

  it("종결 run(DONE)에는 관리자 액션이 없고, RUNNING은 취소만", async () => {
    const { unmount } = renderApp(`${BASE}/runs/8985`);
    await detailLoaded("8985");
    expect(screen.queryByRole("button", { name: "재개" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실행 취소" })).not.toBeInTheDocument();
    unmount();

    renderApp(`${BASE}/runs/9001`);
    await detailLoaded("9001");
    expect(screen.getByRole("button", { name: "실행 취소" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재개" })).not.toBeInTheDocument();
  });

  it("전역 관리자가 아니면 액션 버튼을 숨긴다", async () => {
    vi.spyOn(store, "getMyOrgProfile").mockResolvedValue({
      id: "u2", displayName: "일반", email: null, status: "ACTIVE", kind: "HUMAN",
      globalRoles: [], teams: [], joinedVia: "LEGACY",
    });
    renderApp(`${BASE}/runs/9004`);
    await detailLoaded("9004");
    expect(screen.queryByRole("button", { name: "재개" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실행 취소" })).not.toBeInTheDocument();
  });

  it("없는 run id는 찾을 수 없음 + 목록으로", async () => {
    renderApp(`${BASE}/runs/424242`);
    expect(await screen.findByText("실행 #424242 — 찾을 수 없습니다")).toBeInTheDocument();
  });
});

describe("승인 인박스(AGP-13)", () => {
  it("결정 대기 게이트 — 종류 글리프·요청 전문·run 링크·이슈키", async () => {
    renderApp(`${BASE}/gates`);
    const list = await screen.findByRole("list", { name: "승인 요청 목록" });
    const gate = within(list).getByRole("article", { name: /머지/ });
    expect(within(gate).getByText("PR #41 머지 승인 요청 — 이슈 상세 모달 개선")).toBeInTheDocument();
    expect(within(gate).getByText("결정 대기")).toBeInTheDocument();
    expect(within(gate).getByRole("link", { name: "실행 #9003 상세" })).toHaveAttribute("href", `${BASE}/runs/9003`);
    expect(within(gate).getByRole("link", { name: "ALM-3" })).toBeInTheDocument();
    expect(within(gate).getByText("프론트봇")).toBeInTheDocument();
    expect(within(list).getAllByRole("article")).toHaveLength(1);
  });

  it("승인하면 확인 후 결정되고 목록에서 빠진다(재조회)", async () => {
    const user = userEvent.setup();
    const approve = vi.spyOn(store, "approveGate");
    renderApp(`${BASE}/gates`);
    await screen.findByRole("list", { name: "승인 요청 목록" });
    await user.click(screen.getByRole("button", { name: "요청 #501 승인" }));
    const dialog = await screen.findByRole("dialog", { name: "ALM-3 머지 요청 승인" });
    await user.click(within(dialog).getByRole("button", { name: "승인" }));
    expect(approve).toHaveBeenCalledWith("501");
    expect(await screen.findByText("ALM-3 머지 요청을 승인했습니다")).toBeInTheDocument();
    expect(await screen.findByText("결정을 기다리는 요청이 없습니다")).toBeInTheDocument();
  });

  it("거절도 확인 다이얼로그를 거친다 — 결정 포함 토글이면 '거절됨'으로 남는다", async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/gates`);
    await screen.findByRole("list", { name: "승인 요청 목록" });
    await user.click(screen.getByRole("button", { name: "요청 #501 거절" }));
    const dialog = await screen.findByRole("dialog", { name: "ALM-3 머지 요청 거절" });
    await user.click(within(dialog).getByRole("button", { name: "거절" }));
    expect(await screen.findByText("결정을 기다리는 요청이 없습니다")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "결정된 요청 포함(최근 50건)" }));
    const list = await screen.findByRole("list", { name: "승인 요청 목록" });
    const decided = within(list).getByRole("article", { name: /요청 #501/ });
    expect(within(decided).getByText("거절됨")).toBeInTheDocument();
    expect(within(decided).queryByRole("button", { name: /승인|거절/ })).not.toBeInTheDocument();
    expect(within(list).getAllByRole("article")).toHaveLength(3);
  });

  it("결정이 409로 거부되면 문구를 토스트로 보여 준다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "approveGate").mockRejectedValueOnce(
      new Error("WAITING_APPROVAL 상태가 아닌 run의 게이트는 결정할 수 없습니다(현재: CANCELLED): run=9003"),
    );
    renderApp(`${BASE}/gates`);
    await screen.findByRole("list", { name: "승인 요청 목록" });
    await user.click(screen.getByRole("button", { name: "요청 #501 승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    expect(await screen.findByText("승인하지 못했습니다")).toBeInTheDocument();
    expect(
      screen.getByText("WAITING_APPROVAL 상태가 아닌 run의 게이트는 결정할 수 없습니다(현재: CANCELLED): run=9003"),
    ).toBeInTheDocument();
  });

  it("?persona= 필터 — 팀 카드 '승인 인박스'가 넘긴 페르소나의 게이트만", async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}?view=team`);
    const card = await screen.findByRole("article", { name: /프론트봇/ });
    await user.click(within(card).getByRole("button", { name: "승인 인박스" }));
    expect(await screen.findByRole("article", { name: /머지/ })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(`${BASE}/gates?persona=103`);
    expect(screen.getByRole("combobox", { name: "페르소나" })).toHaveTextContent("프론트봇");
  });

  it("다른 페르소나로 거르면 빈 상태 — 필터를 풀면 다시 보인다", async () => {
    const user = userEvent.setup();
    renderApp(`${BASE}/gates?persona=101`);
    expect(await screen.findByText("결정을 기다리는 요청이 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "페르소나" }));
    await user.click(await screen.findByRole("option", { name: "전체 페르소나" }));
    expect(await screen.findByRole("article", { name: /머지/ })).toBeInTheDocument();
  });
});

describe("팀 카드 — 현재 run 종류 표기(캔버스 돋보기와 등가)", () => {
  it("리뷰 run은 '리뷰 · 이슈키', 작업 run은 '작업 · 이슈키', 유휴는 종류 없음", async () => {
    renderApp(`${BASE}?view=team`);
    const reviewer = await screen.findByRole("article", { name: /리뷰봇/ });
    expect(within(reviewer).getByText(/리뷰 ·/).closest("p")).toHaveTextContent(/리뷰 ·\s*ALM-1/);
    const planner = screen.getByRole("article", { name: /기획봇/ });
    expect(within(planner).getByText(/작업 ·/).closest("p")).toHaveTextContent(/작업 ·\s*ALM-4/);
    const ops = screen.getByRole("article", { name: /운영봇/ });
    expect(within(ops).getByText("진행 중인 작업 없음")).toBeInTheDocument();
    expect(within(ops).queryByText(/작업 ·|리뷰 ·/)).not.toBeInTheDocument();
  });
});

describe("안건 이슈 없는 회의 run — 목록·상세", () => {
  it("목록 — 이 프로젝트 범위에 나오고, 이슈 칸은 링크 없이 '프로젝트 전반'", async () => {
    const { run } = await store.createMeeting({ type: "RETRO", projectId: "p1" });
    renderApp(`${BASE}/runs`);
    const table = await runsTable();
    const row = within(table).getByRole("link", { name: `실행 #${run.id} 상세` }).closest("tr")!;
    expect(within(row).getByText("프로젝트 전반")).toBeInTheDocument();
    expect(within(row).getByText("회고")).toBeInTheDocument();
    expect(within(row).queryByRole("link", { name: /PROJECT-/ })).not.toBeInTheDocument();
    expect(table).not.toHaveTextContent("PROJECT-1");
  });

  it("매니저 보고 run(P3c) — 종류 칸이 클립보드 아이콘 + '매니저 보고', 이슈 칸은 '프로젝트 전반'", async () => {
    const original = store.fetchAgentRuns;
    vi.spyOn(store, "fetchAgentRuns").mockImplementation(async (status) => [
      ...(await original(status)),
      {
        id: "8996", issueKey: "PROJECT-1", status: "DONE", personaId: "101", attempt: 1, model: null,
        startedAt: new Date(Date.now() - 20 * 60_000).toISOString(), endedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        type: "MANAGER", trigger: "SCHEDULER", parentRunId: null,
      },
    ]);
    renderApp(`${BASE}/runs`);
    const table = await runsTable();
    const row = within(table).getByRole("link", { name: "실행 #8996 상세" }).closest("tr")!;
    const type = within(row).getByText("매니저 보고");
    expect(type.querySelector(".lucide-clipboard-pen")).not.toBeNull();
    expect(within(row).getByText("프로젝트 전반")).toBeInTheDocument();
  });

  it("상세 — 이슈 칸 '프로젝트 전반', 같은 키 타임라인(한 이슈의 시도)은 없다", async () => {
    const { run } = await store.createMeeting({ type: "RETRO", projectId: "p1" });
    renderApp(`${BASE}/runs/${run.id}`);
    const summary = await detailLoaded(run.id);
    expect(within(summary).getByText("프로젝트 전반")).toBeInTheDocument();
    expect(within(summary).queryByRole("link", { name: /PROJECT-/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /실행 타임라인/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/PROJECT-1/)).not.toBeInTheDocument();
  });
});
