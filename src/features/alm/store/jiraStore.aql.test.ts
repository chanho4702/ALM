import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTest,
  aqlFields,
  archiveIssue,
  getIssueByKey,
  queryIssuesAql,
  updateIssue,
  validateAql,
} from "./jiraStore";
import { AqlError } from "./aql/types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

const keys = async (aql: string) => (await queryIssuesAql(aql)).items.map((i) => i.key);

describe("jiraStore AQL 파사드 (목업)", () => {
  it("빈 절은 시드 8건 전부, 기본 정렬은 updated DESC", async () => {
    const page = await queryIssuesAql("");
    expect(page.total).toBe(8);
    expect(page.items).toHaveLength(8);
    expect(page.page).toBe(0);
  });

  it("레지스트리 이름으로 해석한다", async () => {
    expect(await keys("project = ALM AND type = 버그")).toEqual(["ALM-8"]);
    // "진행"은 상태 이름이 아니다 — 빈 결과가 아니라 400이다(서버와 같은 성질)
    await expect(queryIssuesAql("상태 = 진행")).rejects.toMatchObject({
      message: "상태를 모릅니다: 진행",
    });
    expect(await keys('status = "진행 중" ORDER BY key ASC')).toEqual(["ALM-2", "ALM-3"]);
    expect(await keys("assignee = currentUser() ORDER BY key ASC")).toEqual(["ALM-1", "ALM-3"]);
  });

  it("페이지 자르기와 total", async () => {
    const page = await queryIssuesAql("ORDER BY key ASC", { page: 1, size: 3 });
    expect(page.total).toBe(8);
    expect(page.size).toBe(3);
    expect(page.items.map((i) => i.key)).toEqual(["ALM-4", "ALM-5", "ALM-6"]);
  });

  it("보관 이슈는 기본 제외, archived = true로 찾는다", async () => {
    const issue = await getIssueByKey("ALM-7");
    await archiveIssue(issue!.id);

    expect(await keys("ORDER BY key ASC")).not.toContain("ALM-7");
    expect(await keys("archived = true")).toEqual(["ALM-7"]);
  });

  it("날짜 경계는 실행 기계 시간대가 아니라 Asia/Seoul이다", async () => {
    // 2026-09-06 23:30 UTC = 2026-09-07 08:30 KST. UTC로 계산하면 "오늘"이 하루 밀린다.
    const issue = await getIssueByKey("ALM-2");
    await updateIssue(issue!.id, { dueDate: "2026-09-07" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T23:30:00Z"));
    try {
      expect(await keys("due = startOfDay()")).toEqual(["ALM-2"]);
      expect(await keys("due = startOfDay(-1)")).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("문법 오류는 AqlError(position)로 던진다", async () => {
    await expect(queryIssuesAql("status == done")).rejects.toBeInstanceOf(AqlError);
    await expect(queryIssuesAql("status == done")).rejects.toMatchObject({ position: 7 });
  });

  it("validateAql은 던지지 않고 같은 계약을 돌려준다", async () => {
    // 통과하면 쓰인 필드의 정식명도 함께 온다(서버 validate 응답의 `fields`)
    expect(await validateAql("project = ALM")).toEqual({ ok: true, fields: ["project"] });
    expect(await validateAql("priority ~ high")).toMatchObject({
      ok: false,
      error: "'~'는 텍스트 필드에만 쓸 수 있습니다 (priority)",
      position: 9,
    });
  });

  it("aqlFields는 레지스트리에서 값 후보를 채운다", async () => {
    const info = await aqlFields();
    const byName = Object.fromEntries(info.fields.map((f) => [f.name, f]));

    expect(byName.project.values).toEqual([{ id: "ALM", name: "ALM" }]);
    expect(byName.status.values?.map((v) => v.name)).toEqual(["할 일", "진행 중", "완료"]);
    expect(byName.priority.values?.map((v) => v.id)).toContain("high");
    expect(byName.assignee.values?.map((v) => v.name)).toContain("김찬호");
    expect(byName.labels.values?.map((v) => v.id)).toEqual([
      "backend",
      "design",
      "frontend",
      "infra",
    ]);
    expect(byName.statusCategory.values).toEqual([
      { id: "new", name: "할 일" },
      { id: "active", name: "진행 중" },
      { id: "complete", name: "완료" },
    ]);
    expect(byName.summary.operators).toContain("~");
    expect(byName.status.operators).not.toContain("~");
  });
});
