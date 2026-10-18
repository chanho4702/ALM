// alm-backend REST 어댑터 — members (jiraApi.ts에서 분할, 동작 불변)
import type { ProjectRole, User } from "../types";
import { toBackendId } from "../mapping";
import type { ProjectMemberView } from "../jiraMock";
import { type OrgAvatarFields, withAvatar, avatarPathOf } from "./users";
import { json, sharedApiFetch } from "./http";

// ── 사용자 디렉터리·프로젝트 멤버 — org-service REST(게이트웨이 `/api/org/**`). 권한의 진실은 org-service ──

interface OrgMemberDto extends OrgAvatarFields {
  id: number;
  displayName: string;
  email?: string | null;
  status: string;
}

interface OrgGrantDto {
  id: number;
  subjectType: "USER" | "TEAM";
  subjectId: number;
  resourceType: string;
  resourceId: string | null;
  role: "VIEWER" | "EDITOR" | "ADMIN";
}

const ROLE_FROM_ORG: Record<OrgGrantDto["role"], ProjectRole> = { VIEWER: "viewer", EDITOR: "editor", ADMIN: "admin" };

const ROLE_TO_ORG: Record<ProjectRole, OrgGrantDto["role"]> = { viewer: "VIEWER", editor: "EDITOR", admin: "ADMIN" };

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

/**
 * ACTIVE 멤버만 — 비활성 계정은 담당자·멤버 선택 UI에 나오면 안 된다.
 * 아바타 경로는 org-service가 목록 행에 함께 준다(별도 병합 호출 없음).
 */
export async function listUsers(query?: { q?: string }): Promise<User[]> {
  // 서버가 이름·이메일 부분일치로 걸러 준다 — 목록 전체를 받아 화면에서 자르지 않는다.
  const q = query?.q?.trim() ?? "";
  const search = q === "" ? "" : `?q=${encodeURIComponent(q)}`;
  const rows = await json<OrgMemberDto[]>(await sharedApiFetch(`/api/org/members${search}`));
  return Promise.all(
    rows
      .filter((m) => m.status === "ACTIVE")
      .map((m) => {
        const id = String(m.id);
        return withAvatar({ id, name: m.displayName }, avatarPathOf(id, m));
      }),
  );
}

/** org-service는 grant 목록을 그 리소스의 ADMIN(또는 전역 관리자)에게만 연다 */
async function projectGrants(projectId: string): Promise<OrgGrantDto[]> {
  const response = await sharedApiFetch(
    `/api/org/grants?resourceType=PROJECT&resourceId=${toBackendId(projectId)}`,
  );
  if (response.status === 403) throw new Error("멤버 목록은 프로젝트 관리자만 볼 수 있습니다");
  const rows = await json<OrgGrantDto[]>(response);
  return rows.filter((g) => g.subjectType === "USER");
}

/** 역할 높은 순 → 이름순. 팀 grant는 개인 멤버 목록에 넣지 않는다(목업과 같은 모양) */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberView[]> {
  const [grants, users] = await Promise.all([projectGrants(projectId), listUsers()]);
  const directory = new Map(users.map((u) => [u.id, u]));
  return grants
    .map((g) => ({
      user: directory.get(String(g.subjectId)) ?? {
        id: String(g.subjectId),
        name: `사용자 ${g.subjectId}`,
        avatarUrl: null,
      },
      role: ROLE_FROM_ORG[g.role],
    }))
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.user.name.localeCompare(b.user.name));
}

async function createProjectGrant(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  await json(
    await sharedApiFetch("/api/org/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectType: "USER",
        subjectId: toBackendId(userId),
        resourceType: "PROJECT",
        resourceId: String(toBackendId(projectId)),
        role: ROLE_TO_ORG[role],
      }),
    }),
  );
}

export async function addProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  await createProjectGrant(projectId, userId, role);
}

function requireGrant(grants: OrgGrantDto[], userId: string): OrgGrantDto {
  const grant = grants.find((g) => String(g.subjectId) === userId);
  if (!grant) throw new Error("프로젝트 멤버가 아닙니다");
  return grant;
}

function assertNotLastAdmin(grants: OrgGrantDto[], userId: string): void {
  const otherAdmin = grants.some((g) => g.role === "ADMIN" && String(g.subjectId) !== userId);
  if (!otherAdmin) throw new Error("프로젝트에는 관리자가 최소 한 명 필요합니다");
}

/**
 * 역할 변경은 `PATCH /api/org/grants/{id}` 제자리 갱신이다(설계 §3.2). 예전의 "삭제 후 재생성"은
 * 두 요청 사이에서 실패하면 멤버가 통째로 사라졌고, `grant_audit`에도 회수+부여로 남았다.
 */
export async function updateProjectMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  const grants = await projectGrants(projectId);
  const current = requireGrant(grants, userId);
  if (ROLE_FROM_ORG[current.role] === role) return;
  if (current.role === "ADMIN" && role !== "admin") assertNotLastAdmin(grants, userId);
  await json(
    await sharedApiFetch(`/api/org/grants/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: ROLE_TO_ORG[role] }),
    }),
  );
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const grants = await projectGrants(projectId);
  const current = requireGrant(grants, userId);
  if (current.role === "ADMIN") assertNotLastAdmin(grants, userId);
  await json(await sharedApiFetch(`/api/org/grants/${current.id}`, { method: "DELETE" }));
}

interface MyPermissionDto {
  resourceType: string;
  resourceId: string | null;
  role: OrgGrantDto["role"];
}

/** 내 grant 전부 — 프로젝트 역할과 "어디든 관리자인가" 판정이 같은 응답을 읽는다 */
async function myPermissions(): Promise<MyPermissionDto[]> {
  return json<MyPermissionDto[]>(await sharedApiFetch("/api/org/me/permissions"));
}

/**
 * 어느 프로젝트든 관리자인가 — 설계 §3.2의 "리소스 ADMIN도 초대할 수 있다"를 화면이 판정하는 값.
 * 전역 관리자는 당연히 참이다. 허용 범위(자기 리소스로 제한)는 서버가 강제하므로 화면은
 * 진입만 열고 거절 문구는 서버 것을 그대로 띄운다.
 */
export async function hasAnyProjectAdmin(): Promise<boolean> {
  const rows = await myPermissions();
  return rows.some(
    (g) => g.role === "ADMIN" && (g.resourceType === "PROJECT" || g.resourceType === "GLOBAL"),
  );
}

/** 내 역할 — PROJECT grant, 없으면 GLOBAL ADMIN, 그것도 없으면 null(멤버 아님) */
export async function getMyProjectRole(projectId: string): Promise<ProjectRole | null> {
  const rows = await myPermissions();
  const resourceId = String(toBackendId(projectId));
  const mine = rows.filter((g) => g.resourceType === "PROJECT" && g.resourceId === resourceId);
  if (mine.length > 0) {
    return mine.map((g) => ROLE_FROM_ORG[g.role]).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0];
  }
  if (rows.some((g) => g.resourceType === "GLOBAL" && g.role === "ADMIN")) return "admin";
  return null;
}
