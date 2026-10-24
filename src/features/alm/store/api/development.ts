// alm-backend REST 어댑터 — 개발 기록(커밋 연결, V41). 계약 정본은 alm-backend README "개발 기록 — 커밋 연결"
// (`DevDtos`): 저장소 등록 `GET/PUT /projects/{id}/settings/repositories`, 이슈 개발 정보 `GET /issues/{id}/development`,
// 프로젝트 최근 커밋 `GET /projects/{id}/commits?cursor=&limit=`. id(Long)는 여기서만 문자열로 바꾼다.
import type {
  DevCommit,
  DevIssueRef,
  DevPullRequest,
  DevRepository,
  DevRepositoryInput,
  IssueDevelopment,
  ProjectCommitPage,
  ProjectCommitQuery,
} from "../types";
import { toBackendId } from "../mapping";
import { json, jsonBody, searchParams, sharedApiFetch } from "./http";

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
}

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
