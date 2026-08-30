import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  archiveIssue,
  archiveProject,
  createIssue,
  deleteProject,
  getIssueByKey,
  listArchivedIssues,
  listIssues,
  listProjects,
  listTrashedProjects,
  purgeProject,
  restoreIssue,
  restoreProject,
  searchIssues,
  unarchiveProject,
  updateProject,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("이슈 보관 (지라 보관된 업무 항목)", () => {
  it("보관하면 목록·검색에서 빠지고 보관함에서 복원된다", async () => {
    const before = (await listIssues("p1")).length;
    const issue = await getIssueByKey("ALM-2");
    const archived = await archiveIssue(issue!.id);
    expect(archived.archivedAt).toBeTruthy();
    expect((await listIssues("p1")).length).toBe(before - 1);
    expect((await searchIssues("칸반")).some((i) => i.id === issue!.id)).toBe(false);
    expect(await getIssueByKey("ALM-2")).toBeNull();
    const box = await listArchivedIssues("p1");
    expect(box.map((i) => i.key)).toEqual(["ALM-2"]);
    const restored = await restoreIssue(issue!.id);
    expect(restored.archivedAt).toBeNull();
    expect((await listIssues("p1")).length).toBe(before);
    await expect(restoreIssue(issue!.id)).rejects.toThrow("보관함에 없는 이슈입니다");
  });
});

describe("프로젝트 보관·휴지통", () => {
  it("보관된 프로젝트는 읽기 전용이고 해제하면 다시 편집된다", async () => {
    const project = await archiveProject("p1");
    expect(project.archivedAt).toBeTruthy();
    await expect(createIssue({ projectId: "p1", title: "막힘" })).rejects.toThrow("보관된 프로젝트는 읽기만 할 수 있습니다");
    await expect(updateProject("p1", { name: "바꿈" })).rejects.toThrow("보관된 프로젝트는 읽기만 할 수 있습니다");
    expect((await listIssues("p1")).length).toBeGreaterThan(0); // 읽기는 된다
    await unarchiveProject("p1");
    expect((await listProjects()).find((p) => p.id === "p1")?.archivedAt).toBeNull();
    await createIssue({ projectId: "p1", title: "다시 됨" });
  });

  it("삭제는 휴지통 이동이고 복원하면 이슈까지 돌아오며, 영구 삭제는 되돌릴 수 없다", async () => {
    const issueCount = (await listIssues("p1")).length;
    await deleteProject("p1");
    expect((await listProjects()).some((p) => p.id === "p1")).toBe(false);
    expect(await getIssueByKey("ALM-1")).toBeNull();
    expect((await searchIssues("보드")).length).toBe(0);
    const trash = await listTrashedProjects();
    expect(trash.map((p) => p.id)).toEqual(["p1"]);
    expect(trash[0].deletedAt).toBeTruthy();

    await restoreProject("p1");
    expect((await listProjects()).some((p) => p.id === "p1")).toBe(true);
    expect((await listIssues("p1")).length).toBe(issueCount);
    expect(await listTrashedProjects()).toHaveLength(0);

    await deleteProject("p1");
    await purgeProject("p1");
    expect(await listTrashedProjects()).toHaveLength(0);
    await expect(restoreProject("p1")).rejects.toThrow("휴지통에 없는 프로젝트입니다");
  });
});
