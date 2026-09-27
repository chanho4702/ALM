import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  mapAgentPermissions,
  mapAgentPersonaDetail,
  mapAgentProjectCredential,
  mapAgentTeamPersona,
  mapAgentToken,
} from "./agentMapping";
import {
  createAgentPersona,
  deleteProjectCredential,
  fetchAgentPermissions,
  fetchAgentPersonaDetail,
  fetchProjectCredential,
  issueAgentToken,
  listAgentTeamPersonas,
  listAgentTokens,
  revokeAgentToken,
  saveProjectCredential,
  setAgentPersonaActive,
  updateAgentPersona,
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
  return JSON.parse(String(init?.body));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AI 팀 경계 매퍼(P3f·P3h)", () => {
  it("권한 힌트 — 모르는 값·null은 '못 한다'로 접는다", () => {
    expect(mapAgentPermissions({ canManage: true, isGlobalAdmin: false })).toEqual({ canManage: true, isGlobalAdmin: false });
    expect(mapAgentPermissions(null)).toEqual({ canManage: false, isGlobalAdmin: false });
    expect(mapAgentPermissions({ canManage: "yes" as unknown as boolean })).toEqual({ canManage: false, isGlobalAdmin: false });
  });

  it("페르소나 — long id·projectId는 문자열, projectId 없음(구 백엔드)·null은 공용, 모르는 롤은 접는다", () => {
    expect(
      mapAgentTeamPersona({ id: 7, slug: "qa-bot", role: "MANAGER", name: "QA봇", emoji: "", active: true, projectId: 3 }),
    ).toEqual({
      id: "7",
      slug: "qa-bot",
      role: "MANAGER",
      name: "QA봇",
      emoji: null,
      active: true,
      projectId: "3",
      avatarConfig: null,
    });
    expect(mapAgentTeamPersona({ id: 8, slug: "ops-bot", role: "OPS", name: "운영봇", active: false }).projectId).toBeNull();
    expect(mapAgentTeamPersona({ id: 9, slug: "x", role: "WIZARD", name: "X", active: true, projectId: null }).role).toBe(
      "FRONTEND",
    );
  });

  it("토큰 — 빠진 시각은 null, revoked 기본 false, P4a 이전 백엔드(종류·만료 표지 없음)는 사람용·경고 없음", () => {
    expect(mapAgentToken({ id: 31, label: "노트북", personaSlug: "frontend-bot" })).toEqual({
      id: "31",
      label: "노트북",
      personaSlug: "frontend-bot",
      createdAt: null,
      expiresAt: null,
      lastUsedAt: null,
      revoked: false,
      kind: "HUMAN",
      noExpiry: false,
      expiringSoon: false,
    });
  });

  it("자격증명 — 모르는 출처는 NONE, set=false면 프로젝트 쪽 필드를 비운다, updatedBy는 문자열", () => {
    expect(
      mapAgentProjectCredential({
        project: { set: true, provider: "ANTHROPIC", keyHint: "abcd", updatedBy: 12, updatedAt: "2026-09-27T01:00:00Z" },
        effective: { scope: "PROJECT", keyHint: "abcd" },
      }),
    ).toEqual({
      project: { set: true, provider: "ANTHROPIC", keyHint: "abcd", updatedBy: "12", updatedAt: "2026-09-27T01:00:00Z" },
      effective: { scope: "PROJECT", keyHint: "abcd" },
    });
    expect(
      mapAgentProjectCredential({ project: { set: false, keyHint: "zzzz", updatedBy: 3 }, effective: { scope: "USER" } }),
    ).toEqual({
      project: { set: false, provider: null, keyHint: null, updatedBy: null, updatedAt: null },
      effective: { scope: "NONE", keyHint: null },
    });
    expect(mapAgentProjectCredential(null).effective.scope).toBe("NONE");
  });
});

