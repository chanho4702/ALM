import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, deleteProject, listIssues, listProjects } from "../store/jiraStore";

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

describe("이슈 보관함 (지라 보관된 업무 항목)", () => {
  it("상세에서 보관하면 목록에서 빠지고 보관함 탭에서 복원된다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    await user.click(within(dialog).getByRole("button", { name: "보관" }));
    expect(await screen.findByText("ALM-2을(를) 보관했습니다")).toBeInTheDocument();
    expect((await listIssues("p1")).some((i) => i.key === "ALM-2")).toBe(false);

    await user.click(await screen.findByRole("button", { name: "보관함" }));
    const list = await screen.findByRole("list", { name: "보관된 이슈 목록" });
    expect(within(list).getByText("ALM-2")).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "복원" }));
    expect(await screen.findByText("ALM-2을(를) 복원했습니다")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "보관된 이슈가 없습니다" })).toBeInTheDocument();
    expect((await listIssues("p1")).some((i) => i.key === "ALM-2")).toBe(true);
  }, 30_000); // App 전체 마운트 + 보관→보관함→복원 왕복 — 병렬 워커 부하에서 기본 15s를 넘긴다
});

describe("프로젝트 보관·휴지통", () => {
  it("설정에서 보관하면 헤더에 읽기 전용 표시가 붙고 해제하면 사라진다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/settings/general");
    await user.click(await screen.findByRole("button", { name: "프로젝트 보관" }));
    expect(await screen.findByText("프로젝트를 보관했습니다")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "보관 해제" })).toBeInTheDocument();
    expect((await listProjects())[0].archivedAt).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "프로젝트로 돌아가기" }));
    expect(await screen.findByTestId("project-archived-lozenge")).toHaveTextContent("보관됨");
  });

  it("삭제한 프로젝트는 휴지통에서 복원된다", async () => {
    const user = userEvent.setup();
    await deleteProject("p1");
    expect(await listProjects()).toHaveLength(0);
    renderAt("/projects/trash");
    const trash = await screen.findByRole("list", { name: "휴지통 프로젝트 목록" });
    expect(within(trash).getByText("ALM 플랫폼")).toBeInTheDocument();
    await user.click(within(trash).getByRole("button", { name: "복원" }));
    expect(await screen.findByText("프로젝트 ALM를 복원했습니다")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "휴지통이 비어 있습니다" })).toBeInTheDocument();
    expect(await listProjects()).toHaveLength(1);
  }, 30_000); // App 전체 마운트 + 삭제→휴지통→복원 왕복 — 병렬 워커 부하에서 기본 15s를 넘긴다
});

describe("휴지통 자동 비우기 카운트다운", () => {
  it("purgeAt까지 남은 일수를 올림해 보여주고, 지났으면 '곧 영구 삭제'", async () => {
    const { purgeCountdown } = await import("./TrashPage");
    const now = Date.parse("2026-09-04T00:00:00Z");
    expect(purgeCountdown("2026-09-14T12:00:00Z", now)).toBe("11일 후 영구 삭제");
    expect(purgeCountdown("2026-09-05T00:00:00Z", now)).toBe("1일 후 영구 삭제");
    expect(purgeCountdown("2026-09-03T00:00:00Z", now)).toBe("곧 영구 삭제");
  });
});
