// alm-backend REST 어댑터 — 개발 기록(커밋 연결, V41). 계약 정본은 alm-backend README "개발 기록 — 커밋 연결"
// (`DevDtos`): 저장소 등록 `GET/PUT /projects/{id}/settings/repositories`, 이슈 개발 정보 `GET /issues/{id}/development`,
// 프로젝트 최근 커밋 `GET /projects/{id}/commits?cursor=&limit=`. id(Long)는 여기서만 문자열로 바꾼다.
import type {
  DevSettings,
  DevCommit,
  DevIssueRef,
  DevPullRequest,
  DevRepository,
  DevRepositoryInput,
  DevWebhook,
  DevWebhookIssued,
  DevWebhookList,
  DevWebhookOutcome,
  DevWebhookProvider,
  DevPullRequestState,
  IssueDevelopment,
  ScmSync,
  ScmSyncInput,
  ScmSyncList,
  ProjectCommitPage,
  ProjectCommitQuery,
} from "../types";
import { toBackendId } from "../mapping";
import { json, jsonBody, postJson, searchParams, sharedApiFetch } from "./http";

interface RepositoryDto {
  id: number;
  name: string | null;
  url: string;
  defaultBranch: string | null;
}

interface IssueRefDto {
  issueId: number;
  issueKey: string;
}

export interface CommitViewDto {
  id: number | null;
  source: string | null;
  repositoryName: string | null;
  repositoryUrl: string | null;
  sha: string | null;
  shortSha: string | null;
  title: string | null;
  message: string | null;
  authorName: string | null;
  authorEmail: string | null;
  authoredAt: string | null;
  branch: string | null;
  url: string | null;
  issues: IssueRefDto[] | null;
}

interface PullRequestDto {
  id: number;
  url: string;
  title: string | null;
  createdBy: number;
  createdAt: string;
  state?: string | null;
}

const PR_STATES: readonly DevPullRequestState[] = ["OPEN", "MERGED", "CLOSED"];

interface DevelopmentDto {
  issueId: number;
  issueKey: string;
  summary?: { commits?: number; repositories?: number; pullRequests?: number; lastCommitAt?: string | null } | null;
  commits?: CommitViewDto[] | null;
  truncated?: boolean;
  pullRequests?: PullRequestDto[] | null;
}

interface CommitPageDto {
  items?: CommitViewDto[] | null;
  nextCursor?: string | null;
}

function mapRepository(dto: RepositoryDto): DevRepository {
  return { id: String(dto.id), name: dto.name ?? dto.url, url: dto.url, defaultBranch: dto.defaultBranch || "main" };
}

const mapIssueRef = (dto: IssueRefDto): DevIssueRef => ({ issueId: String(dto.issueId), issueKey: dto.issueKey });

/** 경계 매퍼 — 서버가 비워 보낸 값은 화면이 그대로 그릴 수 있는 기본값으로(빈 sha는 짧은 sha도 빈 문자열) */
export function mapCommitView(dto: CommitViewDto): DevCommit {
  const sha = dto.sha ?? "";
  return {
    id: dto.id === null || dto.id === undefined ? null : String(dto.id),
    source: dto.source === "WEB_LINK" ? "WEB_LINK" : "COMMIT",
    repositoryName: dto.repositoryName ?? null,
    repositoryUrl: dto.repositoryUrl ?? null,
    sha,
    shortSha: dto.shortSha || sha.slice(0, 7),
    title: dto.title || dto.url || sha,
    message: dto.message ?? null,
    authorName: dto.authorName ?? null,
    authorEmail: dto.authorEmail ?? null,
    authoredAt: dto.authoredAt ?? null,
    branch: dto.branch ?? null,
    url: dto.url ?? null,
    issues: Array.isArray(dto.issues) ? dto.issues.map(mapIssueRef) : null,
  };
}

