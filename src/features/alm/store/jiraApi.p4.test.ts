import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  mapAgentExecutionSite,
  mapAgentOffice,
  mapAgentRunSummary,
  mapAgentRunner,
  mapAgentRunnerIssued,
  mapAgentToken,
  mapAgentTokenIssued,
} from "./agentMapping";
import {
  createAgentRun,
  createMeeting,
  fetchExecutionSite,
  issueAgentRunner,
  issueAgentToken,
  listAgentRunners,
  revokeAgentRunner,
  saveExecutionSite,
} from "./jiraApi";
import { ApiError } from "./mapping";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchSpy(...responses: Response[]) {
  const spy = vi.spyOn(client, "sharedApiFetch");
  for (const r of responses) spy.mockResolvedValueOnce(r);
  return spy;
}

function sentBody(spy: ReturnType<typeof fetchSpy>, call = 0): unknown {
  const init = spy.mock.calls[call][1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P4a 경계 매퍼 — 실행 위치·러너·토큰 위생", () => {
  it("현재 run — executionSite·awaitingRunner, 구 백엔드(필드 없음)는 SERVER·대기 아님, 대기는 QUEUED에만", () => {
    const persona = (currentRun: Record<string, unknown>) => ({
      id: 1,
      slug: "a",
      name: "A",
      emoji: null,
      role: "FRONTEND",
      active: true,
      currentRun: { id: 9, status: "QUEUED", issueKey: "ALM-1", attempt: 1, model: null, startedAt: null, ...currentRun },
      lastActivity: null,
      todayCostUsd: 0,
    });
    const office = mapAgentOffice({
      personas: [
        persona({ status: "QUEUED", executionSite: "LOCAL", awaitingRunner: true }),
        persona({ status: "RUNNING" }),
        // 계약 위반 — RUNNING인데 대기 표지가 붙어 와도 무시
        persona({ status: "RUNNING", executionSite: "SERVER", awaitingRunner: true }),
        // 모르는 위치는 SERVER로
        persona({ status: "QUEUED", executionSite: "MARS" }),
      ],
    });
    expect(office.personas.map((p) => [p.currentRun?.executionSite, p.currentRun?.awaitingRunner])).toEqual([
      ["LOCAL", true],
      ["SERVER", false],
      ["SERVER", false],
      ["SERVER", false],
    ]);
  });

  it("run 요약 — runnerId는 문자열, 없으면 null", () => {
    const base = { id: 9, issueKey: null, status: "DONE", personaId: 1, attempt: 1, model: null, startedAt: null, endedAt: null };
    expect(mapAgentRunSummary({ ...base, executionSite: "LOCAL", runnerId: 41 })).toMatchObject({
      executionSite: "LOCAL",
      runnerId: "41",
    });
    expect(mapAgentRunSummary(base)).toMatchObject({ executionSite: "SERVER", runnerId: null });
  });

  it("실행 위치 — 저장값 null은 기본값 따름, effectiveSite가 없으면 저장값 → 기본값 순으로 채운다", () => {
    expect(
      mapAgentExecutionSite({ projectId: 3, site: null, effectiveSite: "SERVER", defaultSite: "SERVER", inProcess: true }, "3"),
    ).toEqual({ projectId: "3", site: null, effectiveSite: "SERVER", defaultSite: "SERVER", inProcess: true });
    expect(mapAgentExecutionSite({ site: "LOCAL", defaultSite: "SERVER" }, "7")).toEqual({
      projectId: "7",
      site: "LOCAL",
      effectiveSite: "LOCAL",
      defaultSite: "SERVER",
      inProcess: false,
    });
  });

  it("러너 — id·projectId·currentRunIds는 문자열, 모르는 상태는 ONLINE으로 보이지 않는다", () => {
    expect(
      mapAgentRunner({
        id: 41,
        kind: "LOCAL",
        name: "노트북",
        projectId: 3,
        issuedBy: 1,
        tokenPrefix: "agr_abcd",
        lastHeartbeatAt: "2026-09-28T00:00:00Z",
        version: "0.1.0",
        os: "Windows 11",
        maxConcurrency: 2,
        status: "ONLINE",
        currentRunIds: [812, 813],
      }),
    ).toMatchObject({ id: "41", projectId: "3", issuedBy: "1", status: "ONLINE", currentRunIds: ["812", "813"] });
    expect(mapAgentRunner({ id: 1, status: "WEIRD", lastHeartbeatAt: "2026-09-28T00:00:00Z" }).status).toBe("OFFLINE");
    expect(mapAgentRunner({ id: 2, status: null }).status).toBe("NEVER_CONNECTED");
    // 철회 시각이 있으면 서버 상태와 무관하게 철회됨, 이름이 비면 "러너 #id"
    expect(mapAgentRunner({ id: 3, status: "ONLINE", revokedAt: "2026-09-28T00:00:00Z", name: " " })).toMatchObject({
      status: "REVOKED",
      name: "러너 #3",
      kind: "LOCAL",
      projectId: null,
      currentRunIds: [],
    });
    expect(mapAgentRunnerIssued({ id: 5, token: "agr_x", projectId: null, name: "PC" })).toEqual({
      id: "5",
      kind: "LOCAL",
      name: "PC",
      projectId: null,
      token: "agr_x",
      tokenPrefix: null,
      createdAt: null,
    });
  });

  it("토큰 — kind RUN·noExpiry·expiringSoon, 발급 응답 expiresAt은 null(무기한)과 없음(구 백엔드)을 구분한다", () => {
    expect(
      mapAgentToken({ id: 1, label: "run:9", personaSlug: "a", kind: "RUN", noExpiry: true, expiringSoon: true }),
    ).toMatchObject({ kind: "RUN", noExpiry: true, expiringSoon: true });
    expect(mapAgentToken({ id: 1, label: "x", personaSlug: "a", kind: "ALIEN" }).kind).toBe("HUMAN");
    expect(mapAgentTokenIssued({ token: "agp_x", id: 1, label: "x", personaSlug: "a", expiresAt: null })).toHaveProperty(
      "expiresAt",
      null,
    );
    expect(mapAgentTokenIssued({ token: "agp_x", id: 1, label: "x", personaSlug: "a" })).not.toHaveProperty("expiresAt");
  });
});

