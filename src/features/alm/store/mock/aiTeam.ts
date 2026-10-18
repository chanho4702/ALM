// localStorage 목업 스토어 — aiTeam (jiraMock.ts에서 분할, 동작 불변)
import type { AgentTeamPersona, AgentToken, AgentPermissions, AgentDialogEntry, AgentRunner, AgentExecutionSite, AgentRunDirective, AgentPersonaInput, AgentPersonaDetail, AgentPersonaPatch, AgentTokenIssueInput, AgentTokenIssued, AgentProjectCredential, AgentCredentialInput, AgentExecutionSiteSetting, AgentRunnerInput, AgentRunnerIssued, AgentReviewSetting, AgentReviewerSource } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { ApiError } from "../mapping";
import { baseOfficePersonas } from "./office";
import { ago, MINUTE } from "./clock";
import { clone } from "./db";

// ── AI 팀 설정(목업, P3f·P3h) — 판정·거부 문구는 agent-service AgentAuthz·PersonaCreateRequest를 따른다 ──
// 기본은 "프로젝트 관리자" 시나리오(canManage=true, 전역 관리자 아님) + 전역 키 설정됨. 테스트는
// `__setAgentMockScenario`로 권한·키 상태를 바꾼다(키 3상태: 프로젝트 키 / 전역 키 / 없음).

const AGENT_FORBIDDEN_GRANT = "관리하지 않는 자원 권한은 부여할 수 없습니다";

export const AGENT_FORBIDDEN = "접근 권한이 없습니다";

/** 목업 프로젝트 관리자가 ADMIN인 위키 스페이스 — 회의록 스페이스(5)만 */
const MOCK_MANAGED_SPACES: readonly string[] = ["5"];

const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

interface MockCredential {
  keyHint: string;
  updatedBy: string;
  updatedAt: string;
}

/** 상세 API에만 있는 편집 필드(목록에는 싣지 않는다 — 누구나 보는 표면) */
interface MockPersonaDetail {
  voicePrompt: string | null;
  defaultModel: string | null;
  skills: string | null;
}

interface AgentTeamMockState {
  personas: AgentTeamPersona[];
  /** 페르소나 id → 편집 필드 */
  details: Map<string, MockPersonaDetail>;
  tokens: AgentToken[];
  /** 프로젝트 id → 프로젝트 키 */
  projectKeys: Map<string, MockCredential>;
  platformKeyHint: string | null;
  envKey: boolean;
  masterKey: boolean;
  permissions: AgentPermissions;
  seq: number;
  /** office features.chat(P3g) */
  chat: boolean;
  /** false면 대화 기록 API가 404(구 백엔드) */
  dialogApi: boolean;
  /** 설정하면 수다 API가 이 상태로 실패한다(503·409·429 대사 확인용) */
  chatError: number | null;
  /** 페르소나 id → 대화 기록(시간순) */
  dialogs: Map<string, AgentDialogEntry[]>;
  /** 수다 세션 발급 번호 */
  chatSeq: number;
  /** 러너(P4a) — PLATFORM 1 + 프로젝트 p1 LOCAL 3 + 전역 LOCAL 1 */
  runners: AgentRunner[];
  /** 프로젝트 id → 저장된 실행 위치(없으면 전역 기본) */
  executionSites: Map<string, AgentExecutionSite>;
  defaultSite: AgentExecutionSite;
  /** false = compose 배포처럼 SERVER run을 PLATFORM 러너가 집는다 */
  inProcess: boolean;
  /** false면 실행 위치·러너 API가 404(구 백엔드) */
  executionApi: boolean;
  /** 프로젝트 id → 리뷰어로 지정한 페르소나 id(P4b) */
  reviewSettings: Map<string, string>;
  /** 전역 리뷰어 지정 — 공용 페르소나 id */
  platformReviewer: string | null;
  /** 서버 env REVIEW_PERSONA 슬러그(폴백) */
  envReviewer: string | null;
  /** REVIEW_ENABLED — 꺼져 있으면 reviewReady는 늘 true */
  reviewEnabled: boolean;
  /** false면 리뷰어 지정 API 404(구 백엔드) */
  reviewApi: boolean;
  /** run id → 실행 중 지시(오래된 것 먼저, P4b AGP-67) */
  directives: Map<string, MockDirective[]>;
  /** false면 지시 API 404 + 사무실 pendingDirectiveCount 없음(구 백엔드) */
  directivesApi: boolean;
}

/** hold = 목업 시드(자동 전달하지 않는다 — 사무실 편지 표식이 늘 보이게) */
export interface MockDirective extends AgentRunDirective {
  hold?: boolean;
}

/**
 * 목업 외형(AGP-62) — 커스텀된 직원이 한 방에 섞인 장면을 목업에서도 본다. 디자인봇 = 긴 머리·적갈·아이보리 셔츠·빨간 테 안경,
 * 백엔드봇 = 곱슬·볼터치. 나머지는 설정 없음(기본 외형).
 */