const mapPullRequest = (dto: PullRequestDto): DevPullRequest => ({
  id: String(dto.id),
  url: dto.url,
  title: dto.title ?? null,
  createdBy: String(dto.createdBy),
  createdAt: dto.createdAt,
  // 모르는 값·옛 서버(필드 없음)는 null — 상태를 그리지 않는다
  state: PR_STATES.includes(dto.state as DevPullRequestState) ? (dto.state as DevPullRequestState) : null,
});

export function mapDevelopment(dto: DevelopmentDto): IssueDevelopment {
  const commits = (dto.commits ?? []).map(mapCommitView);
  const pullRequests = (dto.pullRequests ?? []).map(mapPullRequest);
  const summary = dto.summary ?? {};
  return {
    issueId: String(dto.issueId),
    issueKey: dto.issueKey,
    summary: {
      commits: summary.commits ?? commits.length,
      repositories: summary.repositories ?? new Set(commits.map((c) => c.repositoryUrl).filter(Boolean)).size,
      pullRequests: summary.pullRequests ?? pullRequests.length,
      lastCommitAt: summary.lastCommitAt ?? null,
    },
    commits,
    truncated: dto.truncated === true,
    pullRequests,
  };
}

export async function listProjectRepositories(projectId: string): Promise<DevRepository[]> {
  const rows = await json<RepositoryDto[]>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/repositories`),
  );
  return rows.map(mapRepository);
}

/** 통째 교체 — 보낸 목록이 곧 등록 상태(최대 20). 빈 이름·브랜치는 보내지 않아 서버 기본값을 쓴다 */
export async function saveProjectRepositories(projectId: string, inputs: DevRepositoryInput[]): Promise<DevRepository[]> {
  const repositories = inputs.map((input) => ({
    name: input.name?.trim() || null,
    url: input.url.trim(),
    defaultBranch: input.defaultBranch?.trim() || null,
  }));
  const rows = await json<RepositoryDto[]>(
    await sharedApiFetch(
      `/api/alm/projects/${toBackendId(projectId)}/settings/repositories`,
      jsonBody({ repositories }),
    ),
  );
  return rows.map(mapRepository);
}

export async function getIssueDevelopment(issueId: string): Promise<IssueDevelopment> {
  return mapDevelopment(
    await json<DevelopmentDto>(await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/development`)),
  );
}

export async function listProjectCommits(projectId: string, query: ProjectCommitQuery = {}): Promise<ProjectCommitPage> {
  const qs = searchParams({
    cursor: query.cursor || undefined,
    limit: query.limit === undefined ? undefined : String(query.limit),
  });
  const page = await json<CommitPageDto>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/commits${qs ? `?${qs}` : ""}`),
  );
  return { items: (page.items ?? []).map(mapCommitView), nextCursor: page.nextCursor ?? null };
}

interface DevSettingsDto {
  projectId: number;
  branchPrefix: string | null;
  version: number;
}

const mapDevSettings = (dto: DevSettingsDto): DevSettings => ({
  projectId: String(dto.projectId),
  branchPrefix: dto.branchPrefix ?? "",
  version: dto.version,
});

/** 프로젝트 개발 설정(V43) — 브랜치 이름 접두. 저장한 적 없으면 접두 ""·version 0 */
export async function getDevSettings(projectId: string): Promise<DevSettings> {
  return mapDevSettings(
    await json<DevSettingsDto>(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/development`)),
  );
}

/** 관리자만. expectedVersion이 어긋나면 409(서버 `{error}` 문구) */
export async function updateDevSettings(
  projectId: string,
  input: { branchPrefix: string; expectedVersion: number },
): Promise<DevSettings> {
  return mapDevSettings(
    await json<DevSettingsDto>(
      await sharedApiFetch(
        `/api/alm/projects/${toBackendId(projectId)}/settings/development`,
        jsonBody({ branchPrefix: input.branchPrefix, expectedVersion: input.expectedVersion }),
      ),
    ),
  );
}

