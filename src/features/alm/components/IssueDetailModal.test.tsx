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

describe("IssueDetailModal 이슈 관계", () => {
  it("차단됨 경고: ALM-2는 미완료 차단자(ALM-3)가 있어 danger Lozenge가 보인다", async () => {
    renderBoard("/projects/p1/board?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    expect(await within(dialog).findByTestId("issue-blocked-lozenge")).toHaveTextContent("차단됨");
  });

  it("에픽(ALM-4)의 하위 이슈 목록에 ALM-2가 보이고, 클릭하면 그 이슈 모달로 전환된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");
    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });

    const childrenSection = await within(dialog).findByTestId("issue-children");
    expect(within(childrenSection).getByText("ALM-2")).toBeInTheDocument();
    expect(within(childrenSection).getByText(/완료 0\/1/)).toBeInTheDocument();

    await user.click(within(childrenSection).getByText("칸반 보드 UI 구현"));
    expect(await screen.findByRole("dialog", { name: "ALM-2" })).toBeInTheDocument();
  });

  it("일반 이슈에서 하위 작업을 인라인 추가하면 목록에 나타난다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });

    await user.type(within(dialog).getByLabelText("하위 작업 추가"), "세부 구현");
    await user.click(within(dialog).getByRole("button", { name: "추가" }));

    const childrenSection = within(dialog).getByTestId("issue-children");
    expect(await within(childrenSection).findByText("세부 구현")).toBeInTheDocument();
    expect(within(childrenSection).getByRole("img", { name: "하위 작업" })).toBeInTheDocument();
  });

  it("링크 섹션: 차단됨 그룹 표시, 링크 추가/제거", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });

    const linksSection = await within(dialog).findByTestId("issue-links");
    expect(within(linksSection).getByText("차단됨")).toBeInTheDocument();
    expect(within(linksSection).getByText("ALM-3")).toBeInTheDocument();

    // 관련 링크 추가: ALM-2 ↔ ALM-5
    await user.click(within(linksSection).getByRole("combobox", { name: "종류" }));
    await user.click(await screen.findByRole("option", { name: "관련" }));
    await user.click(within(linksSection).getByRole("combobox", { name: "대상 이슈" }));
    await user.click(await screen.findByRole("option", { name: /ALM-5/ }));
    await user.click(within(linksSection).getByRole("button", { name: "링크 추가" }));

    expect(
      await within(linksSection).findByText("관련", { selector: ".issue-link-group-title" }),
    ).toBeInTheDocument();
    expect(within(linksSection).getByText("ALM-5")).toBeInTheDocument();

    // 차단 링크 제거 → 차단됨 그룹 사라짐
    await user.click(within(linksSection).getByRole("button", { name: "ALM-3 링크 제거" }));
    await waitFor(() => {
      expect(within(linksSection).queryByText("ALM-3")).not.toBeInTheDocument();
    });
  });

  it("부모 Select로 에픽을 지정할 수 있다 (에픽 모달에는 부모 Select 없음)", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });

    await user.click(within(dialog).getByRole("combobox", { name: "부모" }));
    await user.click(await screen.findByRole("option", { name: /ALM-4/ }));
    expect(await screen.findByText("부모를 변경했습니다")).toBeInTheDocument();
  });
});

describe("IssueDetailModal 해결", () => {
  it("완료 이슈에만 해결 Select가 보이고, 값을 바꾸면 저장된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-1"); // 시드: 완료, 해결 = 완료됨

    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });
    const select = within(dialog).getByRole("combobox", { name: "해결" });
    expect(select).toHaveTextContent("완료됨");

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "하지 않음" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("combobox", { name: "해결" })).toHaveTextContent("하지 않음");
    });
  });

  it("완료가 아닌 이슈에는 해결 Select가 없고, 완료로 바꾸면 '완료됨'으로 나타난다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-5"); // 시드: 할 일

    const dialog = await screen.findByRole("dialog", { name: "ALM-5" });
    expect(within(dialog).queryByRole("combobox", { name: "해결" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));

    expect(await within(dialog).findByRole("combobox", { name: "해결" })).toHaveTextContent("완료됨");
  });
});

describe("IssueDetailModal 워크로그", () => {
  it("시드(ALM-2): 진행률 '기록 5h / 예상 8h', 워크로그 탭에 2건", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });

    const tracking = await within(dialog).findByTestId("issue-time-tracking");
    expect(tracking).toHaveTextContent("기록 5h / 예상 8h");

    await user.click(within(dialog).getByRole("tab", { name: "워크로그 (2)" }));
    const worklogs = within(dialog).getByTestId("issue-worklogs");
    expect(within(worklogs).getByText("컬럼 드래그 구현")).toBeInTheDocument();
    // 본인(u1) 것만 삭제 버튼
    expect(within(worklogs).getAllByRole("button", { name: "워크로그 삭제" })).toHaveLength(1);
  });

  it("작업 시간을 기록하면 목록·탭 카운트·진행률이 갱신되고, 예상 초과 시 danger", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });

    await user.click(await within(dialog).findByRole("tab", { name: "워크로그 (2)" }));
    const worklogs = within(dialog).getByTestId("issue-worklogs");
    await user.type(within(worklogs).getByLabelText("시간 (h)"), "4");
    await user.type(within(worklogs).getByLabelText("메모"), "마무리 작업");
    await user.click(within(worklogs).getByRole("button", { name: "기록" }));

    expect(await within(dialog).findByRole("tab", { name: "워크로그 (3)" })).toBeInTheDocument();
    // 5+4=9h > 예상 8h → 초과 표시
    const tracking = within(dialog).getByTestId("issue-time-tracking");
    expect(tracking).toHaveTextContent("기록 9h / 예상 8h");
    expect(tracking.querySelector(".issue-time-label")).toHaveClass("is-over");
  });

  it("예상 시간을 바꾸면 저장된다 (blur)", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-1"); // 예상 없음
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });

    const estimate = within(dialog).getByLabelText("예상 시간 (h)");
    await user.type(estimate, "6");
    await user.tab(); // blur → 저장
    expect(await screen.findByText("예상 시간을 저장했습니다")).toBeInTheDocument();
  });
});
