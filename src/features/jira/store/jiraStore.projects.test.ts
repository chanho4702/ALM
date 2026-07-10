import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createProject,
  getCurrentUser,
  listProjects,
  listUsers,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("users", () => {
  it("목업 유저 4명을 반환한다", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(4);
    expect(users[0]).toEqual({ id: "u1", name: "김찬호" });
  });

  it("현재 유저는 u1 고정이다", async () => {
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", name: "김찬호" });
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
});