// ── 저장소 웹훅(V44) — 관리 GET/POST /projects/{id}/settings/webhooks, DELETE …/webhooks/{id}. 수신은 GitHub·GitLab 몫 ──

interface WebhookDeliveryDto {
  deliveryId: string;
  event: string;
  outcome: string;
  message: string | null;
  receivedAt: string;
}

interface WebhookDto {
  id: number;
  repositoryUrl: string;
  provider: string;
  payloadPath: string;
  payloadUrl: string | null;
  actorId: number;
  createdAt: string;
  secretRotatedAt: string;
  lastDeliveryAt: string | null;
  lastEvent: string | null;
  lastOutcome: string | null;
  lastMessage: string | null;
  recentDeliveries?: WebhookDeliveryDto[] | null;
}

const OUTCOMES: readonly DevWebhookOutcome[] = ["PROCESSED", "IGNORED", "PING", "REJECTED", "FAILED"];
/** 모르는 값(서버가 늘린 결과)은 실패로 보이지 않게 IGNORED로 — 문구(message)는 그대로 뜬다 */
const toOutcome = (value: string | null | undefined): DevWebhookOutcome =>
  OUTCOMES.includes(value as DevWebhookOutcome) ? (value as DevWebhookOutcome) : "IGNORED";

export function mapWebhook(dto: WebhookDto): DevWebhook {
  return {
    id: String(dto.id),
    repositoryUrl: dto.repositoryUrl,
    provider: dto.provider === "GITLAB" ? "GITLAB" : "GITHUB",
    payloadPath: dto.payloadPath,
    payloadUrl: dto.payloadUrl ?? null,
    actorId: String(dto.actorId),
    createdAt: dto.createdAt,
    secretRotatedAt: dto.secretRotatedAt,
    lastDeliveryAt: dto.lastDeliveryAt ?? null,
    lastEvent: dto.lastEvent ?? null,
    lastOutcome: dto.lastOutcome ? toOutcome(dto.lastOutcome) : null,
    lastMessage: dto.lastMessage ?? null,
    recentDeliveries: (dto.recentDeliveries ?? []).map((d) => ({
      deliveryId: d.deliveryId,
      event: d.event,
      outcome: toOutcome(d.outcome),
      message: d.message ?? null,
      receivedAt: d.receivedAt,
    })),
  };
}

/** 관리자만(목록도 — 최근 수신에 저장소 활동이 보인다) */
export async function listRepositoryWebhooks(projectId: string): Promise<DevWebhookList> {
  const dto = await json<{ encryptionConfigured: boolean; webhooksEnabled?: boolean; webhooks?: WebhookDto[] | null }>(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/webhooks`),
  );
  return {
    encryptionConfigured: dto.encryptionConfigured === true,
    // 옛 서버(필드 없음)는 웹훅만 있던 때라 켜진 것으로 본다
    webhooksEnabled: dto.webhooksEnabled !== false,
    webhooks: (dto.webhooks ?? []).map(mapWebhook),
  };
}

/** 만들기·재발급 — 같은 저장소면 경로는 그대로, 시크릿만 새로. `secret`은 이 응답에서만 보인다 */
export async function issueRepositoryWebhook(
  projectId: string,
  input: { repositoryUrl: string; provider: DevWebhookProvider },
): Promise<DevWebhookIssued> {
  const dto = await json<{ webhook: WebhookDto; secret: string }>(
    await sharedApiFetch(
      `/api/alm/projects/${toBackendId(projectId)}/settings/webhooks`,
      postJson({ repositoryUrl: input.repositoryUrl, provider: input.provider }),
    ),
  );
  return { webhook: mapWebhook(dto.webhook), secret: dto.secret };
}

export async function deleteRepositoryWebhook(projectId: string, webhookId: string): Promise<void> {
  await json(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/webhooks/${toBackendId(webhookId)}`, {
      method: "DELETE",
    }),
  );
}

