import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createIssue, listProjects, listProjectShortcuts, updateProject } from "../store/jiraStore";

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

describe("프로젝트 일반 설정 저장 충돌(409)", () => {
  it("화면을 연 뒤 동료가 먼저 저장하면 덮어쓰지 않고, 입력을 남긴 채 다시 적용을 고르게 한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/general");
    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();
    const seen = (await listProjects()).find((p) => p.id === "p1")!;
    await updateProject("p1", { category: "동료 범주" }, seen.version); // 동료 저장

    await user.type(screen.getByLabelText("범주"), "내 범주");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText(/다른 사용자가 이 프로젝트를 먼저 수정해/)).toBeInTheDocument();
    expect(screen.getByLabelText("범주")).toHaveValue("내 범주");
    expect((await listProjects()).find((p) => p.id === "p1")!.category).toBe("동료 범주");

    await user.click(screen.getByRole("button", { name: "내 변경 다시 적용(최신 버전 기준)" }));
    expect(await screen.findByText("프로젝트를 수정했습니다")).toBeInTheDocument();
    expect((await listProjects()).find((p) => p.id === "p1")!.category).toBe("내 범주");
    expect(screen.queryByText(/다른 사용자가 이 프로젝트를 먼저 수정해/)).not.toBeInTheDocument();
  });
});

describe("프로젝트 일반 설정 — 다시 적용은 내가 손댄 필드만", () => {
  it("동료가 이름을 바꾸고 나는 범주만 바꿨으면, 다시 적용해도 동료의 이름이 남는다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/general");
    expect(await screen.findByRole("heading", { name: "일반" })).toBeInTheDocument();
    const seen = (await listProjects()).find((p) => p.id === "p1")!;
    await updateProject("p1", { name: "동료가 바꾼 이름" }, seen.version);

    await user.type(screen.getByLabelText("범주"), "내 범주");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await user.click(await screen.findByRole("button", { name: "내 변경 다시 적용(최신 버전 기준)" }));
    expect(await screen.findByText("프로젝트를 수정했습니다")).toBeInTheDocument();

    const saved = (await listProjects()).find((p) => p.id === "p1")!;
    expect(saved).toMatchObject({ name: "동료가 바꾼 이름", category: "내 범주" });
    // 초안도 저장된 값으로 다시 맞춰져, 다음 저장이 동료의 이름을 되돌리지 않는다
    expect(screen.getByLabelText("이름")).toHaveValue("동료가 바꾼 이름");
  });
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