const MOCK_AVATARS: Record<string, string> = {
  "designer-bot": '{"v":1,"skinTone":"e","hairStyle":"long","hairColor":"4","shirtColor":"ivory","accessory":"glasses","showEmoji":1}',
  "backend-bot": '{"v":1,"skinTone":"f","hairStyle":"curly","hairColor":"7","accessory":"blush"}',
};

function freshTeamState(): AgentTeamMockState {
  const now = Date.now();
  // 사무실 목업 6인과 같은 사람들 — 앞의 넷은 ALM(p1) 전용, 운영·리뷰는 전사 공용
  const personas: AgentTeamPersona[] = baseOfficePersonas(now).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    emoji: p.emoji,
    role: p.role,
    active: p.active,
    projectId: p.role === "OPS" || p.role === "REVIEWER" ? null : "p1",
    avatarConfig: MOCK_AVATARS[p.slug] ?? null,
  }));
  return {
    personas,
    details: new Map([
      ["102", { voicePrompt: "밝고 다정하게, 시안 근거를 먼저 말한다", defaultModel: null, skills: null }],
      [
        "103",
        {
          voicePrompt: "짧고 단정하게",
          defaultModel: "claude-sonnet-5",
          skills: "# 프론트봇 — 디자인시스템으로 화면을 짓는다\n\n## 잘하는 것\n- React 19 + DS 컴포넌트\n",
        },
      ],
    ]),
    // 토큰 위생(P4a D-P4-3b) — 곧 만료(5일 남음)·무기한(V13 이전 발급)·철회·run 토큰(실행용, 시스템 발급)이 섞여 있다
    tokens: [
      { id: "33", label: "run:9003", personaSlug: "frontend-bot", createdAt: ago(now, 32), expiresAt: null, lastUsedAt: ago(now, 3), revoked: false, kind: "RUN", noExpiry: false, expiringSoon: false },
      { id: "32", label: "백엔드봇 CI", personaSlug: "backend-bot", createdAt: ago(now, 60 * 24 * 40), expiresAt: null, lastUsedAt: ago(now, 60 * 5), revoked: false, kind: "HUMAN", noExpiry: true, expiringSoon: false },
      { id: "31", label: "Claude Desktop — 프론트봇", personaSlug: "frontend-bot", createdAt: ago(now, 60 * 24 * 85), expiresAt: ago(now, -60 * 24 * 5), lastUsedAt: ago(now, 40), revoked: false, kind: "HUMAN", noExpiry: false, expiringSoon: true },
      { id: "30", label: "예전 노트북", personaSlug: "planner-bot", createdAt: ago(now, 60 * 24 * 20), expiresAt: ago(now, -60 * 24 * 70), lastUsedAt: null, revoked: true, kind: "HUMAN", noExpiry: false, expiringSoon: false },
      { id: "29", label: "운영봇 CI", personaSlug: "ops-bot", createdAt: ago(now, 60 * 24 * 9), expiresAt: ago(now, -60 * 24 * 81), lastUsedAt: null, revoked: false, kind: "HUMAN", noExpiry: false, expiringSoon: false },
    ],
    projectKeys: new Map(),
    platformKeyHint: "1234",
    envKey: false,
    masterKey: true,
    permissions: { canManage: true, isGlobalAdmin: false },
    seq: 500,
    chat: true,
    dialogApi: true,
    chatError: null,
    dialogs: new Map(),
    chatSeq: 1,
    runners: [
      mockRunnerRow(now, { id: "44", name: "공용 빌드 PC", projectId: null, status: "NEVER_CONNECTED", createdAt: ago(now, 60 * 24 * 2) }),
      mockRunnerRow(now, { id: "43", name: "예전 PC", status: "REVOKED", createdAt: ago(now, 60 * 24 * 30), revokedAt: ago(now, 60 * 24 * 5), lastHeartbeatAt: ago(now, 60 * 24 * 6), version: "0.1.0", os: "Windows 10", maxConcurrency: 1 }),
      mockRunnerRow(now, { id: "42", name: "사무실 데스크톱", status: "OFFLINE", createdAt: ago(now, 60 * 24 * 10), lastHeartbeatAt: ago(now, 60 * 3), version: "0.1.0", os: "macOS 16", maxConcurrency: 1 }),
      mockRunnerRow(now, { id: "41", name: "chanho 노트북", status: "ONLINE", createdAt: ago(now, 60 * 24 * 12), lastHeartbeatAt: ago(now, 0.3), version: "0.1.0", os: "Windows 11", maxConcurrency: 2, currentRunIds: ["9006"] }),
      mockRunnerRow(now, { id: "40", kind: "PLATFORM", name: "플랫폼 러너", projectId: null, issuedBy: null, status: "OFFLINE", createdAt: ago(now, 60 * 24 * 60), lastHeartbeatAt: ago(now, 12), version: "0.1.0", os: "Linux", maxConcurrency: 2 }),
    ],
    executionSites: new Map<string, AgentExecutionSite>([["p1", "LOCAL"]]),
    defaultSite: "SERVER",
    inProcess: false,
    executionApi: true,
    // 리뷰어 — 지정 없음, 공용 리뷰봇이 "자동 선택"으로 잡힌다
    reviewSettings: new Map(),
    platformReviewer: null,
    envReviewer: null,
    reviewEnabled: true,
    reviewApi: true,
    // 기획봇(RUNNING 9001) — 전달된 지시 1 + 아직 전달 대기 1(책상 편지 표식)
    directives: new Map<string, MockDirective[]>([
      [
        "9001",
        [
          { id: "701", runId: "9001", text: "ALM-4 인수 조건에 비로그인 사용자 경우도 넣어 주세요", createdAt: ago(now, 11), deliveredAt: ago(now, 10) },
          { id: "702", runId: "9001", text: "우선순위 표는 오늘 공유할 수 있는 수준까지만 정리해 주세요", createdAt: ago(now, 1), deliveredAt: null, hold: true },
        ],
      ],
    ]),
    directivesApi: true,
  };
}

