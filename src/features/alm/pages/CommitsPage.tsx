import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Banner, Button, EmptyState, SkeletonListItem } from "@chanho/react";
import { RotateCw } from "lucide-react";
import type { DevCommit } from "../store/types";
import { listProjectCommits } from "../store/jiraStore";
import { DevCommitRow } from "../components/development/DevCommitRow";
import { describeDevelopmentError } from "../components/development/IssueDevelopmentPanel";
import { isDevelopmentOnlyEvent, useProjectRealtime } from "../components/realtime/ProjectRealtime";
import { useIssueModal } from "../components/useIssueModal";
import { formatDate } from "../components/time";
import "../components/development/development.css";

const PAGE_SIZE = 30;
const REFRESH_COALESCE_MS = 400;

/** 날짜별 묶음 — 작성 시각이 없는 옛 웹 링크 커밋은 "날짜 없음"으로 맨 뒤 */
function groupByDay(commits: DevCommit[]): { day: string; commits: DevCommit[] }[] {
  const groups: { day: string; commits: DevCommit[] }[] = [];
  for (const commit of commits) {
    const day = commit.authoredAt ? formatDate(commit.authoredAt) : "날짜 없음";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.commits.push(commit);
    else groups.push({ day, commits: [commit] });
  }
  return groups;
}

/**
 * 프로젝트 › 커밋 — 등록한 저장소의 커밋과 이 프로젝트 이슈에 이어진 커밋의 최근 순 타임라인(alm-backend V41).
 * 커서로 다음 쪽을 더 읽는다. 연결 이슈 칩을 누르면 이슈 상세가 열린다(칩은 볼 수 있는 이슈만 온다).
 */
export function CommitsPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [commits, setCommits] = useState<DevCommit[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const page = await listProjectCommits(projectId, { limit: PAGE_SIZE });
      setCommits(page.items);
      setNextCursor(page.nextCursor);
      setError(null);
      setMoreError(null);
    } catch (e) {
      setError(describeDevelopmentError(e));
    }
  }, [projectId]);

  useEffect(() => {
    setCommits(null);
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(() => undefined);

  // 커밋이 새로 이어지면(실시간 development 신호·재동기화) 첫 쪽을 다시 읽는다 — 몰리면 한 번으로
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useProjectRealtime((event) => {
    const relevant = event.kind === "resync" || event.kind === "reset" || (event.kind === "issue" && isDevelopmentOnlyEvent(event));
    if (!relevant || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void reload();
    }, REFRESH_COALESCE_MS);
  });

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listProjectCommits(projectId, { cursor: nextCursor, limit: PAGE_SIZE });
      setCommits((list) => [...(list ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
      setMoreError(null);
    } catch (e) {
      setMoreError(describeDevelopmentError(e));
    } finally {
      setLoadingMore(false);
    }
  };

  let body;
  if (error !== null) {
    body = (
      <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
        커밋을 불러오지 못했습니다 — {error}
      </Banner>
    );
  } else if (commits === null) {
    body = (
      <div className="dev-commit-list" aria-busy="true" aria-label="커밋 불러오는 중">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dev-commit">
            <SkeletonListItem media="icon" lines={2} width={`${60 - i * 8}%`} />
          </div>
        ))}
      </div>
    );
  } else if (commits.length === 0) {
    body = (
      <EmptyState
        title="아직 연결된 커밋이 없습니다"
        description="프로젝트 설정 › 저장소에 저장소를 등록하고, 커밋 메시지에 ALM-12 같은 이슈 키를 넣어 보내면 여기에 최근 순으로 모입니다."
        primaryAction={{ label: "저장소 설정", onClick: () => navigate(`/projects/${projectId}/settings/repositories`) }}
      />
    );
  } else {
    body = (
      <>
        {groupByDay(commits).map((group) => (
          <section key={group.day} className="commits-day" aria-label={group.day}>
            <h3 className="commits-day-title">{group.day}</h3>
            <ul className="dev-commit-list">
              {group.commits.map((commit) => (
                <DevCommitRow
                  key={`${commit.source}-${commit.id ?? commit.url ?? commit.sha}`}
                  commit={commit}
                  trailing={
                    commit.issues && commit.issues.length > 0
                      ? commit.issues.map((ref) => (
                          <button
                            key={ref.issueId}
                            type="button"
                            className="dev-issue-chip"
                            aria-label={`${ref.issueKey} 열기`}
                            onClick={() => openIssue(ref.issueKey)}
                          >
                            {ref.issueKey}
                          </button>
                        ))
                      : null
                  }
                />
              ))}
            </ul>
          </section>
        ))}
        {moreError ? <Banner variant="danger">다음 커밋을 불러오지 못했습니다 — {moreError}</Banner> : null}
        {nextCursor ? (
          <Button className="commits-more" variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
            더 보기
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <section className="commits-page" aria-label="커밋">
      <div className="commits-page-head">
        <p className="settings-help">
          등록한 저장소의 커밋과 이 프로젝트 이슈에 이어진 커밋입니다. 커밋 메시지 속 이슈 키로 연결됩니다.
        </p>
        <Button variant="ghost" size="small" iconBefore={<RotateCw size={14} />} onClick={() => void reload()}>
          새로 고침
        </Button>
      </div>
      {body}
      {issueModal}
    </section>
  );
}
