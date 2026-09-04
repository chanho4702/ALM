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

function renderBacklog(initialPath = "/projects/p1/backlog") {
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

describe("BacklogPage", () => {
  it("계획 저장이 거부되면 모달이 열린 채 입력이 남는다", async () => {
    renderBacklog();
    const user = userEvent.setup();

    const panel = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(panel).getByRole("button", { name: "Sprint 1 계획 수정" }));
    await user.clear(await screen.findByLabelText("시작 예정일"));
    await user.type(screen.getByLabelText("시작 예정일"), "2026-09-12");
    await user.clear(screen.getByLabelText("종료 예정일"));
    await user.type(screen.getByLabelText("종료 예정일"), "2026-09-01");
    await user.click(screen.getByRole("button", { name: "저장" }));

    // 기간 역전은 스토어가 거부 → danger Toast, 모달은 닫히지 않고 초안도 유지
    expect(
      await screen.findByText("시작 예정일은 종료 예정일보다 늦을 수 없습니다"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("시작 예정일")).toHaveValue("2026-09-12");
    expect(screen.getByLabelText("종료 예정일")).toHaveValue("2026-09-01");
  });

  it("스프린트·백로그 머리글에 예상 시간 합계와 미입력 건수를 보여준다", async () => {
    renderBacklog();

    // 시드 Sprint 1: 이슈 5건 중 ALM-2만 예상 8h
    const panel = await screen.findByRole("region", { name: "Sprint 1" });
    expect(within(panel).getByText("예상 8h")).toBeInTheDocument();
    expect(within(panel).getByText("미입력 4건")).toBeInTheDocument();

    // 백로그 3건은 전부 예상 미입력
    const backlog = screen.getByRole("region", { name: "백로그 목록" });
    expect(within(backlog).getByText("예상 0h")).toBeInTheDocument();
    expect(within(backlog).getByText("미입력 3건")).toBeInTheDocument();
  });

  it("이슈를 스프린트로 옮기면 합계가 갱신된다", async () => {
    renderBacklog();
    const user = userEvent.setup();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.click(within(backlog).getByRole("button", { name: "ALM-6 액션" }));
    await user.click(await screen.findByText("Sprint 1로 이동"));

    await waitFor(() => {
      const panel = screen.getByRole("region", { name: "Sprint 1" });
      expect(within(panel).getByText("미입력 5건")).toBeInTheDocument();
    });
  });

  it("스프린트 목표와 예정 기간을 편집하면 머리글에 표시된다", async () => {
    renderBacklog();
    const user = userEvent.setup();

    const panel = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(panel).getByRole("button", { name: "Sprint 1 계획 수정" }));

    // 시드 스프린트는 목표·기간을 이미 갖고 있다 — 비우고 새로 넣는다
    const goal = await screen.findByLabelText("스프린트 목표");
    await user.clear(goal);
    await user.type(goal, "결제 실패율 절반으로");
    await user.clear(screen.getByLabelText("시작 예정일"));
    await user.type(screen.getByLabelText("시작 예정일"), "2026-09-01");
    await user.clear(screen.getByLabelText("종료 예정일"));
    await user.type(screen.getByLabelText("종료 예정일"), "2026-09-12");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const header = screen.getByRole("region", { name: "Sprint 1" });
      expect(within(header).getByText("결제 실패율 절반으로")).toBeInTheDocument();
      expect(within(header).getByText("9월 1일 – 9월 12일")).toBeInTheDocument();
    });
  });

  it("활성 스프린트 패널과 백로그 목록을 렌더한다", async () => {
    renderBacklog();

    // 활성 스프린트 패널: s1 이슈 5개 + 완료 버튼
    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    for (const key of ["ALM-1", "ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      expect(within(sprint).getByText(key)).toBeInTheDocument();
    }
    expect(within(sprint).getByRole("button", { name: "스프린트 완료" })).toBeInTheDocument();

    // 백로그 목록: sprintId=null 이슈 3개 (시드: ALM-6 담당 최다인)
    const backlog = screen.getByRole("region", { name: "백로그 목록" });
    for (const key of ["ALM-6", "ALM-7", "ALM-8"]) {
      expect(within(backlog).getByText(key)).toBeInTheDocument();
    }
    expect(within(backlog).getByRole("img", { name: "최다인" })).toBeInTheDocument();

    // planned 스프린트가 없으므로 시작 버튼도 없다
    expect(screen.queryByRole("button", { name: "스프린트 시작" })).not.toBeInTheDocument();
  });

  it("인라인 생성: 제목 입력 → 만들기 → 백로그 목록에 새 이슈가 나타난다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    // 인라인 생성은 접혀 있다 — ghost 버튼으로 필드를 연다 (보드 컬럼과 같은 패턴)
    await user.click(within(backlog).getByRole("button", { name: "이슈 만들기" }));
    await user.type(within(backlog).getByLabelText("새 이슈 제목"), "성능 개선 조사");
    await user.click(within(backlog).getByRole("button", { name: "만들기" }));

    // 시드 카운터가 8이므로 다음 키는 ALM-9, 백로그(sprintId=null)로 생성된다
    expect(await within(backlog).findByText("ALM-9")).toBeInTheDocument();
    expect(within(backlog).getByText("성능 개선 조사")).toBeInTheDocument();
    // 성공하면 인라인 폼이 닫히고(보드 컬럼과 같은 패턴) 다시 여는 버튼이 남는다
    expect(within(backlog).queryByLabelText("새 이슈 제목")).not.toBeInTheDocument();
    expect(within(backlog).getByRole("button", { name: "이슈 만들기" })).toBeInTheDocument();
  });

  it("인라인 생성은 Esc로 닫히고 입력이 남지 않는다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.click(within(backlog).getByRole("button", { name: "이슈 만들기" }));
    await user.type(within(backlog).getByLabelText("새 이슈 제목"), "잠깐 쓴 제목");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(within(backlog).queryByLabelText("새 이슈 제목")).not.toBeInTheDocument();
    });
    // 다시 열면 이전 초안이 남아 있지 않다
    await user.click(within(backlog).getByRole("button", { name: "이슈 만들기" }));
    expect(within(backlog).getByLabelText("새 이슈 제목")).toHaveValue("");
  });

  it("스프린트 만들기 → planned 패널이 생기고, 활성 스프린트가 있으면 시작이 거부된다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    await user.click(await screen.findByRole("button", { name: "스프린트 만들기" }));
    const planned = await screen.findByRole("region", { name: "Sprint 2" });
    await user.click(within(planned).getByRole("button", { name: "스프린트 시작" }));

    // 도메인 규칙(스펙 §3): 활성 스프린트는 프로젝트당 1개 → 스토어 throw → danger Toast
    expect(await screen.findByText("이미 진행 중인 스프린트가 있습니다")).toBeInTheDocument();
  });

  it("스프린트 완료: 확인 모달에서 백로그를 고르면 미완료 이슈가 백로그로 돌아온다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(sprint).getByRole("button", { name: "스프린트 완료" }));

    // 모달이 미완료 4건을 먼저 보여준다 (침묵 처리 금지)
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("미완료 이슈 4건");
    await user.click(within(dialog).getByRole("button", { name: "완료 처리" }));

    // done 스프린트 패널은 렌더하지 않는다
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Sprint 1" })).not.toBeInTheDocument();
    });
    const backlog = screen.getByRole("region", { name: "백로그 목록" });
    for (const key of ["ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      expect(within(backlog).getByText(key)).toBeInTheDocument();
    }
    // ALM-1(done)은 완료된 스프린트에 남아 화면에서 사라진다
    expect(screen.queryByText("ALM-1")).not.toBeInTheDocument();
  });

  it("스프린트 완료: 다음 스프린트를 고르면 미완료 이슈가 그 스프린트로 넘어간다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    // 이관 대상이 되도록 계획 스프린트를 하나 만든다
    await user.click(await screen.findByRole("button", { name: "스프린트 만들기" }));
    await screen.findByRole("region", { name: "Sprint 2" });

    const sprint = screen.getByRole("region", { name: "Sprint 1" });
    await user.click(within(sprint).getByRole("button", { name: "스프린트 완료" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "Sprint 2" }));
    await user.click(within(dialog).getByRole("button", { name: "완료 처리" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Sprint 1" })).not.toBeInTheDocument();
    });
    const next = screen.getByRole("region", { name: "Sprint 2" });
    for (const key of ["ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      expect(within(next).getByText(key)).toBeInTheDocument();
    }
  });

  it("Dropdown 액션: 스프린트로 이동과 삭제(확인 없이 Toast)", async () => {
    const user = userEvent.setup();
    renderBacklog();

    // ALM-6 → Sprint 1로 이동
    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.click(within(backlog).getByRole("button", { name: "ALM-6 액션" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sprint 1로 이동" }));
    const sprint = screen.getByRole("region", { name: "Sprint 1" });
    expect(await within(sprint).findByText("ALM-6")).toBeInTheDocument();

    // ALM-8 삭제 — 확인 다이얼로그 없이 즉시 삭제 + Toast
    await user.click(within(backlog).getByRole("button", { name: "ALM-8 액션" }));
    await user.click(await screen.findByRole("menuitem", { name: "삭제" }));
    await waitFor(() => {
      expect(screen.queryByText("ALM-8")).not.toBeInTheDocument();
    });
    expect(screen.getByText("ALM-8 이슈를 삭제했습니다")).toBeInTheDocument();
  });

  it("행 클릭 → ?issue= 쿼리와 함께 상세 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.click(within(backlog).getByText("코멘트 기능 구현")); // ALM-6

    expect(await screen.findByRole("dialog", { name: "ALM-6" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/backlog?issue=ALM-6");
  });

  it("행은 키보드로도 열린다 (role=button + Enter)", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    const row = within(backlog)
      .getByText("코멘트 기능 구현")
      .closest(".backlog-row") as HTMLElement;
    row.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "ALM-6" })).toBeInTheDocument();
  });
});
