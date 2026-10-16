import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  __versionForTest,
  aggregateIssues,
  createIssue,
  findIssues,
  getIssueByKey,
  listIssuesPage,
  listProjectLabels,
  moveIssue,
  queryIssuesPage,
  resolveSettings,
  setProjectCustom,
  updateIssue,
  updateProjectCustomSettings,
} from "./jiraStore";
import { parseSmartQuery } from "./searchQuery";

/**
 * 서버 검색·집계·라벨 계약(issueSearch.ts)의 목업 구현 — REST(alm-backend)와 같은 의미여야 한다.
 * 상태 분류는 프로젝트 워크플로 설정으로 풀고, 페이지는 total을 함께 준다.
 */
beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

const keys = (items: { key: string }[]) => items.map((i) => i.key);

/** p1에 커스텀 상태 "review"(분류 진행 중)를 추가하고 ALM-1을 거기로 옮긴다 */
async function withReviewStatus() {
  await setProjectCustom("p1", true);
  const { body } = await resolveSettings("p1");
  await updateProjectCustomSettings("p1", {
    ...body,
    statuses: [...body.statuses, { id: "review", name: "코드 리뷰", category: "inprogress", order: 99 }],
  });
  const issue = (await getIssueByKey("ALM-1"))!;
  await moveIssue(issue.id, { status: "review" });
}

describe("검색 — 상태 분류와 상태 id", () => {
  it("커스텀 상태 review(분류 진행 중)는 '상태:진행중'에 걸린다 — 분류는 statusCategories로 푼다", async () => {
    await withReviewStatus();
    const query = parseSmartQuery("상태:진행중", { users: [], projects: [] });
    expect(query.statuses).toEqual(["inprogress"]);
    const page = await queryIssuesPage(query, { page: 0, size: 50 });
    expect(keys(page.items)).toContain("ALM-1");
    expect(page.items.every((i) => ["inprogress", "review"].includes(i.status))).toBe(true);
    expect(page.total).toBe(page.items.length);
  });

  it("상태 id와 분류는 OR로 합친다, 모르는 분류는 아무것도 잡지 않는다", async () => {
    await withReviewStatus();
    const both = await findIssues({ statuses: ["review"], statusCategories: ["done"] }, { page: 0, size: 50 });
    expect(both.items.every((i) => i.status === "review" || i.status === "done")).toBe(true);
    expect(keys(both.items)).toContain("ALM-1");
    expect((await findIssues({ statusCategories: ["없는-분류"] }, { page: 0, size: 50 })).total).toBe(0);
  });

  it("openOnly는 완료 분류(kind=complete) 상태를 뺀다", async () => {
    const open = await findIssues({ projectIds: ["p1"], openOnly: true }, { page: 0, size: 200 });
    const all = await findIssues({ projectIds: ["p1"] }, { page: 0, size: 200 });
    expect(open.items.some((i) => i.status === "done")).toBe(false);
    expect(all.total - open.total).toBe(all.items.filter((i) => i.status === "done").length);
  });
});

describe("검색 — 날짜·수정 시각 조건", () => {
  it("마감일 조건은 마감일 없는 이슈를 잡지 않고, dueBefore는 배타·dueFrom/dueTo는 포함이다", async () => {
    await createIssue({ projectId: "p1", title: "어제 마감", dueDate: "2026-10-15" });
    await createIssue({ projectId: "p1", title: "오늘 마감", dueDate: "2026-10-16" });
    await createIssue({ projectId: "p1", title: "다음 주 마감", dueDate: "2026-10-23" });
    await createIssue({ projectId: "p1", title: "마감일 없음 마감" });
    const titles = async (criteria: Parameters<typeof findIssues>[0]) =>
      (await findIssues({ ...criteria, text: "마감" }, { page: 0, size: 50 })).items.map((i) => i.title).sort();

    expect(await titles({ dueBefore: "2026-10-16" })).toEqual(["어제 마감"]);
    expect(await titles({ dueFrom: "2026-10-16", dueTo: "2026-10-23" })).toEqual(["다음 주 마감", "오늘 마감"]);
    expect(await titles({ dueTo: "2099-01-01" })).toEqual(["다음 주 마감", "어제 마감", "오늘 마감"]);
    expect(await titles({})).toContain("마감일 없음 마감");
  });

  it("updatedSince는 그 시각 이후 수정된 이슈만", async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    const page = await findIssues({ updatedSince: before }, { page: 0, size: 200 });
    const all = await findIssues({}, { page: 0, size: 200 });
    expect(page.total).toBe(all.items.filter((i) => Date.parse(i.updatedAt) >= Date.parse(before)).length);
    expect((await findIssues({ updatedSince: "2999-01-01T00:00:00Z" }, { page: 0, size: 10 })).total).toBe(0);
  });
});

