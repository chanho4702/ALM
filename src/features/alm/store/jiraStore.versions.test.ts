import { beforeEach, describe, expect, it } from "vitest";
import { __versionForTest } from "./jiraStore";
import {
  purgeProject,
  __resetForTest,
  archiveVersion,
  createIssue,
  createProject,
  createVersion,
  deleteVersion,
  getIssueByKey,
  listVersions,
  releaseVersion,
  updateIssue,
  updateVersion,
  aggregateIssues,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("버전(릴리스)", () => {
  it("버전을 만들면 미릴리스 상태로 목록에 들어간다", async () => {
    const version = await createVersion("p1", { name: "1.0", releaseDate: "2026-09-30" });

    expect(version).toMatchObject({ projectId: "p1", name: "1.0", status: "unreleased" });
    expect(await listVersions("p1")).toEqual([version]);
  });

  it("같은 프로젝트에 같은 이름의 버전은 만들 수 없다", async () => {
    await createVersion("p1", { name: "1.0" });

    await expect(createVersion("p1", { name: "1.0" })).rejects.toThrow(
      "이미 있는 버전 이름입니다: 1.0",
    );
  });

  it("이슈에 수정 버전을 달고 진행률을 센다(서버 집계 계약)", async () => {
    const version = await createVersion("p1", { name: "1.0" });
    const done = await getIssueByKey("ALM-1"); // 완료
    const open = await getIssueByKey("ALM-5"); // 할 일
    await updateIssue(done!.id, { fixVersionId: version.id }, __versionForTest("issue", done!.id));
    await updateIssue(open!.id, { fixVersionId: version.id }, __versionForTest("issue", open!.id));

    const byCategory = await aggregateIssues({ fixVersionId: version.id }, "statusCategory");
    expect(byCategory.total).toBe(2);
    expect(byCategory.buckets).toEqual(expect.arrayContaining([{ key: "done", count: 1 }]));
  });

  it("릴리스하면 상태와 릴리스 시각이 바뀌고, 미완료 이슈는 다음 버전으로 옮길 수 있다", async () => {
    const v1 = await createVersion("p1", { name: "1.0" });
    const v2 = await createVersion("p1", { name: "1.1" });
    const done = await getIssueByKey("ALM-1");
    const open = await getIssueByKey("ALM-5");
    await updateIssue(done!.id, { fixVersionId: v1.id }, __versionForTest("issue", done!.id));
    await updateIssue(open!.id, { fixVersionId: v1.id }, __versionForTest("issue", open!.id));

    const released = await releaseVersion(v1.id, { moveUnresolvedTo: v2.id });

    expect(released.status).toBe("released");
    expect(released.releasedAt).toBeTruthy();
    expect((await getIssueByKey("ALM-5"))!.fixVersionId).toBe(v2.id);
    expect((await getIssueByKey("ALM-1"))!.fixVersionId).toBe(v1.id);
  });

  it("이관 대상을 주지 않으면 미완료 이슈는 그 버전에 그대로 남는다 (지라와 동일)", async () => {
    const v1 = await createVersion("p1", { name: "1.0" });
    const open = await getIssueByKey("ALM-5");
    await updateIssue(open!.id, { fixVersionId: v1.id }, __versionForTest("issue", open!.id));

    await releaseVersion(v1.id);

    expect((await getIssueByKey("ALM-5"))!.fixVersionId).toBe(v1.id);
  });

  it("릴리스된 버전으로는 이관할 수 없고, 릴리스된 버전은 다시 릴리스할 수 없다", async () => {
    const v1 = await createVersion("p1", { name: "1.0" });
    const v2 = await createVersion("p1", { name: "1.1" });
    await releaseVersion(v2.id);

    await expect(releaseVersion(v1.id, { moveUnresolvedTo: v2.id })).rejects.toThrow(
      "릴리스된 버전으로는 이관할 수 없습니다",
    );
    await expect(releaseVersion(v2.id)).rejects.toThrow("이미 릴리스된 버전입니다");
  });

  it("보관하면 새 이슈에 달 수 없지만 기존 이슈의 표시는 유지된다", async () => {
    const version = await createVersion("p1", { name: "0.9" });
    const issue = await getIssueByKey("ALM-1");
    await updateIssue(issue!.id, { fixVersionId: version.id }, __versionForTest("issue", issue!.id));

    const archived = await archiveVersion(version.id);
    expect(archived.status).toBe("archived");
    expect((await getIssueByKey("ALM-1"))!.fixVersionId).toBe(version.id);

    const other = await getIssueByKey("ALM-2");
    await expect(updateIssue(other!.id, { fixVersionId: version.id }, __versionForTest("issue", other!.id))).rejects.toThrow(
      "보관된 버전에는 이슈를 달 수 없습니다",
    );
  });

  it("버전을 지우면 달려 있던 이슈의 수정 버전이 비워진다", async () => {
    const version = await createVersion("p1", { name: "1.0" });
    const issue = await getIssueByKey("ALM-1");
    await updateIssue(issue!.id, { fixVersionId: version.id }, __versionForTest("issue", issue!.id));

    await deleteVersion(version.id);

    expect(await listVersions("p1")).toEqual([]);
    expect((await getIssueByKey("ALM-1"))!.fixVersionId).toBeNull();
  });

  it("다른 프로젝트의 버전은 달 수 없다", async () => {
    const other = await createProject({ key: "OTH", name: "다른 제품" });
    const foreign = await createVersion(other.id, { name: "1.0" });
    const issue = await getIssueByKey("ALM-1");

    await expect(updateIssue(issue!.id, { fixVersionId: foreign.id }, __versionForTest("issue", issue!.id))).rejects.toThrow(
      "다른 프로젝트의 버전입니다",
    );
  });

  it("이름·설명·날짜를 수정할 수 있고 날짜 역전은 거부한다", async () => {
    const version = await createVersion("p1", { name: "1.0" });

    const updated = await updateVersion(version, {
      name: "1.0 GA",
      description: "첫 정식",
      startDate: "2026-09-01",
      releaseDate: "2026-09-30",
    });
    expect(updated).toMatchObject({ name: "1.0 GA", description: "첫 정식", startDate: "2026-09-01" });

    await expect(
      updateVersion(updated, { startDate: "2026-10-01", releaseDate: "2026-09-30" }),
    ).rejects.toThrow("시작일은 릴리스일보다 늦을 수 없습니다");
  });

  it("편집을 시작한 뒤 남이 먼저 고쳤으면 409로 막는다(남의 저장을 덮지 않는다)", async () => {
    const version = await createVersion("p1", { name: "1.0" });
    await updateVersion(version, { description: "먼저 저장" });

    await expect(updateVersion(version, { description: "늦은 저장" })).rejects.toMatchObject({ status: 409 });
    expect((await listVersions("p1"))[0].description).toBe("먼저 저장");
  });

  it("프로젝트를 지우면 버전도 사라진다", async () => {
    const project = await createProject({ key: "TMP", name: "임시" });
    await createVersion(project.id, { name: "1.0" });
    await createIssue({ projectId: project.id, title: "임시" });

    const { deleteProject } = await import("./jiraStore");
    await deleteProject(project.id);
    await purgeProject(project.id); // 삭제 = 휴지통, 연쇄 삭제는 영구 삭제 때

    expect(await listVersions(project.id)).toEqual([]);
  });
});