// ── 저장소 폴링 동기화(V45) — GET/PUT /projects/{id}/settings/scm-sync, DELETE …/{id}, POST …/{id}/run ──

interface ScmSyncDto {
  id: number;
  repositoryUrl: string;
  provider: string;
  apiBaseUrl: string;
  enabled: boolean;
  actorId: number;
  createdAt: string;
  tokenUpdatedAt: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastOutcome: string | null;
  lastMessage: string | null;
  nextRunAt: string | null;
  rateLimitedUntil: string | null;
  failureCount: number;
  running: boolean;
}

export function mapScmSync(dto: ScmSyncDto): ScmSync {
  const outcome = dto.lastOutcome;
  return {
    id: String(dto.id),
    repositoryUrl: dto.repositoryUrl,
    provider: dto.provider === "GITLAB" ? "GITLAB" : "GITHUB",
    apiBaseUrl: dto.apiBaseUrl,
    enabled: dto.enabled !== false,
    actorId: String(dto.actorId),
    createdAt: dto.createdAt,
    tokenUpdatedAt: dto.tokenUpdatedAt,
    lastRunAt: dto.lastRunAt ?? null,
    lastSuccessAt: dto.lastSuccessAt ?? null,
    // 모르는 결과는 실패로 — 문구(lastMessage)는 그대로 뜬다
    lastOutcome: outcome === "OK" || outcome === "RATE_LIMITED" || outcome === "FAILED" ? outcome : outcome ? "FAILED" : null,
    lastMessage: dto.lastMessage ?? null,
    nextRunAt: dto.nextRunAt ?? null,
    rateLimitedUntil: dto.rateLimitedUntil ?? null,
    failureCount: dto.failureCount ?? 0,
    running: dto.running === true,
  };
}

/** 관리자만 */
export async function listScmSyncs(projectId: string): Promise<ScmSyncList> {
  const dto = await json<{
    syncMode: string;
    webhooksEnabled: boolean;
    pollingEnabled: boolean;
    schedulerActive: boolean;
    encryptionConfigured: boolean;
    pollIntervalSeconds: number;
    repositories?: ScmSyncDto[] | null;
  }>(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/scm-sync`));
  const mode = dto.syncMode === "webhook" || dto.syncMode === "polling" ? dto.syncMode : "both";
  return {
    syncMode: mode,
    webhooksEnabled: dto.webhooksEnabled !== false,
    pollingEnabled: dto.pollingEnabled === true,
    schedulerActive: dto.schedulerActive === true,
    encryptionConfigured: dto.encryptionConfigured === true,
    pollIntervalSeconds: dto.pollIntervalSeconds,
    repositories: (dto.repositories ?? []).map(mapScmSync),
  };
}

/** 등록·수정 — 빈 토큰·API 주소는 보내지 않는다(서버가 기존 토큰·기본 주소를 쓴다) */
export async function saveScmSync(projectId: string, input: ScmSyncInput): Promise<ScmSync> {
  const body: Record<string, unknown> = { repositoryUrl: input.repositoryUrl, provider: input.provider };
  if (input.apiBaseUrl?.trim()) body.apiBaseUrl = input.apiBaseUrl.trim();
  if (input.token?.trim()) body.token = input.token.trim();
  if (input.enabled !== undefined) body.enabled = input.enabled;
  return mapScmSync(
    await json<ScmSyncDto>(await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/scm-sync`, jsonBody(body))),
  );
}

export async function deleteScmSync(projectId: string, syncId: string): Promise<void> {
  await json(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/scm-sync/${toBackendId(syncId)}`, { method: "DELETE" }),
  );
}

/** 지금 동기화 — 요청 안에서 한 번 돈다. 실행 중·레이트 리밋 대기면 409 {error} */
export async function runScmSync(projectId: string, syncId: string): Promise<ScmSync> {
  return mapScmSync(
    await json<ScmSyncDto>(
      await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/settings/scm-sync/${toBackendId(syncId)}/run`, postJson({})),
    ),
  );
}
