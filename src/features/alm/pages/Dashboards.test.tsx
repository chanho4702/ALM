import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, addWorklog, createDashboard, getIssueByKey, listDashboards } from "../store/jiraStore";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("대시보드 (지라 Dashboards)", () => {
  it("만들면 바로 열리고, 가젯을 추가하면 그리드에 놓인다", async () => {
    const user = userEvent.setup();
    renderAt("/dashboards");
    // 만들기 폼은 기본 접힘 — 버튼을 누르면 인라인 폼이 그 자리를 대신한다
    await user.click(await screen.findByRole("button", { name: "대시보드 만들기" }));
    await user.type(await screen.findByLabelText("새 대시보드 이름"), "팀 현황");
    await user.click(screen.getByRole("button", { name: "대시보드 만들기" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/\/dashboards\/d-/));
    expect(await screen.findByRole("heading", { name: "팀 현황" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "가젯 추가" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "가젯 추가" });
    await user.click(within(dialog).getByRole("combobox", { name: "가젯" }));
    await user.click(await screen.findByRole("option", { name: "담당자별 이슈" }));
    await user.click(within(dialog).getByRole("button", { name: "추가" }));
    expect(await screen.findByText("가젯을 추가했습니다")).toBeInTheDocument();
    const gadget = await screen.findByRole("region", { name: "담당자별 이슈" });
    expect(await within(gadget).findByText("미지정")).toBeInTheDocument();
    expect((await listDashboards())[0].gadgets).toHaveLength(1);
  });

  it("워크로그 가젯은 기간 안의 기록 시간을 사람별로 합산한다", async () => {
    const issue = await getIssueByKey("ALM-2");
    await addWorklog(issue!.id, { hours: 2.5, workedOn: today() });
    const board = await createDashboard({
      name: "시간",
      gadgets: [{ id: "g1", type: "worklog-summary", column: 0, config: { projectId: "p1", period: 7 } }],
    });
    renderAt(`/dashboards/${board.id}`);
    const gadget = await screen.findByRole("region", { name: "기록 시간(워크로그)" });
    // 시드 워크로그(같은 사람)에 2.5h가 더해진다 — 사람별 표와 기간 표기를 확인한다
    await waitFor(() => expect(gadget).toHaveTextContent("김찬호"));
    expect(gadget).toHaveTextContent(/총 \d+(\.\d+)?h/);
    expect(gadget).toHaveTextContent("최근 7일");
  });
});

describe("워크로그 리포트", () => {
  it("리포트 종류에서 워크로그를 고르면 사람별 표가 나온다", async () => {
    const user = userEvent.setup();
    const issue = await getIssueByKey("ALM-2");
    await addWorklog(issue!.id, { hours: 4, workedOn: today() });
    renderAt("/projects/p1/reports");
    await user.click(await screen.findByRole("combobox", { name: "리포트" }));
    await user.click(await screen.findByRole("option", { name: "워크로그" }));
    const card = await screen.findByTestId("worklog-report");
    expect(card).toHaveTextContent(/4h|4\.5h|6h|6\.5h/); // 시드 워크로그가 같은 사람에게 더해질 수 있다
    expect(within(card).getByRole("table")).toBeInTheDocument();
  });
});
