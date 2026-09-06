import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

function renderSearch(initialPath = "/search") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function globalNav() {
  return screen.getByRole("navigation", { name: "전역 내비게이션" });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("SearchPage 기본 검색 (지라 Basic)", () => {
  it("담당자 필터 드롭다운 토글이 결과와 URL(q)을 좁힌다", async () => {
    const user = userEvent.setup();
    renderSearch();

    // 초기: 전체 8개
    expect(await screen.findByTestId("search-count")).toHaveTextContent("8개 이슈");

    await user.click(screen.getByRole("button", { name: "담당자" }));
    await user.click(await screen.findByRole("checkbox", { name: "김찬호" }));
    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("2개 이슈"); // ALM-1, ALM-3
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=");
    // 트리거가 선택 요약을 보여준다 (지라식)
    expect(screen.getByRole("button", { name: "담당자: 김찬호" })).toBeInTheDocument();
    expect(screen.getByText("ALM-1")).toBeInTheDocument();
    expect(screen.queryByText("ALM-4")).not.toBeInTheDocument();
  });

  it("상태·타입·우선순위 필터 항목은 값 글리프를 함께 그린다", async () => {
    const user = userEvent.setup();
    renderSearch();
    await screen.findByTestId("search-count");

    // 결과 표에도 같은 글리프가 있으므로 열린 필터 패널로 범위를 좁힌다
    await user.click(screen.getByRole("button", { name: "상태" }));
    const statusPanel = await screen.findByRole("group", { name: "상태 필터" });
    expect(within(statusPanel).getByRole("checkbox", { name: "할 일" })).toBeInTheDocument();
    expect(within(statusPanel).getByTestId("status-glyph-todo")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "타입" }));
    const typePanel = await screen.findByRole("group", { name: "타입 필터" });
    expect(within(typePanel).getByRole("checkbox", { name: "버그" })).toBeInTheDocument();
    expect(within(typePanel).getByTestId("type-glyph-bug")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "우선순위" }));
    const priorityPanel = await screen.findByRole("group", { name: "우선순위 필터" });
    expect(within(priorityPanel).getByRole("checkbox", { name: "높음" })).toBeInTheDocument();
    expect(within(priorityPanel).getByTestId("priority-glyph-high")).toBeInTheDocument();
  });

  it("검색어+필터 조합 후 필터 초기화로 복원한다 (검색어는 유지)", async () => {
    const user = userEvent.setup();
    renderSearch();
    await screen.findByTestId("search-count");

    await user.type(screen.getByLabelText("검색어"), "구현");
    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("5개 이슈"); // ALM-2·3·4·5·6
    });
    await user.click(screen.getByRole("button", { name: "담당자" }));
    await user.click(await screen.findByRole("checkbox", { name: "김찬호" }));
    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("1개 이슈"); // ALM-3
    });

    await user.click(screen.getByRole("button", { name: "필터 초기화" }));
    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("5개 이슈");
    });
    expect(screen.queryByRole("button", { name: "필터 초기화" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("검색어")).toHaveValue("구현");
  });
});

describe("SearchPage 스마트 검색", () => {
  it("스마트 토큰 입력이 URL(q)과 결과를 좁히고 조건 칩으로 나타난다", async () => {
    const user = userEvent.setup();
    renderSearch();
    await screen.findByTestId("search-count");

    await user.click(screen.getByRole("button", { name: "스마트 구문으로 전환" }));
    await user.type(screen.getByLabelText("스마트 검색"), "상태:진행중");
    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("2개 이슈"); // ALM-2, ALM-3
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=");
    expect(within(screen.getByTestId("search-chips")).getByText("상태:진행중")).toBeInTheDocument();
    expect(screen.getByText("ALM-2")).toBeInTheDocument();
    expect(screen.queryByText("ALM-4")).not.toBeInTheDocument();
  });

  it("조건 칩 ×로 제거하면 검색어에서 그 토큰만 빠진다", async () => {
    const user = userEvent.setup();
    renderSearch("/search?q=" + encodeURIComponent("상태:진행중 라벨:frontend 보드"));
    await screen.findByTestId("search-count");

    await user.click(screen.getByRole("button", { name: "스마트 구문으로 전환" }));
    await user.click(screen.getByRole("button", { name: "상태:진행중 태그 제거" }));
    await waitFor(() => {
      expect(screen.getByLabelText("스마트 검색")).toHaveValue("라벨:frontend 보드");
    });
  });

  it("결과 행 클릭 → 이슈 상세 모달 (q 파라미터 보존)", async () => {
    const user = userEvent.setup();
    renderSearch("/search?q=" + encodeURIComponent("타입:버그"));
    await screen.findByText("ALM-8");

    await user.click(screen.getByText("다크 테마 점검"));
    expect(await screen.findByRole("dialog", { name: "ALM-8" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("issue=ALM-8");
    expect(screen.getByTestId("location").textContent).toContain("q=");
  });
});

describe("저장 필터", () => {
  it("필터로 저장하면 사이드바 필터 섹션에 나타나고 클릭으로 적용, ×로 삭제된다", async () => {
    const user = userEvent.setup();
    renderSearch("/search?q=" + encodeURIComponent("타입:버그"));
    await screen.findByText("ALM-8");

    await user.click(screen.getByRole("button", { name: "필터로 저장" }));
    const dialog = await screen.findByRole("dialog", { name: "필터로 저장" });
    await user.type(within(dialog).getByLabelText("필터 이름"), "버그 모음");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    const filters = await within(globalNav()).findByTestId("nav-filters");
    expect(within(filters).getByRole("button", { name: "버그 모음" })).toBeInTheDocument();

    // 홈으로 갔다가 필터 클릭 → 같은 검색으로 복귀
    await user.click(within(globalNav()).getByRole("button", { name: "홈" }));
    await user.click(within(globalNav()).getByRole("button", { name: "버그 모음" }));
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("/search?q=");
    });
    expect(await screen.findByText("ALM-8")).toBeInTheDocument();

    // 삭제
    await user.click(within(globalNav()).getByRole("button", { name: "필터 버그 모음 삭제" }));
    await waitFor(() => {
      expect(within(globalNav()).queryByTestId("nav-filters")).not.toBeInTheDocument();
    });
  });
});

describe("전역 검색 모달 → 고급 검색", () => {
  it("모달의 '고급 검색으로'가 입력어를 들고 /search로 이동한다", async () => {
    const user = userEvent.setup();
    renderSearch("/home");
    await screen.findByRole("heading", { name: /안녕하세요/ });

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("전역 검색"), { target: { value: "칸반" } });
    const dialog = await screen.findByRole("dialog", { name: "이슈 검색" });
    await user.click(within(dialog).getByRole("button", { name: /고급 검색으로/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("/search?q=");
    });
    expect(screen.getByLabelText("검색어")).toHaveValue("칸반"); // 기본 모드 검색어로 이어받는다
  });
});