describe("AI 팀 REST 어댑터", () => {
  it("권한 조회는 projectId를 숫자로 보내고, 실패(5xx·네트워크)는 canManage=false로 접는다", async () => {
    const spy = fetchSpy(response(200, { canManage: true, isGlobalAdmin: false }), response(503, { error: "org 장애" }));
    await expect(fetchAgentPermissions("3")).resolves.toEqual({ canManage: true, isGlobalAdmin: false });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/permissions?projectId=3");
    await expect(fetchAgentPermissions("3")).resolves.toEqual({ canManage: false, isGlobalAdmin: false });
    spy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchAgentPermissions("3")).resolves.toEqual({ canManage: false, isGlobalAdmin: false });
  });

  it("설정용 페르소나 목록은 실패를 삼키지 않는다(진입점 판정과 다름)", async () => {
    fetchSpy(response(503, { error: "agent-service 준비 중" }));
    await expect(listAgentTeamPersonas()).rejects.toThrow("agent-service 준비 중");
  });

  it("직원 추가 — 빈 이모지·말투는 보내지 않고 projectId는 숫자, 403 문구를 그대로 올린다", async () => {
    const spy = fetchSpy(
      response(201, { id: 40, slug: "qa-bot", role: "PLANNER", name: "QA봇", emoji: null, active: true, projectId: 3 }),
      response(403, { error: "관리하지 않는 자원 권한은 부여할 수 없습니다" }),
    );
    const input = {
      slug: " qa-bot ",
      role: "PLANNER" as const,
      name: "QA봇",
      emoji: " ",
      voicePrompt: "",
      projectId: "3",
      grants: [
        { resourceType: "PROJECT" as const, resourceId: "3", role: "EDITOR" as const },
        { resourceType: "SPACE" as const, resourceId: " 5 ", role: "VIEWER" as const },
      ],
    };
    await expect(createAgentPersona(input)).resolves.toMatchObject({ id: "40", projectId: "3" });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/personas");
    expect(sentBody(spy)).toEqual({
      slug: "qa-bot",
      role: "PLANNER",
      name: "QA봇",
      projectId: 3,
      grants: [
        { resourceType: "PROJECT", resourceId: "3", role: "EDITOR" },
        { resourceType: "SPACE", resourceId: "5", role: "VIEWER" },
      ],
    });
    await expect(createAgentPersona(input)).rejects.toThrow("관리하지 않는 자원 권한은 부여할 수 없습니다");
  });

  it("활성 토글 PATCH · 토큰 목록/발급/철회 경로", async () => {
    const spy = fetchSpy(
      response(200, { id: 101, slug: "planner-bot", role: "PLANNER", name: "기획봇", active: false, projectId: 3 }),
      response(200, [{ id: 31, label: "노트북", personaSlug: "planner-bot", revoked: true }]),
      response(201, { token: "chanho_pat_secret", id: 32, label: "새 토큰", personaSlug: "planner-bot" }),
      response(204),
    );
    await expect(setAgentPersonaActive("101", false)).resolves.toMatchObject({ active: false });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/personas/101/active");
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
    expect(sentBody(spy, 0)).toEqual({ active: false });

    await expect(listAgentTokens("3")).resolves.toEqual([expect.objectContaining({ id: "31", revoked: true })]);
    expect(spy.mock.calls[1][0]).toBe("/api/agent/tokens?projectId=3");

    await expect(issueAgentToken({ label: " 새 토큰 ", personaSlug: "planner-bot" })).resolves.toEqual({
      token: "chanho_pat_secret",
      id: "32",
      label: "새 토큰",
      personaSlug: "planner-bot",
    });
    expect(sentBody(spy, 2)).toEqual({ label: "새 토큰", personaSlug: "planner-bot" });

    await expect(revokeAgentToken("32")).resolves.toBeUndefined();
    expect(spy.mock.calls[3][0]).toBe("/api/agent/tokens/32");
    expect((spy.mock.calls[3][1] as RequestInit).method).toBe("DELETE");
  });

  it("프로젝트 키 — GET/PUT(provider 고정·validate)/DELETE 204, 마스터 키 미설정 503은 문구 그대로", async () => {
    const view = {
      project: { set: true, provider: "ANTHROPIC", keyHint: "abcd", updatedBy: 1, updatedAt: "2026-09-27T01:00:00Z" },
      effective: { scope: "PROJECT", keyHint: "abcd" },
    };
    const spy = fetchSpy(
      response(200, view),
      response(200, view),
      response(503, { error: "자격증명 암호화 키가 설정되지 않았습니다" }),
      response(204),
    );
    await expect(fetchProjectCredential("3")).resolves.toMatchObject({ effective: { scope: "PROJECT" } });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/credentials/projects/3");

    await saveProjectCredential("3", { apiKey: "sk-ant-xyz-abcd", validate: true });
    expect((spy.mock.calls[1][1] as RequestInit).method).toBe("PUT");
    expect(sentBody(spy, 1)).toEqual({ provider: "ANTHROPIC", apiKey: "sk-ant-xyz-abcd", validate: true });

    await expect(saveProjectCredential("3", { apiKey: "k", validate: false })).rejects.toThrow(
      "자격증명 암호화 키가 설정되지 않았습니다",
    );
    await expect(deleteProjectCredential("3")).resolves.toBeUndefined();
    expect((spy.mock.calls[3][1] as RequestInit).method).toBe("DELETE");
  });
});

