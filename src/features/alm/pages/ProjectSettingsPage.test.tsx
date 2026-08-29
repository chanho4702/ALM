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

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/settings"]}>
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

describe("ProjectSettingsPage", () => {
  it("이름/설명을 수정하면 전역 사이드바에도 반영된다 (키는 읽기 전용 표시)", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();
    expect(screen.getByText("ALM", { selector: ".issue-key-cell" })).toBeInTheDocument(); // 키 표시
    expect(screen.queryByLabelText("키")).not.toBeInTheDocument(); // 입력 필드는 아님

    const nameField = screen.getByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "ALM 플랫폼 v2");
    await user.click(screen.getByRole("button", { name: "저장" }));

    const projectSection = within(
      screen.getByRole("navigation", { name: "전역 내비게이션" }),
    ).getByTestId("nav-projects");
    await waitFor(() => {
      expect(
        within(projectSection).getByRole("button", { name: "ALM 플랫폼 v2" }),
      ).toBeInTheDocument();
    });
  });

  it("위험 구역에서 삭제하면 확인 후 디렉터리로 이동한다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "프로젝트 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "프로젝트 삭제" });
    expect(within(dialog).getByText(/이슈 8\s*개가 함께 삭제됩니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
    // 마지막 프로젝트였으므로 빈 상태
    expect(
      await screen.findByRole("heading", { name: "아직 프로젝트가 없습니다" }),
    ).toBeInTheDocument();
  });
});

describe("프로젝트 사용자·권한", () => {
  it("멤버 목록을 보여주고 역할을 바꾼다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("tab", { name: "사용자·권한" }));

    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    // 시드: 김찬호 관리자 + 나머지 3명 편집자
    expect(within(members).getAllByRole("row")).toHaveLength(5); // 머리글 + 4명

    const row = within(members).getByText("이서연").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "이서연 역할" }));
    await user.click(await screen.findByRole("menuitem", { name: "뷰어" }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("table", { name: "프로젝트 멤버" }))
          .getByText("이서연")
          .closest("tr"),
      ).toHaveTextContent("뷰어");
    });
  });

  it("마지막 관리자를 강등하면 거부하고 사유를 알린다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("tab", { name: "사용자·권한" }));
    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    const row = within(members).getByText("김찬호").closest("tr")!;

    await user.click(within(row).getByRole("button", { name: "김찬호 역할" }));
    await user.click(await screen.findByRole("menuitem", { name: "편집자" }));

    expect(
      await screen.findByText("프로젝트에는 관리자가 최소 한 명 필요합니다"),
    ).toBeInTheDocument();
  });

  it("멤버를 내보내면 목록에서 사라지고 다시 추가할 수 있다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("tab", { name: "사용자·권한" }));
    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    await user.click(within(members).getByRole("button", { name: "최다인 내보내기" }));

    await waitFor(() => {
      expect(within(members).queryByText("최다인")).not.toBeInTheDocument();
    });

    // 디렉터리에서 다시 추가
    await user.click(screen.getByRole("combobox", { name: "추가할 사용자" }));
    await user.click(await screen.findByRole("option", { name: "최다인" }));
    await user.click(screen.getByRole("button", { name: "멤버 추가" }));

    await waitFor(() => {
      expect(within(members).getByText("최다인")).toBeInTheDocument();
    });
  });
});
