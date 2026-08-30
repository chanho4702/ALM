import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  bulkDeleteIssues,
  bulkUpdateIssues,
  getIssueByKey,
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
