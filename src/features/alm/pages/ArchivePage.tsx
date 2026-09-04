import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { Button, EmptyState, useToast } from "@chanho/react";
import type { Issue } from "../store/types";
import { listArchivedIssues, restoreIssue } from "../store/jiraStore";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { formatDateTime } from "../components/time";

/**
 * 프로젝트 보관함(지라 "보관된 업무 항목") — 보드·목록·검색에서 빠진 이슈를 보고 복원한다.
 * 보관은 삭제가 아니라 되돌릴 수 있는 정리다.
 */
export function ArchivePage() {
  const { projectId = "" } = useParams();
  const toast = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setIssues(await listArchivedIssues(projectId));
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRestore = async (issue: Issue) => {
    try {
      await restoreIssue(issue.id);
      toast({ title: `${issue.key}을(를) 복원했습니다`, appearance: "success" });
      await reload();
    } catch (error) {
      toast({
        title: "복원 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <section className="archive-page" aria-label="보관함">
      <p className="settings-help">
        보관된 이슈는 보드·목록·검색·리포트에서 빠집니다. 필요하면 언제든 복원할 수 있습니다.
      </p>
      {loaded && issues.length === 0 ? (
        <EmptyState title="보관된 이슈가 없습니다" description="이슈 상세의 [보관]으로 정리한 이슈가 여기에 모입니다." />
      ) : (
        <ul className="issue-relation-list archive-list" aria-label="보관된 이슈 목록">
          {issues.map((issue) => (
            <li key={issue.id} className="issue-link-item">
              <span className="issue-relation-row archive-row">
                <IssueTypeGlyph type={issue.type} />
                <span className="issue-key-cell">{issue.key}</span>
                <span className="issue-relation-title">{issue.title}</span>
                <span className="archive-at">{issue.archivedAt ? formatDateTime(issue.archivedAt) : ""}</span>
              </span>
              <Button size="small" variant="secondary" onClick={() => void handleRestore(issue)}>
                복원
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
