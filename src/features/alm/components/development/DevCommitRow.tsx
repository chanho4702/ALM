import type { ReactNode } from "react";
import { ExternalLink, GitCommitHorizontal } from "lucide-react";
import type { DevCommit } from "../../store/types";
import { formatDateTime, relTime } from "../time";

/**
 * 커밋 한 줄 — 짧은 sha(모노) · 제목(GitHub 새 탭) · 작성자 · 상대 시각 · 저장소. 이슈 개발 패널과 프로젝트 커밋 탭이 같이 쓴다.
 * 옛 웹 링크 커밋(WEB_LINK)은 작성자·시각이 없다 — 빈 칸을 지어내지 않고 "웹 링크"라고만 적는다.
 */
export function DevCommitRow({ commit, trailing }: { commit: DevCommit; trailing?: ReactNode }) {
  const title = commit.title || commit.shortSha;
  const meta: ReactNode[] = [];
  if (commit.authorName) meta.push(<span key="author" className="dev-commit-author">{commit.authorName}</span>);
  if (commit.authoredAt) {
    meta.push(
      <time key="at" dateTime={commit.authoredAt} title={formatDateTime(commit.authoredAt)}>
        {relTime(commit.authoredAt)}
      </time>,
    );
  }
  if (commit.repositoryName) meta.push(<span key="repo" className="dev-commit-repo">{commit.repositoryName}</span>);
  if (commit.source === "WEB_LINK") meta.push(<span key="web">웹 링크</span>);

  return (
    <li className="dev-commit" data-testid="dev-commit">
      <GitCommitHorizontal size={14} aria-hidden className="dev-commit-icon" />
      <code className="dev-sha" title={commit.sha}>
        {commit.shortSha || "—"}
      </code>
      <div className="dev-commit-body">
        {commit.url ? (
          <a className="dev-commit-title" href={commit.url} target="_blank" rel="noreferrer noopener">
            <span className="dev-commit-title-text">{title}</span>
            <ExternalLink size={12} aria-hidden />
          </a>
        ) : (
          <span className="dev-commit-title">
            <span className="dev-commit-title-text">{title}</span>
          </span>
        )}
        {meta.length > 0 ? (
          <span className="dev-commit-meta">
            {meta.flatMap((node, i) => (i === 0 ? [node] : [<span key={`sep${i}`} aria-hidden>·</span>, node]))}
          </span>
        ) : null}
      </div>
      {trailing ? <div className="dev-commit-trailing">{trailing}</div> : null}
    </li>
  );
}
