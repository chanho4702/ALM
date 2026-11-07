import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __ingestMockCommits, __resetForTest, listAutomationRules, listProjectRepositories } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import { ApiError } from "../store/mapping";
import "../components/IssueDetailModal";
import "./IssueListPage";
import "./CommitsPage";
// 저장소·브랜치 접두 설정은 프로젝트 설정(lazy 청크, @xyflow/react 포함)에 있다 — 위와 같이 미리 받아 둬
// 전체 실행에서 첫 설정 테스트가 "설정 불러오는 중"에 머무르지 않게 한다
import "./ProjectSettingsPage";

/** 개발 기록(V41) — 이슈 개발 패널·미리보기 요약·프로젝트 커밋 탭·저장소 설정·활동·자동화 트리거 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetCommandScopeForTest();
});
afterEach(() => vi.restoreAllMocks());

const blur = () => (document.activeElement as HTMLElement | null)?.blur();

async function devPanel(key: string) {
  renderAt(`/projects/p1/issues?issue=${key}`);
  const dialog = await screen.findByRole("dialog");
  return within(dialog).findByRole("region", { name: "개발" });
}

describe("이슈 개발 패널", () => {
  it("요약(커밋·PR 수)을 보이고, 펼치면 커밋(짧은 sha·제목 새 탭·작성자·저장소)과 PR 목록", async () => {
    const user = userEvent.setup();
    const panel = await devPanel("ALM-2");
    const summary = await within(panel).findByRole("button", { name: /커밋 2건.*PR 1건/ });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).queryByRole("list", { name: "연결된 커밋" })).not.toBeInTheDocument();

    await user.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    const commits = within(panel).getByRole("list", { name: "연결된 커밋" });
    const rows = within(commits).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("3dc8bbc")).toHaveClass("dev-sha");
    const link = within(rows[0]).getByRole("link", { name: /컬럼 드래그 앤 드롭 \[ALM-2\]/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/chanho4702/alm-front/commit/3dc8bbc1f0e2a7d4c5b6a7980123456789abcdef",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(within(rows[0]).getByText("이영희")).toBeInTheDocument();
    expect(within(rows[0]).getByText("chanho4702/alm-front")).toBeInTheDocument();
    const prs = within(panel).getByRole("list", { name: "연결된 PR" });
    expect(within(prs).getByRole("link", { name: /칸반 보드 UI PR/ })).toHaveAttribute("target", "_blank");
  });

  it("연결이 없으면 키 안내 + 브랜치 이름 복사", async () => {
    const user = userEvent.setup();
    const panel = await devPanel("ALM-5");
    expect(await within(panel).findByText(/같은 키를 넣으면 여기에 연결됩니다/)).toBeInTheDocument();
    expect(within(panel).getByText("ALM-5")).toHaveClass("dev-key");
    await user.click(within(panel).getByRole("button", { name: "이 이슈의 브랜치 이름 복사" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("alm-5"));
  });

  it("불러오기 실패(503)는 빈 패널이 아니라 에러 + 다시 시도", async () => {
    const user = userEvent.setup();
    const original = store.getIssueDevelopment;
    const spy = vi
      .spyOn(store, "getIssueDevelopment")
      .mockRejectedValue(new ApiError(503, "x"));
    const panel = await devPanel("ALM-2");
    expect(await within(panel).findByRole("alert")).toHaveTextContent("ALM 서비스를 일시적으로 사용할 수 없습니다");
    spy.mockImplementation(original);
    await user.click(within(panel).getByRole("button", { name: "다시 시도" }));
    expect(await within(panel).findByRole("button", { name: /커밋 2건/ })).toBeInTheDocument();
  });

  it("커밋이 새로 이어지면(실시간 development 신호) 패널과 활동만 다시 읽는다 — 이슈는 다시 읽지 않는다", async () => {
    const user = userEvent.setup();
    const panel = await devPanel("ALM-5");
    await within(panel).findByText(/같은 키를 넣으면/);
    // 모달 뒤 배경은 aria-hidden — 연결 배지는 hidden 포함으로 찾는다
    await screen.findByRole("status", { name: "실시간 연결됨", hidden: true });
    const issueSpy = vi.spyOn(store, "getIssueByKey");
    await __ingestMockCommits!("https://github.com/chanho4702/alm-front", [
      { sha: "d".repeat(40), message: "feat(list): 필터 [ALM-5]", authorName: "김찬호" },
    ]);
    expect(await within(panel).findByRole("button", { name: /커밋 1건/ })).toBeInTheDocument();
    expect(issueSpy).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "활동" }));
    const activity = await within(dialog).findByTestId("issue-activity");
    await waitFor(() => expect(within(activity).getByText("커밋 1건 연결: ddddddd")).toBeInTheDocument());
    expect(within(activity).getByLabelText("커밋 연결")).toBeInTheDocument();
  });
});

describe("미리보기(Space) 개발 요약", () => {
  it("미리보기에 커밋·PR 수가 보인다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    await within(table).findByText("ALM-1");
    blur();
    await user.keyboard("j");
    await user.keyboard("j");
    await user.keyboard(" ");
    const peek = await screen.findByRole("complementary", { name: "ALM-2 미리보기" });
    await waitFor(() =>
      expect(within(peek).getByTestId("issue-peek-development")).toHaveTextContent("커밋 2건PR 1건"),
    );
  });
});

describe("프로젝트 커밋 탭", () => {
  it("뷰 탭에 '커밋' — 날짜별 최근 커밋, 연결 이슈 칩을 누르면 이슈 상세가 열린다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues");
    const tabs = await screen.findByRole("navigation", { name: "프로젝트 뷰" });
    await user.click(within(tabs).getByRole("button", { name: "커밋" }));
    const page = await screen.findByRole("region", { name: "커밋" });
    await waitFor(() => expect(within(page).getAllByTestId("dev-commit")).toHaveLength(4));
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/commits");
    await user.click(within(page).getByRole("button", { name: "ALM-3 열기" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("issue=ALM-3");
  });

  it("커서로 더 보기", async () => {
    const user = userEvent.setup();
    for (let i = 0; i < 31; i += 1) {
      await __ingestMockCommits!("https://github.com/chanho4702/alm-front", [
        {
          sha: i.toString(16).padStart(40, "e"),
          message: `chore: 정리 ${i}`,
          authoredAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        },
      ]);
    }
    renderAt("/projects/p1/commits");
    const page = await screen.findByRole("region", { name: "커밋" });
    await waitFor(() => expect(within(page).getAllByTestId("dev-commit")).toHaveLength(30));
    await user.click(within(page).getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(within(page).getAllByTestId("dev-commit")).toHaveLength(35));
    expect(within(page).queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });

  it("커밋이 없으면 안내와 저장소 설정 바로 가기", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "listProjectCommits").mockResolvedValue({ items: [], nextCursor: null });
    renderAt("/projects/p1/commits");
    expect(await screen.findByText("아직 연결된 커밋이 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장소 설정" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/settings/repositories"),
    );
  });
});

describe("프로젝트 설정 › 저장소", () => {
  it("관리자가 추가·저장 — URL 빈칸은 필드 오류, 서버 검증 오류는 배너, 저장되면 정규화된 값", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/repositories");
    const form = await screen.findByRole("form", { name: "저장소 편집" });
    expect(within(form).getAllByTestId("repo-row")).toHaveLength(1);
    expect(within(form).getByText("1/20")).toBeInTheDocument();
    const save = within(form).getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();

    await user.click(within(form).getByRole("button", { name: "저장소 추가" }));
    await user.click(save);
    expect(await within(form).findByText("저장소 URL을 입력하세요")).toBeInTheDocument();

    const url2 = () => within(form).getByLabelText("URL 2 *");
    await user.type(url2(), "https://token@github.com/chanho4702/alm-backend");
    await user.click(save);
    expect(await within(form).findByText("저장소 URL에 계정 정보를 넣을 수 없습니다")).toBeInTheDocument();

    await user.clear(url2());
    await user.type(url2(), "git@github.com:chanho4702/alm-backend.git");
    await user.click(save);
    expect(await screen.findByText("저장소를 저장했습니다")).toBeInTheDocument();
    await waitFor(() => expect(url2()).toHaveValue("https://github.com/chanho4702/alm-backend"));
    expect(within(form).getByLabelText("이름 2")).toHaveValue("chanho4702/alm-backend");
    expect(await listProjectRepositories("p1")).toHaveLength(2);

    await user.click(within(form).getByRole("button", { name: "저장소 1 제거" }));
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(async () =>
      expect(await listProjectRepositories("p1")).toEqual([expect.objectContaining({ name: "chanho4702/alm-backend" })]),
    );
  });

  it("관리자가 아니면 읽기 전용 목록", async () => {
    await store.updateProjectMemberRole("p1", "u2", "admin");
    await store.updateProjectMemberRole("p1", "u1", "editor");
    renderAt("/projects/p1/settings/repositories");
    const list = await screen.findByRole("list", { name: "등록한 저장소" });
    expect(within(list).getByText("chanho4702/alm-front")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "저장소 편집" })).not.toBeInTheDocument();
    expect(screen.getByText("프로젝트 관리자만 바꿀 수 있습니다.")).toBeInTheDocument();
  });
});

describe("프로젝트 설정 › 브랜치 이름 접두(V43)", () => {
  it("git 참조 규칙 위반은 저장 전에 막고, 저장하면 브랜치 이름 복사에 붙는다 — 옛 version이면 409 배너", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt("/projects/p1/settings/repositories");
    const form = await screen.findByRole("form", { name: "브랜치 접두 편집" });
    const input = within(form).getByLabelText("브랜치 접두");
    const save = within(form).getByRole("button", { name: "저장" });

    await user.type(input, "my branch");
    expect(within(form).getByText("브랜치 접두에는 영문·숫자와 . _ - / 만 쓸 수 있습니다")).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, "feature/");
    expect(within(form).getByLabelText("브랜치 이름 예")).toHaveTextContent("feature/alm-12-fix-login-redirect");
    await user.click(save);
    expect(await screen.findByText("브랜치 접두를 저장했습니다")).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue("feature"));
    expect((await store.getDevSettings("p1")).branchPrefix).toBe("feature");

    // 다른 관리자가 먼저 바꿨다 — 화면이 든 version은 1, 저장소는 2
    await store.updateDevSettings("p1", { branchPrefix: "fix", expectedVersion: 1 });
    await user.clear(input);
    await user.type(input, "hotfix");
    await user.click(save);
    expect(await within(form).findByText(/다른 관리자가 먼저 바꿨습니다 — 최신 값으로 갱신했습니다/)).toBeInTheDocument();
    // 최신 version으로 갱신됐으니 새로 고치지 않고 바로 다시 저장된다(입력은 그대로)
    expect(input).toHaveValue("hotfix");
    await user.click(save);
    await waitFor(async () => expect(await store.getDevSettings("p1")).toMatchObject({ branchPrefix: "hotfix", version: 3 }));
    await store.updateDevSettings("p1", { branchPrefix: "fix", expectedVersion: 3 });
    unmount();

    // 상세의 브랜치 버튼 — 저장된 접두(fix)가 붙는다
    renderAt("/projects/p1/issues?issue=ALM-5");
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "브랜치 이름 복사" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toMatch(/^fix\/alm-5/));
  });

  it("접두를 못 읽으면 접두 없이 복사하지 않고 오류를 알린다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "getDevSettings").mockRejectedValue(new ApiError(503, "unavailable"));
    renderAt("/projects/p1/issues?issue=ALM-5");
    const dialog = await screen.findByRole("dialog");
    await navigator.clipboard.writeText("이전 값");
    await user.click(await within(dialog).findByRole("button", { name: "브랜치 이름 복사" }));
    expect(await screen.findByText("복사하지 못했습니다")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe("이전 값");
  });
});

describe("자동화 트리거 COMMIT_LINKED", () => {
  it("편집기 트리거에 '커밋이 연결되면' — 고르면 그 트리거로 저장된다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/automation");
    await user.click(await screen.findByRole("button", { name: "규칙 만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "자동화 규칙 만들기" });
    await user.type(within(dialog).getByLabelText("규칙 이름 *"), "커밋 오면 코멘트");
    await user.click(within(dialog).getByRole("combobox", { name: "트리거" }));
    await user.click(await screen.findByRole("option", { name: "커밋이 연결되면" }));
    expect(within(dialog).getByText(/커밋이 새로 이어지면 실행합니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "액션 추가" }));
    await user.click(await screen.findByRole("menuitem", { name: "코멘트 남기기" }));
    await user.type(await within(dialog).findByLabelText("액션 1 코멘트 내용"), "커밋 확인");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    expect(await screen.findByText("규칙을 만들었습니다")).toBeInTheDocument();
    const [saved] = await listAutomationRules("p1");
    expect(saved.trigger.type).toBe("COMMIT_LINKED");
  });
});