function mockRunnerRow(now: number, row: Partial<AgentRunner> & Pick<AgentRunner, "id" | "name" | "status">): AgentRunner {
  return {
    kind: "LOCAL",
    projectId: "p1",
    issuedBy: CURRENT_USER_ID,
    tokenPrefix: `agr_${row.id}9f`,
    createdAt: new Date(now).toISOString(),
    revokedAt: null,
    lastHeartbeatAt: null,
    version: null,
    os: null,
    maxConcurrency: null,
    currentRunIds: [],
    ...row,
  };
}

export let teamState: AgentTeamMockState = freshTeamState();

/** 테스트 초기화(`__resetForTest`) — AI 팀 설정 목업 상태를 처음으로 */
export function resetTeamMockState(): void {
  teamState = freshTeamState();
}

export interface AgentMockScenario {
  canManage?: boolean;
  isGlobalAdmin?: boolean;
  /** 전역 키 끝 4자 — null이면 전역 키 없음 */
  platformKeyHint?: string | null;
  /** p1 프로젝트 키 끝 4자 — null이면 프로젝트 키 없음 */
  projectKeyHint?: string | null;
  /** 서버 env ANTHROPIC_API_KEY(호환 층) */
  envKey?: boolean;
  /** AGENT_CREDENTIAL_MASTER_KEY — false면 저장 503 */
  masterKey?: boolean;
  /** office features.chat(P3g) — false면 수다 API도 503 */
  chat?: boolean;
  /** false면 대화 기록 API 404(구 백엔드 폴백 확인용) */
  dialogApi?: boolean;
  /** 수다 API 강제 실패 상태(409·429·503 등) — null이면 정상 */
  chatError?: number | null;
  /** false면 실행 위치·러너 API 404(구 백엔드 폴백 확인용) */
  executionApi?: boolean;
  /** p1 저장 실행 위치 — null이면 설정 해제(전역 기본) */
  projectSite?: AgentExecutionSite | null;
  /** false면 온라인 LOCAL 러너를 전부 오프라인으로 */
  runnersOnline?: boolean;
  /** false면 리뷰어 지정 API 404(구 백엔드 폴백 확인용) */
  reviewApi?: boolean;
  /** 공용 리뷰봇(106) 활성 — false면 자동으로 고를 리뷰어가 없다(NONE) */
  reviewerActive?: boolean;
  /** 전역 리뷰어 지정(페르소나 id) — null이면 해제 */
  platformReviewer?: string | null;
  /** 서버 env REVIEW_PERSONA 슬러그 */
  envReviewer?: string | null;
  /** REVIEW_ENABLED */
  reviewEnabled?: boolean;
  /** false면 지시 API 404(구 백엔드 폴백 확인용) */
  directivesApi?: boolean;
  /** true면 대기 중 지시를 전부 지금 전달된 것으로 */
  deliverDirectives?: boolean;
}

