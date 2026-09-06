import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
// 이 화면은 App에서 lazy()로 쪼개져 있다. 전체 스위트를 병렬로 돌릴 때 첫 findBy가 청크 로딩까지
// 기다리다 한도(5s)를 넘기므로, 수집 시점에 미리 올려 lazy 해석이 즉시 끝나게 한다.
import "./ReportsPage";
import {
  __resetForTest,
  createSprint,
  getIssueByKey,
  listSprints,
  updateIssue,
} from "../store/jiraStore";

/** 이력 기능 도입 전 데이터를 흉내 — localStorage의 changes만 비운다 */
async function dropChangeHistory() {
  await listSprints("p1"); // 시드를 만들어 localStorage에 쓰게 한다
  const raw = localStorage.getItem("alm.jira.v1");
  if (!raw) throw new Error("시드가 없습니다");
  const data = JSON.parse(raw) as { changes: unknown[] };
  data.changes = [];
  localStorage.setItem("alm.jira.v1", JSON.stringify(data));
  __resetForTest(); // 스토어 메모리 캐시를 버려 저장소에서 다시 읽게 한다
}

function renderReports() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/reports"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("ReportsPage", () => {
  it("활성 스프린트의 번다운을 표로도 제공하고 미입력을 경고한다", async () => {
    renderReports();

    const burndown = await screen.findByRole("region", { name: "번다운" });
    // 시드: 5일 전 시작, 이슈 5건 중 1건이 1일 전 완료 → 이슈 수 기준 5 → 4
    expect(within(burndown).getByText(/예상 미입력 4건/)).toBeInTheDocument();

    // 시드는 ALM-2의 8h만 입력돼 있어 미입력 4건 — 그러면 이슈 수 기준이 기본이다(시간 기준은 빈 이슈를 0으로 센다)
    const table = within(burndown).getByRole("table", { name: "번다운 값" });
    const rows = within(table).getAllByRole("row").slice(1); // 머리글 제외
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows[0]).toHaveTextContent("5건");
    expect(within(burndown).getByRole("radio", { name: "이슈 수" })).toBeChecked();
  });

  it("단위를 이슈 수로 바꾸면 잔여가 건수로 계산된다", async () => {
    renderReports();
    const user = userEvent.setup();

    const burndown = await screen.findByRole("region", { name: "번다운" });
    await user.click(within(burndown).getByRole("radio", { name: "이슈 수" }));

    const table = within(burndown).getByRole("table", { name: "번다운 값" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("5");
  });

  it("이슈가 한 번도 없던 스프린트는 차트 대신 사유를 말한다", async () => {
    const sprint = await createSprint("p1"); // 이슈가 없는 계획 스프린트
    renderReports();
    const user = userEvent.setup();

    await screen.findByRole("region", { name: "번다운" });
    await user.click(screen.getByRole("combobox", { name: "스프린트" }));
    await user.click(await screen.findByRole("option", { name: new RegExp(sprint.name) }));

    expect(await screen.findByText("이 스프린트에는 이슈가 없습니다.")).toBeInTheDocument();
  });

  it("창설 이력이 없는 이슈가 있으면 평평한 선의 사유를 알린다", async () => {
    // 이력 없이 이슈만 있는 상태를 만든다 (기능 도입 전 데이터를 흉내)
    await dropChangeHistory();
    renderReports();

    const burndown = await screen.findByRole("region", { name: "번다운" });
    expect(within(burndown).getByText(/변경 이력이 없어/)).toBeInTheDocument();
  });

  it("스프린트 리포트가 완료·미완료·스코프 변경을 나눠 보여준다", async () => {
    renderReports();

    const report = await screen.findByRole("region", { name: "스프린트 리포트" });
    expect(within(report).getByText("완료 1건")).toBeInTheDocument();
    expect(within(report).getByText("미완료 4건")).toBeInTheDocument();
    expect(within(report).getByText("ALM-1")).toBeInTheDocument();
  });

  it("완료됨이 아닌 해결은 아이콘 + 이름으로 드러난다", async () => {
    const alm1 = await getIssueByKey("ALM-1");
    await updateIssue(alm1!.id, { resolution: "duplicate" });
    renderReports();

    const report = await screen.findByRole("region", { name: "스프린트 리포트" });
    const done = within(report).getByRole("button", { name: /ALM-1/ });
    expect(within(done).getByTestId("resolution-glyph-duplicate")).toBeInTheDocument();
    // 아이콘만 두지 않는다 — 이름은 메타 텍스트가 갖는다
    expect(done).toHaveTextContent("중복");
  });

  it("리포트의 이슈를 누르면 상세 모달이 열린다", async () => {
    renderReports();
    const user = userEvent.setup();

    const report = await screen.findByRole("region", { name: "스프린트 리포트" });
    await user.click(within(report).getByRole("button", { name: /ALM-1/ }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("프로젝트 스캐폴드 구성");
  });
});

describe("ReportsPage 확장 리포트", () => {
  it("리포트 종류를 바꾸면 번업·벨로시티·누적 흐름도·컨트롤 차트가 표와 함께 나온다", async () => {
    const user = userEvent.setup();
    renderReports();
    await screen.findByRole("region", { name: "번다운" });

    const pick = async (label: string) => {
      await user.click(screen.getByRole("combobox", { name: "리포트" }));
      await user.click(await screen.findByRole("option", { name: label }));
    };

    await pick("번업");
    expect(await screen.findByRole("region", { name: "번업" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "번업 값" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "번다운" })).not.toBeInTheDocument();

    await pick("벨로시티");
    const velocity = await screen.findByRole("region", { name: "벨로시티" });
    expect(velocity).toHaveTextContent(/완료된 스프린트가 없습니다|평균 완료/);
    expect(screen.queryByRole("region", { name: "스프린트 리포트" })).not.toBeInTheDocument();

    await pick("누적 흐름도");
    const flow = await screen.findByRole("region", { name: "누적 흐름도" });
    expect(within(flow).getByRole("table", { name: "누적 흐름 값" })).toBeInTheDocument();
    // 시드 8건: 마지막 날 합계가 8이다
    const rows = within(flow).getAllByRole("row");
    const lastCells = within(rows[rows.length - 1]).getAllByRole("cell").map((c) => Number(c.textContent));
    expect(lastCells[1] + lastCells[2] + lastCells[3]).toBe(8);

    await pick("컨트롤 차트");
    expect(await screen.findByRole("region", { name: "컨트롤 차트" })).toHaveTextContent(/사이클 타임|완료된 이슈가 없습니다/);
  });
});
