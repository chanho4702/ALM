import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    await user.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(/^\/projects\/.+\/board$/);
    });
    // 스위처가 새 프로젝트를 보여준다
    expect(screen.getByRole("combobox", { name: "프로젝트" })).toHaveTextContent(
      "결제 서비스 (PAY)",
    );
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
