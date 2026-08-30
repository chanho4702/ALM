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

  it("워크플로 스킴: 상태 편집으로 새 상태를 추가하면 미리보기에 반영된다", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "전역 관리" });

    await user.click(screen.getByRole("button", { name: "워크플로 스킴" }));
    const list = screen.getByTestId("scheme-list");
    expect(within(list).getByText("할 일")).toBeInTheDocument();
    expect(within(list).getByText("진행 중")).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "기본 스킴 워크플로 편집" }));
    const dialog = await screen.findByRole("dialog", { name: /워크플로 상태 — 기본 스킴/ });
    await user.type(within(dialog).getByLabelText("새 상태 이름"), "리뷰");
    await user.click(within(dialog).getByRole("button", { name: "상태 추가" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("워크플로 상태를 저장했습니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(screen.getByTestId("scheme-list")).getByText("리뷰")).toBeInTheDocument();
    });
  });

  it("상태 편집기: 마지막 남은 카테고리 상태는 삭제 버튼이 비활성화된다", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "전역 관리" });

    await user.click(screen.getByRole("button", { name: "워크플로 스킴" }));
    await user.click(
      within(screen.getByTestId("scheme-list")).getByRole("button", { name: "기본 스킴 워크플로 편집" }),
    );
    const dialog = await screen.findByRole("dialog", { name: /워크플로 상태 — 기본 스킴/ });
    // 기본 3상태는 각자 카테고리의 유일한 상태 — 전부 삭제 불가
    expect(within(dialog).getByRole("button", { name: "할 일 삭제" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "진행 중 삭제" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "완료 삭제" })).toBeDisabled();
  });
});

describe("스킴 워크플로 전이", () => {
  it("스킴 편집 모달에서 전이를 추가해 저장한다 (프로젝트를 커스텀으로 돌리지 않고)", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("heading", { name: "전역 관리" });
    await user.click(screen.getByRole("button", { name: "워크플로 스킴" }));

    await user.click(await screen.findByRole("button", { name: "기본 스킴 워크플로 편집" }));
    const dialog = await screen.findByRole("dialog", { name: /워크플로 상태 — 기본 스킴/ });

    await user.click(within(dialog).getByRole("combobox", { name: "출발 상태" }));
    await user.click(await screen.findByRole("option", { name: "할 일" }));
    await user.click(within(dialog).getByRole("combobox", { name: "도착 상태" }));
    await user.click(await screen.findByRole("option", { name: "진행 중" }));
    await user.click(within(dialog).getByRole("button", { name: "전이 추가" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("워크플로 상태를 저장했습니다")).toBeInTheDocument();

    // 다시 열면 저장된 전이가 남아 있다
    await user.click(screen.getByRole("button", { name: "기본 스킴 워크플로 편집" }));
    const reopened = await screen.findByRole("list", { name: "전이 목록" });
    expect(within(reopened).queryByText(/전이를 정하지 않으면/)).not.toBeInTheDocument();
  });
});

describe("프로젝트 설정 — 스킴/커스텀", () => {
  it("이슈 타입 탭: 스킴 사용 중(읽기 전용) → 커스텀 전환 → 편집 → 스킴 복귀", async () => {
    const user = userEvent.setup();
    renderSettings("/projects/p1/settings");
    const menu = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await user.click(within(menu).getByRole("button", { name: "이슈 타입" }));
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

  it("워크플로 탭: 스킴은 읽기 전용, 커스텀 전환하면 상태 편집기로 추가/저장", async () => {
    const user = userEvent.setup();
    renderSettings("/projects/p1/settings");
    const menu = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await user.click(within(menu).getByRole("button", { name: "워크플로" }));
    const readonly = await screen.findByTestId("statuses-readonly");
    expect(within(readonly).getByText("할 일")).toBeInTheDocument();
    expect(within(readonly).getByText("진행 중")).toBeInTheDocument();
    expect(within(readonly).getByText("완료")).toBeInTheDocument();

    // 커스텀 전환 → 편집기 등장 → 코드 리뷰 추가 → 저장
    await user.click(
      within(screen.getByTestId("settings-scheme-header")).getByRole("switch", {
        name: "이 프로젝트만 커스텀",
      }),
    );
    expect(await screen.findByTestId("status-editor")).toBeInTheDocument();
    await user.type(screen.getByLabelText("새 상태 이름"), "코드 리뷰");
    await user.click(screen.getByRole("button", { name: "상태 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("워크플로를 저장했습니다")).toBeInTheDocument();

    // 저장 후 재조회된 편집기에 새 상태가 남아 있다
    expect(await screen.findByDisplayValue("코드 리뷰")).toBeInTheDocument();
  });
});