describe("검색 — 정렬과 페이지", () => {
  it("total은 조건 전체 건수이고 페이지는 size만큼 자른다(서버 최대 200)", async () => {
    const first = await listIssuesPage("p1", undefined, { page: 0, size: 3 });
    const second = await listIssuesPage("p1", undefined, { page: 1, size: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.total).toBe(second.total);
    expect(first.total).toBeGreaterThan(3);
    // 기본 정렬은 키 오름차순이라 페이지가 겹치지 않는다
    expect(keys(first.items)).toEqual(["ALM-1", "ALM-2", "ALM-3"]);
    expect(keys(second.items)).toEqual(["ALM-4", "ALM-5", "ALM-6"]);
    expect((await findIssues({}, { page: 0, size: 5000 })).size).toBe(200);
  });

  it("정렬은 조건 전체에 대해 한다 — 키 내림차순 첫 페이지에 마지막 키가 온다", async () => {
    const page = await listIssuesPage("p1", undefined, { page: 0, size: 2 }, { field: "key", dir: "desc" });
    expect(keys(page.items)).toEqual(["ALM-8", "ALM-7"]);
  });

  it("마감일 정렬은 방향과 무관하게 마감일 없음을 맨 뒤로 둔다", async () => {
    for (const dir of ["asc", "desc"] as const) {
      const page = await listIssuesPage("p1", undefined, { page: 0, size: 200 }, { field: "due", dir });
      const dues = page.items.map((i) => i.dueDate);
      const firstNull = dues.indexOf(null);
      expect(firstNull).toBeGreaterThan(0);
      expect(dues.slice(firstNull).every((d) => d === null)).toBe(true);
    }
  });

  it("상태 정렬은 분류 순(할 일 → 진행 → 완료), 우선순위 정렬은 레지스트리 순(높음 먼저)", async () => {
    const byStatus = await listIssuesPage("p1", undefined, { page: 0, size: 200 }, { field: "status", dir: "asc" });
    const rank = { todo: 0, inprogress: 1, done: 2 } as Record<string, number>;
    const ranks = byStatus.items.map((i) => rank[i.status]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    const byPriority = await listIssuesPage("p1", undefined, { page: 0, size: 200 }, { field: "priority", dir: "asc" });
    expect(byPriority.items[0].priority).toBe("high");
    expect(byPriority.items.at(-1)!.priority).toBe("low");
  });

  it("제목 정렬은 대소문자를 무시한다", async () => {
    await createIssue({ projectId: "p1", title: "alpha 정렬" });
    await createIssue({ projectId: "p1", title: "Beta 정렬" });
    const page = await findIssues({ text: "정렬" }, { page: 0, size: 10 }, { field: "title", dir: "asc" });
    expect(page.items.map((i) => i.title)).toEqual(["alpha 정렬", "Beta 정렬"]);
  });
});

describe("집계와 라벨", () => {
  it("나온 값만 건수 내림차순·키 오름차순, 미지정 담당자는 unassigned", async () => {
    const all = await findIssues({ projectIds: ["p1"] }, { page: 0, size: 200 });
    const byStatus = await aggregateIssues({ projectIds: ["p1"] }, "status");
    expect(byStatus.total).toBe(all.total);
    expect(byStatus.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(all.total);
    for (const bucket of byStatus.buckets) {
      expect(bucket.count).toBe(all.items.filter((i) => i.status === bucket.key).length);
    }
    const counts = byStatus.buckets.map((b) => b.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    const byAssignee = await aggregateIssues({ projectIds: ["p1"], openOnly: true }, "assignee");
    const unassigned = all.items.filter((i) => i.assigneeId === null && i.status !== "done").length;
    expect(byAssignee.buckets.find((b) => b.key === "unassigned")?.count).toBe(unassigned);
    expect(byAssignee.buckets.every((b) => b.count > 0)).toBe(true);
  });

  it("상태 분류 집계는 커스텀 상태를 그 분류로 센다", async () => {
    await withReviewStatus();
    const byCategory = await aggregateIssues({ projectIds: ["p1"] }, "statusCategory");
    const all = await findIssues({ projectIds: ["p1"], statusCategories: ["inprogress"] }, { page: 0, size: 200 });
    expect(byCategory.buckets.find((b) => b.key === "inprogress")?.count).toBe(all.total);
    expect(byCategory.buckets.some((b) => b.key === "review")).toBe(false);
  });

  it("분류 지정자는 id·kind·이름을 대소문자 없이 받고, 워크플로에 없는 상태는 uncategorized로 센다", async () => {
    const byKind = await findIssues({ projectIds: ["p1"], statusCategories: ["COMPLETE"] }, { page: 0, size: 50 });
    const byId = await findIssues({ projectIds: ["p1"], statusCategories: ["done"] }, { page: 0, size: 50 });
    expect(byKind.total).toBe(byId.total);
    expect(byKind.total).toBeGreaterThan(0);

    // 워크플로 밖 상태(구버전 데이터 등) — 집계 버킷 합이 total과 같아야 한다
    const created = await createIssue({ projectId: "p1", title: "고아 상태" });
    const raw = JSON.parse(localStorage.getItem("alm.jira.v1")!);
    raw.issues.find((i: { id: string }) => i.id === created.id).status = "ghost";
    localStorage.setItem("alm.jira.v1", JSON.stringify(raw));
    __resetForTest(); // 캐시를 버리고 저장소에서 다시 읽는다
    const byCategory = await aggregateIssues({ projectIds: ["p1"] }, "statusCategory");
    expect(byCategory.buckets.find((b) => b.key === "uncategorized")?.count).toBe(1);
    expect(byCategory.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(byCategory.total);
  });

  it("라벨은 중복 없이 대소문자 무시 순으로 준다", async () => {
    const created = await createIssue({ projectId: "p1", title: "라벨", labels: ["Zeta", "alpha"] });
    await updateIssue(created.id, { labels: ["Zeta", "alpha", "backend"] }, __versionForTest("issue", created.id));
    const labels = await listProjectLabels("p1");
    expect(labels).toEqual([...new Set(labels)]);
    expect(labels.indexOf("alpha")).toBeLessThan(labels.indexOf("backend"));
    expect(labels.indexOf("backend")).toBeLessThan(labels.indexOf("Zeta"));
  });
});