/** 테스트 전용 — 권한·키 시나리오를 바꾼다(`__resetForTest`가 기본으로 되돌린다) */
export function __setAgentMockScenario(scenario: AgentMockScenario): void {
  if (scenario.canManage !== undefined) teamState.permissions.canManage = scenario.canManage;
  if (scenario.isGlobalAdmin !== undefined) {
    teamState.permissions.isGlobalAdmin = scenario.isGlobalAdmin;
    if (scenario.isGlobalAdmin) teamState.permissions.canManage = true;
  }
  if (scenario.platformKeyHint !== undefined) teamState.platformKeyHint = scenario.platformKeyHint;
  if (scenario.projectKeyHint !== undefined) {
    if (scenario.projectKeyHint === null) teamState.projectKeys.delete("p1");
    else teamState.projectKeys.set("p1", { keyHint: scenario.projectKeyHint, updatedBy: "u2", updatedAt: ago(Date.now(), 90) });
  }
  if (scenario.envKey !== undefined) teamState.envKey = scenario.envKey;
  if (scenario.masterKey !== undefined) teamState.masterKey = scenario.masterKey;
  if (scenario.chat !== undefined) teamState.chat = scenario.chat;
  if (scenario.dialogApi !== undefined) teamState.dialogApi = scenario.dialogApi;
  if (scenario.chatError !== undefined) teamState.chatError = scenario.chatError;
  if (scenario.executionApi !== undefined) teamState.executionApi = scenario.executionApi;
  if (scenario.projectSite !== undefined) {
    if (scenario.projectSite === null) teamState.executionSites.delete("p1");
    else teamState.executionSites.set("p1", scenario.projectSite);
  }
  if (scenario.runnersOnline === false) {
    for (const r of teamState.runners) if (r.kind === "LOCAL" && r.status === "ONLINE") r.status = "OFFLINE";
  }
  if (scenario.reviewApi !== undefined) teamState.reviewApi = scenario.reviewApi;
  if (scenario.reviewerActive !== undefined) {
    const reviewer = teamState.personas.find((p) => p.id === "106");
    if (reviewer) reviewer.active = scenario.reviewerActive;
  }
  if (scenario.platformReviewer !== undefined) teamState.platformReviewer = scenario.platformReviewer;
  if (scenario.envReviewer !== undefined) teamState.envReviewer = scenario.envReviewer;
  if (scenario.reviewEnabled !== undefined) teamState.reviewEnabled = scenario.reviewEnabled;
  if (scenario.directivesApi !== undefined) teamState.directivesApi = scenario.directivesApi;
  if (scenario.deliverDirectives) {
    const now = new Date().toISOString();
    for (const list of teamState.directives.values()) for (const d of list) if (!d.deliveredAt) d.deliveredAt = now;
  }
}

function requireManage(): void {
  if (!teamState.permissions.canManage) throw new Error(AGENT_FORBIDDEN);
}

function mockPersonaBySlug(slug: string): AgentTeamPersona {
  const persona = teamState.personas.find((p) => p.slug === slug);
  if (!persona) throw new Error(`페르소나를 찾을 수 없습니다: ${slug}`);
  return persona;
}

/** 공용 페르소나(projectId null)는 전역 관리자만 — 프로젝트 페르소나는 그 프로젝트 관리자까지 */
function requireManagePersona(persona: AgentTeamPersona): void {
  if (teamState.permissions.isGlobalAdmin) return;
  if (persona.projectId === null) throw new Error(AGENT_FORBIDDEN);
  requireManage();
}

export async function fetchAgentPermissions(projectId?: string): Promise<AgentPermissions> {
  const { canManage, isGlobalAdmin } = teamState.permissions;
  return { canManage: projectId ? canManage : isGlobalAdmin, isGlobalAdmin };
}

export async function listAgentTeamPersonas(): Promise<AgentTeamPersona[]> {
  return clone(teamState.personas);
}

export async function createAgentPersona(input: AgentPersonaInput): Promise<AgentTeamPersona> {
  const slug = input.slug.trim();
  if (!SLUG_PATTERN.test(slug)) throw new Error("slug는 소문자/숫자/하이픈 2~40자여야 합니다");
  const name = input.name.trim();
  if (!name) throw new Error("name은 필수입니다");
  if (name.length > 80) throw new Error("name은 80자 이하여야 합니다");
  const emoji = input.emoji?.trim() || null;
  if (emoji && emoji.length > 16) throw new Error("emoji는 16자 이하여야 합니다");
  requireManage();
  if (!teamState.permissions.isGlobalAdmin) {
    for (const grant of input.grants) {
      const managed =
        grant.resourceType === "PROJECT"
          ? grant.resourceId.trim() === input.projectId
          : MOCK_MANAGED_SPACES.includes(grant.resourceId.trim());
      if (!managed) throw new Error(AGENT_FORBIDDEN_GRANT);
    }
  }
  const existing = teamState.personas.find((p) => p.slug === slug);
  if (existing) {
    // 기존 슬러그 — 서버처럼 표시 필드만 갱신한다(권한·소속 프로젝트는 그대로)
    existing.name = name;
    existing.emoji = emoji;
    return clone(existing);
  }
  const persona: AgentTeamPersona = {
    id: String(teamState.seq++),
    slug,
    name,
    emoji,
    role: input.role,
    active: true,
    projectId: input.projectId,
    avatarConfig: null,
  };
  teamState.personas.push(persona);
  teamState.details.set(persona.id, { voicePrompt: input.voicePrompt?.trim() || null, defaultModel: null, skills: null });
  return clone(persona);
}

export async function setAgentPersonaActive(personaId: string, active: boolean): Promise<AgentTeamPersona> {
  const persona = teamState.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error(`페르소나를 찾을 수 없습니다: id=${personaId}`);
  requireManagePersona(persona);
  persona.active = active;
  return clone(persona);
}

