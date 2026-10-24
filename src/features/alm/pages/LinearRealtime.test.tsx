import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __emitProjectStreamEvent, __resetForTest, __simulateRemoteIssueChange, getIssueByKey } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import { StreamError } from "../store/eventStream";
import "./BoardPage";
import "./BacklogPage";
import "./IssueListPage";
import "../components/IssueDetailModal";

/** 실시간 동기화(Linear식) — 남의 변경은 그 이슈만 다시 읽고 하이라이트, 내 메아리·옛 신호는 무시 */
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
  __resetCommandScopeForTest();
});
afterEach(() => vi.restoreAllMocks());

const card = (key: string) => document.querySelector<HTMLElement>(`[data-issue-key="${key}"]`)!;

describe("실시간 동기화 — 보드", () => {
  it("연결되면 '실시간' 표시, 남이 바꾸면 그 카드만 새 값으로 바뀌고 하이라이트된다", async () => {
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-2");
    expect(await screen.findByRole("status", { name: "실시간 연결됨" })).toBeInTheDocument();
    const spy = vi.spyOn(store, "getIssueByKey");
    __simulateRemoteIssueChange!("ALM-2", { title: "남이 고친 제목" });
    expect(await screen.findByText("남이 고친 제목")).toBeInTheDocument();
    await waitFor(() => expect(card("ALM-2")).toHaveAttribute("data-remote-flash"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("남이 상태를 옮기면(issue.transitioned) 카드가 그 열로 간다", async () => {
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-5");
    expect(within(screen.getByRole("region", { name: "할 일" })).getByText("ALM-5")).toBeInTheDocument();
    __simulateRemoteIssueChange!("ALM-5", { status: "done" });
    await waitFor(() => expect(within(screen.getByRole("region", { name: "완료" })).getByText("ALM-5")).toBeInTheDocument());
    expect(within(screen.getByRole("region", { name: "할 일" })).queryByText("ALM-5")).not.toBeInTheDocument();
  });

  it("내 변경의 메아리(actorId = 나, 같은 version)·늦게 온 옛 신호는 다시 읽지 않는다", async () => {
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-2");
    await screen.findByRole("status", { name: "실시간 연결됨" });
    const issue = (await getIssueByKey("ALM-2"))!;
    const spy = vi.spyOn(store, "getIssueByKey");
    const base = {
      kind: "issue" as const,
      projectId: "p1",
      issueId: issue.id,
      issueKey: issue.key,
      changedFields: ["title"],
      sprintId: null,
      at: null,
      eventId: null,
    };
    __emitProjectStreamEvent!({ ...base, type: "issue.updated", version: issue.version, actorId: "u1" });
    __emitProjectStreamEvent!({ ...base, type: "issue.updated", version: issue.version - 1, actorId: "u2" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
    // 같은 version이라도 남의 신호는 다시 읽는다(플래그·보드 이동은 version을 안 올린다)
    __emitProjectStreamEvent!({ ...base, type: "issue.updated", version: issue.version, actorId: "u2" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("삭제 신호는 카드를 빼고, 스프린트 신호·reset은 다시 읽는다", async () => {
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-2");
    await screen.findByRole("status", { name: "실시간 연결됨" });
    const issue = (await getIssueByKey("ALM-2"))!;
    __emitProjectStreamEvent!({
      kind: "issue",
      type: "issue.deleted",
      projectId: "p1",
      issueId: issue.id,
      issueKey: issue.key,
      version: null,
      changedFields: [],
      sprintId: null,
      actorId: "u2",
      at: null,
      eventId: null,
    });
    await waitFor(() => expect(screen.queryByText("ALM-2")).not.toBeInTheDocument());
    const boardIssues = vi.spyOn(store, "listBoardIssues");
    __emitProjectStreamEvent!({ kind: "reset", projectId: "p1", reason: "gap", eventId: null });
    await waitFor(() => expect(boardIssues).toHaveBeenCalled());
  });

  it("스트림이 끊기면 '실시간 끊김' 배지를 보인다", async () => {
    vi.spyOn(store, "streamProject").mockRejectedValue(new StreamError("network", 502));
    renderAt("/projects/p1/board");
    await screen.findByText("ALM-2");
    expect(await screen.findByText(/실시간 끊김 — 다시 연결 중/)).toBeInTheDocument();
  });
});

describe("실시간 동기화 — 백로그·목록·상세", () => {
  it("백로그 행도 갈아 끼우고 하이라이트", async () => {
    renderAt("/projects/p1/backlog");
    await screen.findByText("ALM-6");
    await screen.findByRole("status", { name: "실시간 연결됨" });
    __simulateRemoteIssueChange!("ALM-6", { title: "백로그 원격 수정" });
    expect(await screen.findByText("백로그 원격 수정")).toBeInTheDocument();
    await waitFor(() => expect(card("ALM-6")).toHaveAttribute("data-remote-flash"));
  });

  it("이슈 목록은 한 페이지를 다시 읽고 그 행을 하이라이트한다", async () => {
    renderAt("/projects/p1/issues");
    const table = await screen.findByRole("table", { name: "이슈 목록" });
    await within(table).findByText("ALM-1");
    await screen.findByRole("status", { name: "실시간 연결됨" });
    const page = vi.spyOn(store, "listIssuesPage");
    __simulateRemoteIssueChange!("ALM-3", { title: "목록 원격 수정" });
    expect(await within(table).findByText("목록 원격 수정")).toBeInTheDocument();
    expect(page).toHaveBeenCalled();
    await waitFor(() => expect(within(table).getByText("ALM-3").closest("tr")).toHaveAttribute("data-remote-flash"));
  });

  it("열어 둔 상세 — 남이 바꾸면 최신 값과 '○○ 님이 방금 바꿨습니다'", async () => {
    renderAt("/projects/p1/board?issue=ALM-2");
    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    // 모달이 열려 배경이 aria-hidden이라 연결 표시를 질의하지 않는다 — 연결(목업은 즉시)이 맺힐 틈만 준다
    await new Promise((resolve) => setTimeout(resolve, 100));
    __simulateRemoteIssueChange!("ALM-2", { title: "상세 원격 제목" }, "u2");
    expect(await within(dialog).findByText("이서연 님이 방금 바꿨습니다")).toBeInTheDocument();
    expect(await within(dialog).findByText("상세 원격 제목")).toBeInTheDocument();
  });
});
