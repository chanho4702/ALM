import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import type { AutomationRuleInput } from "../store/types";

/**
 * 규칙 목록 읽기만 갈아끼울 수 있게 한다(503 재현) — `jiraStore`는 구현 함수를 상수로 붙들어
 * 나중 `spyOn`이 화면에 닿지 않는다(GlobalSideNav.savedFilters.test와 같은 방식). 나머지는 실제 목업.
 */
const stub = vi.hoisted(() => ({ listRules: null as null | (() => Promise<never>) }));

vi.mock("../store/jiraStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store/jiraStore")>();
  return {
    ...actual,
    listAutomationRules: (projectId: string) => (stub.listRules ? stub.listRules() : actual.listAutomationRules(projectId)),
  };
});

const { App } = await import("../../../app/App");
const {
  __resetForTest,
  createAutomationRule,
  getIssueByKey,
  listAutomationRules,
  moveIssue,
  setIssueFlag,
  updateAutomationRule,
  updateProjectMemberRole,
} = await import("../store/jiraStore");

function renderAt(path = "/projects/p1/settings/automation") {
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
  stub.listRules = null;
});

const unflagOnDone: AutomationRuleInput = {
  name: "끝나면 막힘 해제",
  trigger: { type: "ISSUE_TRANSITIONED", fromStatuses: [], toStatuses: ["done"] },
  condition: "flagged = true",
  actions: [
    { type: "SET_FIELD", field: "flagged", value: false },
    { type: "COMMENT", body: "완료되어 플래그를 내렸습니다" },
  ],
};

async function ruleList() {
  return screen.findByRole("list", { name: "자동화 규칙 목록" });
}

