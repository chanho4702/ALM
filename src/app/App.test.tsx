import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import { __resetForTest, createProject } from "../features/jira/store/jiraStore";
import { MOCK_USERS } from "../mock/users";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderApp(initialPath = "/") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** 전역 사이드바 (모든 화면 상주) */
function globalNav() {
  return screen.getByRole("navigation", { name: "전역 내비게이션" });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("App 라우팅과 전역 셸", () => {
  it("루트 접근 시 For you 홈(/home)이 열리고 전역 사이드바가 보인다", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: /안녕하세요/ })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/home");
    // 전역 사이드바: 홈/프로젝트 + 프로젝트 목록
    const nav = globalNav();
    expect(within(nav).getByRole("button", { name: "홈" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "프로젝트" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "ALM 플랫폼" })).toBeInTheDocument();
  });

  it("프로젝트가 0개면 홈이 빈 상태를 보여주고 생성 페이지로 안내한다", async () => {
    // 시드를 우회해 빈 데이터를 미리 심는다
    localStorage.setItem(
      "alm.jira.v1",
      JSON.stringify({
        users: MOCK_USERS,
        projects: [],
        sprints: [],
        issues: [],
        comments: [],
        activities: [],
        issueCounters: {},
      }),
    );
    const user = userEvent.setup();
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "아직 프로젝트가 없습니다" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "첫 프로젝트 만들기" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/new");
    });
  });

  it("존재하지 않는 프로젝트 URL은 디렉터리로 돌려보낸다", async () => {
    renderApp("/projects/ghost/board");
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
  });

  it("사이드바에서 프로젝트를 바꾸면 해당 보드로 이동하고 하위 페이지가 중첩 확장된다", async () => {
    const pay = await createProject({ key: "PAY", name: "결제 서비스" }); // 시드 + 2번째 프로젝트
    const user = userEvent.setup();
    renderApp("/projects/p1/board");
    await screen.findByRole("navigation", { name: "브레드크럼" });

    // 현재 프로젝트(ALM 플랫폼)의 하위 페이지가 펼쳐져 있다
    const nav = globalNav();
    expect(within(nav).getByRole("button", { name: "백로그" })).toBeInTheDocument();

    // 다른 프로젝트 클릭 → 그 보드로 이동, 확장도 따라온다
    await user.click(within(nav).getByRole("button", { name: "결제 서비스" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(`/projects/${pay.id}/board`);
    });

    // 하위 페이지 클릭 → 해당 페이지로
    await user.click(within(globalNav()).getByRole("button", { name: "백로그" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(`/projects/${pay.id}/backlog`);
    });
  });

  it("사이드바 '프로젝트'로 디렉터리에 간다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/board");
    await screen.findByRole("navigation", { name: "브레드크럼" });

    await user.click(within(globalNav()).getByRole("button", { name: "프로젝트" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
  });

  it("프로젝트를 방문하면 '최근' 섹션에 나타난다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/board");
    await screen.findByRole("navigation", { name: "브레드크럼" });

    // 홈으로 이동해도 최근 섹션에 방문한 프로젝트가 남는다
    await user.click(within(globalNav()).getByRole("button", { name: "홈" }));
    const recent = await within(globalNav()).findByTestId("nav-recent");
    expect(within(recent).getByRole("button", { name: "ALM 플랫폼" })).toBeInTheDocument();
  });

  it("디렉터리에서 별표를 켜면 사이드바 '별표' 섹션에 나타나고, 끄면 사라진다", async () => {
    const user = userEvent.setup();
    renderApp("/projects");
    await screen.findByRole("heading", { name: "ALM 플랫폼" });

    await user.click(screen.getByRole("button", { name: "ALM 플랫폼 별표" }));
    const starred = await within(globalNav()).findByTestId("nav-starred");
    expect(within(starred).getByRole("button", { name: "ALM 플랫폼" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ALM 플랫폼 별표" }));
    await waitFor(() => {
      expect(within(globalNav()).queryByTestId("nav-starred")).not.toBeInTheDocument();
    });
  });

  it("사이드바를 접으면 아이콘 레일이 되고, 상태가 유지되며, 다시 펼 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/board");
    await screen.findByRole("navigation", { name: "브레드크럼" });

    // 접기 → 하위 페이지(백로그 등)와 섹션이 사라진다
    await user.click(within(globalNav()).getByRole("button", { name: "사이드바 접기" }));
    await waitFor(() => {
      expect(within(globalNav()).queryByRole("button", { name: "백로그" })).not.toBeInTheDocument();
    });
    expect(globalNav()).toHaveClass("is-collapsed");
    // 아이콘(아바타)으로 프로젝트 이동은 여전히 가능
    expect(within(globalNav()).getByRole("button", { name: "ALM 플랫폼" })).toBeInTheDocument();

    // 펼치기 → 복원
    await user.click(within(globalNav()).getByRole("button", { name: "사이드바 펼치기" }));
    expect(await within(globalNav()).findByRole("button", { name: "백로그" })).toBeInTheDocument();
  });

  it("리사이즈 핸들 키보드(→/Home)로 사이드바 너비를 조절한다", async () => {
    const user = userEvent.setup();
    renderApp("/home");
    await screen.findByRole("heading", { name: /안녕하세요/ });

    const resizer = within(globalNav()).getByRole("separator", { name: "사이드바 너비 조절" });
    expect(resizer).toHaveAttribute("aria-valuenow", "240");

    resizer.focus();
    await user.keyboard("{ArrowRight}");
    expect(resizer).toHaveAttribute("aria-valuenow", "256");
    await user.keyboard("{Home}");
    expect(resizer).toHaveAttribute("aria-valuenow", "240");
  });

  it("프로젝트 내부에는 브레드크럼(프로젝트/이름)과 활성 뷰 탭이 보인다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/backlog");

    // 지라식: 브레드크럼은 프로젝트/이름까지, 현재 뷰는 탭이 표시
    const crumbs = await screen.findByRole("navigation", { name: "브레드크럼" });
    expect(crumbs).toHaveTextContent("프로젝트/ALM 플랫폼");

    const tabs = screen.getByRole("navigation", { name: "프로젝트 뷰" });
    expect(within(tabs).getByRole("button", { name: "백로그" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // 탭으로 뷰 전환
    await user.click(within(tabs).getByRole("button", { name: "요약" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/dashboard");
    });

    // 브레드크럼 첫 조각 클릭 → 디렉터리로
    await user.click(within(crumbs).getByRole("button", { name: "프로젝트" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
  });
});