// ── 직원 편집(목업, AGP-62) — 검증·거부 문구는 agent-service PersonaUpdateRequest·PersonaService·AvatarConfigValidator ──

const MOCK_MODEL_ID = /^[A-Za-z0-9._:@/[\]-]{1,60}$/;

const AVATAR_KEYS: ReadonlySet<string> = new Set(["v", "skinTone", "hairStyle", "hairColor", "shirtColor", "accessory", "showEmoji"]);

const AVATAR_CONFIG_MAX_BYTES = 1024;

const SKILLS_MAX = 8000;

function mockEditablePersona(personaId: string): AgentTeamPersona {
  const persona = teamState.personas.find((p) => p.id === personaId);
  if (!persona) throw new ApiError(404, `페르소나를 찾을 수 없습니다: ${personaId}`);
  try {
    requireManagePersona(persona);
  } catch {
    throw new ApiError(403, AGENT_FORBIDDEN);
  }
  return persona;
}

function mockDetail(persona: AgentTeamPersona): AgentPersonaDetail {
  const d = teamState.details.get(persona.id) ?? { voicePrompt: null, defaultModel: null, skills: null };
  return { ...clone(persona), avatarConfig: persona.avatarConfig ?? null, ...d };
}

/** 서버 AvatarConfigValidator.normalize 미러 — 형태만 검증하고 공백 없는 JSON으로 정규화 */
function normalizeMockAvatar(text: string): string {
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (bytes(text) > AVATAR_CONFIG_MAX_BYTES) throw new ApiError(400, `avatarConfig는 ${AVATAR_CONFIG_MAX_BYTES}바이트 이하여야 합니다`);
  let node: unknown;
  try {
    node = JSON.parse(text);
  } catch {
    throw new ApiError(400, "avatarConfig는 JSON 객체 문자열이어야 합니다");
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new ApiError(400, "avatarConfig는 JSON 객체여야 합니다");
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!AVATAR_KEYS.has(key)) {
      throw new ApiError(400, `avatarConfig에 허용되지 않은 키가 있습니다 — 허용: ${[...AVATAR_KEYS].sort().join(", ")}`);
    }
    if (key === "showEmoji") {
      if (value !== 0 && value !== 1) throw new ApiError(400, "avatarConfig showEmoji는 숫자 0 또는 1이어야 합니다");
    } else if (typeof value !== "string" && typeof value !== "number") {
      throw new ApiError(400, `avatarConfig 값은 문자열 또는 숫자여야 합니다: ${key}`);
    }
  }
  const normalized = JSON.stringify(node);
  if (bytes(normalized) > AVATAR_CONFIG_MAX_BYTES) throw new ApiError(400, `avatarConfig는 ${AVATAR_CONFIG_MAX_BYTES}바이트 이하여야 합니다`);
  return normalized;
}

/** 편집 다이얼로그 프리필 — 관리자 전용(공용 직원은 전역 관리자만), 아니면 403 */
export async function fetchAgentPersonaDetail(personaId: string): Promise<AgentPersonaDetail> {
  return mockDetail(mockEditablePersona(personaId));
}

/** 생략 = 그대로, 빈 문자열(공백뿐 포함) = 지움, name은 지울 수 없다 — 검증을 전부 통과해야 한 필드라도 바뀐다 */
export async function updateAgentPersona(personaId: string, patch: AgentPersonaPatch): Promise<AgentPersonaDetail> {
  if (patch.name !== undefined && patch.name.length > 80) throw new ApiError(400, "name은 80자 이하여야 합니다");
  if (patch.emoji !== undefined && patch.emoji.length > 16) throw new ApiError(400, "emoji는 16자 이하여야 합니다");
  if (patch.defaultModel !== undefined && patch.defaultModel.length > 60) {
    throw new ApiError(400, "defaultModel은 60자 이하여야 합니다");
  }
  if (patch.skills !== undefined && patch.skills.length > SKILLS_MAX) {
    throw new ApiError(400, `skills는 ${SKILLS_MAX}자 이하여야 합니다`);
  }
  const persona = mockEditablePersona(personaId);
  const text = (value: string | undefined): string | null | undefined => (value === undefined ? undefined : value.trim() || null);
  const name = text(patch.name);
  if (name === null) throw new ApiError(400, "name은 비울 수 없습니다");
  const defaultModel = text(patch.defaultModel);
  if (defaultModel && !MOCK_MODEL_ID.test(defaultModel)) {
    throw new ApiError(400, "defaultModel은 영문·숫자와 . _ : @ / [ ] - 만 쓸 수 있습니다(60자 이하)");
  }
  const avatar =
    patch.avatarConfig === undefined ? undefined : patch.avatarConfig.trim() ? normalizeMockAvatar(patch.avatarConfig) : null;
  const emoji = text(patch.emoji);
  const voicePrompt = text(patch.voicePrompt);
  const skills = text(patch.skills);

  const detail = teamState.details.get(persona.id) ?? { voicePrompt: null, defaultModel: null, skills: null };
  if (name !== undefined) persona.name = name;
  if (emoji !== undefined) persona.emoji = emoji;
  if (avatar !== undefined) persona.avatarConfig = avatar;
  if (voicePrompt !== undefined) detail.voicePrompt = voicePrompt;
  if (defaultModel !== undefined) detail.defaultModel = defaultModel;
  if (skills !== undefined) detail.skills = skills;
  teamState.details.set(persona.id, detail);
  return mockDetail(persona);
}

