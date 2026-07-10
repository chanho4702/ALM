import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("App 라우팅과 프로젝트 흐름", () => {
  it("프로젝트가 0개면 EmptyState를 보여준다", async () => {
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
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "아직 프로젝트가 없습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첫 프로젝트 만들기" })).toBeInTheDocument();
  });

  it("루트 접근 시 첫 프로젝트 보드로 redirect하고, 새 프로젝트 생성이 스위처에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp();
    // 시드 프로젝트(p1) 보드로 redirect
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board");
    });
    // 모달 열기 → 입력 → 생성
    await user.click(screen.getByRole("button", { name: "새 프로젝트" }));
    await user.type(screen.getByLabelText("이름"), "결제 서비스");
    await user.type(screen.getByLabelText("키"), "pay");
    expect(screen.getByLabelText("키")).toHaveValue("PAY"); // 자동 대문자
    await user.click(screen.getByRole("button", { name: "만들기" }));
    // 스위처가 새 프로젝트로 바뀌고 새 프로젝트 보드로 이동
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "프로젝트" })).toHaveTextContent(
        "결제 서비스 (PAY)",
      );
    });
    expect(screen.getByTestId("location").textContent).toMatch(/^\/projects\/.+\/board$/);
    expect(screen.getByTestId("location")).not.toHaveTextContent("/projects/p1/board");
  });

  it("스위처로 프로젝트를 전환하면 URL이 바뀐다", async () => {
    const pay = await createProject({ key: "PAY", name: "결제 서비스" }); // 시드 + 2번째 프로젝트
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board");
    });
    await user.click(screen.getByRole("combobox", { name: "프로젝트" }));
    await user.click(await screen.findByRole("option", { name: "결제 서비스 (PAY)" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(`/projects/${pay.id}/board`);
    });
  });
});