describe("직원 편집(AGP-62) — 경계 매퍼·REST", () => {
  const base = { id: 7, slug: "qa-bot", role: "PLANNER", name: "QA봇", active: true, projectId: 3 };

  it("avatarConfig 방어 — 문자열은 그대로, 객체로 오면 문자열로 되돌리고, 빈 값·숫자·배열·없음은 null(= 기본 외형)", () => {
    expect(mapAgentTeamPersona({ ...base, avatarConfig: '{"v":1,"hairStyle":"bob"}' }).avatarConfig).toBe('{"v":1,"hairStyle":"bob"}');
    expect(mapAgentTeamPersona({ ...base, avatarConfig: { v: 1, accessory: "cap" } }).avatarConfig).toBe('{"v":1,"accessory":"cap"}');
    for (const bad of ["", "  ", 42, [1], null, undefined]) {
      expect(mapAgentTeamPersona({ ...base, avatarConfig: bad }).avatarConfig).toBeNull();
    }
  });

  it("상세 — 편집 필드는 문자열만, 빈 defaultModel은 null", () => {
    expect(mapAgentPersonaDetail({ ...base, avatarConfig: null, voicePrompt: "짧게", defaultModel: "", skills: "# QA" })).toEqual({
      id: "7",
      slug: "qa-bot",
      role: "PLANNER",
      name: "QA봇",
      emoji: null,
      active: true,
      projectId: "3",
      avatarConfig: null,
      voicePrompt: "짧게",
      defaultModel: null,
      skills: "# QA",
    });
    expect(mapAgentPersonaDetail(base)).toMatchObject({ voicePrompt: null, defaultModel: null, skills: null, avatarConfig: null });
  });

  it("상세 조회는 GET /api/agent/personas/{id}, 403은 상태를 싣는 ApiError", async () => {
    const spy = fetchSpy(
      response(200, { ...base, avatarConfig: '{"v":1}', voicePrompt: null, defaultModel: "claude-sonnet-5", skills: null }),
      response(403, { error: "접근 권한이 없습니다" }),
    );
    await expect(fetchAgentPersonaDetail("7")).resolves.toMatchObject({ id: "7", defaultModel: "claude-sonnet-5", avatarConfig: '{"v":1}' });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/personas/7");
    const error = await fetchAgentPersonaDetail("7").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).message).toBe("접근 권한이 없습니다");
  });

  it("편집은 PATCH /api/agent/personas/{id} — 준 필드만 본문에(avatarConfig는 JSON 문자열), 400 문구를 올린다", async () => {
    const spy = fetchSpy(
      response(200, { ...base, name: "QA왕", avatarConfig: '{"v":1,"hairStyle":"bob"}' }),
      response(400, { error: "name은 비울 수 없습니다" }),
    );
    await expect(updateAgentPersona("7", { name: "QA왕", avatarConfig: '{"v":1,"hairStyle":"bob"}' })).resolves.toMatchObject({
      name: "QA왕",
      avatarConfig: '{"v":1,"hairStyle":"bob"}',
    });
    expect(spy.mock.calls[0][0]).toBe("/api/agent/personas/7");
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
    expect(sentBody(spy)).toEqual({ name: "QA왕", avatarConfig: '{"v":1,"hairStyle":"bob"}' });
    await expect(updateAgentPersona("7", { name: "" })).rejects.toThrow("name은 비울 수 없습니다");
  });
});
