import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  addComment,
  addIssueLink,
  addWorklog,
  createBoard,
  getBoard,
  listActivity,
  listBoardIssues,
  listBoards,
  listChildren,
  listComments,
  listIssueLinks,
  listWorklogs,
  searchIssues,
  updateBoard,
  updateVersion,
} from "./jiraApi";
import type { IssueDto } from "./mapping";

const ISSUE: IssueDto = {
  id: 7,
  key: "ALM-7",
  projectId: 3,
  title: "로그인 오류",
  description: "",
  type: "bug",
  status: "done",
  priority: "HIGH",
  assigneeId: null,
  reporterId: 1,
  parentId: null,
  dueDate: null,
  estimateHours: null,
  labels: [],
  order: 1,
  version: 2,
  createdAt: "2026-08-16T00:00:00Z",
  updatedAt: "2026-08-16T01:00:00Z",
};

const BOARD = {
  id: 11,
  projectId: 3,
  name: "메인 보드",
  type: "scrum",
  filter: { assigneeIds: [], types: [], labels: [] },
  columns: [],
  swimlane: "none",
  isDefault: true,
  createdAt: "2026-08-16T00:00:00Z",
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function fetchSpy(handler: (path: string, init?: RequestInit) => Response) {
  return vi
    .spyOn(client, "sharedApiFetch")
    .mockImplementation((path: string, init?: RequestInit) => Promise.resolve(handler(path, init)));
}

afterEach(() => vi.restoreAllMocks());

describe("jiraApi 코멘트·워크로그", () => {
  it("코멘트를 이슈 경로로 만들고 id를 문자열로 옮긴다", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "POST"
        ? response(201, { id: 5, issueId: 7, authorId: 1, body: "확인", createdAt: "2026-08-30T00:00:00Z", updatedAt: null })
        : response(200, [
            { id: 5, issueId: 7, authorId: 1, body: "확인", createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T01:00:00Z" },
          ]),
    );
    const created = await addComment("7", "확인");
    expect(spy).toHaveBeenCalledWith(
      "/api/alm/issues/7/comments",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "확인", mentionedUserIds: [] }) }),
    );
    expect(created).toMatchObject({ id: "5", issueId: "7", authorId: "1", body: "확인" });
    expect(created.updatedAt).toBeUndefined();

    const [listed] = await listComments("7");
    expect(listed.updatedAt).toBe("2026-08-30T01:00:00Z");
  });

  it("워크로그는 기록 시각을 at으로 옮기고 작업일 최신순으로 정렬한다", async () => {
    fetchSpy((_path, init) =>
      init?.method === "POST"
        ? response(201, { id: 1, issueId: 7, authorId: 1, hours: 2.5, comment: "구현", workedOn: "2026-08-30", createdAt: "2026-08-30T00:00:00Z" })
        : response(200, [
            { id: 1, issueId: 7, authorId: 1, hours: 1, comment: "", workedOn: "2026-08-28", createdAt: "2026-08-28T00:00:00Z" },
            { id: 2, issueId: 7, authorId: 1, hours: 2, comment: "", workedOn: "2026-08-30", createdAt: "2026-08-30T00:00:00Z" },
          ]),
    );
    const created = await addWorklog("7", { hours: 2.5, comment: "구현", workedOn: "2026-08-30" });
    expect(created).toMatchObject({ id: "1", hours: 2.5, at: "2026-08-30T00:00:00Z" });
    const listed = await listWorklogs("7");
    expect(listed.map((w) => w.id)).toEqual(["2", "1"]);
  });
});

