import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSettings(initialPath = "/settings") {
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

describe("전역 관리 (/settings)", () => {
  it("상단바 ⚙으로 진입하고, 디폴트 스킴이 배정 수와 함께 보인다", async () => {
    const user = userEvent.setup();
    renderSettings("/home");
    await screen.findByRole("heading", { name: /안녕하세요/ });

    await user.click(screen.getByRole("button", { name: "전역 관리" }));
    expect(await screen.findByRole("heading", { name: "전역 관리" })).toBeInTheDocument();

    const list = screen.getByTestId("scheme-list");
    expect(within(list).getByText("기본 스킴")).toBeInTheDocument();
    expect(within(list).getByText("디폴트")).toBeInTheDocument();
    expect(within(list).getByText("배정 1개 프로젝트")).toBeInTheDocument();
  });

  it("새 스킴 생성 → 목록 추가, 이슈 타입 편집으로 버그를 끄면 반영된다", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "전역 관리" });

    await user.type(screen.getByLabelText("새 스킴 이름"), "개발팀 스킴");
    await user.click(screen.getByRole("button", { name: "스킴 만들기" }));
    const list = screen.getByTestId("scheme-list");
    expect(await within(list).findByText("개발팀 스킴")).toBeInTheDocument();

    // 기본 스킴의 이슈 타입 편집 — 버그 비활성
    await user.click(within(list).getAllByRole("button", { name: "이슈 타입 편집" })[0]);
    const dialog = await screen.findByRole("dialog", { name: /이슈 타입 — 기본 스킴/ });
    await user.click(within(dialog).getByRole("checkbox", { name: "버그" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const card = within(list).getByText("기본 스킴").closest("li")!;
      expect(within(card).queryByText("버그")).not.toBeInTheDocument();
    });
  });

  it("워크플로 스킴 메뉴는 상태 미리보기를 읽기 전용으로 보여준다", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "전역 관리" });

    await user.click(screen.getByRole("button", { name: "워크플로 스킴" }));
    const list = screen.getByTestId("scheme-list");
    expect(within(list).getByText("할 일")).toBeInTheDocument();
    expect(within(list).getByText("진행 중")).toBeInTheDocument();
    expect(within(list).getByText(/다음 라운드/)).toBeInTheDocument();
  });
});

describe("프로젝트 설정 — 스킴/커스텀", () => {
  it("이슈 타입 탭: 스킴 사용 중(읽기 전용) → 커스텀 전환 → 편집 → 스킴 복귀", async () => {
    const user = userEvent.setup();
    renderSettings("/projects/p1/settings");
    await screen.findByRole("tab", { name: "이슈 타입" });

    await user.click(screen.getByRole("tab", { name: "이슈 타입" }));
    const header = await screen.findByTestId("settings-scheme-header");
    expect(within(header).getByText("스킴: 기본 스킴")).toBeInTheDocument();
    expect(screen.getByTestId("types-readonly")).toBeInTheDocument();

    // 커스텀 전환 → 체크박스 편집 가능
    await user.click(within(header).getByRole("switch", { name: "이 프로젝트만 커스텀" }));
    expect(await screen.findByRole("checkbox", { name: "에픽" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "에픽" })); // 에픽 끄기
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("이슈 타입 구성을 저장했습니다")).toBeInTheDocument();

    // 스킴 복귀 → 읽기 전용으로 돌아오고 에픽이 다시 보인다
    await user.click(
      within(screen.getByTestId("settings-scheme-header")).getByRole("switch", {
        name: "이 프로젝트만 커스텀",
      }),
    );
    const readonly = await screen.findByTestId("types-readonly");
    expect(within(readonly).getByText("에픽")).toBeInTheDocument();
  });

  it("워크플로 탭은 현재 상태 구성을 보여준다", async () => {
    const user = userEvent.setup();
    renderSettings("/projects/p1/settings");
    await screen.findByRole("tab", { name: "워크플로" });

    await user.click(screen.getByRole("tab", { name: "워크플로" }));
    expect(await screen.findByText("할 일")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
  });
});
