// ALM 도메인 모델 타입 — aiTeam (types.ts에서 분할, 동작 불변)
import type { AgentRole } from "./office";

/**
 * agent-service `GET /api/agent/personas` 항목 — "꺼지지 않는 개발팀" 페르소나 하나.
 * ALM은 이름·개수만 안다: 배열이 비어 있지 않으면 AI 기능이 활성인 플랫폼이다
 * (agent-service가 없는 배포는 404/5xx로 답하거나 아예 응답하지 않는다 — 빈 배열과 동일 취급).
 */
export interface AgentPersona {
  id: string;
  name: string;
  emoji?: string | null;
}

// ── AI 팀 설정(agent-service P3f·P3h) — 프로젝트 설정 "AI 팀" 화면 ──

/**
 * `GET /api/agent/permissions?projectId=` — 버튼 노출 판정 힌트(D-P3f-6). 실제 판정은 각 관리 API가 다시 한다.
 * canManage = 전역 관리자 OR 그 프로젝트 ADMIN. org 판정 실패는 서버가 canManage=false로 접는다.
 */
export interface AgentPermissions {
  canManage: boolean;
  isGlobalAdmin: boolean;
}

/** org-service ResourceKind 중 프로젝트 관리자가 줄 수 있는 둘 — GLOBAL은 전역 관리자 전용이라 이 화면에 없다 */
export type AgentGrantResourceType = "PROJECT" | "SPACE";

/** org-service GrantRole — ADMIN ⊃ EDITOR ⊃ COMMENTER ⊃ VIEWER */
export type AgentGrantRole = "VIEWER" | "COMMENTER" | "EDITOR" | "ADMIN";

export interface AgentGrantInput {
  resourceType: AgentGrantResourceType;
  resourceId: string;
  role: AgentGrantRole;
}

/** `GET /api/agent/personas` 항목 전체(PersonaResponse) — projectId null이면 전사 공용(전역 관리자만 관리) */
export interface AgentTeamPersona {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  role: AgentRole;
  active: boolean;
  projectId: string | null;
  /** 렌더용 외형(AGP-62) — 버전드 JSON 문자열 원문. 해석은 office `parseAvatarConfig`, 없으면 기본 외형 */
  avatarConfig?: string | null;
}

/**
 * `GET /api/agent/personas/{id}`(관리자 전용 — canManagePersona) — 편집 다이얼로그 프리필. 목록 필드 + 편집 필드.
 * 미설정 필드는 null.
 */
export interface AgentPersonaDetail extends AgentTeamPersona {
  avatarConfig: string | null;
  voicePrompt: string | null;
  defaultModel: string | null;
  skills: string | null;
}

/**
 * `PATCH /api/agent/personas/{id}` 본문 — 전부 선택. 생략 = 그대로, 빈 문자열 = 지움(avatarConfig ""= 기본 외형),
 * name은 지울 수 없다(400).
 */
export interface AgentPersonaPatch {
  name?: string;
  emoji?: string;
  voicePrompt?: string;
  defaultModel?: string;
  skills?: string;
  avatarConfig?: string;
}

/** `POST /api/agent/personas` — 프로젝트 관리자는 projectId=현재 프로젝트가 필수 */
export interface AgentPersonaInput {
  slug: string;
  role: AgentRole;
  name: string;
  emoji?: string;
  voicePrompt?: string;
  projectId: string;
  grants: AgentGrantInput[];
}

/** 토큰 종류(D-P4-3b) — HUMAN = 사람이 발급한 직원 토큰, RUN = run마다 시스템이 발급하는 임시 토큰(종료 시 철회) */
export type AgentTokenKind = "HUMAN" | "RUN";

/** `GET /api/agent/tokens?projectId=` 항목(PatSummaryResponse) — 해시·원문은 없다 */
export interface AgentToken {
  id: string;
  label: string;
  personaSlug: string;
  createdAt: string | null;
  /** null = 무기한(또는 구 백엔드) */
  expiresAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
  /** P4a 이전 백엔드는 필드가 없다 — HUMAN으로 본다 */
  kind: AgentTokenKind;
  /** 무기한 사람용 토큰 — 화면 "무기한" 경고 */
  noExpiry: boolean;
  /** 7일 안 만료 — "곧 만료" 배지 */
  expiringSoon: boolean;
}

/** `POST /api/agent/tokens` — 만료는 기간(1~365일, 생략 = 서버 기본 90일) 또는 무기한(전역 관리자만) 중 하나 */
export interface AgentTokenIssueInput {
  label: string;
  personaSlug: string;
  expiresInDays?: number;
  noExpiry?: boolean;
}

