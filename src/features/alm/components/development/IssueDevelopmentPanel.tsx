import { useCallback, useEffect, useState } from "react";
import { Button, SkeletonListItem } from "@chanho/react";
import { ChevronDown, ChevronRight, ExternalLink, GitBranch, GitCommitHorizontal, GitPullRequest, RotateCw } from "lucide-react";
import type { IssueDevelopment } from "../../store/types";
import { getIssueDevelopment } from "../../store/jiraStore";
import { errorStatus } from "../../store/mapping";
import { formatDateTime, relTime } from "../time";
import { DevCommitRow } from "./DevCommitRow";
import "./development.css";

export interface IssueDevelopmentPanelProps {
  issueId: string;
  issueKey: string;
  /** 브랜치 이름 복사(Ctrl+Shift+.)와 같은 동작 */
  onCopyBranch: () => void;
  /** 바뀌면 다시 읽는다 — 실시간 `issue.updated`(changedFields: development) */
  refreshKey?: number;
}

export function describeDevelopmentError(error: unknown): string {
  if (errorStatus(error) === 503) return "ALM 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
  return error instanceof Error ? error.message : String(error);
}

/**
 * 이슈 개발 패널(지라 Development · Linear) — 커밋 수·PR 수 요약, 펼치면 커밋(최신 순)·PR 목록.
 * 연결은 커밋 메시지 속 이슈 키로만 생긴다(alm-backend V41) — 빈 상태가 그 방법과 브랜치 이름 복사를 알려 준다.
 */
export function IssueDevelopmentPanel({ issueId, issueKey, onCopyBranch, refreshKey = 0 }: IssueDevelopmentPanelProps) {
  const [dev, setDev] = useState<IssueDevelopment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setDev(await getIssueDevelopment(issueId));
      setError(null);
    } catch (e) {
      setError(describeDevelopmentError(e));
    }
  }, [issueId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const empty = dev !== null && dev.summary.commits === 0 && dev.summary.pullRequests === 0;

  return (
    <section className="issue-relations issue-dev" data-testid="issue-development" aria-label="개발">
      <div className="issue-relations-head">
        <h4>개발</h4>
      </div>

      {error !== null ? (
        <div className="issue-dev-error" role="alert">
          <span>개발 정보를 불러오지 못했습니다 — {error}</span>
          <Button variant="ghost" size="small" iconBefore={<RotateCw size={14} />} onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      ) : dev === null ? (
        <div className="issue-dev-loading" aria-busy="true">
          <SkeletonListItem media="icon" width="45%" label="개발 정보 불러오는 중" />
        </div>
      ) : empty ? (
        <div className="issue-dev-empty-box">
          <p className="issue-dev-empty">
            커밋 메시지에 <code className="dev-key">{issueKey}</code> 같은 키를 넣으면 여기에 연결됩니다.
          </p>
          <Button
            variant="secondary"
            size="small"
            iconBefore={<GitBranch size={14} />}
            title="브랜치 이름 복사 (Ctrl+Shift+.)"
            onClick={onCopyBranch}
          >
            이 이슈의 브랜치 이름 복사
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="issue-dev-summary"
            aria-expanded={expanded}
            aria-controls={`issue-dev-detail-${issueId}`}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            <span className="issue-dev-stat">
              <GitCommitHorizontal size={14} aria-hidden />
              커밋 {dev.summary.commits}건
            </span>
            <span className="issue-dev-stat">
              <GitPullRequest size={14} aria-hidden />
              PR {dev.summary.pullRequests}건
            </span>
            {dev.summary.repositories > 0 ? (
              <span className="issue-dev-stat-muted">저장소 {dev.summary.repositories}곳</span>
            ) : null}
            {dev.summary.lastCommitAt ? (
              <span className="issue-dev-stat-muted" title={formatDateTime(dev.summary.lastCommitAt)}>
                마지막 커밋 {relTime(dev.summary.lastCommitAt)}
              </span>
            ) : null}
          </button>
          {expanded ? (
            <div className="issue-dev-detail" id={`issue-dev-detail-${issueId}`}>
              {dev.commits.length > 0 ? (
                <div className="issue-dev-group">
                  <h5 className="issue-dev-group-title">커밋 ({dev.commits.length})</h5>
                  <ul className="dev-commit-list" aria-label="연결된 커밋">
                    {dev.commits.map((commit) => (
                      <DevCommitRow key={`${commit.source}-${commit.id ?? commit.url ?? commit.sha}`} commit={commit} />
                    ))}
                  </ul>
                  {dev.truncated ? (
                    <p className="issue-dev-note" role="note">
                      커밋이 많아 최근 {dev.commits.filter((c) => c.source === "COMMIT").length}건만 보입니다 — 전체 {dev.summary.commits}건은
                      저장소에서 확인하세요.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {dev.pullRequests.length > 0 ? (
                <div className="issue-dev-group">
                  <h5 className="issue-dev-group-title">PR ({dev.pullRequests.length})</h5>
                  <ul className="dev-commit-list" aria-label="연결된 PR">
                    {dev.pullRequests.map((pr) => (
                      <li key={pr.id} className="dev-commit">
                        <GitPullRequest size={14} aria-hidden className="dev-commit-icon" />
                        <div className="dev-commit-body">
                          <a className="dev-commit-title" href={pr.url} target="_blank" rel="noreferrer noopener">
                            <span className="dev-commit-title-text">{pr.title ?? pr.url}</span>
                            <ExternalLink size={12} aria-hidden />
                          </a>
                          <span className="dev-commit-meta">
                            <time dateTime={pr.createdAt} title={formatDateTime(pr.createdAt)}>
                              {relTime(pr.createdAt)}
                            </time>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
