import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getTriageSettings, saveTriageSettings, updateProjectMemberRole } from "../store/jiraStore";
// 지연 청크를 미리 올린다
import "../pages/ProjectSettingsPage";
import "../pages/TriageInboxPage";

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

describe("프로젝트 설정 › 트리아지", () => {
  it("관리자가 켜면 저장되고, 인박스로 가면 프로젝트 뷰에 트리아지 탭이 붙는다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/triage");
    const toggle = await screen.findByRole("switch", { name: "트리아지 사용" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/triage = true/)).toBeInTheDocument();
    await user.click(toggle);
    expect(await screen.findByText("트리아지를 켰습니다")).toBeInTheDocument();
    expect((await getTriageSettings("p1")).enabled).toBe(true);
    expect(screen.getByText("대기 0건 · 보류 0건")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "트리아지 인박스 열기" }));
    const viewTabs = await screen.findByRole("navigation", { name: "프로젝트 뷰" });
    expect(await within(viewTabs).findByRole("button", { name: "트리아지" })).toBeInTheDocument();
  }, 30_000);

  it("끄면 탭이 사라진다(저장 반영)", async () => {
    const user = userEvent.setup();
    await saveTriageSettings("p1", true);
    renderAt("/projects/p1/settings/triage");
    const toggle = await screen.findByRole("switch", { name: "트리아지 사용" });
    await waitFor(() => expect(toggle).toBeChecked());
    await user.click(toggle);
    expect(await screen.findByText("트리아지를 껐습니다")).toBeInTheDocument();
    expect((await getTriageSettings("p1")).enabled).toBe(false);
  });

  it("관리자가 아니면 스위치 대신 읽기 전용 글자를 보인다", async () => {
    await saveTriageSettings("p1", true);
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "viewer");
    renderAt("/projects/p1/settings/triage");
    const readonly = await screen.findByTestId("triage-readonly");
    expect(readonly).toHaveTextContent("켜짐");
    expect(screen.queryByRole("switch", { name: "트리아지 사용" })).not.toBeInTheDocument();
  });
});
