import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, completeSprint } from "../store/jiraStore";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderBoard(initialPath = "/projects/p1/board") {
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

describe("BoardPage", () => {
  it("활성 스프린트의 이슈만 상태별 3컬럼으로 렌더한다", async () => {
    renderBoard();

    // 컬럼별 카드 배치 (시드 기준)
    const todo = await screen.findByRole("region", { name: "할 일" });
    expect(within(todo).getByText("ALM-4")).toBeInTheDocument();
    expect(within(todo).getByText("ALM-5")).toBeInTheDocument();

    const inprogress = screen.getByRole("region", { name: "진행 중" });
    expect(within(inprogress).getByText("ALM-2")).toBeInTheDocument();
    expect(within(inprogress).getByText("ALM-3")).toBeInTheDocument();

    const done = screen.getByRole("region", { name: "완료" });
    expect(within(done).getByText("ALM-1")).toBeInTheDocument();

    // 백로그 이슈(sprintId=null)는 보드에 없다
    expect(screen.queryByText("ALM-6")).not.toBeInTheDocument();
    expect(screen.queryByText("ALM-7")).not.toBeInTheDocument();
    expect(screen.queryByText("ALM-8")).not.toBeInTheDocument();

    // 카드 구성: 제목 · 우선순위 Lozenge(한국어 라벨) · 담당자 Avatar
    expect(within(todo).getByText("백로그 화면 구현")).toBeInTheDocument(); // ALM-4 제목
    expect(within(todo).getByText("보통")).toBeInTheDocument(); // ALM-4 medium
    expect(within(todo).getByText("낮음")).toBeInTheDocument(); // ALM-5 low
    expect(within(todo).getByRole("img", { name: "박준영" })).toBeInTheDocument(); // ALM-4 담당자
    expect(within(done).getByText("높음")).toBeInTheDocument(); // ALM-1 high
  });

  it("활성 스프린트가 없으면 백로그로 유도하는 EmptyState를 보여준다", async () => {
    const user = userEvent.setup();
    await completeSprint("s1"); // 시드의 활성 스프린트를 종료시킨다 (첫 호출이 시드도 생성)
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "진행 중인 스프린트가 없습니다" }),
    ).toBeInTheDocument();
    // 컬럼은 렌더되지 않는다
    expect(screen.queryByRole("region", { name: "할 일" })).not.toBeInTheDocument();

    // EmptyState의 주요 액션 버튼을 누르면 백로그로 이동한다
    await user.click(screen.getByRole("button", { name: "백로그로 이동" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/backlog");
    });
  });
});

describe("보드 컬럼 인라인 생성", () => {
  it("'+ 이슈 만들기'로 해당 컬럼(상태)·활성 스프린트에 이슈가 생긴다", async () => {
    const user = userEvent.setup();
    renderBoard();

    const inprogress = await screen.findByRole("region", { name: "진행 중" });
    await user.click(within(inprogress).getByRole("button", { name: "+ 이슈 만들기" }));
    await user.type(
      within(inprogress).getByLabelText("진행 중 컬럼에 이슈 만들기"),
      "인라인 생성 이슈",
    );
    await user.click(within(inprogress).getByRole("button", { name: "만들기" }));

    // 진행 중 컬럼에 새 카드(ALM-9)가 나타난다
    expect(await within(screen.getByTestId("board-column-inprogress")).findByText("ALM-9"))
      .toBeInTheDocument();
    expect(
      within(screen.getByTestId("board-column-inprogress")).getByText("인라인 생성 이슈"),
    ).toBeInTheDocument();
  });
});

describe("보드 퀵 필터바", () => {
  it("담당자 아바타 토글로 해당 담당자 카드만 남는다", async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole("region", { name: "할 일" });

    // 시드 s1: 박준영 담당 = ALM-4 하나
    await user.click(screen.getByRole("button", { name: "담당자 박준영" }));
    await waitFor(() => {
      expect(screen.queryByText("ALM-2")).not.toBeInTheDocument();
    });
    expect(screen.getByText("ALM-4")).toBeInTheDocument();

    // 미지정까지 켜면 ALM-5도 함께
    await user.click(screen.getByRole("button", { name: "담당자 미지정" }));
    expect(await screen.findByText("ALM-5")).toBeInTheDocument();
  });

  it("검색으로 좁히고 초기화로 복원한다", async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole("region", { name: "할 일" });

    await user.type(screen.getByLabelText("보드 검색"), "칸반");
    await waitFor(() => {
      expect(screen.queryByText("ALM-4")).not.toBeInTheDocument();
    });
    expect(screen.getByText("ALM-2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(await screen.findByText("ALM-4")).toBeInTheDocument();
    expect(screen.getByLabelText("보드 검색")).toHaveValue("");
  });
});

describe("보드 컬럼 WIP·설정 모달", () => {
  it("칸반 보드(b2)의 WIP 초과 컬럼이 danger 강조와 카운트를 보여준다", async () => {
    // 시드 b2: kanban·backend 라벨·진행 중 WIP 2 — backend 이슈 3개를 진행 중으로 만든다
    const { createIssue } = await import("../store/jiraStore");
    for (let i = 0; i < 3; i++) {
      await createIssue({
        projectId: "p1",
        title: `백엔드 진행 ${i}`,
        labels: ["backend"],
        status: "inprogress",
      });
    }
    renderBoard("/projects/p1/boards/b2");

    const column = await screen.findByTestId("board-column-inprogress");
    await waitFor(() => {
      expect(column).toHaveClass("is-over-wip");
    });
    expect(within(column).getByText("3/2")).toBeInTheDocument();
    expect(within(column).getByRole("img", { name: "WIP 제한 초과" })).toBeInTheDocument();
  });

  it("보드 설정에서 이름을 바꾸면 툴바에 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/boards/b2");
    await screen.findByText("백엔드 팀", { selector: ".board-name" });

    await user.click(screen.getByRole("button", { name: "보드 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "보드 설정" }));
    const dialog = await screen.findByRole("dialog", { name: "보드 설정" });

    const nameField = within(dialog).getByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "백엔드 파이프라인");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText("백엔드 파이프라인", { selector: ".board-name" }),
    ).toBeInTheDocument();
  });

  it("보드를 삭제하면 기본 보드로 이동한다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/boards/b2");
    await screen.findByText("백엔드 팀", { selector: ".board-name" });

    await user.click(screen.getByRole("button", { name: "보드 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: "보드 설정" }));
    const dialog = await screen.findByRole("dialog", { name: "보드 설정" });
    await user.click(within(dialog).getByRole("button", { name: "보드 삭제" }));

    const confirm = await screen.findByRole("dialog", { name: "보드 삭제" });
    await user.click(within(confirm).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/boards/b1");
    });
  });
});
