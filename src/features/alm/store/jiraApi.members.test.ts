import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  __resetForTest,
  addProjectMember,
  getMyOrgProfile,
  getMyProjectRole,
  hasAnyProjectAdmin,
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

afterEach(() => {
  vi.restoreAllMocks();
  __resetForTest();
});

describe("jiraApi 사용자 디렉터리·멤버 (org-service)", () => {
  it("사용자 목록은 ACTIVE 멤버만 보여준다 (행에 아바타가 없으면 avatarUrl은 null)", async () => {
    fetchSpy((path) => (path === "/api/org/members" ? response(200, MEMBERS) : response(404)));
    expect(await listUsers()).toEqual([
      { id: "1", name: "Alice", avatarUrl: null },
      { id: "2", name: "Bob", avatarUrl: null },
    ]);
  });

  it("내 조직 프로필은 /api/org/me 하나로 읽는다 — 상태·전역 역할·팀", async () => {
    const spy = fetchSpy(() =>
      response(200, {
        id: 5,
        displayName: "Alice",
        email: "a@x",
        status: "SUSPENDED",
        kind: "HUMAN",
        globalRoles: ["ADMIN"],
        teams: [{ id: 2, name: "플랫폼", role: "LEAD" }],
        joinedVia: "INVITE",
      }),
    );
    expect(await getMyOrgProfile()).toEqual({
      id: "5",
      displayName: "Alice",
      email: "a@x",
      status: "SUSPENDED",
      kind: "HUMAN",
      globalRoles: ["ADMIN"],
      teams: [{ id: "2", name: "플랫폼", role: "LEAD" }],
      joinedVia: "INVITE",
    });
    expect(spy).toHaveBeenCalledWith("/api/org/me");
  });

  it("상태를 안 주는 서버(구버전)는 ACTIVE로 읽는다 — PENDING으로 가정하면 멀쩡한 사용자가 갇힌다", async () => {
    fetchSpy(() => response(200, { id: 5, displayName: "Alice" }));
    const profile = await getMyOrgProfile();
    expect(profile.status).toBe("ACTIVE");
    expect(profile.globalRoles).toEqual([]);
  });

  it("조회가 실패하면 던진다 — 게이트가 상태를 모른 채 앱을 열면 안 된다", async () => {
    fetchSpy(() => response(503, { error: "권한 서비스에 연결할 수 없습니다" }));
    await expect(getMyOrgProfile()).rejects.toThrow("권한 서비스에 연결할 수 없습니다");
  });

  it("사용자 검색은 서버에 q를 넘긴다 — 전체를 받아 화면에서 자르지 않는다", async () => {
    const spy = fetchSpy(() => response(200, MEMBERS));
    await listUsers({ q: " 앨 리스 " });
    expect(spy).toHaveBeenCalledWith("/api/org/members?q=%EC%95%A8%20%EB%A6%AC%EC%8A%A4");
    await listUsers({ q: "   " });
    expect(spy).toHaveBeenLastCalledWith("/api/org/members");
  });

  it("프로젝트 멤버는 USER grant를 이름과 합쳐 역할 높은 순으로 보여준다", async () => {
    const spy = fetchSpy((path) => (path.startsWith("/api/org/grants") ? response(200, GRANTS) : response(200, MEMBERS)));
    const members = await listProjectMembers("3");
    expect(spy).toHaveBeenCalledWith("/api/org/grants?resourceType=PROJECT&resourceId=3");
    expect(members).toEqual([
      { user: { id: "1", name: "Alice", avatarUrl: null }, role: "admin" },
      { user: { id: "2", name: "Bob", avatarUrl: null }, role: "editor" },
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

  it("역할 변경은 grant를 제자리에서 PATCH하고, 마지막 관리자는 강등할 수 없다", async () => {
    const spy = fetchSpy((path, init) => {
      if (init?.method === "PATCH") return response(200, { ...GRANTS[0], role: "ADMIN" });
      return path.startsWith("/api/org/grants") ? response(200, GRANTS) : response(200, MEMBERS);
    });
    await updateProjectMemberRole("3", "2", "admin");
    const methods = spy.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);
    expect(methods).toContain("PATCH /api/org/grants/10");
    // 삭제 후 재생성으로 되돌아가면 두 요청 사이의 실패가 멤버를 통째로 날린다
    expect(methods.some((m) => m.startsWith("DELETE") || m.startsWith("POST"))).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      "/api/org/grants/10",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "ADMIN" }) }),
    );

    await expect(updateProjectMemberRole("3", "1", "viewer")).rejects.toThrow("프로젝트에는 관리자가 최소 한 명 필요합니다");
    await expect(removeProjectMember("3", "1")).rejects.toThrow("프로젝트에는 관리자가 최소 한 명 필요합니다");
    await expect(removeProjectMember("3", "9")).rejects.toThrow("프로젝트 멤버가 아닙니다");
  });

  it("초대 경로 판정은 PROJECT·GLOBAL ADMIN grant 하나면 열린다", async () => {
    const spy = fetchSpy(() =>
      response(200, [{ resourceType: "PROJECT", resourceId: "3", role: "ADMIN" }]),
    );
    expect(await hasAnyProjectAdmin()).toBe(true);
    expect(spy).toHaveBeenCalledWith("/api/org/me/permissions");

    vi.restoreAllMocks();
    fetchSpy(() => response(200, [{ resourceType: "GLOBAL", resourceId: null, role: "ADMIN" }]));
    expect(await hasAnyProjectAdmin()).toBe(true);

    // 편집자는 초대할 수 없고, 스페이스 관리자는 ALM 프로젝트 초대의 근거가 아니다
    vi.restoreAllMocks();
    fetchSpy(() =>
      response(200, [
        { resourceType: "PROJECT", resourceId: "3", role: "EDITOR" },
        { resourceType: "SPACE", resourceId: "DEV", role: "ADMIN" },
      ]),
    );
    expect(await hasAnyProjectAdmin()).toBe(false);
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