export async function listAgentTokens(projectId: string): Promise<AgentToken[]> {
  requireManage();
  const slugs = new Set(teamState.personas.filter((p) => p.projectId === projectId).map((p) => p.slug));
  return clone(teamState.tokens.filter((t) => slugs.has(t.personaSlug)));
}

/** 만료 검증·거부 문구는 agent-service PatService(D-P4-3b) — 기간과 무기한은 함께 줄 수 없고 무기한은 전역 관리자만 */
export async function issueAgentToken(input: AgentTokenIssueInput): Promise<AgentTokenIssued> {
  const label = input.label.trim();
  if (!label) throw new ApiError(400, "label은 필수입니다");
  if (label.length > 120) throw new ApiError(400, "label은 120자 이하여야 합니다");
  if (input.noExpiry && input.expiresInDays !== undefined) {
    throw new ApiError(400, "expiresInDays와 noExpiry는 함께 지정할 수 없습니다");
  }
  const days = input.expiresInDays ?? 90;
  if (!input.noExpiry && (!Number.isInteger(days) || days < 1 || days > 365)) {
    throw new ApiError(400, "expiresInDays는 1~365 사이여야 합니다");
  }
  if (input.noExpiry && !teamState.permissions.isGlobalAdmin) {
    throw new ApiError(403, "무기한 토큰은 전역 관리자만 발급할 수 있습니다");
  }
  requireManagePersona(mockPersonaBySlug(input.personaSlug));
  const id = String(teamState.seq++);
  const now = Date.now();
  const expiresAt = input.noExpiry ? null : new Date(now + days * 24 * 60 * MINUTE).toISOString();
  teamState.tokens.unshift({
    id,
    label,
    personaSlug: input.personaSlug,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    lastUsedAt: null,
    revoked: false,
    kind: "HUMAN",
    noExpiry: input.noExpiry === true,
    expiringSoon: !input.noExpiry && days <= 7,
  });
  const secret = crypto.randomUUID().replace(/-/g, "");
  return { token: `agp_${secret}`, id, label, personaSlug: input.personaSlug, expiresAt };
}

export async function revokeAgentToken(tokenId: string): Promise<void> {
  const token = teamState.tokens.find((t) => t.id === tokenId);
  if (!token) throw new Error(`토큰을 찾을 수 없습니다: id=${tokenId}`);
  requireManagePersona(mockPersonaBySlug(token.personaSlug));
  token.revoked = true;
}

function mockCredentialView(projectId: string): AgentProjectCredential {
  const key = teamState.projectKeys.get(projectId) ?? null;
  const effective: AgentProjectCredential["effective"] = key
    ? { scope: "PROJECT", keyHint: key.keyHint }
    : teamState.platformKeyHint
      ? { scope: "PLATFORM", keyHint: teamState.platformKeyHint }
      : teamState.envKey
        ? { scope: "ENV", keyHint: null }
        : { scope: "NONE", keyHint: null };
  return {
    project: key
      ? { set: true, provider: "ANTHROPIC", keyHint: key.keyHint, updatedBy: key.updatedBy, updatedAt: key.updatedAt }
      : { set: false, provider: null, keyHint: null, updatedBy: null, updatedAt: null },
    effective,
  };
}

export async function fetchProjectCredential(projectId: string): Promise<AgentProjectCredential> {
  requireManage();
  return mockCredentialView(projectId);
}

export async function saveProjectCredential(
  projectId: string,
  input: AgentCredentialInput,
): Promise<AgentProjectCredential> {
  requireManage();
  if (!teamState.masterKey) throw new Error("자격증명 암호화 키(AGENT_CREDENTIAL_MASTER_KEY)가 설정되지 않아 저장할 수 없습니다");
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("apiKey는 필수입니다");
  // 목업 검증 — 실제 서버는 저비용 호출로 확인한다. 문구에 원문을 싣지 않는다
  if (input.validate && !apiKey.startsWith("sk-ant-")) throw new Error("API 키 검증에 실패했습니다");
  teamState.projectKeys.set(projectId, {
    keyHint: apiKey.slice(-4),
    updatedBy: CURRENT_USER_ID,
    updatedAt: new Date().toISOString(),
  });
  return mockCredentialView(projectId);
}

