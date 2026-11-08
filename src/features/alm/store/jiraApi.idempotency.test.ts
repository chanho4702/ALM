import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { createIssue } from "./jiraApi";
import type { IssueDto } from "./mapping";

const ISSUE: IssueDto = {
  id: 7,
  key: "ALM-7",
  projectId: 3,
  title: "로그인 오류",
  description: "",
  type: "TASK",
  status: "todo",
  priority: "MEDIUM",
  assigneeId: null,
  reporterId: 1,
  sprintId: null,
  parentId: null,
  dueDate: null,
  estimateHours: null,
  labels: [],
  order: 4,
  version: 1,
  createdAt: "2026-08-16T00:00:00Z",
  updatedAt: "2026-08-16T01:00:00Z",
} as IssueDto;

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const headerOf = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createIssue 멱등 키(N10)", () => {
  it("idempotencyKey를 주면 Idempotency-Key 헤더로 보내고 본문에는 싣지 않는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(201, ISSUE));
    await createIssue({ projectId: "3", title: "로그인 오류", idempotencyKey: "k-1" });
    const init = spy.mock.calls[0][1];
    expect(headerOf(init, "Idempotency-Key")).toBe("k-1");
    expect(JSON.parse(init!.body as string)).not.toHaveProperty("idempotencyKey");
  });

  it("키가 없으면 헤더를 생략한다(예전 호출부 그대로)", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(201, ISSUE));
    await createIssue({ projectId: "3", title: "로그인 오류" });
    expect(headerOf(spy.mock.calls[0][1], "Idempotency-Key")).toBeNull();
  });

  it("같은 키 재요청의 200 + Idempotency-Replayed 응답은 같은 이슈로 받는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      response(200, ISSUE, { "Idempotency-Replayed": "true" }),
    );
    await expect(createIssue({ projectId: "3", title: "로그인 오류", idempotencyKey: "k-1" })).resolves.toMatchObject({
      key: "ALM-7",
    });
  });

  it("409(같은 요청 처리 중)는 같은 키로 잠시 뒤 다시 물어 처음 결과를 받는다 — 이슈를 둘로 만들지 않는다", async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(409, { error: "같은 요청이 처리 중입니다" }))
      .mockResolvedValueOnce(response(200, ISSUE, { "Idempotency-Replayed": "true" }));
    const result = createIssue({ projectId: "3", title: "로그인 오류", idempotencyKey: "k-9" });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ key: "ALM-7" });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(headerOf(spy.mock.calls[1][1], "Idempotency-Key")).toBe("k-9");
  });

  it("409가 계속되면 몇 번 뒤 409 오류로 끝난다(무한 재시도 금지)", async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockImplementation(async () => response(409, { error: "같은 요청이 처리 중입니다" }));
    const result = createIssue({ projectId: "3", title: "로그인 오류", idempotencyKey: "k-9" });
    const settled = expect(result).rejects.toMatchObject({ status: 409 });
    await vi.runAllTimersAsync();
    await settled;
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("키 없는 409는 다시 묻지 않는다(멱등 보장이 없는 요청)", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(409, { error: "충돌" }));
    await expect(createIssue({ projectId: "3", title: "로그인 오류" })).rejects.toMatchObject({ status: 409 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
