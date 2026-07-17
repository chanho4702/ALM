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

  it("프로젝트 내부에는 브레드크럼(프로젝트 / 이름 / 페이지)이 보인다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/backlog");

    const crumbs = await screen.findByRole("navigation", { name: "브레드크럼" });
    expect(crumbs).toHaveTextContent("프로젝트/ALM 플랫폼/백로그");

    // 첫 조각 클릭 → 디렉터리로
    await user.click(within(crumbs).getByRole("button", { name: "프로젝트" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
  });
});
