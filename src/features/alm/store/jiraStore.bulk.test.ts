import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  bulkDeleteIssues,
  bulkUpdateIssues,
  getIssueByKey,
  importIssues,
  listIssues,
  listSchemes,
  updateScheme,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

const idsOf = async (...keys: string[]) =>
  Promise.all(keys.map(async (key) => (await getIssueByKey(key))!.id));

describe("대량 변경", () => {
  it("여러 이슈의 우선순위·담당자를 한 번에 바꾸고 결과 수를 돌려준다", async () => {
    const ids = await idsOf("ALM-3", "ALM-4");
    const result = await bulkUpdateIssues(ids, { priority: "high", assigneeId: "u2" });
    expect(result).toEqual({ updated: 2, failed: [] });
    for (const key of ["ALM-3", "ALM-4"]) {
      expect(await getIssueByKey(key)).toMatchObject({ priority: "high", assigneeId: "u2" });
    }
  });

  it("라벨은 추가·제거를 합쳐 적용하고 중복 없이 남긴다", async () => {
    const [id] = await idsOf("ALM-6"); // 시드 라벨: backend
    await bulkUpdateIssues([id], { addLabels: ["backend", "urgent"], removeLabels: ["nothing"] });
    expect((await getIssueByKey("ALM-6"))!.labels).toEqual(["backend", "urgent"]);
    await bulkUpdateIssues([id], { removeLabels: ["backend"] });
    expect((await getIssueByKey("ALM-6"))!.labels).toEqual(["urgent"]);
  });

  it("전이 규칙에 막힌 이슈는 실패 목록에 사유와 함께 남고 나머지는 바뀐다", async () => {
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        transitions: [{ id: "t1", name: "시작", from: ["todo"], to: "inprogress" }],
      },
    });
    const [todo, inprogress] = await idsOf("ALM-4", "ALM-2"); // ALM-4 할 일, ALM-2 진행 중
    const result = await bulkUpdateIssues([todo, inprogress], { status: "done" });
    expect(result.updated).toBe(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]).toMatchObject({ key: "ALM-4" });
    expect(result.failed[0].reason).toContain("옮길 수 없습니다");

    const partial = await bulkUpdateIssues([todo, inprogress], { status: "inprogress" });
    expect(partial.updated).toBe(1); // ALM-4만 이동, ALM-2는 같은 상태(변경 아님)
    expect((await getIssueByKey("ALM-4"))!.status).toBe("inprogress");
  });

  it("빈 선택은 거부하고, 대량 삭제는 하위 작업까지 지운다", async () => {
    await expect(bulkUpdateIssues([], { priority: "low" })).rejects.toThrow("선택한 이슈가 없습니다");
    const ids = await idsOf("ALM-7", "ALM-8");
    const before = (await listIssues("p1")).length;
    const result = await bulkDeleteIssues(ids);
    expect(result).toEqual({ deleted: 2, failed: [] });
    expect((await listIssues("p1")).length).toBe(before - 2);
  });
});

describe("가져오기", () => {
  it("키를 보존해 만들고, 카운터는 그 번호 이상으로 앞당겨지며, 중복 키는 사유와 함께 실패한다", async () => {
    const result = await importIssues("p1", [
      { key: "ALM-20", title: "이관 이슈", status: "done", priority: "high", labels: ["legacy"], estimateHours: 3 },
      { key: "ALM-1", title: "중복 키" },
      { title: "키 없는 이슈" },
    ]);
    expect(result.created).toBe(2);
    expect(result.failed).toEqual([{ row: 2, title: "ALM-1", reason: "이미 있는 키입니다: ALM-1" }]);
    expect(await getIssueByKey("ALM-20")).toMatchObject({
      status: "done",
      priority: "high",
      labels: ["legacy"],
      estimateHours: 3,
      resolution: "done",
    });
    expect((await getIssueByKey("ALM-21"))?.title).toBe("키 없는 이슈"); // 카운터가 20을 넘어섰다
    await expect(importIssues("p1", [{ key: "PAY-1", title: "다른 프로젝트 키" }])).resolves.toMatchObject({
      created: 0,
      failed: [{ reason: "키는 ALM-번호 형식이어야 합니다: PAY-1" }],
    });
  });
});
