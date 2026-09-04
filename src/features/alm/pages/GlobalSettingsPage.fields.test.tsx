import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createProject, createVersion, listIssues, resolveSettings } from "../store/jiraStore";

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("전역 관리 > 필드 구성 (지라 필드 구성 스킴)", () => {
  it("마감일을 숨겨 저장하면 이슈 만들기 모달에서 마감일이 사라진다", async () => {
    const user = userEvent.setup();
    const view = renderAt("/settings/fields");

    const table = await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    expect(within(table).getAllByRole("row")).toHaveLength(14); // 머리글 + 13종
    await user.click(screen.getByRole("switch", { name: "기본 스킴 마감일 표시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();
    expect((await resolveSettings("p1")).body.fields).toContainEqual({
      id: "dueDate",
      visible: false,
      required: false,
    });

    view.unmount();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    expect(within(dialog).queryByLabelText("마감일")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("요약 *")).toBeInTheDocument();
  });

  it("담당자를 필수로 두면 담당자를 고르기 전에는 만들 수 없다", async () => {
    const user = userEvent.setup();
    const view = renderAt("/settings/fields");

    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    await user.click(screen.getByRole("switch", { name: "기본 스킴 담당자 필수" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();

    view.unmount();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "담당자 필수 이슈");
    const submit = within(dialog).getByRole("button", { name: "만들기" });
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox", { name: "담당자 *" }));
    await user.click(await screen.findByRole("option", { name: "김찬호" }));
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeEnabled();
  });

  it("해결·상위 항목의 필수 스위치는 사유와 함께 잠겨 있다", async () => {
    renderAt("/settings/fields");
    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    expect(screen.getByRole("switch", { name: "기본 스킴 해결 필수" })).toBeDisabled();
    expect(screen.getByText("완료 상태에서만 입력")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "기본 스킴 상위 항목 필수" })).toBeDisabled();
    expect(screen.getByText("최상위 이슈가 있어야 함")).toBeInTheDocument();
    // 첨부·링크는 켤 수 있되 만들기를 막지 않는다고 미리 알린다
    expect(screen.getAllByText("만들기에서는 막지 않음 (만든 뒤 추가)")).toHaveLength(2);
  });

  it("수정 버전을 필수로 두면 만들기 모달에서 골라야 만들 수 있다", async () => {
    const user = userEvent.setup();
    await createVersion("p1", { name: "1.0.0" });
    const view = renderAt("/settings/fields");
    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    await user.click(screen.getByRole("switch", { name: "기본 스킴 수정 버전 필수" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();

    view.unmount();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "버전 붙은 이슈");
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox", { name: "수정 버전 *" }));
    await user.click(await screen.findByRole("option", { name: "1.0.0" }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    expect(await screen.findByText(/를 만들었습니다/)).toBeInTheDocument();
    const created = (await listIssues("p1")).find((i) => i.title === "버전 붙은 이슈");
    expect(created?.fixVersionId).toBeTruthy();
  });

  it("예상 시간을 필수로 두면 입력해야 만들 수 있다", async () => {
    const user = userEvent.setup();
    const view = renderAt("/settings/fields");
    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    await user.click(screen.getByRole("switch", { name: "기본 스킴 예상 시간 필수" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();

    view.unmount();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "예상 시간 이슈");
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeDisabled();
    expect(within(dialog).getByText(/필수 항목 미입력: 예상 시간/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("예상 시간 (h) *"), "3");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    expect(await screen.findByText(/를 만들었습니다/)).toBeInTheDocument();
    const created = (await listIssues("p1")).find((i) => i.title === "예상 시간 이슈");
    expect(created?.estimateHours).toBe(3);
  });

  it("채울 수 없는 필수 항목은 안내와 비활성 사유로 드러난다 (컴포넌트·스프린트·예상 시간)", async () => {
    const user = userEvent.setup();
    const view = renderAt("/settings/fields");
    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    for (const name of ["기본 스킴 컴포넌트 필수", "기본 스킴 스프린트 필수", "기본 스킴 예상 시간 필수"]) {
      await user.click(screen.getByRole("switch", { name }));
    }
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();

    view.unmount();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "채울 수 없는 이슈");

    // 컴포넌트가 하나도 없는 프로젝트라 체크박스 대신 어디서 만드는지 알려준다
    expect(
      within(dialog).getByText(/이 프로젝트에 컴포넌트가 없습니다/),
    ).toBeInTheDocument();
    // 비활성 사유는 한 줄로 — 스프린트를 안 고른 것도 같은 줄에 드러난다
    const reason = within(dialog).getByText(/필수 항목 미입력:/);
    expect(reason).toHaveTextContent("컴포넌트");
    expect(reason).toHaveTextContent("스프린트");
    expect(reason).toHaveTextContent("예상 시간");
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeDisabled();
  });

  it("링크를 필수로 두면 별표만 붙고 만들기는 막히지 않는다", async () => {
    const user = userEvent.setup();
    const view = renderAt("/settings/fields");
    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    await user.click(screen.getByRole("switch", { name: "기본 스킴 링크 필수" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();

    view.unmount();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    expect(within(dialog).getByText("연결 이슈 *")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("요약 *"), "링크 없이 만든다");
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeEnabled();
  });
});

describe("프로젝트 설정 > 필드", () => {
  it("스킴을 쓰는 동안은 읽기 전용이고, 커스텀으로 켜면 그 프로젝트에만 다시 보인다", async () => {
    const user = userEvent.setup();
    const second = await createProject({ key: "OPS", name: "운영" });

    // 전역 스킴에서 마감일을 숨긴다 — 두 프로젝트 모두에 적용된다
    const globalView = renderAt("/settings/fields");
    await screen.findByRole("table", { name: "기본 스킴 필드 구성" });
    await user.click(screen.getByRole("switch", { name: "기본 스킴 마감일 표시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();
    globalView.unmount();

    // 두 번째 프로젝트만 커스텀으로 전환해 마감일을 되살린다
    const projectView = renderAt(`/projects/${second.id}/settings/fields`);
    const readonly = await screen.findByTestId("fields-readonly");
    // 스킴을 쓰는 동안은 스위치 대신 글자로 상태만 보여준다
    expect(within(readonly).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(readonly).getByText("숨김")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "이 프로젝트만 커스텀" }));
    expect(await screen.findByText("커스텀 설정으로 전환했습니다")).toBeInTheDocument();
    await user.click(await screen.findByRole("switch", { name: "마감일 표시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("필드 구성을 저장했습니다")).toBeInTheDocument();
    projectView.unmount();

    // 커스텀 프로젝트에는 보이고
    const customView = renderAt(`/projects/${second.id}/board`);
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    expect(await within(await screen.findByRole("dialog", { name: "이슈 만들기" })).findByLabelText("마감일")).toBeInTheDocument();
    customView.unmount();

    // 스킴을 그대로 쓰는 프로젝트에는 여전히 없다
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    expect(within(dialog).queryByLabelText("마감일")).not.toBeInTheDocument();
  });
});
