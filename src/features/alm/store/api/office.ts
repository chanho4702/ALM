// alm-backend REST 어댑터 — office (jiraApi.ts에서 분할, 동작 불변)
import type { AgentRunQuery, AgentRunPage, AgentRunDetail, OfficeStreamHandlers, AgentGate, AgentMeetingInput, AgentMeetingCreated, AgentPermissions, AgentTeamPersona, AgentPersonaInput, AgentPersonaDetail, AgentPersonaPatch, AgentToken, AgentTokenIssueInput, AgentTokenIssued, AgentProjectCredential, AgentCredentialInput, AgentExecutionSiteSetting, AgentExecutionSite, AgentRunner, AgentRunnerInput, AgentRunnerIssued, AgentReviewSetting, AgentRunDirective, AgentRunCreateInput, AgentRunSummary, AgentChatInput, AgentChatReply, AgentDialogPage, AgentDialogEntryInput } from "../types";
import { toBackendId, ApiError } from "../mapping";
import { mapAgentRunPage, mapAgentRunDetail, type AgentRunDetailDto, type AgentGateDto, mapAgentGate, mapAgentMeetingCreated, type AgentMeetingCreatedDto, mapAgentPermissions, type AgentPermissionsDto, type AgentTeamPersonaDto, mapAgentTeamPersona, mapAgentPersonaDetail, type AgentPersonaDetailDto, type AgentTokenDto, mapAgentToken, mapAgentTokenIssued, type AgentTokenIssuedDto, mapAgentProjectCredential, type AgentProjectCredentialDto, mapAgentExecutionSite, type AgentExecutionSiteDto, type AgentRunnerDto, mapAgentRunner, mapAgentRunnerIssued, type AgentRunnerIssuedDto, mapAgentReviewSetting, type AgentReviewSettingDto, mapAgentRunDirectives, type AgentRunDirectiveDto, mapAgentRunDirective, mapAgentRunSummary, type AgentRunSummaryDto, mapAgentChatReply, type AgentChatReplyDto, mapAgentDialogPage, type AgentDialogPageDto } from "../agentMapping";
import { OfficeStreamError, readOfficeStream } from "../officeStream";
import { json, sharedApiFetch } from "./http";

// ── run·게이트 감독(P3a AGP-12/13) — 목록은 인증 사용자, 결정·취소·재개는 ADMIN(서버가 403) ──
// 상태 전이 거부는 409 {"error"} — `json()`이 그 문구를 그대로 Error로 올린다(화면이 토스트로 보여 준다).

/**
 * run 목록 한 페이지(P4c D-P4c-1) — 조건은 서버가 AND로 거르고 id 내림차순. 구 서버(배열 전체)도 `mapAgentRunPage`가
 * 같은 페이지 모양으로 접는다(배포 순서 무관).
 */
export async function fetchAgentRuns(query: AgentRunQuery = {}): Promise<AgentRunPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.projectId) params.set("projectId", String(toBackendId(query.projectId)));
  if (query.personaId) params.set("personaId", query.personaId);
  if (query.type) params.set("type", query.type);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.size !== undefined) params.set("size", String(query.size));
  const qs = params.toString();
  const body = await json<unknown>(await sharedApiFetch(`/api/agent/runs${qs ? `?${qs}` : ""}`));
  return mapAgentRunPage(body, query);
}

/**
 * run 단건(P4c) — 없는 id는 404(ApiError). 구 서버는 이 경로가 없어 404/405 — 화면이 목록 조회로 폴백한다.
 * `error`·`instruction`은 관리자에게만 실리고 그 밖은 `redacted: true`.
 */
export async function fetchAgentRun(runId: string): Promise<AgentRunDetail> {
  return mapAgentRunDetail(
    await json<AgentRunDetailDto>(await sharedApiFetch(`/api/agent/runs/${encodeURIComponent(runId)}`)),
  );
}

/**
 * 사무실 무효화 스트림(P4c §15) — fetch 스트리밍이라 Authorization 헤더가 실린다(EventSource는 못 싣는다).
 * `sharedApiFetch`가 401이면 refresh 후 한 번 더 시도하고, 그래도 401이면 `unauthorized`로 올린다.
 * 서버가 닫으면 resolve, 끊기면 reject — 재연결은 호출측(`useOfficeStream`).
 */
