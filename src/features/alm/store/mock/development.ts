// localStorage 목업 스토어 — 개발 기록(커밋 연결, V41). 규칙·문구는 alm-backend README "개발 기록 — 커밋 연결"과
// `RepositoryUrls`·`CodeRepositoryService`·`DevCommitService`를 따른다.
//
// 화면은 수집하지 않는다(수집은 CLI·MCP의 `POST /api/alm/dev/commits`). 목업에서는 시드와 테스트·개발 훅
// `__ingestMockCommits`만 커밋을 넣는다 — 그 훅이 활동 `commit_linked`·실시간 `development` 신호·자동화 `COMMIT_LINKED`를
// 서버와 같은 순서로 낸다.
import type {
  DevCommit,
  DevRepository,
  DevRepositoryInput,
  IssueDevelopment,
  JiraData,
  MockDevCommit,
  ProjectCommitPage,
  ProjectCommitQuery,
} from "../types";
import {
  MAX_PROJECT_REPOSITORIES,
  PROJECT_COMMITS_DEFAULT_LIMIT,
  PROJECT_COMMITS_MAX_LIMIT,
} from "../model/development";
import { ApiError } from "../mapping";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { clone, load, nextId, persist } from "./db";
import { assertCanAdmin } from "./members";
import { __emitProjectStreamEvent } from "./realtime";
import { emitCommitLinked } from "./automation";

const MAX_URL = 300;
/** 이슈 개발 정보의 수집 커밋 상한(넘으면 truncated) */
const ISSUE_COMMITS_LIMIT = 200;
const SCP_LIKE = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):(.+)$/;

const bad = (message: string) => new ApiError(400, message);

/** 저장소 URL 정규화 — 서버 `RepositoryUrls.normalize`와 같은 규칙·문구 */
export function normalizeRepositoryUrl(raw: string): string {
  if (!raw || !raw.trim()) throw bad("저장소 URL을 입력하세요");
  let value = raw.trim();
  const scp = SCP_LIKE.exec(value);
  if (scp && !value.includes("://")) value = `https://${scp[1]}/${scp[2]}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw bad("저장소 URL 형식이 올바르지 않습니다");
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if ((scheme !== "https" && scheme !== "http") || !url.hostname) {
    throw bad("저장소 URL은 http(s) 주소여야 합니다 (예: https://github.com/owner/repo)");
  }
  if (url.username || url.password) throw bad("저장소 URL에 계정 정보를 넣을 수 없습니다");
  if (url.search || url.hash || value.includes("?") || value.includes("#")) {
    throw bad("저장소 URL에 질의·조각(?·#)을 넣을 수 없습니다");
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (path.toLowerCase().endsWith(".git")) path = path.slice(0, -4);
  path = path.replace(/\/+$/, "");
  const segments = path ? path.slice(1).split("/") : [];
  if (segments.length < 2) throw bad("저장소 URL은 소유자/저장소까지 있어야 합니다 (예: https://github.com/owner/repo)");
  if (segments.some((s) => s === "" || s === "." || s === "..")) throw bad("저장소 URL 경로가 올바르지 않습니다");
  const port = url.port ? `:${url.port}` : "";
  const normalized = `${scheme}://${url.hostname.toLowerCase()}${port}${path}`;
  if (normalized.length > MAX_URL) throw bad(`저장소 URL이 너무 깁니다(${MAX_URL}자 이하)`);
  return normalized;
}

