import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createIssue, listProjects, listProjectShortcuts } from "../store/jiraStore";

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

describe("프로젝트 세부 (지라 프로젝트 설정 > 세부)", () => {
  it("범주·기본 담당자를 저장하면 담당자 없는 새 이슈가 리더에게 간다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/general");
    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("범주"), "플랫폼");
    await user.click(screen.getByRole("combobox", { name: "기본 담당자" }));
    await user.click(await screen.findByRole("option", { name: "프로젝트 리더" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("프로젝트를 수정했습니다")).toBeInTheDocument();

    const project = (await listProjects()).find((p) => p.id === "p1");
    expect(project?.category).toBe("플랫폼");
    expect(project?.defaultAssignee).toBe("lead");
    const issue = await createIssue({ projectId: "p1", title: "담당자 없이" });
    expect(issue.assigneeId).toBe(project?.leadId);
  });

  it("바로 가기를 추가하면 프로젝트 머리에 링크로 나타난다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/general");
    expect(await screen.findByRole("heading", { name: "바로 가기" })).toBeInTheDocument();
    await user.type(await screen.findByLabelText("바로 가기 이름"), "팀 위키");
    await user.type(screen.getByLabelText("바로 가기 URL"), "https://wiki.example.com/alm");
    await user.click(screen.getByRole("button", { name: "추가" }));
    expect(await screen.findByText("바로 가기를 추가했습니다")).toBeInTheDocument();
    expect(await listProjectShortcuts("p1")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "프로젝트로 돌아가기" }));
    const nav = await screen.findByRole("navigation", { name: "바로 가기" });
    expect(within(nav).getByRole("link", { name: "팀 위키" })).toHaveAttribute(
      "href",
      "https://wiki.example.com/alm",
    );
    await waitFor(() => expect(nav).toBeInTheDocument());
  });
});
