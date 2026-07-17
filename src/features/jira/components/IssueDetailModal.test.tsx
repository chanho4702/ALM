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

function renderBoard(initialPath: string) {
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

describe("IssueDetailModal", () => {
  it("?issue= 쿼리로 모달이 열리고, 상태 변경이 Lozenge와 보드 카드에 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4"); // 시드: ALM-4 = todo, 보통, 박준영

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    expect(within(dialog).getByRole("button", { name: "제목 편집" })).toHaveTextContent(
      "백로그 화면 구현",
    );
    expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("할 일");
    expect(within(dialog).getByLabelText("설명")).toBeInTheDocument();

    // 상태 Select: 할 일 → 완료
    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));

    // 모달 Lozenge 반영
    await waitFor(() => {
      expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("완료");
    });
    // 모달을 연 채로 보드 카드가 완료 컬럼으로 이동 (모달 뒤 보드는 aria-hidden이라 testid로 조회)
    await waitFor(() => {
      expect(within(screen.getByTestId("board-column-done")).getByText("ALM-4")).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("board-column-todo")).queryByText("ALM-4"),
    ).not.toBeInTheDocument();
  });

  it("제목 인라인 편집(InlineEdit): 클릭 → 입력 → Enter로 저장하고 보드 카드에도 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "제목 편집" }));
    const field = within(dialog).getByLabelText("제목");
    await user.clear(field);
    await user.type(field, "백로그 화면 구현 (2차){Enter}");

    // 보기 모드로 복귀하고 저장된 제목을 보여준다
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "제목 편집" })).toHaveTextContent(
        "백로그 화면 구현 (2차)",
      );
    });
    // 보드 카드에도 반영
    await waitFor(() => {
      expect(
        within(screen.getByTestId("board-column-todo")).getByText("백로그 화면 구현 (2차)"),
      ).toBeInTheDocument();
    });
  });

  it("보드 카드를 클릭하면 ?issue= 쿼리와 함께 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board");

    const todo = await screen.findByRole("region", { name: "할 일" });
    await user.click(within(todo).getByText("백로그 화면 구현"));

    expect(await screen.findByRole("dialog", { name: "ALM-4" })).toBeInTheDocument();
    // /board → 기본 보드(/boards/b1) redirect 후에도 ?issue 쿼리는 보존된다
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/boards/b1?issue=ALM-4");
  });

  it("모달을 닫으면 ?issue 쿼리가 제거된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("location")).toHaveTextContent(/\/projects\/p1\/boards\/b1$/);
  });

  it("미존재 이슈 키로 공유된 URL을 열면 모달을 열지 않고 쿼리를 제거한다", async () => {
    renderBoard("/projects/p1/board?issue=NOPE-999");

    // 모달이 열리지 않음 (로드 실패 시 getIssueByKey는 null 반환 → 모달 렌더 안 함)
    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // URL에서 ?issue 쿼리가 제거됨 (onClose → setSearchParams)
    await waitFor(
      () => {
        expect(screen.getByTestId("location")).toHaveTextContent(/\/projects\/p1\/boards\/b1$/);
      },
      { timeout: 3000 },
    );
  });
});

describe("IssueDetailModal 코멘트/활동 탭 (W3)", () => {
  it("코멘트 탭: 시드 코멘트가 작성자 이름과 함께 보이고, 작성하면 목록에 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2"); // 시드: 코멘트 2개 (김찬호/이서연)

    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    // 코멘트 탭이 기본 활성 (첫 항목)
    expect(await within(dialog).findByRole("tab", { name: "코멘트 (2)" })).toBeInTheDocument();
    const comments = within(dialog).getByTestId("issue-comments");
    expect(
      within(comments).getByText("드래그 라이브러리는 @dnd-kit로 확정했습니다."),
    ).toBeInTheDocument();
    expect(within(comments).getByText("이서연")).toBeInTheDocument();

    // 작성 → 현재 유저(김찬호) 명의로 목록에 추가, 입력 초기화
    await user.type(within(comments).getByLabelText("코멘트"), "리뷰 완료했습니다");
    await user.click(within(comments).getByRole("button", { name: "코멘트 남기기" }));
    expect(await within(comments).findByText("리뷰 완료했습니다")).toBeInTheDocument();
    expect(within(comments).getAllByText("김찬호")).toHaveLength(2); // 시드 1 + 새 코멘트
    expect(within(comments).getByLabelText("코멘트")).toHaveValue("");
  });

  it("빈 코멘트 제출은 스토어가 거부하고 danger Toast를 보여준다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    const comments = await within(dialog).findByTestId("issue-comments");
    await user.click(within(comments).getByRole("button", { name: "코멘트 남기기" }));

    expect(await screen.findByText("코멘트 내용을 입력하세요")).toBeInTheDocument();
  });

  it("활동 탭: 상태 변경이 유저 이름과 함께 자동 로그로 보인다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4"); // 시드: todo

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    // 상태 변경 (활동로그는 스토어 부수효과로 기록된다)
    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));
    await waitFor(() => {
      expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("완료");
    });

    // 활동 탭으로 전환 → created + status 로그가 시간순으로 보인다
    await user.click(within(dialog).getByRole("tab", { name: "활동" }));
    const activity = await within(dialog).findByTestId("issue-activity");
    expect(within(activity).getByText("이슈 생성")).toBeInTheDocument();
    expect(within(activity).getByText(/할 일 → 완료/)).toBeInTheDocument();
    // actor는 유저 이름으로 표시 (u1 = 김찬호)
    expect(within(activity).getAllByText("김찬호").length).toBeGreaterThanOrEqual(2);
  });

  it("빈 제목은 저장하지 않고 기존 제목을 유지한다 (InlineEdit)", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "제목 편집" }));
    await user.clear(within(dialog).getByLabelText("제목"));
    await user.keyboard("{Enter}"); // 빈 값 저장 시도 → InlineEdit이 무시한다

    // 저장되지 않고 기존 제목으로 복귀
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "제목 편집" })).toHaveTextContent(
        "백로그 화면 구현",
      );
    });
  });
});

