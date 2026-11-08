import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { DuplicateSubmitError } from "../store/mapping";
// 지연 로드 청크를 수집 시점에 미리 올린다(병렬 실행에서 첫 findBy 한도 초과 방지)
import "./IssueDetailModal";
import "../pages/BoardPage";

// createIssue만 감싸 호출 횟수·인자를 본다 — 동작은 목업 그대로
vi.mock("../store/jiraStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store/jiraStore")>();
  return { ...actual, createIssue: vi.fn(actual.createIssue) };
});

const createIssue = vi.mocked(store.createIssue);
const actual = await vi.importActual<typeof import("../store/jiraStore")>("../store/jiraStore");

/** 다음 createIssue 한 번을 테스트가 풀 때까지 붙잡는다 — 진행 중 두 번째 제출을 확실히 재현한다 */
function holdNextCreate() {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  createIssue.mockImplementationOnce(async (input) => {
    await gate;
    return actual.createIssue(input);
  });
  return release;
}
const callsFor = (title: string) => createIssue.mock.calls.filter(([input]) => input.title === title);

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
  store.__resetForTest();
  createIssue.mockClear();
});

describe("이슈 생성 이중 제출 가드(N10)", () => {
  it("하위 이슈 폼: Enter 두 번이면 createIssue 한 번, 멱등 키를 싣는다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });
    await user.click(within(dialog).getByRole("button", { name: "하위 이슈" }));
    const input = within(dialog).getByLabelText("하위 이슈 추가");
    await user.type(input, "한 번만");
    const release = holdNextCreate();
    await user.keyboard("{Enter}{Enter}");
    fireEvent.submit(input.closest("form")!);

    expect(callsFor("한 번만")).toHaveLength(1);
    expect(input).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "추가" })).toHaveAttribute("aria-busy", "true");
    release();

    const childrenSection = within(dialog).getByTestId("issue-children");
    expect(await within(childrenSection).findByText("한 번만")).toBeInTheDocument();
    expect(callsFor("한 번만")).toHaveLength(1);
    expect(callsFor("한 번만")[0][0].idempotencyKey).toEqual(expect.any(String));
  }, 30_000);

  it("하위 이슈 폼: 실패하면 입력값을 남기고 잠금을 풀며, 재시도는 같은 키·성공 뒤 새 키", async () => {
    createIssue.mockRejectedValueOnce(new Error("일시 오류"));
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });
    await user.click(within(dialog).getByRole("button", { name: "하위 이슈" }));
    const input = within(dialog).getByLabelText("하위 이슈 추가");
    await user.type(input, "재시도 하위");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("하위 이슈 추가 실패")).toBeInTheDocument();
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("재시도 하위");

    await user.click(within(dialog).getByRole("button", { name: "추가" }));
    await waitFor(() => expect(input).toHaveValue(""));
    const [first, second] = callsFor("재시도 하위");
    expect(second[0].idempotencyKey).toBe(first[0].idempotencyKey);

    await user.type(input, "다음 하위");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(callsFor("다음 하위")).toHaveLength(1));
    expect(callsFor("다음 하위")[0][0].idempotencyKey).not.toBe(first[0].idempotencyKey);
  }, 30_000);

  it("하위 이슈 폼: 서버 409(같은 요청 처리 중)는 실패 토스트 없이 입력을 남긴다", async () => {
    createIssue.mockRejectedValueOnce(new DuplicateSubmitError("같은 요청이 처리 중입니다"));
    const user = userEvent.setup();
    renderAt("/projects/p1/board?issue=ALM-1");
    const dialog = await screen.findByRole("dialog", { name: "ALM-1" });
    await user.click(within(dialog).getByRole("button", { name: "하위 이슈" }));
    const input = within(dialog).getByLabelText("하위 이슈 추가");
    await user.type(input, "처리 중");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(callsFor("처리 중")).toHaveLength(1));
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("처리 중");
    expect(screen.queryByText("하위 이슈 추가 실패")).not.toBeInTheDocument();
  }, 30_000);

  it("만들기 대화상자: 제출 클릭 두 번이면 createIssue 한 번(회귀 고정)", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/board");
    await user.click(await screen.findByRole("button", { name: "만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "이슈 만들기" });
    await user.type(within(dialog).getByLabelText("요약 *"), "대화상자 한 번");
    const submit = within(dialog).getByRole("button", { name: "만들기" });
    const release = holdNextCreate();
    await user.dblClick(submit);
    fireEvent.submit(submit.closest("form")!);
    expect(callsFor("대화상자 한 번")).toHaveLength(1);
    release();

    expect(await screen.findByText(/를 만들었습니다/)).toBeInTheDocument();
    expect(callsFor("대화상자 한 번")).toHaveLength(1);
    expect(callsFor("대화상자 한 번")[0][0].idempotencyKey).toEqual(expect.any(String));
  }, 30_000);
});
