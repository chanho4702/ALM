import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createProject } from "../store/jiraStore";

function renderProjects() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("ProjectListPage", () => {
  it("프로젝트 이름/키/설명/생성일을 테이블로 렌더한다", async () => {
    renderProjects();

    expect(await screen.findByText("ALM 플랫폼")).toBeInTheDocument();
    const row = screen.getByText("ALM 플랫폼").closest("tr")!;
    expect(within(row).getByText("ALM")).toBeInTheDocument();
    expect(within(row).getByText("스틸 블루 디자인 시스템 기반 ALM 데모")).toBeInTheDocument();
  });

  it("수정 모달에서 이름·설명을 바꾸면 테이블에 반영된다 (키는 읽기 전용)", async () => {
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("ALM 플랫폼");

    await user.click(screen.getByRole("button", { name: "ALM 플랫폼 관리" }));
    await user.click(await screen.findByRole("menuitem", { name: "수정" }));

    const dialog = await screen.findByRole("dialog", { name: "프로젝트 수정" });
    // 키는 입력 필드가 아니라 표시만
    expect(within(dialog).queryByLabelText("키")).not.toBeInTheDocument();
    expect(within(dialog).getByText("ALM")).toBeInTheDocument();

    const nameField = within(dialog).getByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "ALM 플랫폼 v2");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("ALM 플랫폼 v2")).toBeInTheDocument();
  });

  it("삭제는 이슈 개수를 경고한 뒤 프로젝트를 제거한다", async () => {
    await createProject({ key: "PAY", name: "결제 서비스" }); // 삭제 후에도 앱이 유지되도록 2번째 프로젝트
    const user = userEvent.setup();
    renderProjects();
    await screen.findByText("결제 서비스");

    await user.click(screen.getByRole("button", { name: "ALM 플랫폼 관리" }));
    await user.click(await screen.findByRole("menuitem", { name: "삭제" }));

    const dialog = await screen.findByRole("dialog", { name: "프로젝트 삭제" });
    expect(within(dialog).getByText(/이슈 8개가 함께 삭제됩니다/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(screen.queryByText("ALM 플랫폼")).not.toBeInTheDocument();
    });
    expect(screen.getByText("결제 서비스")).toBeInTheDocument();
  });
});
