import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { cloneIssue as restClone } from "./jiraApi";
import {
  __resetForTest,
  __versionForTest,
  addComment,
  cloneIssue,
  getIssueByKey,
  listComments,
  listIssueLinks,
  listWorklogs,
  updateIssue,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("이슈 복제 (F-11, 목업)", () => {
  it("제목·타입·본문·우선순위·라벨·부모만 복사하고 처음 상태로 — 담당자·스프린트·마감·추정·댓글·워크로그는 없다, 원본과 '복제' 링크", async () => {
    const original = (await getIssueByKey("ALM-2"))!; // 시드: 진행 중, 담당자·스프린트·마감·추정·워크로그·부모 있음
    await updateIssue(original.id, { description: "<p>원본 본문</p>" }, __versionForTest("issue", original.id));
    await addComment(original.id, "원본 댓글");

    const copy = await cloneIssue(original.id);
    const fresh = (await getIssueByKey("ALM-2"))!;

    expect(copy.key).not.toBe(original.key);
    expect(copy).toMatchObject({
      title: `복제: ${original.title}`,
      type: original.type,
      description: fresh.description,
      priority: original.priority,
      labels: original.labels,
      parentId: original.parentId,
      status: "todo",
      assigneeId: null,
      sprintId: null,
      dueDate: null,
      estimateHours: null,
    });
    expect(await listComments(copy.id)).toEqual([]);
    expect(await listWorklogs(copy.id)).toEqual([]);
    const links = await listIssueLinks(copy.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ link: { sourceId: copy.id, targetId: original.id, type: "clones" }, direction: "outward" });
  });
});

describe("이슈 복제 (F-11, REST)", () => {
  it("POST /api/alm/issues/{id}/clone(본문 없음) → 새 이슈", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: 99, key: "ALM-99", projectId: 3, title: "복제: 로그인", description: "", type: "bug", status: "todo", priority: "high", assigneeId: null, reporterId: 1, labels: [], version: 0, createdAt: "", updatedAt: "" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copy = await restClone("7");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/7/clone");
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(spy.mock.calls[0][1]?.body).toBeUndefined();
    expect(copy).toMatchObject({ id: "99", key: "ALM-99", title: "복제: 로그인" });
  });
});
