import { beforeEach, describe, expect, it } from "vitest";
import * as rest from "./jiraApi";
import * as mock from "./jiraMock";
import {
  DEMO_SEED_COUNTS,
  SAMPLE_DATA_API_FUNCTIONS,
  type AllSampleDataApiFunctionsListed,
  type SampleDataApi,
} from "./sampleData";
import {
  __resetForTest,
  createProject,
  listArchivedIssues,
  listBoards,
  listComments,
  listComponents,
  listDashboards,
  listIssueLinks,
  listIssues,
  listProjectWorklogs,
  listSprints,
  listVersions,
} from "./jiraStore";
import type { Issue } from "./types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function createDemo() {
  return createProject({ key: "DEMO", name: "데모 프로젝트", templateId: "demo" });
}

describe("데모 프로젝트 템플릿 시더", () => {
  it("이슈·스프린트·릴리스·컴포넌트·코멘트를 한 번에 채운다", async () => {
    const project = await createDemo();
    const issues = await listIssues(project.id);

    // 보관 2건은 목록에서 빠진다
    expect(issues.length).toBe(DEMO_SEED_COUNTS.issues - DEMO_SEED_COUNTS.archived);
    expect(issues.length).toBeGreaterThanOrEqual(40);
    expect(await listArchivedIssues(project.id)).toHaveLength(2);

    expect(await listSprints(project.id)).toHaveLength(3);
    expect(await listVersions(project.id)).toHaveLength(3);
    expect(await listComponents(project.id)).toHaveLength(4);

    let commentCount = 0;
    for (const issue of issues) commentCount += (await listComments(issue.id)).length;
    expect(commentCount).toBeGreaterThanOrEqual(15);

    expect(await listProjectWorklogs(project.id)).toHaveLength(DEMO_SEED_COUNTS.worklogs);
  }, 30000);

  it("스프린트는 완료·진행 중·계획 하나씩이고, 완료 스프린트 이슈는 전부 해결됐다", async () => {
    const project = await createDemo();
    const sprints = await listSprints(project.id);
    expect(sprints.map((s) => s.state).sort()).toEqual(["active", "done", "planned"]);
    expect(sprints.every((s) => Boolean(s.goal))).toBe(true);
    expect(sprints.every((s) => Boolean(s.plannedStart) && Boolean(s.plannedEnd))).toBe(true);

    const done = sprints.find((s) => s.state === "done")!;
    const issues = await listIssues(project.id);
    const inDone = issues.filter((i) => i.sprintId === done.id);
    expect(inDone.length).toBeGreaterThan(0);
    expect(inDone.every((i) => i.status === "done" && i.resolution !== null)).toBe(true);

    const active = sprints.find((s) => s.state === "active")!;
    const inActive = issues.filter((i) => i.sprintId === active.id);
    expect(new Set(inActive.map((i) => i.status)).size).toBeGreaterThan(1);
  }, 30000);

  it("릴리스 1개는 릴리스됨, 나머지 2개는 미릴리스", async () => {
    const project = await createDemo();
    const versions = await listVersions(project.id);
    expect(versions.filter((v) => v.status === "released")).toHaveLength(1);
    expect(versions.filter((v) => v.status === "unreleased")).toHaveLength(2);
  }, 30000);

  it("에픽·하위 작업·링크·라벨·우선순위 분포가 채워진다", async () => {
    const project = await createDemo();
    const issues = await listIssues(project.id);

    expect(issues.filter((i) => i.type === "epic")).toHaveLength(DEMO_SEED_COUNTS.epics);
    expect(issues.filter((i) => i.type === "subtask").length).toBeGreaterThanOrEqual(6);
    expect(issues.filter((i) => i.parentId !== null).length).toBeGreaterThanOrEqual(30);

    // 우선순위 5단계가 모두 등장한다
    expect(new Set(issues.map((i) => i.priority)).size).toBe(5);
    // 담당자는 실제 사용자 순환 + 일부 미지정
    expect(issues.some((i) => i.assigneeId === null)).toBe(true);
    expect(new Set(issues.map((i) => i.assigneeId).filter(Boolean)).size).toBeGreaterThanOrEqual(3);
    // 라벨 풀에서 골라 붙는다
    const labels = new Set(issues.flatMap((i: Issue) => i.labels));
    expect(labels.size).toBeGreaterThanOrEqual(6);
    // 마감일은 지난 것·앞으로 올 것이 섞여 있다
    const today = new Date().toISOString().slice(0, 10);
    const dueDates = issues.map((i) => i.dueDate).filter((d): d is string => Boolean(d));
    expect(dueDates.some((d) => d < today)).toBe(true);
    expect(dueDates.some((d) => d > today)).toBe(true);

    const linked = (
      await Promise.all(issues.map((issue) => listIssueLinks(issue.id)))
    ).flat();
    // 링크는 양쪽 이슈에서 모두 보이므로 5건이 10줄로 잡힌다
    expect(linked.length).toBeGreaterThanOrEqual(DEMO_SEED_COUNTS.links);
  }, 30000);

  it("보드 1개와 가젯 5개짜리 대시보드를 만든다", async () => {
    const project = await createDemo();
    const [board] = await listBoards(project.id);
    expect(board).toMatchObject({ name: "데모 보드", type: "scrum", isDefault: true });

    const dashboard = (await listDashboards()).find((d) => d.name === "DEMO 진행 현황");
    expect(dashboard).toBeDefined();
    expect(dashboard!.gadgets).toHaveLength(5);
  }, 30000);

  it("한 번 더 만들면 또 하나의 데모 프로젝트가 생긴다 (키만 다르게)", async () => {
    const first = await createDemo();
    const second = await createProject({ key: "DEMO2", name: "데모 둘", templateId: "demo" });
    expect(second.id).not.toBe(first.id);
    expect((await listIssues(second.id)).length).toBe(
      DEMO_SEED_COUNTS.issues - DEMO_SEED_COUNTS.archived,
    );
    expect((await listIssues(second.id))[0].key.startsWith("DEMO2-")).toBe(true);
  }, 45000);
});

describe("시더 ↔ REST 어댑터 계약", () => {
  it("시더가 부르는 스토어 함수를 REST 어댑터가 전부 갖고 있다", () => {
    // 컴파일 타임: 목록이 SampleDataApi를 다 덮는가
    const listed: AllSampleDataApiFunctionsListed = true;
    expect(listed).toBe(true);

    const missing = SAMPLE_DATA_API_FUNCTIONS.filter(
      (name) => typeof (rest as Record<string, unknown>)[name] !== "function",
    );
    expect(missing).toEqual([]);
  });

  it("스프린트 완료·릴리스는 목업과 REST가 같은 시그니처다 — (id, options)", () => {
    // 완료 판정은 서버가 워크플로 의미로 한다. 어느 한쪽이 doneStatuses 인자를 되살리면
    // 이 대입이 컴파일되지 않는다(인자 수가 SampleDataApi보다 많아진다).
    type Lifecycle = Pick<SampleDataApi, "completeSprint" | "releaseVersion">;
    const restLifecycle: Lifecycle = {
      completeSprint: rest.completeSprint,
      releaseVersion: rest.releaseVersion,
    };
    const mockLifecycle: Lifecycle = {
      completeSprint: mock.completeSprint,
      releaseVersion: mock.releaseVersion,
    };
    expect(typeof restLifecycle.completeSprint).toBe("function");
    expect(typeof mockLifecycle.releaseVersion).toBe("function");
  });
});