export async function deleteProjectCredential(projectId: string): Promise<void> {
  requireManage();
  teamState.projectKeys.delete(projectId);
}

// ── 실행 위치·러너(목업, P4a AGP-69) — 권한·거부 문구는 agent-service ExecutionSiteController·RunnerService ──

export function mockEffectiveSite(projectId: string): AgentExecutionSite {
  return teamState.executionSites.get(projectId) ?? teamState.defaultSite;
}

/** run을 돌린(또는 돌리는) 러너 — 목업은 러너의 currentRunIds로 찾는다 */
export function mockRunnerOfRun(runId: string): string | null {
  return teamState.runners.find((r) => r.currentRunIds.includes(runId))?.id ?? null;
}

/**
 * 서버 RunnerAvailability 미러 — LOCAL은 범위(그 프로젝트 + 전역) 안 온라인 LOCAL 러너가 없을 때,
 * SERVER는 인프로세스가 꺼져 있고 PLATFORM 러너가 온라인이 아닐 때 "러너 대기".
 */
export function mockAwaitingRunner(site: AgentExecutionSite, projectId: string): boolean {
  const online = (r: AgentRunner) => r.status === "ONLINE";
  if (site === "LOCAL") {
    return !teamState.runners.some(
      (r) => r.kind === "LOCAL" && (r.projectId === projectId || r.projectId === null) && online(r),
    );
  }
  return !teamState.inProcess && !teamState.runners.some((r) => r.kind === "PLATFORM" && online(r));
}

function requireExecutionApi(): void {
  if (!teamState.executionApi) throw new ApiError(404, "찾을 수 없습니다.");
}

function executionSiteView(projectId: string): AgentExecutionSiteSetting {
  const site = teamState.executionSites.get(projectId) ?? null;
  return {
    projectId,
    site,
    effectiveSite: site ?? teamState.defaultSite,
    defaultSite: teamState.defaultSite,
    inProcess: teamState.inProcess,
  };
}

/** 인증 사용자 누구나 — 구 백엔드(404)면 null */
export async function fetchExecutionSite(projectId: string): Promise<AgentExecutionSiteSetting | null> {
  if (!teamState.executionApi) return null;
  return executionSiteView(projectId);
}

export async function saveExecutionSite(
  projectId: string,
  site: AgentExecutionSite | null,
): Promise<AgentExecutionSiteSetting> {
  requireExecutionApi();
  if (!teamState.permissions.canManage) throw new ApiError(403, AGENT_FORBIDDEN);
  if (site === null) teamState.executionSites.delete(projectId);
  else teamState.executionSites.set(projectId, site);
  return executionSiteView(projectId);
}

/** 프로젝트 관리자 = 그 프로젝트 + 전역 LOCAL 러너, 전역(projectId 없음) = 전역 관리자만 전체(PLATFORM 포함). 최신 먼저 */
export async function listAgentRunners(projectId: string | null): Promise<AgentRunner[] | null> {
  if (!teamState.executionApi) return null;
  if (projectId === null) {
    if (!teamState.permissions.isGlobalAdmin) throw new ApiError(403, AGENT_FORBIDDEN);
    return clone(teamState.runners);
  }
  if (!teamState.permissions.canManage) throw new ApiError(403, AGENT_FORBIDDEN);
  return clone(
    teamState.runners.filter((r) => r.projectId === projectId || (r.projectId === null && r.kind === "LOCAL")),
  );
}

