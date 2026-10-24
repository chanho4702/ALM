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

describe("이슈 목록 열 표시·숨김 (지라 목록 보기 Columns)", () => {
  const headerNames = (table: HTMLElement) =>
    within(table).getAllByRole("columnheader").map((h) => h.textContent ?? "");

  it("열 선택에서 마감일을 끄면 열이 사라지고 다시 열어도 유지된다", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    expect(headerNames(table).some((n) => n.includes("마감일"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "열" }));
    const panel = screen.getByRole("group", { name: "표시할 열" });
    // 키·제목은 숨길 수 없다
    expect(within(panel).getByRole("checkbox", { name: "키 (항상 표시)" })).toBeDisabled();
    expect(within(panel).getByRole("checkbox", { name: "제목 (항상 표시)" })).toBeDisabled();
    await user.click(within(panel).getByRole("checkbox", { name: "마감일" }));

    await waitFor(() => expect(headerNames(screen.getByRole("table", { name: "이슈 목록" })).some((n) => n.includes("마감일"))).toBe(false));
    expect(screen.getByRole("button", { name: "열 (1개 숨김)" })).toBeInTheDocument();
    expect((await getTablePrefs("issues")).hidden).toEqual(["dueDate"]);

    unmount();
    renderAt("/projects/p1/issues");
    const again = await screen.findByRole("table", { name: "이슈 목록" });
    await waitFor(() => expect(headerNames(again).some((n) => n.includes("마감일"))).toBe(false));
    expect(headerNames(again).some((n) => n.includes("키"))).toBe(true);
  });

  it("기본값으로를 누르면 처음 열 구성(표시·순서)으로 돌아간다", async () => {
    const user = userEvent.setup();
    await setTablePrefs("issues", { hidden: ["dueDate", "labels"], order: ["title", "key"] });
    renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    await waitFor(() => expect(headerNames(table).some((n) => n.includes("라벨"))).toBe(false));

    await user.click(screen.getByRole("button", { name: "열 (2개 숨김)" }));
    await user.click(screen.getByRole("button", { name: "기본값으로" }));

    await waitFor(() => {
      const names = headerNames(screen.getByRole("table", { name: "이슈 목록" }));
      expect(names.some((n) => n.includes("라벨"))).toBe(true);
      expect(names.some((n) => n.includes("마감일"))).toBe(true);
      expect(names.findIndex((n) => n.includes("키"))).toBeLessThan(names.findIndex((n) => n.includes("제목")));
    });
    const prefs = await getTablePrefs("issues");
    expect(prefs.hidden).toBeUndefined();
    expect(prefs.order).toBeUndefined();
  });

  it("열을 숨긴 채 순서를 바꿔도 숨긴 열의 자리는 남는다", async () => {
    const user = userEvent.setup();
    await setTablePrefs("issues", { hidden: ["type"] });
    renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    await waitFor(() => expect(headerNames(table).some((n) => n.includes("타입"))).toBe(false));
    const keyHeader = within(table).getAllByRole("columnheader").find((h) => h.textContent?.includes("키"))!;
    keyHeader.focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(async () => {
      const order = (await getTablePrefs("issues")).order ?? [];
      // 숨긴 type은 선택 다음 제자리, key는 title 뒤로
      expect(order.slice(0, 4)).toEqual(["select", "type", "title", "key"]);
    });
  });
});