export async function streamOffice(projectId: string | undefined, handlers: OfficeStreamHandlers): Promise<void> {
  const query = projectId ? `?projectId=${toBackendId(projectId)}` : "";
  let response: Response;
  try {
    response = await sharedApiFetch(`/api/agent/office/stream${query}`, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: handlers.signal,
    });
  } catch (e) {
    if (handlers.signal.aborted) throw e;
    throw new OfficeStreamError("network", null, e instanceof Error ? e.message : String(e));
  }
  await readOfficeStream(response, handlers);
}

export async function cancelRun(runId: string): Promise<void> {
  await json<null>(
    await sharedApiFetch(`/api/agent/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }),
  );
}

/** BLOCKED·FAILED만 — 서버가 attempt+1 후속 run을 만들고 원 run을 닫는다 */
export async function resumeRun(runId: string): Promise<void> {
  await json<null>(
    await sharedApiFetch(`/api/agent/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" }),
  );
}

/** pending=true → 결정 전 전체, false → 요청순 최신 50건(결정된 것 포함) */
export async function fetchAgentGates(options: { pending: boolean }): Promise<AgentGate[]> {
  const body = await json<AgentGateDto[] | null>(
    await sharedApiFetch(`/api/agent/gates?pending=${options.pending ? "true" : "false"}`),
  );
  return (body ?? []).map(mapAgentGate);
}

export async function approveGate(gateId: string): Promise<void> {
  await json<null>(
    await sharedApiFetch(`/api/agent/gates/${encodeURIComponent(gateId)}/approve`, { method: "POST" }),
  );
}

/** 서버가 거절 사유를 받지 않는다(본문 없음) */
export async function rejectGate(gateId: string): Promise<void> {
  await json<null>(
    await sharedApiFetch(`/api/agent/gates/${encodeURIComponent(gateId)}/reject`, { method: "POST" }),
  );
}

/**
 * 회의 소집(P3b, ADMIN) — 빈 안건·빈 참석자 목록은 보내지 않는다(서버 롤 기본 규칙을 쓰게).
 * 안건 누락 400·같은 프로젝트 활성 회의 409는 `{"error"}` 문구 그대로 Error로 올린다.
 */
export async function createMeeting(input: AgentMeetingInput): Promise<AgentMeetingCreated> {
  const agendaIssueKey = input.agendaIssueKey?.trim();
  const agenda = input.agenda?.trim();
  const body = {
    type: input.type,
    projectId: toBackendId(input.projectId),
    ...(agendaIssueKey ? { agendaIssueKey } : {}),
    ...(agenda ? { agenda } : {}),
    ...(input.personaSlugs && input.personaSlugs.length > 0 ? { personaSlugs: input.personaSlugs } : {}),
    ...(input.executionSite ? { executionSite: input.executionSite } : {}),
  };
  return mapAgentMeetingCreated(
    await json<AgentMeetingCreatedDto>(
      await sharedApiFetch("/api/agent/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

// ── AI 팀 설정(P3f AGP-64·P3h AGP-66) — 관리 행위는 전역 관리자 또는 그 프로젝트 ADMIN(서버 판정) ──
// 권한 없음 403·org 판정 불가 503·검증 실패 400 모두 `{"error"}` 문구 그대로 Error로 올린다(화면이 토스트로).

/**
 * 버튼 노출 힌트 — 실패(네트워크·5xx·구 백엔드 404)는 "관리 못 함"으로 접는다. 이걸로 화면 전체를 오류로 만들지 않는다
 * (서버도 org 장애를 canManage=false로 답한다). 실제 판정은 각 관리 API가 다시 한다.
 */
export async function fetchAgentPermissions(projectId?: string): Promise<AgentPermissions> {
  const query = projectId ? `?projectId=${toBackendId(projectId)}` : "";
  try {
    const res = await sharedApiFetch(`/api/agent/permissions${query}`);
    if (!res.ok) return mapAgentPermissions(null);
    return mapAgentPermissions((await res.json().catch(() => null)) as AgentPermissionsDto | null);
  } catch {
    return mapAgentPermissions(null);
  }
}

/** 설정 화면용 페르소나 전체 — 진입점 판정(`fetchAgentPersonas`)과 달리 실패를 삼키지 않는다 */
export async function listAgentTeamPersonas(): Promise<AgentTeamPersona[]> {
  const body = await json<AgentTeamPersonaDto[] | null>(await sharedApiFetch("/api/agent/personas"));
  return (body ?? []).map(mapAgentTeamPersona);
}

/** 기존 슬러그면 서버가 표시 필드만 갱신하고 200(권한 재부여 없음), 새로 만들면 201 — 둘 다 PersonaResponse */
export async function createAgentPersona(input: AgentPersonaInput): Promise<AgentTeamPersona> {
  const emoji = input.emoji?.trim();
  const voicePrompt = input.voicePrompt?.trim();
  const body = {
    slug: input.slug.trim(),
    role: input.role,
    name: input.name.trim(),
    ...(emoji ? { emoji } : {}),
    ...(voicePrompt ? { voicePrompt } : {}),
    projectId: toBackendId(input.projectId),
    grants: input.grants.map((g) => ({ resourceType: g.resourceType, resourceId: g.resourceId.trim(), role: g.role })),
  };
  return mapAgentTeamPersona(
    await json<AgentTeamPersonaDto>(
      await sharedApiFetch("/api/agent/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

export async function setAgentPersonaActive(personaId: string, active: boolean): Promise<AgentTeamPersona> {
  return mapAgentTeamPersona(
    await json<AgentTeamPersonaDto>(
      await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      }),
    ),
  );
}

/** 편집 다이얼로그 프리필(AGP-62) — 관리자 전용(canManagePersona), 아니면 403 ApiError */
export async function fetchAgentPersonaDetail(personaId: string): Promise<AgentPersonaDetail> {
  return mapAgentPersonaDetail(
    await json<AgentPersonaDetailDto>(await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}`)),
  );
}

/**
 * 직원 편집(AGP-62) — 바뀐 필드만 보낸다(생략 = 그대로, 빈 문자열 = 지움). 400/403은 서버 문구를 실은 ApiError.
 * avatarConfig는 JSON 문자열로 보낸다(서버가 공백 없는 JSON으로 정규화).
 */
export async function updateAgentPersona(personaId: string, patch: AgentPersonaPatch): Promise<AgentPersonaDetail> {
  return mapAgentPersonaDetail(
    await json<AgentPersonaDetailDto>(
      await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    ),
  );
}

/** 그 프로젝트 소속 페르소나의 토큰만(철회된 것 포함) — 공용 페르소나 토큰은 전역 관리 화면 몫 */
export async function listAgentTokens(projectId: string): Promise<AgentToken[]> {
  const body = await json<AgentTokenDto[] | null>(
    await sharedApiFetch(`/api/agent/tokens?projectId=${toBackendId(projectId)}`),
  );
  return (body ?? []).map(mapAgentToken);
}

/**
 * 원문 token은 이 응답에만 있다 — 화면이 한 번 보여 주고 버린다. 만료는 기간 또는 무기한 중 하나만 싣는다
 * (둘 다 생략 = 서버 기본 90일, 둘 다 주면 서버 400). 무기한은 전역 관리자만(아니면 403).
 */
export async function issueAgentToken(input: AgentTokenIssueInput): Promise<AgentTokenIssued> {
  const body = {
    label: input.label.trim(),
    personaSlug: input.personaSlug,
    ...(input.noExpiry ? { noExpiry: true } : input.expiresInDays !== undefined ? { expiresInDays: input.expiresInDays } : {}),
  };
  return mapAgentTokenIssued(
    await json<AgentTokenIssuedDto>(
      await sharedApiFetch("/api/agent/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

export async function revokeAgentToken(tokenId: string): Promise<void> {
  await json<null>(await sharedApiFetch(`/api/agent/tokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" }));
}

export async function fetchProjectCredential(projectId: string): Promise<AgentProjectCredential> {
  return mapAgentProjectCredential(
    await json<AgentProjectCredentialDto>(
      await sharedApiFetch(`/api/agent/credentials/projects/${toBackendId(projectId)}`),
    ),
  );
}

/** 마스터 키 미설정 503·검증 실패 400 — 문구에 원문 키는 없다(서버 계약) */
export async function saveProjectCredential(
  projectId: string,
  input: AgentCredentialInput,
): Promise<AgentProjectCredential> {
  return mapAgentProjectCredential(
    await json<AgentProjectCredentialDto>(
      await sharedApiFetch(`/api/agent/credentials/projects/${toBackendId(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "ANTHROPIC", apiKey: input.apiKey, validate: input.validate }),
      }),
    ),
  );
}

export async function deleteProjectCredential(projectId: string): Promise<void> {
  await json<null>(
    await sharedApiFetch(`/api/agent/credentials/projects/${toBackendId(projectId)}`, { method: "DELETE" }),
  );
}

// ── 실행 위치·러너(P4a AGP-69) — P4a 이전 백엔드는 404: 조회는 null("지원 안 함")로 접고 화면이 카드를 안내로 바꾼다 ──

async function orUnsupported<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** 인증 사용자 누구나 — null = 이 서버에 실행 위치 기능이 없다(구 백엔드) */
export async function fetchExecutionSite(projectId: string): Promise<AgentExecutionSiteSetting | null> {
  return orUnsupported(async () =>
    mapAgentExecutionSite(
      await json<AgentExecutionSiteDto>(
        await sharedApiFetch(`/api/agent/execution-site/projects/${toBackendId(projectId)}`),
      ),
      projectId,
    ),
  );
}

/** 그 프로젝트 관리자만(403) — null은 설정 해제(전역 기본을 따른다). 이미 만든 run은 바뀌지 않는다 */
export async function saveExecutionSite(
  projectId: string,
  site: AgentExecutionSite | null,
): Promise<AgentExecutionSiteSetting> {
  return mapAgentExecutionSite(
    await json<AgentExecutionSiteDto>(
      await sharedApiFetch(`/api/agent/execution-site/projects/${toBackendId(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site }),
      }),
    ),
    projectId,
  );
}

/**
 * 러너 목록 — projectId가 있으면 그 프로젝트 관리자(그 프로젝트 + 전역 LOCAL 러너), 없으면 전역 관리자(PLATFORM 포함).
 * null = 러너 기능이 없는 구 백엔드.
 */
export async function listAgentRunners(projectId: string | null): Promise<AgentRunner[] | null> {
  const query = projectId ? `?projectId=${toBackendId(projectId)}` : "";
  return orUnsupported(async () => {
    const body = await json<AgentRunnerDto[] | null>(await sharedApiFetch(`/api/agent/runners${query}`));
    return (body ?? []).map(mapAgentRunner);
  });
}

/** 원문 token(agr_)은 이 응답에만 있다. projectId null(전역 러너)은 전역 관리자만 */
export async function issueAgentRunner(input: AgentRunnerInput): Promise<AgentRunnerIssued> {
  return mapAgentRunnerIssued(
    await json<AgentRunnerIssuedDto>(
      await sharedApiFetch("/api/agent/runners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name.trim(),
          projectId: input.projectId === null ? null : toBackendId(input.projectId),
        }),
      }),
    ),
  );
}

/** 멱등 204 — PLATFORM 러너는 409(env로만 관리) */
export async function revokeAgentRunner(runnerId: string): Promise<void> {
  await json<null>(await sharedApiFetch(`/api/agent/runners/${encodeURIComponent(runnerId)}`, { method: "DELETE" }));
}

// ── 리뷰어 지정(P4b D-P4b-1, AGP-59) — P4b 이전 백엔드는 404: 조회는 null("지원 안 함") ──
// 400(REVIEWER 롤·활성·범위 위반)·403은 `{"error"}` 문구 그대로 Error로 올린다(화면이 토스트로).

/** 인증 사용자 누구나 — 유효 리뷰어와 출처. null = 이 서버에 리뷰어 지정 기능이 없다 */
export async function fetchReviewSetting(projectId: string): Promise<AgentReviewSetting | null> {
  return orUnsupported(async () =>
    mapAgentReviewSetting(
      await json<AgentReviewSettingDto>(
        await sharedApiFetch(`/api/agent/review-settings/projects/${toBackendId(projectId)}`),
      ),
    ),
  );
}

/** 그 프로젝트 관리자만 — 그 프로젝트 소속 또는 공용의 활성 REVIEWER만(아니면 400) */
export async function saveReviewSetting(projectId: string, personaId: string): Promise<AgentReviewSetting> {
  return mapAgentReviewSetting(
    await json<AgentReviewSettingDto>(
      await sharedApiFetch(`/api/agent/review-settings/projects/${toBackendId(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: toBackendId(personaId) }),
      }),
    ),
  );
}

/** 지정 해제(204, 멱등) — 다음 단계(전역·서버 설정·자동)로 내려간다. 화면은 다시 조회해 유효 리뷰어를 받는다 */
export async function clearReviewSetting(projectId: string): Promise<void> {
  await json<null>(
    await sharedApiFetch(`/api/agent/review-settings/projects/${toBackendId(projectId)}`, { method: "DELETE" }),
  );
}

// ── 실행 중 지시(P4b D-P4b-5, AGP-67) — 워커의 다음 도구 결과 끝에 붙어 전달된다 ──

/** 인증 사용자 누구나(본문은 관리자에게만) — null = 지시 기능이 없는 구 백엔드(404) */
export async function fetchRunDirectives(runId: string): Promise<AgentRunDirective[] | null> {
  return orUnsupported(async () =>
    mapAgentRunDirectives(
      await json<AgentRunDirectiveDto[] | null>(
        await sharedApiFetch(`/api/agent/runs/${encodeURIComponent(runId)}/directives`),
      ),
    ),
  );
}

/**
 * run 프로젝트 관리자만(403) — RUNNING이 아니면 409, 빈 본문·2000자 초과 400. 404는 구 백엔드이거나 run이 없다는 뜻이라
 * 상태를 싣는 ApiError 그대로 올린다(화면이 코멘트로 폴백).
 */
export async function sendRunDirective(runId: string, text: string): Promise<AgentRunDirective> {
  return mapAgentRunDirective(
    await json<AgentRunDirectiveDto>(
      await sharedApiFetch(`/api/agent/runs/${encodeURIComponent(runId)}/directives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      }),
    ),
  );
}

// ── AI 사무실 1:1 대화(P3g AGP-65) — 오류는 상태를 싣는 ApiError로 올린다(화면이 409/429/503을 대사로 번역) ──

/**
 * USER run(AGP-42) — 이슈 조회 뒤 서버가 프로젝트 관리 권한을 판정한다(403). 없는 이슈·슬러그 404, 이미 활성 run 409,
 * 비활성 페르소나 400. 모델·지시문이 비면 보내지 않는다(서버 기본 = 프로젝트 정책).
 */
export async function createAgentRun(input: AgentRunCreateInput): Promise<AgentRunSummary> {
  const instruction = input.instruction?.trim();
  const model = input.model?.trim();
  const body = {
    issueKey: input.issueKey.trim(),
    ...(instruction ? { instruction } : {}),
    ...(model ? { model } : {}),
    personaSlug: input.personaSlug,
    ...(input.executionSite ? { executionSite: input.executionSite } : {}),
  };
  return mapAgentRunSummary(
    await json<AgentRunSummaryDto>(
      await sharedApiFetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

/** 수다 한 턴 — 503(꺼짐·키 없음)·409(킬 스위치·예산)·429(속도)·404·400. 서버가 턴을 대화 기록(SAY)에 직접 남긴다 */
export async function sendPersonaChat(personaId: string, input: AgentChatInput): Promise<AgentChatReply> {
  const body = {
    message: input.message,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.projectId ? { projectId: toBackendId(input.projectId) } : {}),
  };
  return mapAgentChatReply(
    await json<AgentChatReplyDto>(
      await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

/** 호출자 본인의 대화 기록 — 구 백엔드면 404 ApiError(화면이 메모리 기록으로 폴백한다) */
export async function fetchPersonaDialog(
  personaId: string,
  options: { before?: string; limit?: number } = {},
): Promise<AgentDialogPage> {
  const params = new URLSearchParams();
  if (options.before) params.set("before", options.before);
  params.set("limit", String(options.limit ?? 50));
  return mapAgentDialogPage(
    await json<AgentDialogPageDto>(
      await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}/dialog?${params.toString()}`),
    ),
  );
}

/** 1회 20건 이하 — 저장된 건수를 돌려준다 */
export async function savePersonaDialog(personaId: string, entries: AgentDialogEntryInput[]): Promise<number> {
  const body = {
    entries: entries.map((e) => ({
      speaker: e.speaker,
      kind: e.kind,
      text: e.text,
      ...(e.issueKey ? { issueKey: e.issueKey } : {}),
      ...(e.runId ? { runId: e.runId } : {}),
      ...(e.commentId ? { commentId: e.commentId } : {}),
    })),
  };
  const saved = await json<{ saved?: number } | null>(
    await sharedApiFetch(`/api/agent/personas/${encodeURIComponent(personaId)}/dialog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return saved?.saved ?? entries.length;
}
