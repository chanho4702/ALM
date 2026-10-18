import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { bulkDeleteIssues, bulkUpdateIssues } from "./jiraApi";
import type { IssueDto } from "./mapping";

function dto(id: number): IssueDto {
  return {
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
    labels: ["a"],
    version: 2,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

/** 요청마다 한 틱 늦게 응답하면서 동시에 떠 있는 요청 수의 최댓값을 잰다 */
function fakeServer(handler: (method: string, id: number) => Response) {
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: { method: string; id: number }[] = [];
  const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const id = Number(/\/issues\/(\d+)/.exec(String(input))?.[1]);
    calls.push({ method, id });
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await tick();
    inFlight -= 1;
    return handler(method, id);
  });
  return { spy, calls, max: () => maxInFlight };
}

afterEach(() => vi.restoreAllMocks());

describe("REST 대량 변경 — 병렬(동시성 상한)·요청 수·실패 행 키", () => {
  it("이슈마다 GET 1번 + PUT 1번만 보내고, 여러 건을 동시에(최대 5개) 처리한다", async () => {
    const server = fakeServer((method, id) => json(200, method === "PUT" ? { ...dto(id), version: 3 } : dto(id)));
    const targets = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), key: `ALM-${i + 1}`, version: 2 }));

    const result = await bulkUpdateIssues(targets, { priority: "high", addLabels: ["b"] });

    expect(result).toEqual({ updated: 12, failed: [] });
    expect(server.calls.filter((c) => c.method === "GET")).toHaveLength(12);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(12);
    expect(server.max()).toBeGreaterThan(1);
    expect(server.max()).toBeLessThanOrEqual(5);
    // 라벨 병합은 그 GET 본문 기준, 버전은 화면이 본 값 그대로
    const put = server.spy.mock.calls.find(([, init]) => init?.method === "PUT")!;
    const body = JSON.parse(String(put[1]!.body));
    expect(body.details.labels).toEqual(["a", "b"]);
    expect(body.expectedVersion).toBe(2);
    expect(body.priority).toBe("high");
  });

  it("실패 행에는 숫자 id가 아니라 이슈 키가 실린다 — 409는 읽어 둔 키, 읽기부터 실패하면 화면이 넘긴 키", async () => {
    fakeServer((method, id) => {
      if (id === 2 && method === "PUT") return json(409, { error: "다른 사람이 먼저 고쳤습니다" });
      if (id === 3) return json(404, { error: "이슈를 찾을 수 없습니다" });
      return json(200, dto(id));
    });

    const result = await bulkUpdateIssues(
      [
        { id: "1", key: "ALM-1", version: 2 },
        { id: "2", key: "ALM-2", version: 2 },
        { id: "3", key: "ALM-3", version: 2 },
      ],
      { status: "done" },
    );

    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([
      { id: "2", key: "ALM-2", reason: "다른 사람이 먼저 고쳤습니다" },
      { id: "3", key: "ALM-3", reason: "이슈를 찾을 수 없습니다" },
    ]);
  });

  it("대량 삭제도 동시에 처리하고, 실패 행에 키를 싣는다", async () => {
    const server = fakeServer((_, id) =>
      id === 4 ? json(403, { error: "권한이 없습니다" }) : new Response(null, { status: 204 }),
    );
    const targets = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), key: `ALM-${i + 1}` }));

    const result = await bulkDeleteIssues(targets);

    expect(result.deleted).toBe(7);
    expect(result.failed).toEqual([{ id: "4", key: "ALM-4", reason: "권한이 없습니다" }]);
    expect(server.max()).toBeGreaterThan(1);
    expect(server.max()).toBeLessThanOrEqual(5);
  });
});