/** `POST /api/agent/tokens` 201 — 원문 token은 이 응답에만 온다 */
export interface AgentTokenIssued {
  token: string;
  id: string;
  label: string;
  personaSlug: string;
  /** null = 무기한(또는 구 백엔드가 주지 않음) */
  expiresAt?: string | null;
}

// ── 실행 위치·러너(P4a AGP-69, D-P4-1·3·4·5) ──

/** SERVER = 서버(24시간, 등록된 LLM API 키 과금) · LOCAL = 사용자 PC 러너(그 PC의 Claude 구독·자기 키) */
export type AgentExecutionSite = "SERVER" | "LOCAL";

/** `GET/PUT /api/agent/execution-site/projects/{id}` */
export interface AgentExecutionSiteSetting {
  projectId: string;
  /** 저장값 — null이면 전역 기본을 따른다 */
  site: AgentExecutionSite | null;
  effectiveSite: AgentExecutionSite;
  defaultSite: AgentExecutionSite;
  /** SERVER run을 서비스 프로세스 안에서 돈다(호스트 dev) — false면 PLATFORM 러너가 집는다 */
  inProcess: boolean;
}

export type AgentRunnerKind = "PLATFORM" | "LOCAL";

export type AgentRunnerStatus = "ONLINE" | "OFFLINE" | "NEVER_CONNECTED" | "REVOKED";

/** `GET /api/agent/runners?projectId=` 항목 — 토큰 해시·원문 없음 */
export interface AgentRunner {
  id: string;
  kind: AgentRunnerKind;
  name: string;
  /** null = 플랫폼 전역 러너 */
  projectId: string | null;
  issuedBy: string | null;
  tokenPrefix: string | null;
  createdAt: string | null;
  revokedAt: string | null;
  lastHeartbeatAt: string | null;
  version: string | null;
  os: string | null;
  maxConcurrency: number | null;
  status: AgentRunnerStatus;
  currentRunIds: string[];
}

/** `POST /api/agent/runners` 201 — 원문 token(agr_)은 이 응답에만 온다 */
export interface AgentRunnerIssued {
  id: string;
  kind: AgentRunnerKind;
  name: string;
  projectId: string | null;
  token: string;
  tokenPrefix: string | null;
  createdAt: string | null;
}

export interface AgentRunnerInput {
  name: string;
  /** null = 플랫폼 전역(전역 관리자만) */
  projectId: string | null;
}

/** 실제로 적용될 키의 출처(D-P3h-3) — 프로젝트 > 전역 > 서버 env > 없음 */
export type AgentCredentialScope = "PROJECT" | "PLATFORM" | "ENV" | "NONE";

/** `GET/PUT /api/agent/credentials/projects/{projectId}` — 원문 키는 어떤 응답에도 없다 */
export interface AgentProjectCredential {
  project: {
    set: boolean;
    provider: "ANTHROPIC" | null;
    /** 키 끝 4자 */
    keyHint: string | null;
    updatedBy: string | null;
    updatedAt: string | null;
  };
  effective: {
    scope: AgentCredentialScope;
    keyHint: string | null;
  };
}

// ── 리뷰어 지정(P4b D-P4b-1, AGP-59) — `GET/PUT/DELETE /api/agent/review-settings/{projects/{id}|platform}` ──

/** 실제 리뷰어가 정해진 단계 — 프로젝트 설정 > 전역 설정 > 서버 env > 자동(활성 REVIEWER 중 id 최소) > 없음 */
export type AgentReviewerSource = "PROJECT" | "PLATFORM" | "ENV" | "AUTO" | "NONE";

export interface AgentReviewerRef {
  personaId: string;
  /** 지정한 페르소나가 없어졌으면 null */
  slug: string | null;
  name: string | null;
}

export interface AgentReviewSetting {
  /** 이 범위에 저장된 지정 — null이면 상위 설정·자동을 따른다 */
  setting: AgentReviewerRef | null;
  /** 지금 실제로 쓰일 리뷰어 — source가 NONE이면 personaId·slug·name 모두 null */
  effective: {
    personaId: string | null;
    slug: string | null;
    name: string | null;
    source: AgentReviewerSource;
  };
}

// ── 실행 중 지시(P4b D-P4b-5, AGP-67) — `POST/GET /api/agent/runs/{id}/directives` ──

export interface AgentRunDirective {
  id: string;
  runId: string;
  /** 본문은 run 프로젝트 관리자에게만 온다 — 그 밖의 조회자는 null */
  text: string | null;
  createdAt: string;
  /** null = 아직 워커에게 전달되지 않음 */
  deliveredAt: string | null;
}

export interface AgentCredentialInput {
  apiKey: string;
  /** 저장 전에 저비용 호출로 키를 검증한다(실패 400) */
  validate: boolean;
}