/** 표시 이름 기본값 — 경로 마지막 두 조각(owner/repo) */
function defaultRepositoryName(normalizedUrl: string): string {
  const segments = new URL(normalizedUrl).pathname.slice(1).split("/");
  const name = `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
  return name.length > 100 ? name.slice(-100) : name;
}

function requireProject(data: JiraData, projectId: string): void {
  if (!data.projects.some((p) => p.id === projectId)) throw new ApiError(404, "프로젝트를 찾을 수 없습니다");
}

const toRepository = ({ id, name, url, defaultBranch }: DevRepository): DevRepository => ({ id, name, url, defaultBranch });

/** 프로젝트 저장소(등록 순) — 읽기는 누구나(VIEW) */
export async function listProjectRepositories(projectId: string): Promise<DevRepository[]> {
  const data = load();
  requireProject(data, projectId);
  return clone(data.repositories.filter((r) => r.projectId === projectId).map(toRepository));
}

/** 저장소 목록 통째 교체 — 보낸 목록이 곧 등록 상태다(최대 20). 프로젝트 관리자만 */
export async function saveProjectRepositories(projectId: string, inputs: DevRepositoryInput[]): Promise<DevRepository[]> {
  const data = load();
  requireProject(data, projectId);
  assertCanAdmin(data, projectId);
  if (inputs.length > MAX_PROJECT_REPOSITORIES) {
    throw bad(`저장소는 프로젝트당 ${MAX_PROJECT_REPOSITORIES}개까지 등록할 수 있습니다`);
  }
  const seen = new Set<string>();
  const fresh = inputs.map((input) => {
    if (!input) throw bad("저장소 항목이 비었습니다");
    const url = normalizeRepositoryUrl(input.url);
    if (seen.has(url)) throw bad(`같은 저장소가 두 번 들어 있습니다: ${url}`);
    seen.add(url);
    const name = input.name?.trim() ? input.name.trim() : defaultRepositoryName(url);
    if (name.length > 100) throw bad("저장소 이름은 100자 이하여야 합니다");
    const defaultBranch = input.defaultBranch?.trim() ? input.defaultBranch.trim() : "main";
    if (defaultBranch.length > 100) throw bad("기본 브랜치 이름은 100자 이하여야 합니다");
    return { id: nextId(), projectId, name, url, defaultBranch };
  });
  data.repositories = [...data.repositories.filter((r) => r.projectId !== projectId), ...fresh];
  persist();
  return clone(fresh.map(toRepository));
}

/** 최신 순 — (작성 시각, id) 내림차순(서버 키셋과 같은 순서) */
function byNewest(a: MockDevCommit, b: MockDevCommit): number {
  return b.authoredAt.localeCompare(a.authoredAt) || b.id.localeCompare(a.id);
}

function toView(commit: MockDevCommit, issues: DevCommit["issues"]): DevCommit {
  return {
    id: commit.id,
    source: "COMMIT",
    repositoryName: commit.repositoryName,
    repositoryUrl: commit.repositoryUrl,
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    title: commit.title,
    message: commit.message,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    authoredAt: commit.authoredAt,
    branch: commit.branch,
    url: commit.url,
    issues,
  };
}

/**
 * 이슈 개발 정보 — 수집 커밋(최신 순, 200건 넘으면 truncated) 뒤에 옛 웹 링크 커밋(kind=COMMIT, 같은 URL의 수집 커밋이 있으면 뺀다),
 * PR은 웹 링크 kind=PR.
 */
export async function getIssueDevelopment(issueId: string): Promise<IssueDevelopment> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new ApiError(404, "이슈를 찾을 수 없습니다");
  const linked = data.devCommits.filter((c) => c.issueIds.includes(issueId)).sort(byNewest);
  const shown = linked.slice(0, ISSUE_COMMITS_LIMIT);
  const urls = new Set(linked.map((c) => c.url));
  const links = data.webLinks
    .filter((w) => w.issueId === issueId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const webCommits: DevCommit[] = links
    .filter((w) => w.kind === "COMMIT" && !urls.has(w.url))
    .map((w) => {
      const sha = /\/commit\/([0-9a-f]{7,64})/i.exec(w.url)?.[1]?.toLowerCase() ?? "";
      return {
        id: null,
        source: "WEB_LINK",
        repositoryName: null,
        repositoryUrl: null,
        sha,
        shortSha: sha.slice(0, 7),
        title: w.title ?? w.url,
        message: null,
        authorName: null,
        authorEmail: null,
        authoredAt: null,
        branch: null,
        url: w.url,
        issues: null,
      };
    });
  const commits = [...shown.map((c) => toView(c, null)), ...webCommits];
  const pullRequests = links
    .filter((w) => w.kind === "PR")
    .map((w) => ({ id: w.id, url: w.url, title: w.title, createdBy: w.createdBy, createdAt: w.createdAt }));
  return clone({
    issueId: issue.id,
    issueKey: issue.key,
    summary: {
      commits: linked.length + webCommits.length,
      repositories: new Set(linked.map((c) => c.repositoryUrl)).size,
      pullRequests: pullRequests.length,
      lastCommitAt: linked[0]?.authoredAt ?? null,
    },
    commits,
    truncated: linked.length > ISSUE_COMMITS_LIMIT,
    pullRequests,
  });
}

const encodeCursor = (c: MockDevCommit) => `${c.authoredAt}|${c.id}`;

/**
 * 프로젝트 최근 커밋 — 이 프로젝트가 등록한 저장소의 커밋 ∪ 이 프로젝트 이슈에 이어진 커밋, (작성 시각, id) 최신 순 커서.
 * 항목의 `issues`는 볼 수 있는(보관되지 않은) 이슈만.
 */
export async function listProjectCommits(projectId: string, query: ProjectCommitQuery = {}): Promise<ProjectCommitPage> {
  const data = load();
  requireProject(data, projectId);
  const rawLimit = query.limit ?? PROJECT_COMMITS_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), PROJECT_COMMITS_MAX_LIMIT);
  const repoUrls = new Set(data.repositories.filter((r) => r.projectId === projectId).map((r) => r.url));
  const projectIssueIds = new Set(data.issues.filter((i) => i.projectId === projectId).map((i) => i.id));
  const issueById = new Map(data.issues.map((i) => [i.id, i]));
  let rows = data.devCommits
    .filter((c) => repoUrls.has(c.repositoryUrl) || c.issueIds.some((id) => projectIssueIds.has(id)))
    .sort(byNewest);
  if (query.cursor) {
    const [at, id] = query.cursor.split("|");
    if (!at || !id || Number.isNaN(Date.parse(at))) throw bad("커서 형식이 올바르지 않습니다");
    rows = rows.filter((c) => c.authoredAt < at || (c.authoredAt === at && c.id < id));
  }
  const page = rows.slice(0, limit);
  const items = page.map((c) =>
    toView(
      c,
      c.issueIds
        .map((id) => issueById.get(id))
        .filter((i): i is NonNullable<typeof i> => i !== undefined)
        .map((i) => ({ issueId: i.id, issueKey: i.key })),
    ),
  );
  return clone({ items, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null });
}

// ── 테스트·개발 훅 — 수집(`POST /api/alm/dev/commits`) 대역 ──

export interface MockCommitIngest {
  sha: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
  authoredAt?: string;
  branch?: string;
}

/** 등록된 프로젝트 키만 키다 — 가장 긴 키 우선, 앞 0 제거, 영숫자·`_`에 붙은 것은 아니다(서버 IssueKeyParser) */
function parseIssueKeys(message: string, projectKeys: string[]): string[] {
  const keys = [...projectKeys].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  const upper = message.toUpperCase();
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![A-Z0-9_])${escaped}-0*(\\d+)(?![A-Z0-9_])`, "g");
    for (const match of upper.matchAll(pattern)) {
      const full = `${key}-${Number(match[1])}`;
      if (!found.includes(full)) found.push(full);
    }
  }
  return found.slice(0, 20);
}

