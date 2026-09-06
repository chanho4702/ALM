import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
// 이 화면은 App에서 lazy()로 쪼개져 있다. 전체 스위트를 병렬로 돌릴 때 첫 findBy가 청크 로딩까지
// 기다리다 한도(5s)를 넘기므로, 수집 시점에 미리 올려 lazy 해석이 즉시 끝나게 한다.
import "./ProjectSettingsPage";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname을 노출하는 테스트 프로브 (초대 링크는 쿼리 프리셋까지 본다) */
function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
    </>
  );
}

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/settings"]}>
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

describe("ProjectSettingsPage", () => {
  it("이름/설명을 수정하면 전역 사이드바에도 반영된다 (키는 읽기 전용 표시)", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();
    expect(screen.getByText("ALM", { selector: ".issue-key-cell" })).toBeInTheDocument(); // 키 표시
    expect(screen.queryByLabelText("키")).not.toBeInTheDocument(); // 입력 필드는 아님

    const nameField = screen.getByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "ALM 플랫폼 v2");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("프로젝트를 수정했습니다")).toBeInTheDocument();

    // 설정 페이지에는 전역 사이드바가 없다 — 프로젝트로 돌아가서 확인한다
    await user.click(screen.getByRole("button", { name: "프로젝트로 돌아가기" }));
    const projectSection = within(
      await screen.findByRole("navigation", { name: "전역 내비게이션" }),
    ).getByTestId("nav-projects");
    await waitFor(() => {
      expect(
        within(projectSection).getByRole("button", { name: "ALM 플랫폼 v2" }),
      ).toBeInTheDocument();
    });
  });

  it("위험 구역에서 삭제하면 확인 후 디렉터리로 이동한다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "프로젝트 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "프로젝트 삭제" });
    expect(within(dialog).getByText(/이슈 8\s*개와 함께 휴지통으로/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/projects$/);
    });
    // 마지막 프로젝트였으므로 빈 상태
    expect(
      await screen.findByRole("heading", { name: "아직 프로젝트가 없습니다" }),
    ).toBeInTheDocument();
  });
});

