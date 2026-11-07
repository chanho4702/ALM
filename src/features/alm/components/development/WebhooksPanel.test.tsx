import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@chanho/react";
import { __resetForTest, deleteRepositoryWebhook, listRepositoryWebhooks } from "../../store/jiraStore";
import { RepositoriesPanel } from "./RepositoriesPanel";

/** 프로젝트 설정 › 저장소 › 웹훅(V44) — 관리자만, 시크릿은 발급 직후 한 번만, Payload URL은 오리진 + 경로 */
function renderPanel(canManage: boolean) {
  return render(
    <ToastProvider>
      <RepositoriesPanel projectId="p1" projectKey="ALM" canManage={canManage} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("저장소 웹훅 패널", () => {
  it("만들면 Payload URL과 시크릿(한 번만)을 보이고, 다시 그리면 시크릿은 사라진다", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel(true);
    const item = await screen.findByTestId("webhook-item");
    expect(within(item).getByText("chanho4702/alm-front")).toBeTruthy();
    await user.click(within(item).getByRole("button", { name: "웹훅 만들기" }));

    expect(await within(item).findByText(/시크릿은 지금만 보입니다/)).toBeTruthy();
    const { webhooks } = await listRepositoryWebhooks("p1");
    expect(webhooks).toHaveLength(1);
    expect(within(item).getByText(`${window.location.origin}${webhooks[0].payloadPath}`)).toBeTruthy();
    expect(within(item).getByText(/^[0-9a-f]{64}$/)).toBeTruthy();
    expect(within(item).getByText("아직 받은 이벤트가 없습니다.")).toBeTruthy();
    expect(within(item).getByRole("button", { name: "시크릿 재발급" })).toBeTruthy();
    // 제공자는 아이콘 + 텍스트
    expect(within(item).getByText("GitHub")).toBeTruthy();

    unmount();
    renderPanel(true);
    const again = await screen.findByTestId("webhook-item");
    expect(await within(again).findByRole("button", { name: "시크릿 재발급" })).toBeTruthy();
    expect(within(again).queryByText(/시크릿은 지금만 보입니다/)).toBeNull();
    expect(within(again).queryByText(/^[0-9a-f]{64}$/)).toBeNull();

    await deleteRepositoryWebhook("p1", webhooks[0].id);
  });

  it("관리자가 아니면 웹훅 카드를 그리지 않는다", async () => {
    renderPanel(false);
    expect(await screen.findByText("chanho4702/alm-front")).toBeTruthy();
    expect(screen.queryByTestId("webhook-item")).toBeNull();
    expect(screen.queryByRole("button", { name: "웹훅 만들기" })).toBeNull();
  });
});
