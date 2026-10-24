// localStorage 목업 스토어 — members (jiraMock.ts에서 분할, 동작 불변)
import type { ProjectRole, User, JiraData, ProjectMember } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { load, clone, withAvatar, persist } from "./db";

// ── 멤버·역할 ────────────────────────────────────────────────

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

export interface ProjectMemberView {
  user: User;
  role: ProjectRole;
}

/** 역할 높은 순 → 이름순. 디렉터리에서 사라진 사용자는 목록에서 뺀다 */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberView[]> {
  const data = load();
  return clone(
    data.members
      .filter((member) => member.projectId === projectId)
      .map((member) => {
        const user = data.users.find((u) => u.id === member.userId);
        return { user: user ? withAvatar(data, user) : undefined, role: member.role };
      })
      .filter((row): row is ProjectMemberView => row.user !== undefined)
      .sort(
        (a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.user.name.localeCompare(b.user.name),
      ),
  );
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  assertCanAdmin(data, projectId);
  if (!data.users.some((u) => u.id === userId)) throw new Error("사용자를 찾을 수 없습니다");
  if (data.members.some((m) => m.projectId === projectId && m.userId === userId)) {
    throw new Error("이미 프로젝트 멤버입니다");
  }
  data.members.push({ projectId, userId, role });
  persist();
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const member = requireMember(data, projectId, userId);
  if (member.role === "admin" && role !== "admin") assertNotLastAdmin(data, projectId, userId);
  member.role = role;
  persist();
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const data = load();
  assertCanAdmin(data, projectId);
  const member = requireMember(data, projectId, userId);
  if (member.role === "admin") assertNotLastAdmin(data, projectId, userId);
  data.members = data.members.filter(
    (m) => !(m.projectId === projectId && m.userId === userId),
  );
  persist();
}

/** 현재 사용자의 역할 — 화면이 편집 UI를 보일지 판단한다. 멤버가 아니면 null */
export async function getMyProjectRole(projectId: string): Promise<ProjectRole | null> {
  return myRole(load(), projectId);
}

/**
 * 어느 프로젝트든 관리자인가 — 설계 §3.2의 "리소스 ADMIN도 초대할 수 있다"를 화면이 판정하는 값.
 * 목업 프로필은 항상 전역 관리자라(`getMyOrgProfile`) 실사용에서는 늘 참이지만, 화면이 전역
 * 관리자 여부와 **별개로** 이 값을 묻기 때문에 목업도 진짜 멤버십으로 답한다.
 */
export async function hasAnyProjectAdmin(): Promise<boolean> {
  return load().members.some((m) => m.userId === CURRENT_USER_ID && m.role === "admin");
}

/**
 * 쓰기 권한 가드 — 역할 계층은 org-service와 같다(뷰어 ⊂ 편집자 ⊂ 관리자).
 * 목업이 백엔드 대역이므로 여기서 막지 않으면 "뷰어 = 읽기만"이 화면의 빈말이 된다.
 * 서버 전환 후에는 org-service gRPC 판정이 이 자리를 대신한다.
 */
function assertNotArchived(data: JiraData, projectId: string): void {
  if (data.projects.find((p) => p.id === projectId)?.archivedAt) {
    throw new Error("보관된 프로젝트는 읽기만 할 수 있습니다");
  }
}

export function assertCanEdit(data: JiraData, projectId: string): void {
  const role = myRole(data, projectId);
  if (role === null || role === "viewer") {
    throw new Error("이 프로젝트를 편집할 권한이 없습니다");
  }
  assertNotArchived(data, projectId);
}

/** 보관 가드를 우회하는 관리자 확인 — 보관 해제·휴지통 이동에 쓴다 */
export function assertAdminIgnoringArchive(data: JiraData, projectId: string): void {
  if (myRole(data, projectId) !== "admin") {
    throw new Error("프로젝트 관리자만 할 수 있습니다");
  }
}

export function assertCanAdmin(data: JiraData, projectId: string): void {
  assertAdminIgnoringArchive(data, projectId);
  assertNotArchived(data, projectId);
}

/** 댓글·워크로그 삭제 — 작성자 또는 그 이슈 프로젝트의 관리자(서버 감사 A-17 규칙과 같다) */
export function canDeleteOwnedEntry(data: JiraData, authorId: string, issueId: string): boolean {
  if (authorId === CURRENT_USER_ID) return true;
  const projectId = data.issues.find((i) => i.id === issueId)?.projectId;
  return projectId !== undefined && myRole(data, projectId) === "admin";
}

/** 현재 사용자의 프로젝트 역할 — 전환 조건(role)이 쓴다 */
export function myProjectRole(data: JiraData, projectId: string): ProjectRole | null {
  return myRole(data, projectId);
}

function myRole(data: JiraData, projectId: string): ProjectRole | null {
  return (
    data.members.find((m) => m.projectId === projectId && m.userId === CURRENT_USER_ID)?.role ??
    null
  );
}

function requireMember(data: JiraData, projectId: string, userId: string): ProjectMember {
  const member = data.members.find((m) => m.projectId === projectId && m.userId === userId);
  if (!member) throw new Error("프로젝트 멤버가 아닙니다");
  return member;
}

/** 관리자가 0명인 프로젝트를 만들지 않는다 — 아무도 설정을 못 고치는 상태를 막는다 */
function assertNotLastAdmin(data: JiraData, projectId: string, userId: string): void {
  const otherAdmins = data.members.filter(
    (m) => m.projectId === projectId && m.role === "admin" && m.userId !== userId,
  );
  if (otherAdmins.length === 0) {
    throw new Error("프로젝트에는 관리자가 최소 한 명 필요합니다");
  }
}
