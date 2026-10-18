import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { bulkDeleteIssues, bulkUpdateIssues } from "./jiraApi";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

const okRow = (issueId: number) => ({
  issueId,
  key: `ALM-${issueId}`,
  ok: true,
  code: "OK",
  error: null,
  currentVersion: null,
  issue: null,
});

afterEach(() => vi.restoreAllMocks());

describe("REST 일괄 편집 — POST /api/alm/issues/bulk (A-11)", () => {
  it("한 요청으로 보낸다 — 화면이 본 버전, 보낸 키만(changes), id는 서버 숫자", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      json(200, { updated: 2, failed: 0, results: [okRow(1), okRow(2)] }),
    );

    const result = await bulkUpdateIssues(
      [
        { id: "1", key: "ALM-1", version: 3 },
        { id: "2", key: "ALM-2", version: 7 },
      ],
      { priority: "high", assigneeId: null, sprintId: "12", addLabels: ["b"] },
    );

    expect(result).toEqual({ updated: 2, failed: [] });
    expect(spy).toHaveBeenCalledTimes(1);
    const [path, init] = spy.mock.calls[0];
    expect(String(path)).toBe("/api/alm/issues/bulk");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [
        { issueId: 1, expectedVersion: 3 },
        { issueId: 2, expectedVersion: 7 },
      ],
      // status·fixVersionId·removeLabels는 보내지 않았다 — 키가 없으면 그대로
      changes: { priority: "high", assigneeId: null, sprintId: 12, addLabels: ["b"] },
    });
  });

  it("실패 행은 서버 키로 표시하고, 키가 없으면(볼 수 없거나 없는 이슈) '볼 수 없는 이슈'", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      json(200, {
        updated: 1,
        failed: 2,
        results: [
          okRow(1),
          { issueId: 2, key: "ALM-2", ok: false, code: "CONFLICT", error: "다른 사용자가 먼저 수정했습니다", currentVersion: 9, issue: null },
          { issueId: 3, key: null, ok: false, code: "FORBIDDEN", error: "권한이 없습니다", currentVersion: null, issue: null },
        ],
      }),
    );

    const result = await bulkUpdateIssues(
      [
        { id: "1", key: "ALM-1", version: 1 },
        { id: "2", key: "ALM-2", version: 1 },
        { id: "3", key: "ALM-3", version: 1 },
      ],
      { status: "done" },
    );

    expect(result).toEqual({
      updated: 1,
      failed: [
        { id: "2", key: "ALM-2", reason: "다른 사용자가 먼저 수정했습니다" },
        { id: "3", key: "볼 수 없는 이슈", reason: "권한이 없습니다" },
      ],
    });
  });

  it("서버 상한(200건)을 넘으면 200건씩 나눠 보내고 결과를 합친다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async (_path, init) => {
      const items = JSON.parse(String(init?.body)).items as { issueId: number }[];
      return json(200, { updated: items.length, failed: 0, results: items.map((i) => okRow(i.issueId)) });
    });
    const targets = Array.from({ length: 450 }, (_, i) => ({ id: String(i + 1), version: 1 }));

    const result = await bulkUpdateIssues(targets, { priority: "low" });

    expect(result.updated).toBe(450);
    expect(spy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).items.length)).toEqual([200, 200, 50]);
  });

  it("400(빈 변경 등)은 서버 문구 그대로 던진다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(json(400, { error: "바꿀 내용이 없습니다" }));
    await expect(bulkUpdateIssues([{ id: "1", version: 1 }], {})).rejects.toThrow("바꿀 내용이 없습니다");
  });
});

describe("REST 대량 삭제 — 일괄 API가 없어 동시성 상한 안에서 병렬", () => {
  it("동시에 처리하고(최대 5개), 실패 행에 키를 싣는다", async () => {
    let inFlight = 0;
    let max = 0;
    vi.spyOn(client, "sharedApiFetch").mockImplementation(async (input) => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await tick();
      inFlight -= 1;
      const id = Number(/\/issues\/(\d+)/.exec(String(input))?.[1]);
      return id === 4 ? json(403, { error: "권한이 없습니다" }) : new Response(null, { status: 204 });
    });
    const targets = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), key: `ALM-${i + 1}` }));

    const result = await bulkDeleteIssues(targets);

    expect(result.deleted).toBe(7);
    expect(result.failed).toEqual([{ id: "4", key: "ALM-4", reason: "권한이 없습니다" }]);
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(5);
  });
});
