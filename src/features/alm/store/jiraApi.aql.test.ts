import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { aqlFields, queryIssuesAql, validateAql } from "./jiraApi";
import { AqlError } from "./aql/types";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

const ISSUE_DTO = {
  id: 9,
  key: "ALM-9",
  projectId: 7,
  title: "로그인 버그",
  description: "",
  type: "bug",
  status: "todo",
  priority: "high",
  assigneeId: 1,
  reporterId: 1,
  parentId: null,
  dueDate: null,
  estimateHours: null,
  labels: [],
  order: 1,
  version: 1,
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

afterEach(() => vi.restoreAllMocks());

/**
 * 서버 계약(스펙 §4) 대조 — 경로·body·응답 shape·오류 계약.
 * 이 파일이 깨지면 백엔드가 계약을 바꾼 것이다(양쪽을 함께 고친다).
 */
describe("jiraApi AQL 계약", () => {
  it("POST /api/alm/issues/query 에 {aql,page,size}를 보내고 페이지 shape을 받는다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValue(response(200, { items: [ISSUE_DTO], page: 0, size: 50, total: 1 }));

    const page = await queryIssuesAql("type = bug", { page: 0, size: 50 });

    const [path, init] = spy.mock.calls[0];
    expect(path).toBe("/api/alm/issues/query");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      aql: "type = bug",
      page: 0,
      size: 50,
    });
    expect(page.total).toBe(1);
    expect(page.items[0].key).toBe("ALM-9");
    expect(page.items[0].projectId).toBe("7");
  });

  it("400 {error, position, expected}는 AqlError로 올라온다 (에디터가 밑줄을 그릴 수 있게)", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      response(400, { error: "연산자를 모릅니다: ==", position: 7, expected: ["=", "!="] }),
    );

    await expect(queryIssuesAql("status == done")).rejects.toMatchObject({
      message: "연산자를 모릅니다: ==",
      position: 7,
      expected: ["=", "!="],
    });
    await expect(queryIssuesAql("status == done")).rejects.toBeInstanceOf(AqlError);
  });

  it("validate는 200 {ok:false}든 400이든 같은 모양으로 돌려준다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ok: true }))
      .mockResolvedValueOnce(response(200, { ok: false, error: "값이 필요합니다", position: 9 }))
      .mockResolvedValueOnce(response(400, { error: "필드를 모릅니다: statuss", position: 0 }));

    expect(await validateAql("project = ALM")).toEqual({ ok: true, fields: [] });
    expect(await validateAql("status = ")).toMatchObject({
      ok: false,
      error: "값이 필요합니다",
      position: 9,
    });
    expect(await validateAql("statuss = done")).toMatchObject({
      ok: false,
      error: "필드를 모릅니다: statuss",
      position: 0,
    });
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/query/validate");
  });

  it("GET /query/fields의 값 후보를 받아 쓰되, 문법(연산자·별칭)은 프론트 파서가 진실이다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/alm/issues/query/fields")) {
        return response(200, {
          fields: [
            {
              name: "status",
              // 서버가 별칭·연산자를 다르게 주더라도 프론트 규칙이 이긴다
              aliases: ["서버별칭"],
              operators: ["="],
              values: [{ id: "todo", name: "할 일" }],
            },
          ],
        });
      }
      return response(200, [{ id: 1, displayName: "김찬호", email: "a@b.c", status: "ACTIVE", role: "USER" }]);
    });

    const info = await aqlFields();
    const status = info.fields.find((f) => f.name === "status");

    expect(status?.values).toEqual([{ id: "todo", name: "할 일" }]);
    expect(status?.aliases).toEqual(["상태"]);
    expect(status?.operators).toContain("IN");
    // 담당자 후보는 org 멤버에서 채운다(스펙 §4 — 사용자는 /api/org/members)
    expect(info.fields.find((f) => f.name === "assignee")?.values).toEqual([
      { id: "1", name: "김찬호" },
    ]);
    expect(info.functions.map((f) => f.name)).toContain("currentUser");
    expect(info.keywords).toContain("ORDER BY");
  });
});
