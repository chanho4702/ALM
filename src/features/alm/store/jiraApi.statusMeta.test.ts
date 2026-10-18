import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { __clearStatusMetaCache, assignScheme, statusMetaByProject, updateIssue } from "./jiraApi";
import type { SettingsBody } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const body = (name: string): SettingsBody =>
  ({
    statuses: [{ id: "todo", name, categoryId: "todo", kind: "initial", color: "default", order: 0 }],
    enabledTypes: ["task"],
  }) as unknown as SettingsBody;


/** 일괄 상태 API(`/projects/statuses`) → 프로젝트 3개의 상태 목록. 그 밖(쓰기)은 빈 200 */
function fakeServer(statusName = () => "할 일") {
  return vi.spyOn(client, "sharedApiFetch").mockImplementation(async (input, init) => {
    const path = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return json({});
    if (path === "/api/alm/projects/statuses") {
      return json(Object.fromEntries(["1", "2", "3"].map((id) => [id, body(statusName()).statuses])));
    }
    if (/\/api\/alm\/issues\/\d+$/.test(path)) {
      return json({ id: 9, key: "P1-9", projectId: 1, title: "t", description: "", type: "task", status: "todo", priority: "medium", assigneeId: null, reporterId: 1, labels: [], version: 1, createdAt: "", updatedAt: "" });
    }
    return json({});
  });
}

/** 상태 맵 조회 횟수 — 일괄 API 한 번이 한 조회다. 프로젝트별 설정(1+N)은 부르면 안 된다 */
const settingsCalls = (spy: ReturnType<typeof fakeServer>) => {
  expect(spy.mock.calls.some(([input]) => /\/projects\/\d+\/settings$/.test(String(input)))).toBe(false);
  return spy.mock.calls.filter(([input]) => String(input) === "/api/alm/projects/statuses").length;
};

beforeEach(() => __clearStatusMetaCache());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("statusMetaByProject — 일괄 API 한 번 + 세션 캐시 (A-10)", () => {
  it("동시에 여러 화면이 불러도, 곧이어 다시 불러도 일괄 조회 한 번이다 — 프로젝트별 설정은 부르지 않는다", async () => {
    const spy = fakeServer();
    const [a, b] = await Promise.all([statusMetaByProject(), statusMetaByProject()]);
    const c = await statusMetaByProject();
    expect(settingsCalls(spy)).toBe(1);
    expect(a["1"].todo.name).toBe("할 일");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    // 호출자가 결과를 고쳐도 캐시는 오염되지 않는다
    a["1"].todo.name = "망가뜨림";
    expect((await statusMetaByProject())["1"].todo.name).toBe("할 일");
  });

  it("설정 쓰기(스킴 배정 등) 뒤에는 다시 읽는다 — 이슈 저장 같은 무관한 쓰기는 캐시를 지우지 않는다", async () => {
    let name = "할 일";
    const spy = fakeServer(() => name);
    await statusMetaByProject();
    await updateIssue("9", { title: "새 제목" }, 1);
    await statusMetaByProject();
    expect(settingsCalls(spy)).toBe(1);

    name = "대기";
    await assignScheme("1", "other");
    expect((await statusMetaByProject())["1"].todo.name).toBe("대기");
    expect(settingsCalls(spy)).toBe(2);
  });

  it("다른 사람이 바꾼 스킴은 유효 시간(60초)이 지나면 다시 읽는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T00:00:00Z"));
    const spy = fakeServer();
    await statusMetaByProject();
    vi.setSystemTime(new Date("2026-10-18T00:00:59Z"));
    await statusMetaByProject();
    expect(settingsCalls(spy)).toBe(1);
    vi.setSystemTime(new Date("2026-10-18T00:01:01Z"));
    await statusMetaByProject();
    expect(settingsCalls(spy)).toBe(2);
  });

  it("실패한 조회는 캐시하지 않는다 — 다음 호출이 다시 묻는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(json({ error: "ALM 서비스를 사용할 수 없습니다" }, 503));
    await expect(statusMetaByProject()).rejects.toThrow("ALM 서비스를 사용할 수 없습니다");
    spy.mockRestore();
    const next = fakeServer();
    await statusMetaByProject();
    expect(settingsCalls(next)).toBe(1);
  });
});