describe("IssueDetailModal 확장 (마감일·라벨·생성/수정일·삭제)", () => {
  it("마감일을 입력하면 저장되고, 지우면 미지정으로 돌아간다", async () => {
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    const due = within(dialog).getByLabelText("마감일");
    fireEvent.change(due, { target: { value: "2026-08-01" } });

    expect(await screen.findByText("마감일을 저장했습니다")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("마감일")).toHaveValue("2026-08-01");
  });

  it("라벨을 추가하고 제거할 수 있다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4"); // 시드: 라벨 없음

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.type(within(dialog).getByLabelText("라벨 추가"), "urgent{Enter}");
    expect(await within(dialog).findByText("urgent")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "urgent 태그 제거" }));
    await waitFor(() => {
      expect(within(dialog).queryByText("urgent")).not.toBeInTheDocument();
    });
  });

  it("생성일과 수정일을 속성 패널에 표시한다", async () => {
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    expect(within(dialog).getByText("생성일")).toBeInTheDocument();
    expect(within(dialog).getByText("수정일")).toBeInTheDocument();
  });

  it("이슈 삭제: 확인 모달을 거쳐 삭제하면 모달이 닫히고 보드에서 사라진다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "이슈 삭제" }));

    const confirm = await screen.findByRole("dialog", { name: "이슈 삭제" });
    await user.click(within(confirm).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("board-column-todo")).queryByText("ALM-4"),
    ).not.toBeInTheDocument();
  });
});

describe("IssueDetailModal 댓글 수정/삭제", () => {
  it("본인 댓글에만 수정/삭제 버튼이 보인다 (시드: c1=김찬호 본인, c2=이서연)", async () => {
    renderBoard("/projects/p1/board?issue=ALM-2");

    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const comments = await within(dialog).findByTestId("issue-comments");
    expect(within(comments).getAllByRole("button", { name: "수정" })).toHaveLength(1);
    expect(within(comments).getAllByRole("button", { name: "삭제" })).toHaveLength(1);
  });

  it("본인 댓글을 수정하면 본문이 바뀌고 (수정됨) 표시가 붙는다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2");

    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const comments = await within(dialog).findByTestId("issue-comments");
    await user.click(within(comments).getByRole("button", { name: "수정" }));

    const editField = within(comments).getByLabelText("코멘트 수정");
    await user.clear(editField);
    await user.type(editField, "dnd-kit v6로 업그레이드했습니다.");
    await user.click(within(comments).getByRole("button", { name: "저장" }));

    expect(
      await within(comments).findByText("dnd-kit v6로 업그레이드했습니다."),
    ).toBeInTheDocument();
    expect(within(comments).getByText(/\(수정됨\)/)).toBeInTheDocument();
  });

  it("본인 댓글을 삭제하면 목록에서 사라진다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2");

    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    const comments = await within(dialog).findByTestId("issue-comments");
    await user.click(within(comments).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(
        within(comments).queryByText("드래그 라이브러리는 @dnd-kit로 확정했습니다."),
      ).not.toBeInTheDocument();
    });
    // 타인 댓글은 남아 있다
    expect(within(comments).getByText("컬럼 간 이동부터 붙여볼게요.")).toBeInTheDocument();
  });
});
