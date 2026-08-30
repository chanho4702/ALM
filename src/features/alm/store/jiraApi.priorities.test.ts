import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { createPriority, listPriorities, movePriority } from "./jiraApi";
import { mapIssue, toApiIssuePriority } from "./mapping";
import type { IssueDto } from "./mapping";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("jiraApi 우선순위 레지스트리", () => {
  it("목록을 읽고, 추가·이동은 관리 경로로 보낸다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path.endsWith("/priorities")) {
        return Promise.resolve(response(201, { id: "pr-1", name: "긴급", icon: "flag", color: "danger", description: "", order: 6, builtIn: false }));
      }
      if (path.endsWith("/move")) return Promise.resolve(response(204));
      return Promise.resolve(response(200, [{ id: "highest", name: "최상", icon: "chevrons-up", color: "danger", description: "", order: 1, builtIn: true }]));
    });
    expect((await listPriorities())[0].id).toBe("highest");
    const created = await createPriority({ name: "긴급", icon: "flag", color: "danger" });
    expect(created.order).toBe(6);
    await movePriority("pr-1", -1);
    expect(spy).toHaveBeenCalledWith("/api/alm/settings/priorities/pr-1/move", expect.objectContaining({ method: "POST" }));
  });

  it("옛 대문자 enum 응답도 소문자 id로 받고, 요청은 소문자로 보낸다", () => {
    const dto: IssueDto = {
      id: 7, key: "ALM-7", projectId: 3, title: "t", description: "", type: "task", status: "todo",
      priority: "HIGH", assigneeId: null, reporterId: 1, parentId: null, dueDate: null, estimateHours: null,
      labels: [], order: 1, version: 1, createdAt: "2026-08-16T00:00:00Z", updatedAt: "2026-08-16T00:00:00Z",
    };
    expect(mapIssue(dto).priority).toBe("high");
    expect(toApiIssuePriority("Highest")).toBe("highest");
  });
});