/**
 * 커밋 묶음을 넣는다 — 메시지의 키로 이슈에 잇고, 새 연결이 생긴 이슈마다 활동 한 줄·실시간 `development` 신호
 * (version 불변)·자동화 `COMMIT_LINKED`. 같은 (저장소, sha)·(이슈, 커밋)은 다시 잇지 않는다(멱등).
 */
export async function __ingestMockCommits(
  repository: string,
  commits: MockCommitIngest[],
  actorId: string = CURRENT_USER_ID,
): Promise<{ linksCreated: number }> {
  const data = load();
  const repositoryUrl = normalizeRepositoryUrl(repository);
  const registered = data.repositories.find((r) => r.url === repositoryUrl);
  const projectKeys = data.projects.map((p) => p.key);
  const newLinks = new Map<string, string[]>();
  for (const input of commits) {
    const sha = input.sha.toLowerCase();
    const keys = parseIssueKeys(input.message, projectKeys);
    const issues = keys.map((key) => data.issues.find((i) => i.key === key)).filter((i): i is NonNullable<typeof i> => !!i);
    let row = data.devCommits.find((c) => c.repositoryUrl === repositoryUrl && c.sha === sha);
    if (!row) {
      if (issues.length === 0 && !registered) continue;
      const [title, ...rest] = input.message.split("\n");
      const body = rest.join("\n").trim();
      row = {
        id: nextId(),
        repositoryUrl,
        repositoryName: registered?.name ?? defaultRepositoryName(repositoryUrl),
        sha,
        title: title.slice(0, 300),
        message: body ? body.slice(0, 2000) : null,
        authorName: input.authorName ?? null,
        authorEmail: input.authorEmail ?? null,
        authoredAt: input.authoredAt ?? new Date().toISOString(),
        branch: input.branch ?? null,
        url: `${repositoryUrl}/commit/${sha}`,
        issueIds: [],
      };
      data.devCommits.push(row);
    }
    for (const issue of issues) {
      if (row.issueIds.includes(issue.id)) continue;
      row.issueIds.push(issue.id);
      newLinks.set(issue.id, [...(newLinks.get(issue.id) ?? []), sha.slice(0, 7)]);
    }
  }
  const at = new Date().toISOString();
  for (const [issueId, shas] of newLinks) {
    data.activities.push({
      id: nextId(),
      issueId,
      actorId,
      type: "commit_linked",
      detail: `커밋 ${shas.length}건 연결: ${shas.join(", ")}`,
      at,
    });
  }
  persist();
  let linksCreated = 0;
  for (const [issueId, shas] of newLinks) {
    linksCreated += shas.length;
    const issue = load().issues.find((i) => i.id === issueId);
    if (!issue) continue;
    __emitProjectStreamEvent({
      kind: "issue",
      type: "issue.updated",
      projectId: issue.projectId,
      issueId: issue.id,
      issueKey: issue.key,
      version: issue.version,
      changedFields: ["development"],
      sprintId: null,
      actorId,
      at,
      eventId: null,
    });
    await emitCommitLinked(issueId);
  }
  return { linksCreated };
}
