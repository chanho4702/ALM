import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, createIssue, listIssues, listProjects } from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** description·dueDate·labels가 없던 구버전 v1 데이터 */
function seedLegacyV1(): void {
  const now = "2026-07-01T00:00:00.000Z";
  localStorage.setItem(
    "alm.jira.v1",
    JSON.stringify({
      users: [{ id: "u1", name: "김찬호" }],
      projects: [{ id: "p1", key: "ALM", name: "ALM 플랫폼", createdAt: now }],
      sprints: [],
      issues: [
        {
          id: "i1",
          key: "ALM-1",
          projectId: "p1",
          title: "구버전 이슈",
          description: "",
          status: "todo",
          priority: "medium",
          assigneeId: null,
          reporterId: "u1",
          sprintId: null,
          order: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      comments: [],
      activities: [],
      issueCounters: { p1: 1 },
    }),
  );
}

describe("v1 normalize 마이그레이션", () => {
  it("구버전 프로젝트에 description 기본값을 채운다", async () => {
    seedLegacyV1();
    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].description).toBe("");
  });

  it("구버전 이슈에 dueDate/labels 기본값을 채운다", async () => {
    seedLegacyV1();
    const issues = await listIssues("p1");
    expect(issues).toHaveLength(1);
    expect(issues[0].dueDate).toBeNull();
    expect(issues[0].labels).toEqual([]);
  });

  it("issueCounters가 없는 데이터도 이슈 생성이 크래시하지 않는다", async () => {
    seedLegacyV1();
    const raw = JSON.parse(localStorage.getItem("alm.jira.v1")!) as Record<string, unknown>;
    delete raw.issueCounters;
    localStorage.setItem("alm.jira.v1", JSON.stringify(raw));
    __resetForTest();

    const issue = await createIssue({ projectId: "p1", title: "카운터 없던 시절" });
    expect(issue.key).toBe("ALM-1"); // 카운터가 {}로 승격돼 1부터 발번
  });
});
