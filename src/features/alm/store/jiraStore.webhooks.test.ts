import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  deleteRepositoryWebhook,
  issueRepositoryWebhook,
  listRepositoryWebhooks,
  saveProjectRepositories,
  updateProjectMemberRole,
} from "./jiraStore";

/** 저장소 웹훅(V44) — 목업이 서버 규칙(alm-backend RepositoryWebhookService)을 같은 문구로 흉내 내는지 */
const REPO = "https://github.com/chanho4702/alm-front";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("저장소 웹훅(목업)", () => {
  it("등록된 저장소에만 만들고, 재발급은 경로를 유지한 채 시크릿만 바꾼다", async () => {
    await expect(
      issueRepositoryWebhook("p1", { repositoryUrl: "https://github.com/someone/else", provider: "GITHUB" }),
    ).rejects.toThrow("먼저 저장소를 프로젝트에 등록하세요: https://github.com/someone/else");

    const first = await issueRepositoryWebhook("p1", { repositoryUrl: `${REPO}.git`, provider: "GITHUB" });
    expect(first.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(first.webhook.payloadPath).toMatch(/^\/api\/alm\/webhooks\/github\/[A-Za-z0-9_-]+$/);
    const second = await issueRepositoryWebhook("p1", { repositoryUrl: REPO, provider: "GITHUB" });
    expect(second.webhook.payloadPath).toBe(first.webhook.payloadPath);
    expect(second.secret).not.toBe(first.secret);

    const list = await listRepositoryWebhooks("p1");
    expect(list.encryptionConfigured).toBe(true);
    expect(list.webhooks).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(second.secret);
  });

  it("저장소 등록에서 빠지면 웹훅도 지워지고, 삭제는 한 번만 된다", async () => {
    const issued = await issueRepositoryWebhook("p1", { repositoryUrl: REPO, provider: "GITLAB" });
    expect(issued.webhook.payloadPath).toContain("/gitlab/");
    await deleteRepositoryWebhook("p1", issued.webhook.id);
    await expect(deleteRepositoryWebhook("p1", issued.webhook.id)).rejects.toThrow("웹훅을 찾을 수 없습니다");

    await issueRepositoryWebhook("p1", { repositoryUrl: REPO, provider: "GITHUB" });
    await saveProjectRepositories("p1", [{ url: "https://github.com/chanho4702/alm-backend" }]);
    expect((await listRepositoryWebhooks("p1")).webhooks).toEqual([]);
  });

  it("관리자만 — 편집자는 목록도 거절", async () => {
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    await expect(listRepositoryWebhooks("p1")).rejects.toThrow("프로젝트 관리자만 할 수 있습니다");
  });
});