describe("프로젝트 사용자·권한", () => {
  it("멤버 목록을 보여주고 역할을 바꾼다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(within(await screen.findByRole("navigation", { name: "설정 메뉴" })).getByRole("button", { name: "사용자·권한" }));

    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    // 시드: 김찬호 관리자 + 나머지 3명 편집자
    expect(within(members).getAllByRole("row")).toHaveLength(5); // 머리글 + 4명

    const row = within(members).getByText("이서연").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "이서연 역할" }));
    await user.click(await screen.findByRole("menuitem", { name: "뷰어" }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("table", { name: "프로젝트 멤버" }))
          .getByText("이서연")
          .closest("tr"),
      ).toHaveTextContent("뷰어");
    });
  });

  it("마지막 관리자를 강등하면 거부하고 사유를 알린다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(within(await screen.findByRole("navigation", { name: "설정 메뉴" })).getByRole("button", { name: "사용자·권한" }));
    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    const row = within(members).getByText("김찬호").closest("tr")!;

    await user.click(within(row).getByRole("button", { name: "김찬호 역할" }));
    await user.click(await screen.findByRole("menuitem", { name: "편집자" }));

    expect(
      await screen.findByText("프로젝트에는 관리자가 최소 한 명 필요합니다"),
    ).toBeInTheDocument();
  });

  it("멤버를 내보내면 목록에서 사라지고 다시 추가할 수 있다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(within(await screen.findByRole("navigation", { name: "설정 메뉴" })).getByRole("button", { name: "사용자·권한" }));
    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    await user.click(within(members).getByRole("button", { name: "최다인 내보내기" }));

    await waitFor(() => {
      expect(within(members).queryByText("최다인")).not.toBeInTheDocument();
    });

    // 디렉터리에서 다시 추가
    await user.click(screen.getByRole("combobox", { name: "추가할 사용자" }));
    await user.click(await screen.findByRole("option", { name: "최다인" }));
    await user.click(screen.getByRole("button", { name: "멤버 추가" }));

    await waitFor(() => {
      expect(within(members).getByText("최다인")).toBeInTheDocument();
    });
  });

  it("검색으로 후보를 좁히고, 좁혀서 사라진 선택은 비운다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      within(await screen.findByRole("navigation", { name: "설정 메뉴" })).getByRole("button", {
        name: "사용자·권한",
      }),
    );
    const members = await screen.findByRole("table", { name: "프로젝트 멤버" });
    await user.click(within(members).getByRole("button", { name: "최다인 내보내기" }));
    await waitFor(() => expect(within(members).queryByText("최다인")).not.toBeInTheDocument());

    // 후보를 고른 뒤 검색으로 다른 사람만 남기면 선택이 풀린다
    await user.click(screen.getByRole("combobox", { name: "추가할 사용자" }));
    await user.click(await screen.findByRole("option", { name: "최다인" }));
    await user.type(screen.getByRole("textbox", { name: "사용자 검색" }), "박준");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "추가할 사용자" })).toHaveTextContent(
        "사용자 선택",
      ),
    );

    // 검색 결과에 없는 사람은 후보에서도 빠진다
    await user.click(screen.getByRole("combobox", { name: "추가할 사용자" }));
    expect(screen.queryByRole("option", { name: "최다인" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("프로젝트 관리자에게 초대 화면으로 가는 프리셋 링크가 있다", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      within(await screen.findByRole("navigation", { name: "설정 메뉴" })).getByRole("button", {
        name: "사용자·권한",
      }),
    );
    await screen.findByRole("table", { name: "프로젝트 멤버" });
    await user.click(screen.getByRole("button", { name: "초대하기" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/settings/org/invitations"),
    );
    // 패키지(0.1.2)가 읽는 프리셋 — 초대 폼이 이 프로젝트 권한을 담은 채 열린다
    expect(screen.getByTestId("search")).toHaveTextContent(
      "?scope=PROJECT&resourceId=p1&role=EDITOR",
    );
  }, 30_000); // 프로젝트 설정 → 멤버 탭 → 초대 프리셋 이동 — 병렬 워커 부하에서 기본 15s를 넘긴다
});

describe("워크플로 전이 편집", () => {
  it("커스텀 전환 후 전이를 추가·삭제하고 저장하면 규칙이 적용된다", async () => {
    const user = userEvent.setup();
    renderSettings();

    const menu = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await user.click(within(menu).getByRole("button", { name: "워크플로" }));
    await user.click(await screen.findByRole("switch", { name: "이 프로젝트만 커스텀" }));

    // 기본 상태는 전이가 없다 — 자유 이동
    const list = await screen.findByRole("list", { name: "전이 목록" });
    expect(within(list).getByText(/전이를 정하지 않으면/)).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "출발 상태" }));
    await user.click(await screen.findByRole("option", { name: "할 일" }));
    await user.click(screen.getByRole("combobox", { name: "도착 상태" }));
    await user.click(await screen.findByRole("option", { name: "진행 중" }));
    await user.click(screen.getByRole("button", { name: "전이 추가" }));

    await waitFor(() => {
      expect(within(list).queryByText(/전이를 정하지 않으면/)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("워크플로를 저장했습니다")).toBeInTheDocument();
  });
});

describe("프로젝트 설정 — 가져오기", () => {
  it("지라 CSV의 모르는 상태를 짝지어 가져오면 키가 보존된 이슈가 생긴다", async () => {
    const user = userEvent.setup();
    renderSettings();
    const menu = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await user.click(within(menu).getByRole("button", { name: "가져오기" }));

    const csv = [
      "Issue key,Summary,Issue Type,Status,Priority,Assignee",
      "ALM-40,리뷰 대기,Task,Code Review,High,",
      "ALM-41,완료된 것,Bug,Done,Low,",
    ].join("\n");
    await user.upload(
      await screen.findByLabelText("지라 CSV 파일"),
      new File([csv], "jira-export.csv", { type: "text/csv" }),
    );
    expect(await screen.findByText(/읽을 수 있는 행 1개, 건너뛸 행 1개/)).toBeInTheDocument();

    // 모르는 상태 Code Review → 진행 중으로 짝짓기
    await user.click(screen.getByRole("combobox", { name: "상태 Code Review" }));
    await user.click(await screen.findByRole("option", { name: /진행 중/ }));
    expect(await screen.findByText(/읽을 수 있는 행 2개/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2개 이슈 가져오기" }));
    expect(await screen.findByText("2개 이슈를 가져왔습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("가져오기 결과")).toHaveTextContent("만듦 2건");
    const { getIssueByKey } = await import("../store/jiraStore");
    expect(await getIssueByKey("ALM-40")).toMatchObject({ status: "inprogress", priority: "high" });
  });
});
