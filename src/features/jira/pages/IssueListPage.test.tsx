import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createIssue } from "../store/jiraStore";

/** 현재 pathname+search를 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderIssues(initialPath = "/projects/p1/issues") {
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

describe("IssueListPage", () => {
  it("프로젝트 전체 이슈를 테이블로 렌더한다 — 상태·우선순위 Lozenge, 담당자 Avatar+이름", async () => {
    renderIssues();

    expect(await screen.findByText("ALM-1")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(9); // 헤더 1 + 시드 이슈 8

    // ALM-4 행: 할 일 / 보통 / 박준영 (Avatar + 이름)
    const row4 = screen.getByText("ALM-4").closest("tr")!;
    expect(within(row4).getByText("할 일")).toBeInTheDocument();
    expect(within(row4).getByText("보통")).toBeInTheDocument();
    expect(within(row4).getByRole("img", { name: "박준영" })).toBeInTheDocument();
    expect(within(row4).getByText("박준영")).toBeInTheDocument();

    // 미배정 이슈는 "미지정"
    const row7 = screen.getByText("ALM-7").closest("tr")!;
    expect(within(row7).getByText("미지정")).toBeInTheDocument();
  });

  it("텍스트+상태 조합 필터가 목록을 좁힌다 (스펙 §7)", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    // 텍스트 필터: "구현" 포함 = ALM-2·3·4·5·6
    await user.type(screen.getByLabelText("검색"), "구현");
    await waitFor(() => {
      expect(screen.queryByText("ALM-1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("ALM-2")).toBeInTheDocument();

    // 상태 필터 추가: 할 일 → ALM-4·5·6만 남는다
    await user.click(screen.getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "할 일" }));
    await waitFor(() => {
      expect(screen.queryByText("ALM-2")).not.toBeInTheDocument();
    });
    for (const key of ["ALM-4", "ALM-5", "ALM-6"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
    expect(screen.queryByText("ALM-3")).not.toBeInTheDocument();
  });

  it("담당자 필터, 조건이 겹치면 빈 결과 문구를 보여준다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    // 담당자 = 박준영 → ALM-4만
    await user.click(screen.getByRole("combobox", { name: "담당자" }));
    await user.click(await screen.findByRole("option", { name: "박준영" }));
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2); // 헤더 + ALM-4
    });
    expect(screen.getByText("ALM-4")).toBeInTheDocument();

    // 우선순위 = 높음까지 겹치면 결과 없음 (ALM-4는 보통)
    await user.click(screen.getByRole("combobox", { name: "우선순위" }));
    await user.click(await screen.findByRole("option", { name: "높음" }));
    expect(await screen.findByText("조건에 맞는 이슈가 없습니다")).toBeInTheDocument();
  });

  it("행 클릭 → ?issue= 쿼리와 함께 상세 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderIssues();

    await user.click(await screen.findByText("칸반 보드 UI 구현")); // ALM-2

    expect(await screen.findByRole("dialog", { name: "ALM-2" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-2");
  });
});

describe("IssueListPage 확장 (설명 검색·라벨 필터·날짜 정렬)", () => {
  it("검색이 설명 본문도 매치한다", async () => {
    await createIssue({
      projectId: "p1",
      title: "제목에는 검색어 없음",
      description: "결제 모듈 리팩터링 작업",
    });
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    await user.type(screen.getByLabelText("검색"), "결제 모듈");
    await waitFor(() => {
      expect(screen.queryByText("ALM-1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("제목에는 검색어 없음")).toBeInTheDocument();
  });

  it("라벨 필터로 목록을 좁힌다 (시드: backend = ALM-6)", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    await user.click(screen.getByRole("combobox", { name: "라벨" }));
    await user.click(await screen.findByRole("option", { name: "backend" }));

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2); // 헤더 + ALM-6
    });
    expect(screen.getByText("ALM-6")).toBeInTheDocument();
  });

  it("마감일 정렬 시 미지정 이슈는 항상 뒤로 간다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    await user.click(screen.getByRole("button", { name: /마감일/ }));

    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1); // 헤더 제외
      const firstKey = within(rows[0]).getByText(/ALM-\d+/).textContent;
      // 시드에서 마감일이 있는 이슈는 ALM-2, ALM-4뿐
      expect(["ALM-2", "ALM-4"]).toContain(firstKey);
      const lastRow = rows[rows.length - 1];
      expect(within(lastRow).getByText("—")).toBeInTheDocument(); // 미지정은 맨 뒤
    });
  });
});
