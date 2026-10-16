import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  aggregateIssues,
  findIssues,
  listIssuesPage,
  listProjectLabels,
  queryIssuesPage,
  updateIssue,
  uploadAttachment,
} from "./jiraApi";
import { EMPTY_QUERY } from "./searchQuery";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TOO_LARGE_MESSAGE } from "./attachmentLimits";
import type { IssueDto } from "./mapping";

const ISSUE: IssueDto = {
  id: 7,
  key: "ALM-7",
  projectId: 3,
  title: "로그인 오류",
  description: "",
  type: "bug",
  status: "review",
  priority: "high",
  assigneeId: null,
  reporterId: 1,
  labels: [],
  version: 5,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

const page = (items: IssueDto[], total: number, pageNo = 0, size = 50) =>
  response(200, { items, page: pageNo, size, total });

function paramsOf(url: unknown): URLSearchParams {
  return new URL(String(url), "http://localhost").searchParams;
}

afterEach(() => vi.restoreAllMocks());

describe("REST 검색 계약 (contract A)", () => {
  it("스마트 쿼리의 상태 분류는 statusCategories로, 상태 id는 statuses로 나눠 보낸다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(page([ISSUE], 312, 2, 50));
    const result = await queryIssuesPage(
      { ...EMPTY_QUERY, statuses: ["inprogress"], statusIds: ["review"], assigneeIds: ["unassigned", "4"], sort: "due" },
      { page: 2, size: 50 },
    );
    const params = paramsOf(spy.mock.calls[0][0]);
    expect(String(spy.mock.calls[0][0])).toMatch(/^\/api\/alm\/issues\/search\?/);
    expect(params.getAll("statusCategories")).toEqual(["inprogress"]);
    expect(params.getAll("statuses")).toEqual(["review"]);
    expect(params.getAll("assignees")).toEqual(["unassigned", "4"]);
    expect(params.get("sort")).toBe("due");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("page")).toBe("2");
    expect(params.get("size")).toBe("50");
    // 건수는 받은 줄 수가 아니라 서버 total
    expect(result).toMatchObject({ page: 2, size: 50, total: 312 });
    expect(result.items[0]).toMatchObject({ id: "7", version: 5 });
  });

  it("목록 화면 정렬을 서버로 보내고, 정렬이 없으면 키 오름차순이다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(page([ISSUE], 1))
      .mockResolvedValueOnce(page([ISSUE], 1));
    await listIssuesPage("3", { label: "frontend" }, { page: 0, size: 50 });
    await listIssuesPage("3", undefined, { page: 1, size: 50 }, { field: "title", dir: "desc" });
    const first = paramsOf(spy.mock.calls[0][0]);
    expect(first.get("projectIds")).toBe("3");
    expect(first.get("labels")).toBe("frontend");
    expect([first.get("sort"), first.get("dir")]).toEqual(["key", "asc"]);
    const second = paramsOf(spy.mock.calls[1][0]);
    expect([second.get("sort"), second.get("dir"), second.get("page")]).toEqual(["title", "desc", "1"]);
  });

  it("홈·가젯 조건(openOnly·마감일 범위·updatedSince)을 그대로 넘기고 크기는 200으로 묶는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(page([], 0));
    await findIssues(
      { openOnly: true, dueFrom: "2026-10-16", dueTo: "2026-10-23", updatedSince: "2026-10-09T00:00:00.000Z" },
      { page: 0, size: 9999 },
      { field: "due", dir: "asc" },
    );
    const params = paramsOf(spy.mock.calls[0][0]);
    expect(params.get("openOnly")).toBe("true");
    expect(params.get("dueFrom")).toBe("2026-10-16");
    expect(params.get("dueTo")).toBe("2026-10-23");
    expect(params.get("updatedSince")).toBe("2026-10-09T00:00:00.000Z");
    expect(params.get("size")).toBe("200");
    expect(params.has("projectIds")).toBe(false); // 비우면 볼 수 있는 전 프로젝트
  });
});

