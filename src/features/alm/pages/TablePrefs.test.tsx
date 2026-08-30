import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";
import { getTablePrefs, setTablePrefs } from "../store/uiStore";

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

describe("테이블 열 순서·너비 (사용자 로컬 설정)", () => {
  it("이슈 목록 헤더를 Alt+→로 옮기면 순서가 저장되고 다시 열어도 유지된다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    const headers = within(table).getAllByRole("columnheader");
    const keyHeader = headers.find((h) => h.textContent?.includes("키"))!;
    keyHeader.focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(async () => {
      const prefs = await getTablePrefs("issues");
      expect(prefs.order?.indexOf("key")).toBeGreaterThan(prefs.order?.indexOf("title") ?? -1);
    });
  });

  it("저장된 너비는 colgroup에 반영된다", async () => {
    await setTablePrefs("projects", { widths: { name: 320 } });
    renderAt("/projects");
    const table = await screen.findByRole("table", { name: "프로젝트 목록" });
    await waitFor(() => {
      const cols = table.querySelectorAll("colgroup col");
      expect([...cols].some((c) => (c as HTMLElement).style.width === "320px")).toBe(true);
    });
  });

  it("프로젝트 목록은 헤더 클릭으로 정렬된다", async () => {
    const user = userEvent.setup();
    renderAt("/projects");
    const table = await screen.findByRole("table", { name: "프로젝트 목록" });
    const nameHeader = within(table).getByRole("button", { name: /이름/ });
    await user.click(nameHeader);
    expect(within(table).getByRole("columnheader", { name: /이름/ })).toHaveAttribute("aria-sort", "descending");
  });
});
