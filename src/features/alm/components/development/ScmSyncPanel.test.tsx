import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@chanho/react";
import {
  __resetForTest,
  deleteScmSync,
  listScmSyncs,
  saveProjectRepositories,
  saveScmSync,
  updateProjectMemberRole,
} from "../../store/jiraStore";
import { RepositoriesPanel } from "./RepositoriesPanel";

/** 프로젝트 설정 › 저장소 › 폴링 동기화(V45) — 관리자만, 토큰은 저장 뒤 입력칸을 비우고 다시 보이지 않는다, 지금 동기화 */
const REPO = "https://github.com/chanho4702/alm-front";

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

describe("폴링 동기화 패널", () => {
  it("토큰을 넣어 켜면 입력칸이 비고, 지금 동기화하면 결과가 아이콘+텍스트로 뜬다", async () => {
    const user = userEvent.setup();
    renderPanel(true);
    const item = await screen.findByTestId("scm-sync-item");
    expect(within(item).getByRole("button", { name: "폴링 켜기" }).hasAttribute("disabled")).toBe(true);
    await user.type(within(item).getByLabelText("읽기 토큰"), "ghp_secretValue");
    await user.click(within(item).getByRole("button", { name: "폴링 켜기" }));

    expect(await within(item).findByText("아직 동기화하지 않았습니다.")).toBeTruthy();
    expect(within(item).getByText("https://api.github.com")).toBeTruthy();
    expect((within(item).getByLabelText("새 읽기 토큰") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent).not.toContain("ghp_secretValue");

    await user.click(within(item).getByRole("button", { name: "지금 동기화" }));
    expect(await within(item).findByText("변경 없음")).toBeTruthy();
    expect(within(item).getByText("성공")).toBeTruthy();
    expect(screen.getByText("웹훅 + 폴링")).toBeTruthy();
  });

  it("관리자가 아니면 그리지 않는다", async () => {
    renderPanel(false);
    expect(await screen.findByText("chanho4702/alm-front")).toBeTruthy();
    expect(screen.queryByTestId("scm-sync-item")).toBeNull();
  });
});

describe("폴링 동기화(목업 스토어)", () => {
  it("등록 저장소만·처음엔 토큰 필수·API 주소 호스트 가드·등록 해제 시 삭제", async () => {
    await expect(saveScmSync("p1", { repositoryUrl: "https://github.com/x/y", provider: "GITHUB", token: "t" })).rejects.toThrow(
      "먼저 저장소를 프로젝트에 등록하세요",
    );
    await expect(saveScmSync("p1", { repositoryUrl: REPO, provider: "GITHUB" })).rejects.toThrow("읽기 토큰을 입력하세요");
    await expect(
      saveScmSync("p1", { repositoryUrl: REPO, provider: "GITHUB", apiBaseUrl: "http://169.254.169.254", token: "t" }),
    ).rejects.toThrow("API 주소의 호스트는 저장소 호스트(github.com)여야 합니다");

    const sync = await saveScmSync("p1", { repositoryUrl: REPO, provider: "GITHUB", token: "t" });
    expect(sync.apiBaseUrl).toBe("https://api.github.com");
    expect(JSON.stringify(await listScmSyncs("p1"))).not.toContain('"t"');
    await saveProjectRepositories("p1", [{ url: "https://github.com/chanho4702/alm-backend" }]);
    expect((await listScmSyncs("p1")).repositories).toEqual([]);
    await expect(deleteScmSync("p1", sync.id)).rejects.toThrow("동기화 설정을 찾을 수 없습니다");
  });

  it("관리자만", async () => {
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    await expect(listScmSyncs("p1")).rejects.toThrow("프로젝트 관리자만 할 수 있습니다");
  });
});
