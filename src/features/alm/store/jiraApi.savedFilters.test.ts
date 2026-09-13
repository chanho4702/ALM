import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  createSavedFilter,
  deleteSavedFilter,
  listSavedFilters,
  updateSavedFilter,
} from "./jiraApi";
import {
  UI_CHANGED_EVENT,
  createSavedFilter as createLocalFilter,
  localSavedFilters,
} from "./uiStore";
import { AqlError } from "./aql/types";

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

const ROW = {
  id: 7,
  name: "내 버그",
  kind: "smart",
  query: "타입:버그",
  createdAt: "2026-09-12T00:00:00Z",
  updatedAt: "2026-09-12T00:00:00Z",
};

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

describe("jiraApi 저장 필터 (/api/alm/me/filters)", () => {
  it("목록은 서버 행을 SavedFilter로 옮긴다 — id는 문자열, kind는 smart/aql만", async () => {
    fetchSpy(() => response(200, [ROW, { ...ROW, id: 8, name: "AQL", kind: "aql", query: "due < -1d" }]));

    expect(await listSavedFilters()).toEqual([
      { id: "7", name: "내 버그", query: "타입:버그", kind: "smart" },
      { id: "8", name: "AQL", query: "due < -1d", kind: "aql" },
    ]);
  });

  it("만들기·수정·삭제는 REST 동사와 경로를 지킨다", async () => {
    const spy = fetchSpy((_path, init) =>
      init?.method === "DELETE" ? response(204) : response(init?.method === "POST" ? 201 : 200, ROW),
    );

    await createSavedFilter({ name: "  내 버그  ", query: "타입:버그" });
    expect(spy).toHaveBeenCalledWith("/api/alm/me/filters", expect.objectContaining({ method: "POST" }));
    // 이름은 다듬어 보내고 kind를 생략하면 smart다
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      name: "내 버그",
      kind: "smart",
      query: "타입:버그",
    });

    await updateSavedFilter("7", { query: "타입:버그 담당:나" });
    expect(spy).toHaveBeenCalledWith("/api/alm/me/filters/7", expect.objectContaining({ method: "PUT" }));
    // 안 준 필드는 본문에 없다 — 서버 부분 갱신 계약
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({ query: "타입:버그 담당:나" });

    await deleteSavedFilter("7");
    expect(spy).toHaveBeenCalledWith(
      "/api/alm/me/filters/7",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("중복 이름 409는 서버 문구를 그대로 올린다", async () => {
    fetchSpy(() => response(409, { error: "같은 이름의 필터가 있습니다" }));

    await expect(createSavedFilter({ name: "내 버그", query: "a" })).rejects.toThrow(
      "같은 이름의 필터가 있습니다",
    );
  });

  it("kind=aql 문법 400은 AqlError로 올린다 — 에디터 밑줄과 같은 계약", async () => {
    fetchSpy(() =>
      response(400, { error: "필드를 모릅니다: statuss", position: 0, expected: ["status"] }),
    );

    const failure = await createSavedFilter({
      name: "잘못된 AQL",
      query: "statuss = done",
      kind: "aql",
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(AqlError);
    expect(failure).toMatchObject({
      message: "필드를 모릅니다: statuss",
      position: 0,
      expected: ["status"],
    });
  });

  it("자리 없는 400(검증)은 평범한 Error다 — 엉뚱한 첫 글자에 밑줄을 긋지 않는다", async () => {
    fetchSpy(() => response(400, { error: "필터 이름은 60자 이하여야 합니다" }));

    const failure = await createSavedFilter({ name: "x".repeat(61), query: "a" }).catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(AqlError);
    expect((failure as Error).message).toBe("필터 이름은 60자 이하여야 합니다");
  });

  it("이관 중 409는 그 하나만 건너뛰고 나머지를 마저 옮긴다", async () => {
    await createLocalFilter({ name: "겹치는 이름", query: "a" });
    await createLocalFilter({ name: "새 필터", query: "b" });

    const posted: string[] = [];
    fetchSpy((_path, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { name: string };
        posted.push(body.name);
        // 서버 목록에는 없었지만(경합) 실제로는 이미 있는 이름
        if (body.name === "겹치는 이름") {
          return response(409, { error: "같은 이름의 필터가 있습니다" });
        }
        return response(201, { ...ROW, id: 9, name: body.name, query: "b" });
      }
      return response(200, []);
    });

    const merged = await listSavedFilters();

    expect(posted).toEqual(["겹치는 이름", "새 필터"]);
    expect(merged.map((f) => f.name)).toEqual(["새 필터"]);
    // 409 하나 때문에 로컬을 남기지 않는다 — 남기면 매 조회마다 같은 409를 다시 맞는다
    expect(localSavedFilters()).toEqual([]);
  });

  it("서버가 거절한 옛 필터(4xx)는 그 한 건만 버리고 나머지를 옮긴다 — 목록을 영구히 막지 않는다", async () => {
    // 옛 `saveFilter`는 빈 질의를 막지 않았다 — 그런 필터가 남아 있으면 서버는 400이다
    await createLocalFilter({ name: "빈 질의", query: "x" });
    await createLocalFilter({ name: "멀쩡한 필터", query: "타입:버그" });
    // 로컬에 이미 들어간 뒤 질의만 비운 상태를 흉내 낸다(옛 데이터)
    const raw = JSON.parse(localStorage.getItem("alm.jira.ui.v1")!) as {
      savedFilters: { name: string; query: string }[];
    };
    raw.savedFilters.find((f) => f.name === "빈 질의")!.query = "";
    localStorage.setItem("alm.jira.ui.v1", JSON.stringify(raw));

    const posted: string[] = [];
    fetchSpy((_path, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { name: string; query: string };
        posted.push(body.name);
        if (!body.query) return response(400, { error: "필터 질의를 입력하세요" });
        return response(201, { ...ROW, id: 9, name: body.name, query: body.query });
      }
      return response(200, []);
    });

    const merged = await listSavedFilters();

    expect(posted).toEqual(["빈 질의", "멀쩡한 필터"]);
    expect(merged.map((f) => f.name)).toEqual(["멀쩡한 필터"]);
    // 버린 것까지 다 처리했으므로 로컬을 비운다 — 남기면 매 조회가 같은 400을 다시 맞는다
    expect(localSavedFilters()).toEqual([]);
  });

  it("5xx는 로컬을 남겨 다음 조회에서 다시 시도한다", async () => {
    await createLocalFilter({ name: "나중에 다시", query: "a" });
    fetchSpy((_path, init) =>
      init?.method === "POST" ? response(503, { error: "서비스를 사용할 수 없습니다" }) : response(200, []),
    );

    await expect(listSavedFilters()).resolves.toEqual([]);
    expect(localSavedFilters().map((f) => f.name)).toEqual(["나중에 다시"]);
  });

  it("이관이 어떻게 실패해도 목록 조회 자체는 실패하지 않는다", async () => {
    await createLocalFilter({ name: "문제의 필터", query: "a" });
    fetchSpy((_path, init) => {
      if (init?.method === "POST") throw new Error("네트워크가 끊겼습니다");
      return response(200, [ROW]);
    });

    // 서버 목록은 그대로 온다 — 사이드바가 빈 화면이 되지 않는다
    await expect(listSavedFilters()).resolves.toEqual([
      { id: "7", name: "내 버그", query: "타입:버그", kind: "smart" },
    ]);
    expect(localSavedFilters()).toHaveLength(1);
  });

  it("이관 중 변경 신호는 POST마다가 아니라 끝에 한 번만 나간다", async () => {
    await createLocalFilter({ name: "하나", query: "a" });
    await createLocalFilter({ name: "둘", query: "b" });
    fetchSpy((_path, init) =>
      init?.method === "POST"
        ? response(201, { ...ROW, id: 9, name: JSON.parse(init.body as string).name })
        : response(200, []),
    );
    let events = 0;
    const count = () => {
      events += 1;
    };
    window.addEventListener(UI_CHANGED_EVENT, count);

    await listSavedFilters();
    window.removeEventListener(UI_CHANGED_EVENT, count);

    // POST마다 발행하면 사이드바가 다시 조회해 이관에 재진입한다
    expect(events).toBe(1);
  });

  it("첫 목록 조회에서 로컬에 남은 옛 필터를 한 번 서버로 옮기고 로컬을 비운다", async () => {
    await createLocalFilter({ name: "옛 필터", query: "타입:버그" });
    await createLocalFilter({ name: "내 버그", query: "이미 서버에 있다" }); // 이름 중복 → 건너뛴다

    const posted: unknown[] = [];
    const spy = fetchSpy((_path, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(init.body as string));
        return response(201, { ...ROW, id: 9, name: "옛 필터", query: "타입:버그" });
      }
      return response(200, [ROW]);
    });

    const merged = await listSavedFilters();

    // 중복이 아닌 하나만 올라간다
    expect(posted).toEqual([{ name: "옛 필터", kind: "smart", query: "타입:버그" }]);
    expect(merged.map((f) => f.name)).toEqual(["내 버그", "옛 필터"]);
    expect(localSavedFilters()).toEqual([]);

    // 두 번째 조회는 이관을 다시 하지 않는다
    spy.mockClear();
    await listSavedFilters();
    expect(spy.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true);
  });
});

