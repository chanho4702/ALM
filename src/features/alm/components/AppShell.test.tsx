import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname+search를 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderShell(initialPath: string) {
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

describe("AppShell 전역 만들기", () => {
  it("어느 화면에서든 이슈를 만들고 상세로 이동한다 (디렉터리에서)", async () => {
    const user = userEvent.setup();
    renderShell("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    await user.click(screen.getByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });

    // 프로젝트 기본값: 첫 프로젝트(ALM 플랫폼)
    expect(within(dialog).getByRole("combobox", { name: "프로젝트 *" })).toHaveTextContent(
      "ALM 플랫폼 (ALM)",
    );
    await user.type(within(dialog).getByLabelText("요약 *"), "전역에서 만든 이슈");
    await user.type(within(dialog).getByLabelText("라벨"), "global, shell");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    // 시드 다음 번호(ALM-9)의 상세가 열린 이슈 목록으로 이동
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-9");
    });
    expect(await screen.findByRole("dialog", { name: "ALM-9" })).toBeInTheDocument();
  }, 30_000); // 디렉터리 → 만들기 모달 → 상세 이동 왕복 — 병렬 워커·다른 빌드 부하에서 기본 15s를 넘긴다

  it("프로젝트 내부에서는 현재 프로젝트가 기본값이다", async () => {
    const user = userEvent.setup();
    renderShell("/projects/p1/board");
    await screen.findByRole("navigation", { name: "브레드크럼" });

    await user.click(screen.getByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    expect(within(dialog).getByRole("combobox", { name: "프로젝트 *" })).toHaveTextContent(
      "ALM 플랫폼 (ALM)",
    );
  });
});

describe("AppShell 전역 검색", () => {
  it("검색 인풋 입력 → 결과 모달 → 클릭 시 이슈 상세로 이동한다", async () => {
    const user = userEvent.setup();
    renderShell("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    fireEvent.change(screen.getByLabelText("전역 검색"), { target: { value: "칸반" } });

    const dialog = await screen.findByRole("dialog", { name: "이슈 검색" });
    const results = await within(dialog).findByTestId("search-results");
    expect(within(results).getByText("ALM-2")).toBeInTheDocument();
    expect(within(results).getByText("칸반 보드 UI 구현")).toBeInTheDocument();
    expect(within(results).getByText("ALM 플랫폼")).toBeInTheDocument(); // 프로젝트명 표시

    await user.click(within(results).getByText("칸반 보드 UI 구현"));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-2");
    });
    expect(await screen.findByRole("dialog", { name: "ALM-2" })).toBeInTheDocument();
  });

  it("결과가 없으면 빈 상태를 보여준다", async () => {
    renderShell("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    fireEvent.change(screen.getByLabelText("전역 검색"), { target: { value: "존재하지않는이슈" } });
    const dialog = await screen.findByRole("dialog", { name: "이슈 검색" });
    expect(await within(dialog).findByText("결과가 없습니다")).toBeInTheDocument();
  });
});

describe("AppShell 알림 벨", () => {
  it("미읽음 배지를 보여주고, 알림 클릭 시 해당 이슈 상세로 이동하며 읽음 처리된다", async () => {
    const user = userEvent.setup();
    renderShell("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    // 시드 미읽음 2개
    const bell = await screen.findByRole("button", { name: "알림 2개 미읽음" });
    await user.click(bell);

    const dialog = await screen.findByRole("dialog", { name: "알림" });
    const list = within(dialog).getByTestId("notification-list");
    expect(within(list).getByText(/이서연 님이 ALM-2에 코멘트를 남겼습니다/)).toBeInTheDocument();

    await user.click(within(list).getByText(/ALM-2에 코멘트/));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-2");
    });
    const detail = await screen.findByRole("dialog", { name: "ALM-2" });

    // 상세 모달을 닫으면(배경 aria-hidden 해제) 읽음 처리된 배지가 보인다 → 미읽음 1개
    await user.click(within(detail).getByRole("button", { name: "닫기" }));
    expect(
      await screen.findByRole("button", { name: "알림 1개 미읽음" }),
    ).toBeInTheDocument();
  });

  it("모두 읽음을 누르면 배지가 사라진다", async () => {
    const user = userEvent.setup();
    renderShell("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    await user.click(await screen.findByRole("button", { name: "알림 2개 미읽음" }));
    const dialog = await screen.findByRole("dialog", { name: "알림" });
    await user.click(within(dialog).getByRole("button", { name: "모두 읽음" }));
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    // 모달을 닫으면 미읽음 없는 벨("알림")이 보인다
    expect(await screen.findByRole("button", { name: "알림" })).toBeInTheDocument();
  });
});

describe("전역 만들기 타입 선택지", () => {
  it("하위 작업 타입도 전역 만들기에서 고를 수 있고, 고르면 상위 항목이 필수가 된다", async () => {
    const user = userEvent.setup();
    renderShell("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });

    await user.click(screen.getByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "상위 없는 하위 작업");
    await user.click(within(dialog).getByRole("combobox", { name: "이슈 타입 *" }));
    expect(await screen.findByRole("option", { name: "에픽" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "하위 작업" }));

    expect(within(dialog).getByRole("combobox", { name: "상위 항목 *" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeDisabled();
    await user.click(within(dialog).getByRole("combobox", { name: "상위 항목 *" }));
    await user.click(await screen.findByRole("option", { name: /ALM-1/ }));
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeEnabled();
  }, 30_000); // 만들기 모달 + 타입 전환 + 상위 항목 선택 — 부하에서 15s를 넘긴다
});

describe("사이드바 프로젝트 메뉴", () => {
  it("프로젝트 행의 ⋯ 메뉴로 설정에 들어간다 (뷰 탭에는 설정이 없다)", async () => {
    const user = userEvent.setup();
    renderShell("/projects/p1/board");

    // 프로젝트 뷰 탭에서는 설정을 뺐다 — 진입점은 사이드바 메뉴 하나다
    const viewTabs = await screen.findByRole("navigation", { name: "프로젝트 뷰" });
    expect(within(viewTabs).queryByText("설정")).not.toBeInTheDocument();

    const nav = await screen.findByTestId("nav-projects");
    await user.click(within(nav).getByRole("button", { name: "ALM 플랫폼 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "프로젝트 설정" }));

    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();
    // 설정은 별도 페이지 — 뷰 탭이 사라지고 설정 사이드바가 선다
    expect(screen.queryByRole("navigation", { name: "프로젝트 뷰" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "설정 메뉴" })).toBeInTheDocument();
  });
});
