import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  addProjectShortcut,
  getBanner,
  getMyPreferences,
  listProjectShortcuts,
  saveBanner,
  saveMyPreferences,
  updateProject,
} from "./jiraApi";

const PROJECT = {
  id: 3, key: "ALM", name: "ALM 제품", description: "", category: "플랫폼", leadId: 2,
  defaultAssignee: "lead", icon: "rocket", color: "purple", url: "https://example.com",
  version: 4, createdAt: "2026-08-16T00:00:00Z", updatedAt: "2026-08-16T01:00:00Z",
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function fetchSpy(handler: (path: string, init?: RequestInit) => Response) {
  return vi
    .spyOn(client, "sharedApiFetch")
    .mockImplementation((path: string, init?: RequestInit) => Promise.resolve(handler(path, init)));
}

afterEach(() => vi.restoreAllMocks());

describe("jiraApi 프로젝트 세부·바로 가기·개인 설정·배너", () => {
  it("프로젝트 세부 필드를 보내고 리더 해제는 clearLead로 표현한다", async () => {
    const spy = fetchSpy((_path, init) => response(init?.method === "PUT" ? 200 : 200, PROJECT));
    const updated = await updateProject("3", { category: "플랫폼", leadId: null, defaultAssignee: "lead", icon: "rocket" });
    const body = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(body).toMatchObject({ category: "플랫폼", clearLead: true, defaultAssignee: "lead", icon: "rocket", expectedVersion: 4 });
    expect(body.leadId).toBeUndefined();
    expect(updated).toMatchObject({ category: "플랫폼", leadId: "2", defaultAssignee: "lead", icon: "rocket", color: "purple" });
  });

  it("바로 가기는 프로젝트 경로로 만들고 id를 문자열로 옮긴다", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "POST"
        ? response(201, { id: 9, projectId: 3, name: "위키", url: "https://wiki", order: 1, createdAt: "2026-08-30T00:00:00Z" })
        : response(200, [{ id: 9, projectId: 3, name: "위키", url: "https://wiki", order: 1, createdAt: "2026-08-30T00:00:00Z" }]),
    );
    const created = await addProjectShortcut("3", { name: "위키", url: "https://wiki" });
    expect(spy).toHaveBeenCalledWith("/api/alm/projects/3/shortcuts", expect.objectContaining({ method: "POST" }));
    expect(created).toMatchObject({ id: "9", projectId: "3", order: 1 });
    expect((await listProjectShortcuts("3"))[0].name).toBe("위키");
  });

  it("개인 설정은 기본값으로 채워 읽고, 저장은 현재 값 위에 패치를 얹어 전체 문서를 보낸다", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "PUT"
        ? response(200, { notifications: { assigned: false, statusChanged: true, commented: true }, autoWatch: { created: true, commented: true, edited: false }, startPage: "projects" })
        : response(200, { notifications: { assigned: false }, startPage: null }),
    );
    expect(await getMyPreferences()).toEqual({
      notifications: { assigned: false, statusChanged: true, commented: true, mentioned: true },
      autoWatch: { created: true, commented: true, edited: false },
      startPage: "home",
      emailEnabled: false,
      mailConfigured: false,
    });
    const saved = await saveMyPreferences({ startPage: "projects" });
    const body = JSON.parse(spy.mock.calls[2][1]!.body as string);
    expect(body).toEqual({
      notifications: { assigned: false, statusChanged: true, commented: true, mentioned: true },
      autoWatch: { created: true, commented: true, edited: false },
      startPage: "projects",
      emailEnabled: false,
    });
    expect(saved.startPage).toBe("projects");
  });

  it("이메일 수신(V19)은 서버 값을 읽고 패치로 켤 수 있으며 mailConfigured는 보내지 않는다", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "PUT"
        ? response(200, { emailEnabled: true, mailConfigured: true, startPage: "home" })
        : response(200, { emailEnabled: false, mailConfigured: true }),
    );
    expect(await getMyPreferences()).toMatchObject({ emailEnabled: false, mailConfigured: true });
    const saved = await saveMyPreferences({ emailEnabled: true });
    const body = JSON.parse(spy.mock.calls[2][1]!.body as string);
    expect(body.emailEnabled).toBe(true);
    expect(body.mailConfigured).toBeUndefined();
    expect(saved).toMatchObject({ emailEnabled: true, mailConfigured: true });
  });

  it("배너는 누구나 읽고 관리자 경로로 저장한다", async () => {
    const spy = fetchSpy((path) =>
      path.includes("/admin/")
        ? response(200, { enabled: true, level: "warning", message: "점검" })
        : response(200, { enabled: false, level: "info", message: "" }),
    );
    expect(await getBanner()).toEqual({ enabled: false, level: "info", message: "" });
    const saved = await saveBanner({ enabled: true, level: "warning", message: "점검" });
    expect(spy).toHaveBeenCalledWith("/api/alm/admin/banner", expect.objectContaining({ method: "PUT" }));
    expect(saved.level).toBe("warning");
  });
});