/**
 * 이관 실패 분류 — 서버 계약상 영구 거절은 400·409뿐이다. 그 밖의 상태에서 로컬을 비우면
 * 세션 만료·스로틀 한 번에 사용자의 저장 필터가 통째로 사라진다(2026-09-13 이전 결함).
 */
describe("jiraApi 저장 필터 이관 — 재시도 분류", () => {
  /** GET은 서버 목록을 주고 POST만 주어진 상태로 거절하는 서버 */
  function rejectingServer(status: number, body: unknown = { error: "거절" }) {
    return fetchSpy((_path, init) => (init?.method === "POST" ? response(status, body) : response(200, [])));
  }

  it.each([
    [401, "세션 만료(refresh 실패)"],
    [403, "권한 없음·승인 대기"],
    [404, "옛 배포에 라우트 없음"],
    [408, "요청 시간 초과"],
    [429, "스로틀"],
    [502, "게이트웨이 오류"],
  ])("POST %i(%s)는 로컬을 남겨 다음 조회에서 다시 시도한다", async (status) => {
    await createLocalFilter({ name: "지켜야 할 필터", query: "타입:버그" });
    rejectingServer(status);

    const rows = await listSavedFilters();

    expect(rows).toEqual([]);
    expect(localSavedFilters().map((f) => f.name)).toEqual(["지켜야 할 필터"]);
  });

  it.each([
    [400, { error: "필터 이름은 60자 이하여야 합니다" }],
    [409, { error: "같은 이름의 필터가 있습니다" }],
  ])("POST %i는 영구 거절 — 그 필터만 버리고 로컬을 비운다", async (status, body) => {
    await createLocalFilter({ name: "서버가 거절하는 필터", query: "타입:버그" });
    rejectingServer(status, body);

    await listSavedFilters();

    expect(localSavedFilters()).toEqual([]);
  });

  it("상태를 모르는 실패(네트워크 끊김)도 로컬을 남긴다", async () => {
    await createLocalFilter({ name: "네트워크 실패", query: "a" });
    vi.spyOn(client, "sharedApiFetch").mockImplementation((_path, init) =>
      init?.method === "POST" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(response(200, [])),
    );

    await listSavedFilters();

    expect(localSavedFilters().map((f) => f.name)).toEqual(["네트워크 실패"]);
  });

  it("스로틀에 걸려 미뤄진 이관은 다음 조회에서 성공하고 그때 로컬을 비운다", async () => {
    await createLocalFilter({ name: "나중에 옮길 필터", query: "타입:버그" });
    const throttled = rejectingServer(429, { error: "잠시 후 다시 시도하세요" });
    expect(await listSavedFilters()).toEqual([]);
    expect(localSavedFilters()).toHaveLength(1);
    throttled.mockRestore();

    // 두 번째 조회: 서버가 받는다 — 옮긴 행이 목록에 합쳐지고 로컬은 비워진다
    fetchSpy((_path, init) =>
      init?.method === "POST"
        ? response(201, { ...ROW, id: 9, name: "나중에 옮길 필터", query: "타입:버그" })
        : response(200, []),
    );

    const rows = await listSavedFilters();

    expect(rows).toEqual([{ id: "9", name: "나중에 옮길 필터", query: "타입:버그", kind: "smart" }]);
    expect(localSavedFilters()).toEqual([]);
  });
});
