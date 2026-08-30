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
    await user.type(screen.getByPlaceholderText("제목·설명·키 검색"), "구현");
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

    await user.type(screen.getByPlaceholderText("제목·설명·키 검색"), "결제 모듈");
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

describe("IssueListPage 타입", () => {
  it("타입 글리프 컬럼이 보이고 타입 필터로 좁힐 수 있다 (시드: 버그 = ALM-8)", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    await user.click(screen.getByRole("combobox", { name: "타입" }));
    await user.click(await screen.findByRole("option", { name: "버그" }));

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2); // 헤더 + ALM-8
    });
    const row = screen.getByText("ALM-8").closest("tr")!;
    expect(within(row).getByRole("img", { name: "버그" })).toBeInTheDocument();
  });
});

describe("IssueListPage 대량 변경", () => {
  it("체크박스로 고른 이슈를 한 번에 바꾸고, 선택 삭제도 된다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    await user.click(screen.getByRole("checkbox", { name: "ALM-4 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "ALM-3 선택" }));
    const bar = screen.getByRole("toolbar", { name: "대량 작업" });
    expect(bar).toHaveTextContent("2개 선택");

    await user.click(within(bar).getByRole("button", { name: "대량 변경" }));
    const dialog = await screen.findByRole("dialog", { name: "대량 변경" });
    expect(dialog).toHaveTextContent("2개 이슈");
    await user.click(within(dialog).getByRole("combobox", { name: "우선순위" }));
    await user.click(await screen.findByRole("option", { name: "높음" }));
    await user.click(within(dialog).getByRole("button", { name: "적용" }));
    expect(await screen.findByText("2개 이슈를 변경했습니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(screen.getByText("ALM-3").closest("tr")!).getByText("높음")).toBeInTheDocument();
    });

    // 선택 삭제 — 확인 뒤 목록에서 사라진다
    await user.click(screen.getByRole("checkbox", { name: "ALM-7 선택" }));
    await user.click(within(screen.getByRole("toolbar", { name: "대량 작업" })).getByRole("button", { name: "삭제" }));
    const confirm = await screen.findByRole("dialog", { name: "이슈 삭제" });
    await user.click(within(confirm).getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("1개 이슈를 삭제했습니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("ALM-7")).not.toBeInTheDocument();
    });
  });
});

describe("IssueListPage CSV", () => {
  it("CSV 파일을 고르면 미리보기·건너뛸 행을 보여주고, 가져오면 목록에 나타난다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    await user.click(screen.getByRole("button", { name: "CSV 가져오기" }));
    const dialog = await screen.findByRole("dialog", { name: "CSV 가져오기" });
    const csv = [
      "Issue key,Summary,Issue Type,Status,Priority,Assignee,Labels",
      "ALM-30,이관된 버그,Bug,Done,High,박준영,legacy",
      ",모르는 상태는 건너뛴다,Task,Unknown,Low,,",
    ].join("\n");
    await user.upload(
      within(dialog).getByLabelText("CSV 파일"),
      new File([csv], "jira.csv", { type: "text/csv" }),
    );
    expect(await within(dialog).findByText(/읽을 수 있는 행 1개, 건너뛸 행 1개/)).toBeInTheDocument();
    expect(within(dialog).getByRole("list", { name: "건너뛰는 행" })).toHaveTextContent("3행: 모르는 상태입니다: Unknown");

    await user.click(within(dialog).getByRole("button", { name: "가져오기" }));
    expect(await screen.findByText("1개 이슈를 가져왔습니다")).toBeInTheDocument();
    const row = (await screen.findByText("ALM-30")).closest("tr")!;
    expect(within(row).getByText("이관된 버그")).toBeInTheDocument();
    expect(within(row).getByText("완료")).toBeInTheDocument();
  });
});