describe("P4a REST — 실행 위치·러너", () => {
  it("실행 위치 GET/PUT(null = 해제) — 404(구 백엔드) 조회는 null, 저장 403은 문구 그대로", async () => {
    const view = { projectId: 3, site: "LOCAL", effectiveSite: "LOCAL", defaultSite: "SERVER", inProcess: false };
    const spy = fetchSpy(
      response(200, view),
      response(404, { error: "찾을 수 없습니다" }),
      response(200, { ...view, site: null, effectiveSite: "SERVER" }),
      response(403, { error: "접근 권한이 없습니다" }),
    );
    await expect(fetchExecutionSite("3")).resolves.toMatchObject({ site: "LOCAL", effectiveSite: "LOCAL" });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/execution-site/projects/3");
    await expect(fetchExecutionSite("3")).resolves.toBeNull();

    await expect(saveExecutionSite("3", null)).resolves.toMatchObject({ site: null, effectiveSite: "SERVER" });
    expect((spy.mock.calls[2][1] as RequestInit).method).toBe("PUT");
    expect(sentBody(spy, 2)).toEqual({ site: null });
    await expect(saveExecutionSite("3", "SERVER")).rejects.toThrow("접근 권한이 없습니다");
  });

  it("러너 목록(프로젝트·전역)·발급·철회 — 404 목록은 null, 5xx는 오류로 올린다, PLATFORM 철회 409", async () => {
    const spy = fetchSpy(
      response(200, [{ id: 41, kind: "LOCAL", name: "노트북", projectId: 3, status: "ONLINE", currentRunIds: [] }]),
      response(200, []),
      response(404),
      response(503, { error: "org 판정 불가" }),
      response(201, { id: 45, kind: "LOCAL", name: "새 PC", projectId: 3, token: "agr_secret", tokenPrefix: "agr_secr" }),
      response(204),
      response(409, { error: "플랫폼 러너는 철회할 수 없습니다" }),
    );
    await expect(listAgentRunners("3")).resolves.toEqual([expect.objectContaining({ id: "41", status: "ONLINE" })]);
    expect(spy.mock.calls[0][0]).toBe("/api/agent/runners?projectId=3");
    await expect(listAgentRunners(null)).resolves.toEqual([]);
    expect(spy.mock.calls[1][0]).toBe("/api/agent/runners");
    await expect(listAgentRunners("3")).resolves.toBeNull();
    await expect(listAgentRunners("3")).rejects.toBeInstanceOf(ApiError);

    await expect(issueAgentRunner({ name: " 새 PC ", projectId: "3" })).resolves.toMatchObject({ id: "45", token: "agr_secret" });
    expect(sentBody(spy, 4)).toEqual({ name: "새 PC", projectId: 3 });

    await expect(revokeAgentRunner("45")).resolves.toBeUndefined();
    expect(spy.mock.calls[5][0]).toBe("/api/agent/runners/45");
    expect((spy.mock.calls[5][1] as RequestInit).method).toBe("DELETE");
    await expect(revokeAgentRunner("40")).rejects.toThrow("플랫폼 러너는 철회할 수 없습니다");
  });

  it("전역 러너 발급은 projectId null을 그대로 보낸다", async () => {
    const spy = fetchSpy(response(201, { id: 46, name: "공용", projectId: null, token: "agr_x" }));
    await issueAgentRunner({ name: "공용", projectId: null });
    expect(sentBody(spy)).toEqual({ name: "공용", projectId: null });
  });

  it("맡기기·회의 소집 — 실행 위치는 고를 때만 싣는다(생략 = 프로젝트 설정)", async () => {
    const run = { id: 9, issueKey: "ALM-1", status: "QUEUED", personaId: 1, attempt: 1, model: null, startedAt: null, endedAt: null };
    const spy = fetchSpy(
      response(201, run),
      response(201, { ...run, executionSite: "LOCAL" }),
      response(201, { run: { ...run, type: "RETRO" }, attendees: [] }),
      response(201, { run: { ...run, type: "RETRO" }, attendees: [] }),
    );
    await createAgentRun({ issueKey: "ALM-1", personaSlug: "a" });
    expect(sentBody(spy, 0)).toEqual({ issueKey: "ALM-1", personaSlug: "a" });
    await expect(createAgentRun({ issueKey: "ALM-1", personaSlug: "a", executionSite: "LOCAL" })).resolves.toMatchObject({
      executionSite: "LOCAL",
    });
    expect(sentBody(spy, 1)).toEqual({ issueKey: "ALM-1", personaSlug: "a", executionSite: "LOCAL" });
    await createMeeting({ type: "RETRO", projectId: "3" });
    expect(sentBody(spy, 2)).toEqual({ type: "RETRO", projectId: 3 });
    await createMeeting({ type: "RETRO", projectId: "3", executionSite: "SERVER" });
    expect(sentBody(spy, 3)).toEqual({ type: "RETRO", projectId: 3, executionSite: "SERVER" });
  });
});

