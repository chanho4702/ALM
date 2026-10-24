import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import {
  __resetForTest,
  createIssue,
  getIssueByKey,
  listIssueLinks,
  listTriage,
  saveTriageSettings,
  updateProjectMemberRole,
} from "../store/jiraStore";
// 지연 청크를 미리 올린다 — 병렬 실행에서 첫 findBy가 청크 변환을 기다리다 한도를 넘지 않게
import "./TriageInboxPage";

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

async function seed() {
  await saveTriageSettings("p1", true);
  const a = await createIssue({ projectId: "p1", title: "접수 A", triage: true });
  const b = await createIssue({ projectId: "p1", title: "접수 B", triage: true });
  return { a, b };
}

const queue = () => screen.findByRole("list", { name: "트리아지 대기열" });
const toolbar = () => screen.getByRole("toolbar", { name: "트리아지 처리" });

describe("트리아지 인박스 (V35)", () => {
  it("대기열을 오래된 것부터 보여 주고 첫 이슈를 고른다", async () => {
    await seed();
    renderAt("/projects/p1/triage");
    const list = await queue();
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("접수 A");
    expect(items[0]).toHaveAttribute("aria-current", "true");
    expect(await screen.findByText("대기 2건 · 보류 0건")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "접수 A" })).toBeInTheDocument();
    expect(within(toolbar()).getByRole("button", { name: /^수락/ })).toHaveTextContent("1");
  });

  it("수락 — 고른 상태로 대기열에서 빠진다", async () => {
    const user = userEvent.setup();
    const { a } = await seed();
    renderAt("/projects/p1/triage");
    await queue();
    await user.click(within(toolbar()).getByRole("button", { name: /^수락/ }));
    const dialog = await screen.findByRole("dialog", { name: `${a.key} 수락` });
    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "진행 중" }));
    await user.click(within(dialog).getByRole("button", { name: "수락" }));
    expect(await screen.findByText(`${a.key}을(를) 수락했습니다`)).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("list", { name: "트리아지 대기열" })).getAllByRole("button")).toHaveLength(1));
    expect(await getIssueByKey(a.key)).toMatchObject({ status: "inprogress", triageState: null });
  });

  it("단축키 j로 다음 이슈, 3으로 거절 — 하지 않음으로 닫힌다", async () => {
    const user = userEvent.setup();
    const { b } = await seed();
    renderAt("/projects/p1/triage");
    const list = await queue();
    await user.keyboard("j");
    await waitFor(() => expect(within(list).getAllByRole("button")[1]).toHaveAttribute("aria-current", "true"));
    await user.keyboard("3");
    const confirm = await screen.findByRole("dialog", { name: `${b.key} 거절` });
    await user.type(within(confirm).getByLabelText("거절 사유 (선택)"), "범위 밖");
    await user.click(within(confirm).getByRole("button", { name: "거절" }));
    expect(await screen.findByText(`${b.key}을(를) 거절했습니다`)).toBeInTheDocument();
    expect(await getIssueByKey(b.key)).toMatchObject({ resolution: "wont_do", triageState: null });
  });

  it("단축키 1은 수락 대화상자를 연다", async () => {
    const user = userEvent.setup();
    const { a } = await seed();
    renderAt("/projects/p1/triage");
    await queue();
    await user.keyboard("1");
    expect(await screen.findByRole("dialog", { name: `${a.key} 수락` })).toBeInTheDocument();
  });

  it("중복 — 원본을 골라 링크를 만들고 중복으로 닫는다", async () => {
    const user = userEvent.setup();
    const { a } = await seed();
    const original = (await getIssueByKey("ALM-3"))!;
    renderAt("/projects/p1/triage");
    await queue();
    await user.click(within(toolbar()).getByRole("button", { name: /^중복/ }));
    const dialog = await screen.findByRole("dialog", { name: `${a.key} 중복으로 닫기` });
    await user.type(within(dialog).getByLabelText("원본 이슈 검색"), original.title);
    const candidates = await within(dialog).findByRole("list", { name: "원본 이슈 후보" });
    await user.click(await within(candidates).findByRole("button", { name: new RegExp(`^ALM-3 `) }));
    await user.click(within(dialog).getByRole("button", { name: "중복으로 닫기" }));
    expect(await screen.findByText(`${a.key}을(를) ALM-3의 중복으로 닫았습니다`)).toBeInTheDocument();
    expect(await getIssueByKey(a.key)).toMatchObject({ resolution: "duplicate", triageState: null });
    expect((await listIssueLinks(a.id)).some((l) => l.link.type === "duplicates" && l.other.id === original.id)).toBe(true);
  });

  it("보류 — 프리셋으로 접어 두면 보류 탭으로 옮겨 간다", async () => {
    const user = userEvent.setup();
    const { a } = await seed();
    renderAt("/projects/p1/triage");
    await queue();
    await user.click(within(toolbar()).getByRole("button", { name: /^보류/ }));
    const dialog = await screen.findByRole("dialog", { name: `${a.key} 보류` });
    await user.click(within(dialog).getByRole("button", { name: /내일 아침 9시/ }));
    expect(await screen.findByText(/까지 보류했습니다$/)).toBeInTheDocument();
    expect((await listTriage("p1", "snoozed")).map((i) => i.key)).toEqual([a.key]);
    await user.click(screen.getByRole("tab", { name: "보류" }));
    const snoozed = await screen.findByRole("list", { name: "트리아지 대기열" });
    await waitFor(() => expect(within(snoozed).getAllByRole("button")).toHaveLength(1));
    expect(within(snoozed).getByRole("button")).toHaveTextContent("접수 A");
  });

  it("트리아지를 꺼도 안내와 함께 남은 이슈를 처리할 수 있다", async () => {
    const user = userEvent.setup();
    const { a } = await seed();
    await saveTriageSettings("p1", false);
    renderAt("/projects/p1/triage");
    expect(await screen.findByText(/이 프로젝트는 트리아지를 사용하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "트리아지 설정" })).toBeInTheDocument();
    await queue();
    await user.keyboard("3");
    const confirm = await screen.findByRole("dialog", { name: `${a.key} 거절` });
    await user.click(within(confirm).getByRole("button", { name: "거절" }));
    expect(await screen.findByText(`${a.key}을(를) 거절했습니다`)).toBeInTheDocument();
  });

  it("대기열이 비면 빈 상태를 보인다", async () => {
    await saveTriageSettings("p1", true);
    renderAt("/projects/p1/triage");
    expect(await screen.findByRole("heading", { name: "트리아지할 이슈가 없습니다" })).toBeInTheDocument();
  });

  it("열람자는 볼 수만 있다 — 처리 버튼이 잠긴다", async () => {
    await seed();
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "viewer");
    renderAt("/projects/p1/triage");
    expect(await screen.findByText(/열람자는 대기열을 볼 수만 있습니다/)).toBeInTheDocument();
    expect(within(toolbar()).getByRole("button", { name: /^수락/ })).toBeDisabled();
  });
});
