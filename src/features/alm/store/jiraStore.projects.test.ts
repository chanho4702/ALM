import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  createIssue,
  createProject,
  createSprint,
  deleteProject,
  purgeProject,
  getCurrentUser,
  listComments,
  listIssues,
  listProjects,
  listSprints,
  listUsers,
  updateProject,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("users", () => {
  it("목업 유저 4명을 반환한다", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(4);
    expect(users[0]).toEqual({ id: "u1", name: "김찬호", avatarUrl: null });
  });

  it("현재 유저는 u1 고정이다", async () => {
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", name: "김찬호", avatarUrl: null });
  });
});

describe("projects", () => {
  it("첫 실행 시 시드 프로젝트(ALM 플랫폼)가 생성되고 localStorage에 저장된다", async () => {
    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ key: "ALM", name: "ALM 플랫폼" });
    expect(localStorage.getItem("alm.jira.v1")).not.toBeNull();
  });

  it("createProject는 키를 대문자로 정규화해 저장한다", async () => {
    const project = await createProject({ key: "pay", name: "결제 서비스" });
    expect(project.key).toBe("PAY");
    const projects = await listProjects();
    expect(projects.map((p) => p.key)).toEqual(["ALM", "PAY"]);
  });

  it("키가 중복되면 한국어 메시지로 거부한다", async () => {
    await expect(createProject({ key: "alm", name: "중복" })).rejects.toThrow(
      "이미 존재하는 프로젝트 키입니다: ALM",
    );
  });

  it("키/이름이 비어 있으면 거부한다", async () => {
    await expect(createProject({ key: "  ", name: "이름" })).rejects.toThrow(
      "프로젝트 키를 입력하세요",
    );
    await expect(createProject({ key: "PAY", name: "  " })).rejects.toThrow(
      "프로젝트 이름을 입력하세요",
    );
  });

  it("생성한 프로젝트는 메모리 캐시 리셋 후에도 localStorage에서 조회된다", async () => {
    await createProject({ key: "PAY", name: "결제 서비스" });
    __resetForTest(); // 캐시만 비움 — localStorage는 유지
    const projects = await listProjects();
    expect(projects.map((p) => p.key)).toEqual(["ALM", "PAY"]);
  });

  it("localStorage가 손상된 JSON이면 시드로 재생성한다", async () => {
    localStorage.setItem("alm.jira.v1", "{corrupted!!");
    __resetForTest();
    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].key).toBe("ALM");
    expect(localStorage.getItem("alm.jira.v1")).not.toContain("corrupted");
  });

  it("createProject는 설명을 함께 저장한다 (미지정이면 빈 문자열)", async () => {
    const withDesc = await createProject({ key: "PAY", name: "결제", description: "결제 서비스" });
    expect(withDesc.description).toBe("결제 서비스");
    const withoutDesc = await createProject({ key: "OPS", name: "운영" });
    expect(withoutDesc.description).toBe("");
  });
});

describe("updateProject", () => {
  it("이름/설명을 수정하고 키는 그대로 유지한다", async () => {
    const [project] = await listProjects();
    const updated = await updateProject(project.id, {
      name: "ALM 플랫폼 v2",
      description: "새 설명",
    });
    expect(updated).toMatchObject({ key: "ALM", name: "ALM 플랫폼 v2", description: "새 설명" });
  });

  it("이름이 공백이면 거부한다", async () => {
    const [project] = await listProjects();
    await expect(updateProject(project.id, { name: "  " })).rejects.toThrow(
      "프로젝트 이름을 입력하세요",
    );
  });

  it("없는 프로젝트면 거부한다", async () => {
    await expect(updateProject("nope", { name: "x" })).rejects.toThrow(
      "프로젝트를 찾을 수 없습니다",
    );
  });
});

describe("deleteProject", () => {
  it("프로젝트와 스프린트·이슈·댓글이 연쇄 삭제된다", async () => {
    const [project] = await listProjects();
    const issues = await listIssues(project.id);
    expect(issues.length).toBeGreaterThan(0);
    const comment = await addComment(issues[0].id, "곧 사라질 댓글");

    await deleteProject(project.id);

    await purgeProject(project.id); // 삭제 = 휴지통, 연쇄 삭제는 영구 삭제 때

    expect(await listProjects()).toHaveLength(0);
    expect(await listIssues(project.id)).toHaveLength(0);
    expect(await listSprints(project.id)).toHaveLength(0);
    expect(await listComments(comment.issueId)).toHaveLength(0);
  });

  it("다른 프로젝트의 데이터는 건드리지 않는다", async () => {
    const other = await createProject({ key: "PAY", name: "결제" });
    await createSprint(other.id);
    await createIssue({ projectId: other.id, title: "살아남을 이슈" });

    const [alm] = await listProjects();
    await deleteProject(alm.id);
    await purgeProject(alm.id); // 삭제 = 휴지통, 연쇄 삭제는 영구 삭제 때

    expect((await listProjects()).map((p) => p.key)).toEqual(["PAY"]);
    expect(await listIssues(other.id)).toHaveLength(1);
    expect(await listSprints(other.id)).toHaveLength(1);
  });

  it("없는 프로젝트면 거부한다", async () => {
    await expect(deleteProject("nope")).rejects.toThrow("프로젝트를 찾을 수 없습니다");
  });
});