describe("프로젝트 설정 › 자동화", () => {
  it("편집기로 전환 트리거 규칙을 만들면 목록에 보인다", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole("button", { name: "규칙 만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "자동화 규칙 만들기" });
    await user.type(within(dialog).getByLabelText("규칙 이름 *"), "완료 시 코멘트");

    await user.click(within(dialog).getByRole("combobox", { name: "도착 상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));
    await user.keyboard("{Escape}");

    await user.click(within(dialog).getByRole("button", { name: "액션 추가" }));
    await user.click(await screen.findByRole("menuitem", { name: "코멘트 남기기" }));
    await user.type(await within(dialog).findByLabelText("액션 1 코멘트 내용"), "끝났습니다");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    expect(await screen.findByText("규칙을 만들었습니다")).toBeInTheDocument();
    const list = await ruleList();
    expect(within(list).getByRole("button", { name: "완료 시 코멘트" })).toBeInTheDocument();
    expect(within(list).getByText("상태 전환됨: 아무 상태 → 완료")).toBeInTheDocument();
    const [saved] = await listAutomationRules("p1");
    expect(saved).toMatchObject({
      name: "완료 시 코멘트",
      trigger: { type: "ISSUE_TRANSITIONED", toStatuses: ["done"] },
      actions: [{ type: "COMMENT", body: "끝났습니다" }],
      allowRuleTrigger: false,
    });
  });

  it("규칙 이름을 고치고, 액션 순서를 키보드 버튼으로 바꾼다", async () => {
    const user = userEvent.setup();
    await createAutomationRule("p1", unflagOnDone);
    renderAt();
    await user.click(within(await ruleList()).getByRole("button", { name: "끝나면 막힘 해제" }));
    const dialog = await screen.findByRole("dialog", { name: "자동화 규칙 고치기" });
    expect(within(dialog).getByText(/실행 주체: 김찬호/)).toBeInTheDocument();
    const name = within(dialog).getByLabelText("규칙 이름 *");
    await user.clear(name);
    await user.type(name, "완료되면 플래그 내리기");
    await user.click(within(dialog).getByRole("button", { name: "액션 2 위로" }));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("규칙을 저장했습니다")).toBeInTheDocument();
    expect(await within(await ruleList()).findByRole("button", { name: "완료되면 플래그 내리기" })).toBeInTheDocument();
    const [saved] = await listAutomationRules("p1");
    expect(saved.version).toBe(2);
    expect(saved.actions.map((a) => a.type)).toEqual(["COMMENT", "SET_FIELD"]);
  });

  it("스위치로 끄면 버전을 실어 저장한다", async () => {
    const user = userEvent.setup();
    await createAutomationRule("p1", unflagOnDone);
    renderAt();
    const toggle = await within(await ruleList()).findByRole("switch", { name: "끝나면 막힘 해제 사용" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(await screen.findByText('"끝나면 막힘 해제" 규칙을 껐습니다')).toBeInTheDocument();
    await waitFor(async () => expect((await listAutomationRules("p1"))[0]).toMatchObject({ enabled: false, version: 2 }));
    expect(await within(await ruleList()).findByText("꺼짐")).toBeInTheDocument();
  });

  it("규칙이 돌면 감사 로그에 성공과 이슈 키가 남는다", async () => {
    const user = userEvent.setup();
    await createAutomationRule("p1", unflagOnDone);
    const alm3 = (await getIssueByKey("ALM-3"))!;
    await setIssueFlag(alm3.id, true);
    await moveIssue(alm3.id, { status: "done" });
    renderAt();
    await ruleList();
    await user.click(screen.getByRole("tab", { name: "감사 로그" }));
    const log = await screen.findByRole("list", { name: "자동화 감사 로그" });
    const [row] = within(log).getAllByRole("listitem");
    expect(within(row).getByText("성공")).toBeInTheDocument();
    expect(within(row).getByText("끝나면 막힘 해제")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "ALM-3 열기" })).toBeInTheDocument();
    expect(within(row).getByText("상태 전환됨 · 연쇄 1단계 · 액션 2개 실행")).toBeInTheDocument();
  });

  it("자동으로 꺼진 규칙은 사유를 경고로 보인다", async () => {
    await createAutomationRule("p1", {
      name: "플래그 바뀌면 코멘트",
      trigger: { type: "FIELD_CHANGED", fields: ["flagged"] },
      actions: [{ type: "COMMENT", body: "플래그가 바뀌었습니다" }],
    });
    const alm2 = (await getIssueByKey("ALM-2"))!;
    // 분당 30회를 넘기면 RATE_LIMITED + 자동 비활성
    for (let i = 0; i < 31; i += 1) await setIssueFlag(alm2.id, i % 2 === 0);
    renderAt();
    const list = await ruleList();
    expect(await within(list).findByText(/자동으로 꺼짐 — 실행 상한\(분당 30회\)을 넘어 자동으로 껐습니다/)).toBeInTheDocument();
    expect(within(list).getByRole("switch", { name: "플래그 바뀌면 코멘트 사용" })).not.toBeChecked();
  });

  it("프로젝트 관리자가 아니면 설명만 보인다", async () => {
    await createAutomationRule("p1", unflagOnDone);
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    renderAt();
    expect(await screen.findByText("프로젝트 관리자만 자동화 규칙을 보고 고칠 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "자동화 규칙 목록" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "규칙 만들기" })).not.toBeInTheDocument();
  });

  it("⋯ 메뉴에서 확인 후 삭제한다", async () => {
    const user = userEvent.setup();
    await createAutomationRule("p1", unflagOnDone);
    renderAt();
    await user.click(within(await ruleList()).getByRole("button", { name: "끝나면 막힘 해제 더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "삭제" }));
    const confirm = await screen.findByRole("dialog", { name: "자동화 규칙 삭제" });
    await user.click(within(confirm).getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("아직 자동화 규칙이 없습니다")).toBeInTheDocument();
    expect(await listAutomationRules("p1")).toEqual([]);
  });

  it("⋯ 메뉴의 복제는 꺼진 사본을 만든다", async () => {
    const user = userEvent.setup();
    await createAutomationRule("p1", unflagOnDone);
    renderAt();
    await user.click(within(await ruleList()).getByRole("button", { name: "끝나면 막힘 해제 더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "복제" }));
    const dialog = await screen.findByRole("dialog", { name: "자동화 규칙 만들기" });
    expect(within(dialog).getByLabelText("규칙 이름 *")).toHaveValue("끝나면 막힘 해제 (복사본)");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    expect(await within(await ruleList()).findByRole("button", { name: "끝나면 막힘 해제 (복사본)" })).toBeInTheDocument();
    const copies = await listAutomationRules("p1");
    expect(copies.map((r) => [r.name, r.enabled])).toEqual([
      ["끝나면 막힘 해제", true],
      ["끝나면 막힘 해제 (복사본)", false],
    ]);
  });

  it("스토어 검증 오류는 편집기 안에 남고 초안을 지킨다", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole("button", { name: "규칙 만들기" }));
    const dialog = await screen.findByRole("dialog", { name: "자동화 규칙 만들기" });
    await user.type(within(dialog).getByLabelText("규칙 이름 *"), "액션 없는 규칙");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));
    expect(await within(dialog).findByText("액션을 하나 이상 넣으세요")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("규칙 이름 *")).toHaveValue("액션 없는 규칙");
    expect(await listAutomationRules("p1")).toEqual([]);
  });
  it("목록을 못 읽으면(503) '없음'이 아니라 오류와 다시 시도를 보인다", async () => {
    const user = userEvent.setup();
    await createAutomationRule("p1", unflagOnDone);
    stub.listRules = () => {
      stub.listRules = null;
      return Promise.reject(Object.assign(new Error("권한 서비스를 사용할 수 없습니다"), { status: 503 }));
    };
    renderAt();
    expect(await screen.findByText(/자동화 규칙을 불러오지 못했습니다 — 권한 서비스를 사용할 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText("아직 자동화 규칙이 없습니다")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await within(await ruleList()).findByRole("button", { name: "끝나면 막힘 해제" })).toBeInTheDocument();
  });

  it("고치는 사이 남이 먼저 저장하면(409) 충돌 배너에서 최신 내용을 불러온다", async () => {
    const user = userEvent.setup();
    const rule = await createAutomationRule("p1", unflagOnDone);
    renderAt();
    await user.click(within(await ruleList()).getByRole("button", { name: "끝나면 막힘 해제" }));
    const dialog = await screen.findByRole("dialog", { name: "자동화 규칙 고치기" });
    await updateAutomationRule(rule.id, { ...unflagOnDone, name: "남이 바꾼 이름" }, rule.version);
    await user.type(within(dialog).getByLabelText("규칙 이름 *"), "!");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await within(dialog).findByText(/다른 사용자가 먼저 이 규칙을 수정했습니다/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("규칙 이름 *")).toHaveValue("끝나면 막힘 해제!");
    await user.click(within(dialog).getByRole("button", { name: "최신 내용 불러오기" }));
    await waitFor(() => expect(within(dialog).getByLabelText("규칙 이름 *")).toHaveValue("남이 바꾼 이름"));
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await screen.findByText("규칙을 저장했습니다")).toBeInTheDocument();
    expect((await listAutomationRules("p1"))[0]).toMatchObject({ name: "남이 바꾼 이름", version: 3 });
  });
});
