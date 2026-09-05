import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createIssue,
  createSprint,
  setProjectCustom,
  updateProject,
  addProjectMember,
  createProject,
  deleteProject,
  purgeProject,
  getCurrentUser,
  getMyOrgProfile,
  hasAnyProjectAdmin,
  listProjectMembers,
  listProjects,
  listUsers,
  removeProjectMember,
  updateProjectMemberRole,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("프로젝트 멤버·역할", () => {
  it("새 프로젝트는 만든 사람이 관리자로 들어간다", async () => {
    const project = await createProject({ key: "MEM", name: "멤버 검증" });
    const me = await getCurrentUser();

    const members = await listProjectMembers(project.id);

    expect(members).toEqual([{ user: me, role: "admin" }]);
  });

  it("디렉터리의 사용자를 멤버로 추가하고 역할을 바꾼다", async () => {
    const project = await createProject({ key: "MEM", name: "멤버 검증" });
    const [, second] = await listUsers();

    await addProjectMember(project.id, second.id, "viewer");
    expect((await listProjectMembers(project.id)).map((m) => [m.user.id, m.role])).toEqual([
      ["u1", "admin"],
      ["u2", "viewer"],
    ]);

    await updateProjectMemberRole(project.id, second.id, "editor");
    expect((await listProjectMembers(project.id))[1].role).toBe("editor");
  });

  it("같은 사람을 두 번 추가하지 않는다", async () => {
    const project = await createProject({ key: "MEM", name: "멤버 검증" });

    await expect(addProjectMember(project.id, "u1", "editor")).rejects.toThrow(
      "이미 프로젝트 멤버입니다",
    );
  });

  it("마지막 관리자는 강등하거나 내보낼 수 없다", async () => {
    const project = await createProject({ key: "MEM", name: "멤버 검증" });
    await addProjectMember(project.id, "u2", "editor");

    await expect(updateProjectMemberRole(project.id, "u1", "editor")).rejects.toThrow(
      "프로젝트에는 관리자가 최소 한 명 필요합니다",
    );
    await expect(removeProjectMember(project.id, "u1")).rejects.toThrow(
      "프로젝트에는 관리자가 최소 한 명 필요합니다",
    );

    // 관리자가 둘이면 한 명은 내보낼 수 있다
    await updateProjectMemberRole(project.id, "u2", "admin");
    await removeProjectMember(project.id, "u1");
    expect((await listProjectMembers(project.id)).map((m) => m.user.id)).toEqual(["u2"]);
  });

  it("멤버가 아닌 사람의 역할은 바꿀 수 없다", async () => {
    const project = await createProject({ key: "MEM", name: "멤버 검증" });

    await expect(updateProjectMemberRole(project.id, "u3", "editor")).rejects.toThrow(
      "프로젝트 멤버가 아닙니다",
    );
  });

  it("프로젝트를 지우면 멤버 기록도 사라진다", async () => {
    const project = await createProject({ key: "MEM", name: "멤버 검증" });
    await addProjectMember(project.id, "u2", "editor");

    await deleteProject(project.id);

    await purgeProject(project.id); // 삭제 = 휴지통, 연쇄 삭제는 영구 삭제 때

    expect(await listProjectMembers(project.id)).toEqual([]);
  });

  it("시드 프로젝트는 팀 전원이 멤버다 (데모 데이터)", async () => {
    const members = await listProjectMembers("p1");

    expect(members).toHaveLength(4);
    expect(members[0]).toMatchObject({ role: "admin" });
  });
});

describe("역할이 쓰기를 제한한다", () => {
  /** u1을 원하는 역할로 낮춘다 — 마지막 관리자 보호를 피하려 u2를 먼저 관리자로 올린다 */
  async function demoteSelfTo(projectId: string, role: "editor" | "viewer") {
    await addProjectMember(projectId, "u2", "admin");
    await updateProjectMemberRole(projectId, "u1", role);
  }

  it("뷰어는 이슈를 만들 수 없다", async () => {
    const project = await createProject({ key: "ROL", name: "역할 검증" });
    await demoteSelfTo(project.id, "viewer");

    await expect(createIssue({ projectId: project.id, title: "막혀야 한다" })).rejects.toThrow(
      "이 프로젝트를 편집할 권한이 없습니다",
    );
  });

  it("편집자는 이슈·스프린트를 만들 수 있지만 프로젝트 설정은 못 바꾼다", async () => {
    const project = await createProject({ key: "ROL", name: "역할 검증" });
    await demoteSelfTo(project.id, "editor");

    await expect(createIssue({ projectId: project.id, title: "허용" })).resolves.toMatchObject({
      title: "허용",
    });
    await expect(createSprint(project.id)).resolves.toMatchObject({ state: "planned" });

    await expect(updateProject(project.id, { name: "바꾸기" })).rejects.toThrow(
      "프로젝트 관리자만 할 수 있습니다",
    );
    await expect(setProjectCustom(project.id, true)).rejects.toThrow(
      "프로젝트 관리자만 할 수 있습니다",
    );
    await expect(addProjectMember(project.id, "u3", "viewer")).rejects.toThrow(
      "프로젝트 관리자만 할 수 있습니다",
    );
  });

  it("목업 조직 프로필은 활성 전역 관리자다 — 목업 개발자는 모든 화면을 봐야 한다", async () => {
    const profile = await getMyOrgProfile();
    expect(profile.status).toBe("ACTIVE");
    expect(profile.globalRoles).toContain("ADMIN");
    expect(profile.id).toBe((await getCurrentUser()).id);
  });

  it("사용자 검색은 이름 부분일치이고, 공백만 넣으면 전체를 준다", async () => {
    expect((await listUsers({ q: "서연" })).map((u) => u.name)).toEqual(["이서연"]);
    expect(await listUsers({ q: "  " })).toHaveLength((await listUsers()).length);
    expect(await listUsers({ q: "없는사람" })).toEqual([]);
  });

  it("어느 프로젝트든 관리자면 초대 경로가 열린다 — 관리자 자리를 잃으면 닫힌다", async () => {
    expect(await hasAnyProjectAdmin()).toBe(true); // 시드: u1은 ALM 플랫폼 관리자

    // 내가 관리하는 모든 프로젝트에서 관리자 자리를 넘긴다 (마지막 관리자 보호를 지키며)
    for (const project of await listProjects()) {
      await updateProjectMemberRole(project.id, "u2", "admin");
      await updateProjectMemberRole(project.id, "u1", "viewer");
    }

    expect(await hasAnyProjectAdmin()).toBe(false);
  });

  it("멤버가 아니면 읽기도 쓰기도 막힌다 (쓰기 기준)", async () => {
    const project = await createProject({ key: "ROL", name: "역할 검증" });
    await addProjectMember(project.id, "u2", "admin");
    await removeProjectMember(project.id, "u1");

    await expect(createIssue({ projectId: project.id, title: "막혀야 한다" })).rejects.toThrow(
      "이 프로젝트를 편집할 권한이 없습니다",
    );
  });
});