export async function issueAgentRunner(input: AgentRunnerInput): Promise<AgentRunnerIssued> {
  requireExecutionApi();
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "name은 필수입니다");
  if (name.length > 80) throw new ApiError(400, "name은 80자 이하여야 합니다");
  if (input.projectId === null ? !teamState.permissions.isGlobalAdmin : !teamState.permissions.canManage) {
    throw new ApiError(403, AGENT_FORBIDDEN);
  }
  const id = String(teamState.seq++);
  const token = `agr_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = Date.now();
  const row = mockRunnerRow(now, {
    id,
    name,
    projectId: input.projectId,
    status: "NEVER_CONNECTED",
    tokenPrefix: token.slice(0, 8),
  });
  teamState.runners.unshift(row);
  return { id, kind: "LOCAL", name, projectId: input.projectId, token, tokenPrefix: row.tokenPrefix, createdAt: row.createdAt };
}

/** 멱등 — PLATFORM은 409(env로만 관리), 전역 러너는 전역 관리자만 */
export async function revokeAgentRunner(runnerId: string): Promise<void> {
  requireExecutionApi();
  const runner = teamState.runners.find((r) => r.id === runnerId);
  if (!runner) throw new ApiError(404, `러너를 찾을 수 없습니다: id=${runnerId}`);
  if (runner.kind === "PLATFORM") {
    throw new ApiError(409, "플랫폼 러너는 철회할 수 없습니다 — AGENT_PLATFORM_RUNNER_TOKEN으로 관리합니다");
  }
  const allowed = runner.projectId === null ? teamState.permissions.isGlobalAdmin : teamState.permissions.canManage;
  if (!allowed) throw new ApiError(403, AGENT_FORBIDDEN);
  if (runner.revokedAt) return;
  runner.revokedAt = new Date().toISOString();
  runner.status = "REVOKED";
  runner.currentRunIds = [];
}

// ── 리뷰어 지정(목업, P4b D-P4b-1) — 해석 순서·거부 문구는 agent-service ReviewerResolver ──

const REVIEWER_INVALID =
  "리뷰어로 지정할 수 없는 페르소나입니다 — 활성 REVIEWER 롤이고 이 범위에서 쓸 수 있는 페르소나(프로젝트 소속은 그 프로젝트에서만, 공용은 어디서나)만 지정할 수 있습니다";

/** 활성 REVIEWER이고 그 범위에서 쓸 수 있다(프로젝트 소속은 그 프로젝트에서만, 전역 범위는 공용만) */
function mockReviewerUsable(persona: AgentTeamPersona | undefined, projectId: string | null): persona is AgentTeamPersona {
  return (
    persona !== undefined &&
    persona.role === "REVIEWER" &&
    persona.active &&
    (persona.projectId === null || persona.projectId === projectId)
  );
}

/**
 * 프로젝트 설정 > 전역 설정 > env > 자동 > 없음. 명시 지정(설정·env)이 깨졌으면 다음 단계로 내려가지 않고 NONE —
 * 사람이 고른 리뷰어를 조용히 바꾸지 않는다. projectId null = 전역 범위(프로젝트 축 없이 푼다).
 */
function mockReviewerView(projectId: string | null): AgentReviewSetting {
  const byId = (id: string) => teamState.personas.find((p) => p.id === id);
  const ref = (id: string) => {
    const p = byId(id);
    return { personaId: id, slug: p?.slug ?? null, name: p?.name ?? null };
  };
  const eff = (p: AgentTeamPersona | undefined, source: AgentReviewerSource): AgentReviewSetting["effective"] =>
    p && source !== "NONE"
      ? { personaId: p.id, slug: p.slug, name: p.name, source }
      : { personaId: null, slug: null, name: null, source: "NONE" };

  const savedId = projectId === null ? teamState.platformReviewer : (teamState.reviewSettings.get(projectId) ?? null);
  const setting = savedId === null ? null : ref(savedId);
  let effective: AgentReviewSetting["effective"];
  const projectPick = projectId === null ? null : teamState.reviewSettings.get(projectId);
  if (projectPick) {
    const p = byId(projectPick);
    effective = eff(p, mockReviewerUsable(p, projectId) ? "PROJECT" : "NONE");
  } else if (teamState.platformReviewer) {
    const p = byId(teamState.platformReviewer);
    effective = eff(p, mockReviewerUsable(p, null) ? "PLATFORM" : "NONE");
  } else if (teamState.envReviewer) {
    const p = teamState.personas.find((x) => x.slug === teamState.envReviewer);
    effective = eff(p, p?.active ? "ENV" : "NONE");
  } else {
    const active = teamState.personas
      .filter((p) => p.role === "REVIEWER" && p.active)
      .sort((a, b) => Number(a.id) - Number(b.id));
    const auto = (projectId !== null ? active.find((p) => p.projectId === projectId) : undefined) ?? active.find((p) => p.projectId === null);
    effective = eff(auto, "AUTO");
  }
  return { setting, effective };
}

export function mockReviewReady(projectId: string | null): boolean {
  return !teamState.reviewEnabled || mockReviewerView(projectId).effective.source !== "NONE";
}

function requireReviewApi(): void {
  if (!teamState.reviewApi) throw new ApiError(404, "찾을 수 없습니다.");
}

/** 인증 사용자 누구나 — 구 백엔드(404)면 null */
export async function fetchReviewSetting(projectId: string): Promise<AgentReviewSetting | null> {
  if (!teamState.reviewApi) return null;
  return mockReviewerView(projectId);
}

export async function saveReviewSetting(projectId: string, personaId: string): Promise<AgentReviewSetting> {
  requireReviewApi();
  if (!teamState.permissions.canManage) throw new ApiError(403, AGENT_FORBIDDEN);
  if (!personaId) throw new ApiError(400, "personaId가 필요합니다");
  const persona = teamState.personas.find((p) => p.id === personaId);
  if (!mockReviewerUsable(persona, projectId)) throw new ApiError(400, REVIEWER_INVALID);
  teamState.reviewSettings.set(projectId, personaId);
  return mockReviewerView(projectId);
}

/** 멱등 204 */
export async function clearReviewSetting(projectId: string): Promise<void> {
  requireReviewApi();
  if (!teamState.permissions.canManage) throw new ApiError(403, AGENT_FORBIDDEN);
  teamState.reviewSettings.delete(projectId);
}
