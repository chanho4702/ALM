import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { addWebLink as restAdd, listWebLinks as restList, removeWebLink as restRemove } from "./jiraApi";
import { __resetForTest, addWebLink, deleteIssue, listWebLinks, removeWebLink } from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("웹 링크 (F-08, 목업)", () => {
  it("붙이면 최신순 목록에 생기고, 같은 URL은 새로 만들지 않고 기존 것을 돌려준다(created: false)", async () => {
    const first = await addWebLink("i1", { url: " https://wiki.example.com/a ", title: "설계 문서" });
    expect(first).toMatchObject({ created: true, link: { url: "https://wiki.example.com/a", title: "설계 문서", kind: "WEB", issueId: "i1" } });
    const again = await addWebLink("i1", { url: "https://wiki.example.com/a", title: "다른 이름", kind: "PR" });
    expect(again).toEqual({ created: false, link: first.link });
    expect((await listWebLinks("i1")).map((l) => l.id)).toEqual([first.link.id]);
  });

  it("서버와 같은 문구로 거부한다 — 빈 URL·http(s) 아님·형식 오류·없는 종류", async () => {
    await expect(addWebLink("i1", { url: "  " })).rejects.toThrow("URL을 입력하세요");
    await expect(addWebLink("i1", { url: "ftp://x.example.com" })).rejects.toThrow("http 또는 https 주소만 붙일 수 있습니다");
    await expect(addWebLink("i1", { url: "그냥 글자" })).rejects.toThrow("URL 형식이 올바르지 않습니다");
    await expect(addWebLink("i1", { url: "https://x.example.com", kind: "ISSUE" as never })).rejects.toThrow("없는 링크 종류입니다");
  });

  it("제거·이슈 삭제 시 함께 사라진다", async () => {
    const { link } = await addWebLink("i5", { url: "https://x.example.com/1" });
    await addWebLink("i5", { url: "https://x.example.com/2" });
    await removeWebLink(link.id);
    expect((await listWebLinks("i5")).map((l) => l.url)).toEqual(["https://x.example.com/2"]);
    await deleteIssue("i5");
    await expect(listWebLinks("i5")).rejects.toThrow("이슈를 찾을 수 없습니다");
  });
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DTO = { id: 3, issueId: 7, url: "https://github.com/o/r/pull/1", title: null, kind: "PR", createdBy: 1, createdAt: "2026-10-18T00:00:00Z" };

describe("웹 링크 (F-08, REST)", () => {
  it("201은 새 링크, 200은 이미 있던 링크 — id는 문자열", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(json(201, DTO)).mockResolvedValueOnce(json(200, DTO));
    expect(await restAdd("7", { url: DTO.url, kind: "PR" })).toEqual({
      created: true,
      link: { id: "3", issueId: "7", url: DTO.url, title: null, kind: "PR", createdBy: "1", createdAt: DTO.createdAt },
    });
    expect((await restAdd("7", { url: DTO.url })).created).toBe(false);
    expect(spy.mock.calls[0][0]).toBe("/api/alm/issues/7/web-links");
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toEqual({ url: DTO.url, title: null, kind: "PR" });
    expect(JSON.parse(String(spy.mock.calls[1][1]?.body)).kind).toBe("WEB");
  });

  it("목록 GET·삭제 DELETE 경로", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(json(200, [DTO])).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await restList("7"))[0]).toMatchObject({ id: "3", kind: "PR" });
    await restRemove("3");
    expect(spy.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${String(path)}`)).toEqual([
      "GET /api/alm/issues/7/web-links",
      "DELETE /api/alm/web-links/3",
    ]);
  });
});