describe("jiraApi 링크·활동·하위", () => {
  it("링크는 source 이슈 경로로 만들고 조회 시 상대 이슈를 매핑한다", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "POST"
        ? response(201, { id: 9, sourceId: 7, targetId: 8, type: "blocks" })
        : response(200, [{ link: { id: 9, sourceId: 7, targetId: 8, type: "blocks" }, other: { ...ISSUE, id: 8, key: "ALM-8" }, direction: "outward" }]),
    );
    const link = await addIssueLink({ sourceId: "7", targetId: "8", type: "blocks" });
    expect(spy).toHaveBeenCalledWith(
      "/api/alm/issues/7/links",
      expect.objectContaining({ body: JSON.stringify({ targetId: 8, type: "blocks" }) }),
    );
    expect(link).toEqual({ id: "9", sourceId: "7", targetId: "8", type: "blocks" });
    const [view] = await listIssueLinks("7");
    expect(view.direction).toBe("outward");
    expect(view.other.key).toBe("ALM-8");
    expect(view.link.id).toBe("9");
  });

  it("활동은 occurredAt을 at으로 옮긴다", async () => {
    fetchSpy(() => response(200, [{ id: 3, issueId: 7, actorId: 1, type: "status", detail: "할 일 → 완료", occurredAt: "2026-08-30T00:00:00Z" }]));
    const [activity] = await listActivity("7");
    expect(activity).toEqual({ id: "3", issueId: "7", actorId: "1", type: "status", detail: "할 일 → 완료", at: "2026-08-30T00:00:00Z" });
  });

  it("하위 이슈와 텍스트 검색은 서버 검색으로 간다", async () => {
    const spy = fetchSpy(() => response(200, { items: [ISSUE], page: 0, size: 200, total: 1 }));
    const children = await listChildren("5");
    expect(spy.mock.calls[0][0]).toContain("parentId=5");
    expect(children[0].key).toBe("ALM-7");
    await searchIssues("로그인", 5);
    expect(spy.mock.calls[1][0]).toContain("text=%EB%A1%9C%EA%B7%B8%EC%9D%B8");
    expect(spy.mock.calls[1][0]).toContain("size=5");
  });

  it("버전 수정은 화면이 본 값으로 전체 본문을 채우고 그 버전을 expectedVersion으로 보낸다(목록 재조회 없음)", async () => {
    const spy = fetchSpy(() =>
      response(200, { id: 4, projectId: 3, name: "1.1", description: "", status: "UNRELEASED", version: 6, createdAt: "2026-08-16T00:00:00Z", updatedAt: "2026-08-16T00:00:00Z" }),
    );
    const updated = await updateVersion(
      { id: "4", projectId: "3", name: "1.0", description: "설명", releaseDate: "2026-09-30", status: "unreleased", createdAt: "2026-08-16T00:00:00Z", version: 5 },
      { name: " 1.1 ", releaseDate: null },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const [path, init] = spy.mock.calls[0];
    expect(String(path)).toBe("/api/alm/versions/4");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "1.1",
      description: "설명",
      startDate: null,
      releaseDate: null,
      expectedVersion: 5,
    });
    expect(updated).toMatchObject({ id: "4", name: "1.1", version: 6 });
  });
});

describe("jiraApi 보드", () => {
  it("보드 목록·단건·생성·수정을 매핑한다", async () => {
    const spy = fetchSpy((path, init) => {
      if (init?.method === "POST") return response(201, { ...BOARD, id: 12, name: "칸반", type: "kanban", isDefault: false });
      if (init?.method === "PUT") return response(200, { ...BOARD, swimlane: "assignee" });
      if (path.endsWith("/boards/404")) return response(404, { error: "보드를 찾을 수 없습니다" });
      if (path.endsWith("/boards/11")) return response(200, BOARD);
      if (path.endsWith("/boards/11/issues")) return response(200, [ISSUE]);
      return response(200, [BOARD]);
    });
    const [board] = await listBoards("3");
    expect(board).toMatchObject({ id: "11", projectId: "3", type: "scrum", isDefault: true, columns: [] });
    expect(await getBoard("404")).toBeNull();
    expect((await getBoard("11"))?.name).toBe("메인 보드");
    const created = await createBoard({ projectId: "3", name: "칸반", type: "kanban" });
    expect(created).toMatchObject({ id: "12", type: "kanban", isDefault: false });
    const updated = await updateBoard("11", { swimlane: "assignee" });
    expect(spy).toHaveBeenCalledWith(
      "/api/alm/boards/11",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ swimlane: "assignee" }) }),
    );
    expect(updated.swimlane).toBe("assignee");
    const issues = await listBoardIssues("11");
    expect(issues[0].key).toBe("ALM-7");
  });
});
