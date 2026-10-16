import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, getIssueByKey, updateIssue } from "../store/jiraStore";
import { typeInEditor } from "./editor/editorTestUtils";

/**
 * 동시 편집 — 모달을 연 뒤 동료가 먼저 저장하면 내 저장은 409로 막히고, 입력은 버려지지 않으며,
 * 사용자가 "최신 내용 불러오기"(버림)나 "내 변경 다시 적용"(최신 버전 기준)을 직접 고른다.
 */
function renderModal() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/projects/p1/board?issue=ALM-3"]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function openAndCollide() {
  const user = userEvent.setup();
  renderModal();
  // 파일의 첫 마운트는 지연 청크(보드·모달)를 처음 받는다 — 병렬 실행 경합에서 기본 5초를 넘길 수 있다
  const dialog = await screen.findByRole("dialog", { name: "ALM-3" }, { timeout: 12_000 });
  await within(dialog).findByLabelText("설명");
  // 내가 모달을 연 뒤 동료가 먼저 저장했다
  const seen = (await getIssueByKey("ALM-3"))!;
  await updateIssue(seen.id, { description: "<p>동료가 쓴 설명</p>" }, seen.version);
  typeInEditor("설명", "내 초안 문장");
  await user.click(within(dialog).getByRole("button", { name: "설명 저장" }));
  return { user, dialog };
}

describe("IssueDetailModal 저장 충돌(409)", () => {
  it("동료의 저장을 덮어쓰지 않고, 내 입력을 남긴 채 선택지를 보여 준다", async () => {
    const { dialog } = await openAndCollide();
    expect(await within(dialog).findByText(/다른 사용자가 이 이슈를 먼저 수정해/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "최신 내용 불러오기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "내 변경 다시 적용(최신 버전 기준)" })).toBeInTheDocument();
    // 서버(목업)는 동료 값 그대로, 내 초안은 에디터에 남아 있다
    expect((await getIssueByKey("ALM-3"))!.description).toBe("<p>동료가 쓴 설명</p>");
    expect(within(dialog).getByText(/내 초안 문장/)).toBeInTheDocument();
  });

  it("'내 변경 다시 적용'을 고르면 최신 버전 기준으로 내 초안을 저장한다", async () => {
    const { user, dialog } = await openAndCollide();
    await user.click(await within(dialog).findByRole("button", { name: "내 변경 다시 적용(최신 버전 기준)" }));
    await waitFor(async () => {
      expect((await getIssueByKey("ALM-3"))!.description).toContain("내 초안 문장");
    });
    expect(within(dialog).queryByRole("button", { name: "최신 내용 불러오기" })).not.toBeInTheDocument();
    expect(await screen.findByText("설명을 저장했습니다")).toBeInTheDocument();
  });

  it("충돌 뒤 더 고쳐 쓴 다음 다시 적용하면 누른 순간의 초안을 저장한다(실패 당시 값이 아니라)", async () => {
    const { user, dialog } = await openAndCollide();
    await within(dialog).findByRole("button", { name: "내 변경 다시 적용(최신 버전 기준)" });
    typeInEditor("설명", " 그리고 덧붙인 문장");
    await user.click(within(dialog).getByRole("button", { name: "내 변경 다시 적용(최신 버전 기준)" }));
    await waitFor(async () => {
      const saved = (await getIssueByKey("ALM-3"))!.description;
      expect(saved).toContain("내 초안 문장");
      expect(saved).toContain("그리고 덧붙인 문장");
    });
  });

  it("'최신 내용 불러오기'를 고르면 내 초안을 버리고 동료의 설명을 보여 준다", async () => {
    const { user, dialog } = await openAndCollide();
    await user.click(await within(dialog).findByRole("button", { name: "최신 내용 불러오기" }));
    expect(await within(dialog).findByText("동료가 쓴 설명")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByText(/내 초안 문장/)).not.toBeInTheDocument());
    expect(within(dialog).queryByRole("button", { name: "최신 내용 불러오기" })).not.toBeInTheDocument();
    expect((await getIssueByKey("ALM-3"))!.description).toBe("<p>동료가 쓴 설명</p>");
  });
});
