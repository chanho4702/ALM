import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  addProjectMember,
  getMyProjectRole,
  listProjectMembers,
  listUsers,
  removeProjectMember,
  updateProjectMemberRole,
} from "./jiraApi";

const MEMBERS = [
  { id: 1, displayName: "Alice", email: "a@x", status: "ACTIVE" },
  { id: 2, displayName: "Bob", email: "b@x", status: "ACTIVE" },
  { id: 3, displayName: "Ghost", email: "g@x", status: "INACTIVE" },
];

const GRANTS = [
  { id: 10, subjectType: "USER", subjectId: 2, resourceType: "PROJECT", resourceId: "3", role: "EDITOR" },
  { id: 11, subjectType: "USER", subjectId: 1, resourceType: "PROJECT", resourceId: "3", role: "ADMIN" },
  { id: 12, subjectType: "TEAM", subjectId: 7, resourceType: "PROJECT", resourceId: "3", role: "VIEWER" },
];

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

describe("jiraApi 사용자 디렉터리·멤버 (org-service)", () => {
  it("사용자 목록은 ACTIVE 멤버만 보여준다", async () => {
    fetchSpy(() => response(200, MEMBERS));
    expect(await listUsers()).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
  });

  it("프로젝트 멤버는 USER grant를 이름과 합쳐 역할 높은 순으로 보여준다", async () => {
    const spy = fetchSpy((path) => (path.startsWith("/api/org/grants") ? response(200, GRANTS) : response(200, MEMBERS)));
    const members = await listProjectMembers("3");
    expect(spy).toHaveBeenCalledWith("/api/org/grants?resourceType=PROJECT&resourceId=3");
    expect(members).toEqual([
      { user: { id: "1", name: "Alice" }, role: "admin" },
      { user: { id: "2", name: "Bob" }, role: "editor" },
    ]);
  });

  it("멤버 추가는 PROJECT USER grant를 만든다", async () => {
    const spy = fetchSpy(() => response(201, GRANTS[0]));
    await addProjectMember("3", "2", "editor");
    expect(spy).toHaveBeenCalledWith(
      "/api/org/grants",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ subjectType: "USER", subjectId: 2, resourceType: "PROJECT", resourceId: "3", role: "EDITOR" }),
      }),
    );
  });

  it("역할 변경은 기존 grant를 지우고 새로 만들며, 마지막 관리자는 강등할 수 없다", async () => {
    const spy = fetchSpy((path, init) => {
      if (init?.method === "DELETE") return response(204);
      if (init?.method === "POST") return response(201, GRANTS[0]);
      return path.startsWith("/api/org/grants") ? response(200, GRANTS) : response(200, MEMBERS);
    });
    await updateProjectMemberRole("3", "2", "admin");
    const methods = spy.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);
    expect(methods).toContain("DELETE /api/org/grants/10");
    expect(methods).toContain("POST /api/org/grants");

    await expect(updateProjectMemberRole("3", "1", "viewer")).rejects.toThrow("프로젝트에는 관리자가 최소 한 명 필요합니다");
    await expect(removeProjectMember("3", "1")).rejects.toThrow("프로젝트에는 관리자가 최소 한 명 필요합니다");
    await expect(removeProjectMember("3", "9")).rejects.toThrow("프로젝트 멤버가 아닙니다");
  });

  it("내 역할은 me/permissions의 PROJECT grant(또는 GLOBAL ADMIN)에서 읽고, 없으면 null", async () => {
    fetchSpy(() =>
      response(200, [
        { resourceType: "PROJECT", resourceId: "3", role: "EDITOR" },
        { resourceType: "SPACE", resourceId: "3", role: "ADMIN" },
      ]),
    );
    expect(await getMyProjectRole("3")).toBe("editor");
    expect(await getMyProjectRole("4")).toBeNull();
    vi.restoreAllMocks();
    fetchSpy(() => response(200, [{ resourceType: "GLOBAL", resourceId: null, role: "ADMIN" }]));
    expect(await getMyProjectRole("4")).toBe("admin");
  });
});