describe("REST 집계·라벨 (contract B·C)", () => {
  it("집계는 groupBy와 조건을 보내고 버킷을 그대로 돌려준다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      response(200, { total: 9, buckets: [{ key: "unassigned", count: 5 }, { key: "4", count: 4 }] }),
    );
    const result = await aggregateIssues({ projectIds: ["3"], openOnly: true }, "assignee");
    const url = String(spy.mock.calls[0][0]);
    expect(url).toMatch(/^\/api\/alm\/issues\/aggregate\?/);
    expect(paramsOf(url).get("groupBy")).toBe("assignee");
    expect(paramsOf(url).get("openOnly")).toBe("true");
    expect(result).toEqual({ total: 9, buckets: [{ key: "unassigned", count: 5 }, { key: "4", count: 4 }] });
  });

  it("라벨은 프로젝트 라벨 엔드포인트 한 번으로 받는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(response(200, ["alpha", "Beta"]));
    expect(await listProjectLabels("3")).toEqual(["alpha", "Beta"]);
    expect(spy.mock.calls[0][0]).toBe("/api/alm/projects/3/labels");
  });
});

describe("같은 GET 동시 호출 공유", () => {
  it("응답 전까지만 요청 하나를 나눠 쓰고, 끝나면 다음 호출은 새로 묻는다(캐시 아님)", async () => {
    let release!: (value: Response) => void;
    const spy = vi.spyOn(client, "sharedApiFetch")
      .mockImplementationOnce(() => new Promise<Response>((done) => { release = done; }))
      .mockResolvedValueOnce(response(200, { total: 2, buckets: [] }));

    const a = aggregateIssues({ projectIds: ["3"] }, "status");
    const b = aggregateIssues({ projectIds: ["3"] }, "status");
    expect(spy).toHaveBeenCalledTimes(1);
    release(response(200, { total: 1, buckets: [{ key: "todo", count: 1 }] }));
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(ra).not.toBe(rb); // 호출자마다 새 객체 — 한쪽이 고쳐도 다른 쪽에 번지지 않는다

    const c = await aggregateIssues({ projectIds: ["3"] }, "status");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(c.total).toBe(2);
  });

  it("URL이 다르면 나누지 않고, 실패도 그 순간 기다리던 호출만 함께 받는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(503, { error: "조직 서비스 장애" }))
      .mockResolvedValueOnce(response(200, { total: 0, buckets: [] }))
      .mockResolvedValueOnce(response(200, { total: 0, buckets: [] }));
    await expect(aggregateIssues({ projectIds: ["3"] }, "priority")).rejects.toThrow("조직 서비스 장애");
    await aggregateIssues({ projectIds: ["3"] }, "priority");
    await aggregateIssues({ projectIds: ["4"] }, "priority");
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe("REST 이슈 수정 — 편집 시작 버전", () => {
  it("저장 직전 최신 버전이 더 높아도 화면이 본 버전을 expectedVersion으로 보낸다(덮어쓰기 대신 409)", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(response(200, { ...ISSUE, version: 6, title: "동료가 바꾼 제목" }))
      .mockResolvedValueOnce(response(409, { error: "다른 사용자가 먼저 수정했습니다" }));
    await expect(updateIssue("7", { description: "내 초안" }, 5)).rejects.toMatchObject({ status: 409 });
    const body = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(body.expectedVersion).toBe(5);
    // 안 건드린 필드는 최신 값으로 채운다(보드 이동처럼 버전을 안 올리는 변경을 되돌리지 않게)
    expect(body.title).toBe("동료가 바꾼 제목");
    expect(body.description).toBe("내 초안");
  });
});

describe("REST 첨부 상한 (contract F)", () => {
  it("20MB를 넘는 파일은 보내지 않고 같은 문구로 막는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch");
    const big = new File(["x"], "큰파일.zip");
    Object.defineProperty(big, "size", { value: ATTACHMENT_MAX_BYTES + 1 });
    await expect(uploadAttachment("7", big)).rejects.toThrow(ATTACHMENT_TOO_LARGE_MESSAGE);
    expect(spy).not.toHaveBeenCalled();
  });

  it("프록시·서버의 413(본문이 HTML일 수 있다)도 같은 문구로 바꾼다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response("<html>413 Request Entity Too Large</html>", { status: 413 }),
    );
    const file = new File(["hello"], "a.txt");
    await expect(uploadAttachment("7", file)).rejects.toMatchObject({
      status: 413,
      message: `${ATTACHMENT_TOO_LARGE_MESSAGE}: a.txt`,
    });
  });
});
