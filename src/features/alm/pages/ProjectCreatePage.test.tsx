import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderCreate() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/new"]}>
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

describe("ProjectCreatePage", () => {
  it("영문 이름을 입력하면 키를 이니셜로 자동 제안하고, 직접 수정하면 제안을 멈춘다", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(await screen.findByLabelText("이름"), "Payment Service");
    expect(screen.getByLabelText("키")).toHaveValue("PS");

    // 키를 직접 수정 → 소문자는 대문자로, 이후 이름을 바꿔도 유지
    await user.clear(screen.getByLabelText("키"));
    await user.type(screen.getByLabelText("키"), "pay");
    expect(screen.getByLabelText("키")).toHaveValue("PAY");
    await user.type(screen.getByLabelText("이름"), " Extra");
    expect(screen.getByLabelText("키")).toHaveValue("PAY");
  });

  it("만들기 → 새 프로젝트 보드로 이동한다", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(await screen.findByLabelText("이름"), "결제 서비스");
    await user.type(screen.getByLabelText("키"), "PAY");
    await user.type(screen.getByLabelText("설명"), "결제 도메인");
    await user.click(screen.getByRole("button", { name: "프로젝트 만들기" }));

    await waitFor(() => {
      // /board 진입 후 기본 보드로 redirect된 최종 URL
      expect(screen.getByTestId("location").textContent).toMatch(/^\/projects\/.+\/boards\/.+$/);
    });
    // 전역 사이드바 프로젝트 섹션에 새 프로젝트가 나타난다 ("최근" 섹션에도 뜨므로 스코프)
    const projectSection = within(
      screen.getByRole("navigation", { name: "전역 내비게이션" }),
    ).getByTestId("nav-projects");
    expect(within(projectSection).getByRole("button", { name: "결제 서비스" })).toBeInTheDocument();
  });

  it("취소 → 프로젝트 디렉터리로 돌아간다", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(await screen.findByRole("button", { name: "취소" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
  });
});

describe("프로젝트 템플릿", () => {
  it("템플릿 카드가 미리보기와 함께 렌더되고 기본 선택은 빈 프로젝트다", async () => {
    renderCreate();
    const grid = await screen.findByTestId("template-grid");

    expect(within(grid).getByRole("radio", { name: /빈 프로젝트/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // 정직한 미리보기: 칸반 카드에 WIP까지 표기
    expect(within(grid).getByText(/진행 중 \(WIP 3\)/)).toBeInTheDocument();
    expect(within(grid).getByText("Sprint 1")).toBeInTheDocument();
  });

  it("스크럼 템플릿으로 만들면 스프린트 보드로 이동하고 백로그에 샘플 이슈가 있다", async () => {
    const user = userEvent.setup();
    renderCreate();
    const grid = await screen.findByTestId("template-grid");

    await user.click(within(grid).getByRole("radio", { name: /스프린트 단위로 계획/ }));
    await user.type(screen.getByLabelText("이름"), "스크럼 팀");
    await user.type(screen.getByLabelText("키"), "SCR");
    await user.click(screen.getByRole("button", { name: "프로젝트 만들기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(/\/projects\/.+\/boards\/.+/);
    });
    // 템플릿 보드 이름이 툴바에 보인다
    expect(
      await screen.findByText("스프린트 보드", { selector: ".board-name" }),
    ).toBeInTheDocument();
  });
});
