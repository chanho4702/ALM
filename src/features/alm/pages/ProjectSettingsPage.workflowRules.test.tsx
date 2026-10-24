import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import "./ProjectSettingsPage";
import { __resetForTest, resolveSettings, setProjectCustom, updateProjectCustomSettings } from "../store/jiraStore";

function renderAt(path = "/projects/p1/settings/workflow") {
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

async function withTransition() {
  await setProjectCustom("p1", true);
  const { body } = await resolveSettings("p1");
  await updateProjectCustomSettings("p1", {
    ...body,
    transitions: [{ id: "t-done", name: "끝내기", from: ["inprogress"], to: "done" }],
  });
}

describe("워크플로 편집기 — 전환 규칙 (C1~C3)", () => {
  it("규칙 버튼으로 조건·검증·전환 화면·후처리를 정하고 저장하면 서버 본문에 그대로 실린다", async () => {
    await withTransition();
    const user = userEvent.setup();
    renderAt();
    const list = await screen.findByRole("list", { name: "전이 목록" });
    await user.click(within(list).getByRole("button", { name: "전이 끝내기 규칙" }));

    const form = await screen.findByRole("form", { name: "전환 규칙 편집" });
    await user.click(within(form).getByRole("checkbox", { name: "담당자만" }));
    await user.click(within(form).getByRole("checkbox", { name: "하위 이슈가 모두 완료일 때" }));
    await user.click(within(form).getByRole("checkbox", { name: "해결" }));
    await user.click(within(form).getByRole("checkbox", { name: "코멘트" }));
    await user.click(within(form).getByRole("radio", { name: "담당자 비우기" }));
    await user.click(within(form).getByRole("checkbox", { name: "해결 기본값 지정" }));
    await user.click(within(form).getByRole("combobox", { name: "기본 해결" }));
    await user.click(await screen.findByRole("option", { name: "하지 않음" }));
    await user.click(within(form).getByRole("button", { name: "적용" }));

    // 목록 행에 요약이 붙는다
    await waitFor(() => expect(list.querySelector(".workflow-rule-summary")?.getAttribute("aria-label")).toBe("조건: 담당자만, 하위 이슈가 모두 완료일 때 · 화면: 해결, 코멘트 · 후처리: 담당자 비우기, 해결 기본값 지정"));

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("워크플로를 저장했습니다")).toBeInTheDocument();
    const { body } = await resolveSettings("p1");
    expect(body.transitions).toEqual([
      {
        id: "t-done",
        name: "끝내기",
        from: ["inprogress"],
        to: "done",
        conditions: [
          { type: "assignee", role: null },
          { type: "subtasksDone", role: null },
        ],
        validators: [],
        screenFields: ["resolution", "comment"],
        postFunctions: [
          { type: "clearAssignee", value: null },
          { type: "setResolution", value: "WONT_DO" },
        ],
      },
    ]);
  });

  it("해결 칸·해결 후처리는 완료로 가는 전환에서만 고를 수 있다", async () => {
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    await updateProjectCustomSettings("p1", { ...body, transitions: [{ id: "t-start", name: "시작", from: ["todo"], to: "inprogress" }] });
    const user = userEvent.setup();
    renderAt();
    const list = await screen.findByRole("list", { name: "전이 목록" });
    await user.click(within(list).getByRole("button", { name: "전이 시작 규칙" }));
    const form = await screen.findByRole("form", { name: "전환 규칙 편집" });
    expect(within(form).getByRole("checkbox", { name: "해결 (완료로 가는 전환만)" })).toBeDisabled();
    expect(within(form).queryByRole("checkbox", { name: "해결 기본값 지정" })).not.toBeInTheDocument();
  });

  it("상태를 빼면 그 상태를 쓰던 전이는 정리해 저장한다(서버는 깨진 참조를 거부)", async () => {
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    await updateProjectCustomSettings("p1", {
      ...body,
      statuses: [...body.statuses, { id: "review", name: "리뷰", category: "inprogress", order: 9 }],
      transitions: [
        { id: "t1", name: "리뷰 요청", from: ["inprogress"], to: "review" },
        { id: "t2", name: "시작", from: ["todo"], to: "inprogress" },
      ],
    });
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole("list", { name: "전이 목록" });
    await user.click(screen.getByRole("button", { name: "리뷰 삭제" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("워크플로를 저장했습니다")).toBeInTheDocument();
    expect((await resolveSettings("p1")).body.transitions?.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("워크플로 편집기 — 이슈 타입별 워크플로 (C5)", () => {
  it("타입을 고르고 '기본 워크플로 따름'을 끄면 하위 집합을 고를 수 있고, 의미가 비면 경고한다", async () => {
    await setProjectCustom("p1", true);
    const user = userEvent.setup();
    renderAt();
    const section = await screen.findByRole("region", { name: "이슈 타입별 워크플로" });
    await user.click(within(section).getByRole("combobox", { name: "이슈 타입" }));
    await user.click(await screen.findByRole("option", { name: "버그" }));
    expect(within(section).getByText(/버그은\(는\) 프로젝트 기본 워크플로/)).toBeInTheDocument();

    await user.click(within(section).getByRole("switch", { name: "기본 워크플로 따름" }));
    await user.click(within(section).getByRole("checkbox", { name: "진행 중" }));
    expect(within(section).getByText("진행 중 의미의 상태가 없습니다 — 저장할 수 없습니다.")).toBeInTheDocument();
    await user.click(within(section).getByRole("checkbox", { name: "진행 중" }));
    await user.click(within(section).getByRole("radio", { name: "모든 이동 허용" }));

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("워크플로를 저장했습니다")).toBeInTheDocument();
    await waitFor(async () =>
      expect((await resolveSettings("p1")).body.workflowsByType).toEqual({
        bug: { statuses: ["todo", "inprogress", "done"], transitions: [] },
      }),
    );
  });

  it("스킴을 쓰는 프로젝트는 타입 워크플로를 읽기 전용으로 보인다", async () => {
    renderAt();
    const section = await screen.findByRole("region", { name: "이슈 타입별 워크플로" });
    expect(within(section).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(section).getByText("기본 워크플로 따름")).toBeInTheDocument();
  });
});
