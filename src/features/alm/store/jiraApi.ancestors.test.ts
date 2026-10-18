import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { listIssueAncestors } from "./jiraApi";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const dto = (id: number, parentId: number | null) => ({
  id,
  key: `ALM-${id}`,
  projectId: 3,
  title: `이슈 ${id}`,
  description: "",
  type: "task",
  status: "todo",
  priority: "medium",
  assigneeId: null,
  reporterId: 1,
  labels: [],
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  parentId,
});

afterEach(() => vi.restoreAllMocks());

describe("listIssueAncestors — 부모를 한 단계씩 따라간다(프로젝트 전체 조회 없음)", () => {
  it("넘겨받은 부모부터 루트까지 GET하고 루트 먼저 돌려준다", async () => {
    const chain: Record<number, number | null> = { 10: 7, 7: 2, 2: null };
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async (input) => {
      const id = Number(/\/issues\/(\d+)$/.exec(String(input))![1]);
      return json(dto(id, chain[id]));
    });
    const result = await listIssueAncestors("11", "10");
    expect(result.map((i) => i.key)).toEqual(["ALM-2", "ALM-7", "ALM-10"]);
    expect(spy.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/alm/issues/10",
      "/api/alm/issues/7",
      "/api/alm/issues/2",
    ]);
  });

  it("중간 부모를 못 읽으면 거기까지만, 순환이면 멈춘다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockImplementation(async (input) => {
      const id = Number(/\/issues\/(\d+)$/.exec(String(input))![1]);
      if (id === 5) return json({ error: "권한이 없습니다" }, 403);
      return json(dto(id, id === 9 ? 5 : 8));
    });
    expect((await listIssueAncestors("1", "9")).map((i) => i.key)).toEqual(["ALM-9"]);
    // 8 → 8(자기 자신을 부모로) 같은 망가진 체인도 무한히 돌지 않는다
    expect((await listIssueAncestors("1", "8")).map((i) => i.key)).toEqual(["ALM-8"]);
  });
});