describe("P4a REST — 직원 토큰 만료", () => {
  it("기간·무기한 중 하나만 싣고, 둘 다 없으면 생략(서버 기본 90일)", async () => {
    const issued = { token: "agp_x", id: 1, label: "x", personaSlug: "a", expiresAt: "2026-12-27T00:00:00Z" };
    const spy = fetchSpy(response(201, issued), response(201, issued), response(201, { ...issued, expiresAt: null }));
    await issueAgentToken({ label: "x", personaSlug: "a" });
    expect(sentBody(spy, 0)).toEqual({ label: "x", personaSlug: "a" });
    await expect(issueAgentToken({ label: "x", personaSlug: "a", expiresInDays: 30 })).resolves.toMatchObject({
      expiresAt: "2026-12-27T00:00:00Z",
    });
    expect(sentBody(spy, 1)).toEqual({ label: "x", personaSlug: "a", expiresInDays: 30 });
    await issueAgentToken({ label: "x", personaSlug: "a", noExpiry: true, expiresInDays: 30 });
    expect(sentBody(spy, 2)).toEqual({ label: "x", personaSlug: "a", noExpiry: true });
  });

  it("무기한 403은 서버 문구 그대로", async () => {
    fetchSpy(response(403, { error: "무기한 토큰은 전역 관리자만 발급할 수 있습니다" }));
    await expect(issueAgentToken({ label: "x", personaSlug: "a", noExpiry: true })).rejects.toThrow(
      "무기한 토큰은 전역 관리자만 발급할 수 있습니다",
    );
  });
});
