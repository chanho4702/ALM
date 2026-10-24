// ALM 도메인 모델 타입 — 개발 기록(커밋 연결, alm-backend V41). 정본은 alm-backend README "개발 기록 — 커밋 연결".
//
// git 커밋을 수집해 메시지 안 이슈 키로 이슈에 잇는다(지라 Development 패널). 수집(`POST /api/alm/dev/commits`)은 CLI·MCP 몫이라
// 화면은 읽기(이슈 개발 정보·프로젝트 최근 커밋)와 저장소 등록만 한다. id는 화면에서 항상 문자열이다.

/** 프로젝트에 등록한 저장소 — URL은 서버가 정규화한 값(끝 `/`·`.git` 제거, SSH → https) */
export interface DevRepository {
  id: string;
  name: string;
  url: string;
  defaultBranch: string;
}

/** 저장소 목록 통째 교체의 한 줄 — `name` 비우면 `owner/repo`, `defaultBranch` 비우면 `main` */
export interface DevRepositoryInput {
  name?: string;
  url: string;
  defaultBranch?: string;
}

/** 프로젝트당 저장소 상한(서버 `CodeRepositoryService.MAX_REPOSITORIES`) */
export const MAX_PROJECT_REPOSITORIES = 20;

/** COMMIT = 수집한 커밋, WEB_LINK = 웹 링크(kind=COMMIT)로만 붙은 옛 연결(작성 시각·작성자가 없을 수 있다) */
export type DevCommitSource = "COMMIT" | "WEB_LINK";

export interface DevIssueRef {
  issueId: string;
  issueKey: string;
}

export interface DevCommit {
  /** 수집한 커밋 id — 웹 링크로만 붙은 옛 연결이면 null */
  id: string | null;
  source: DevCommitSource;
  repositoryName: string | null;
  repositoryUrl: string | null;
  sha: string;
  shortSha: string;
  title: string;
  /** 본문 앞부분(최대 2000자) */
  message: string | null;
  authorName: string | null;
  authorEmail: string | null;
  /** 작성 시각 — WEB_LINK면 null */
  authoredAt: string | null;
  branch: string | null;
  url: string | null;
  /** 프로젝트 최근 커밋에서만 — 이어진 이슈(볼 수 있는 프로젝트 것만). 이슈 개발 정보에서는 null */
  issues: DevIssueRef[] | null;
}

/** PR — 웹 링크 kind=PR(link_pr 도구·화면에서 붙인 것) */
export interface DevPullRequest {
  id: string;
  url: string;
  title: string | null;
  createdBy: string;
  createdAt: string;
}

export interface DevelopmentSummary {
  /** 커밋 수(수집 + 옛 웹 링크) */
  commits: number;
  /** 커밋이 걸친 저장소 수 */
  repositories: number;
  pullRequests: number;
  /** 가장 최근 커밋 작성 시각 — 없으면 null */
  lastCommitAt: string | null;
}

/** 이슈 개발 정보 — 커밋 최신 순(최대 200건, 넘으면 truncated) + PR */
export interface IssueDevelopment {
  issueId: string;
  issueKey: string;
  summary: DevelopmentSummary;
  commits: DevCommit[];
  truncated: boolean;
  pullRequests: DevPullRequest[];
}

export interface ProjectCommitQuery {
  /** 앞 쪽의 nextCursor */
  cursor?: string | null;
  /** 1~100, 기본 50 */
  limit?: number;
}

/** 프로젝트 최근 커밋 한 쪽 — nextCursor가 null이면 끝 */
export interface ProjectCommitPage {
  items: DevCommit[];
  nextCursor: string | null;
}

export const PROJECT_COMMITS_DEFAULT_LIMIT = 50;
export const PROJECT_COMMITS_MAX_LIMIT = 100;
