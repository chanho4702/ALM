import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { Spinner } from "@chanho/react";
import { listBoards } from "../store/jiraStore";

/** 기존 `/projects/:id/board` URL 호환 — 프로젝트의 기본 보드로 보낸다 */
export function BoardRedirect() {
  const { projectId } = useParams();
  const { search } = useLocation(); // ?issue=ALM-1 공유 URL 보존
  const [defaultBoardId, setDefaultBoardId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void listBoards(projectId).then((boards) => {
      if (!cancelled) setDefaultBoardId(boards[0]?.id ?? null); // listBoards는 기본 보드 우선
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (defaultBoardId === undefined) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  }
  // normalize가 프로젝트마다 기본 보드를 보장하므로 null은 사실상 없다 — 방어적으로 디렉터리로
  if (defaultBoardId === null) return <Navigate to="/projects" replace />;
  return <Navigate to={`/projects/${projectId}/boards/${defaultBoardId}${search}`} replace />;
}
