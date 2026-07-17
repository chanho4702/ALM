import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import type { Project } from "../store/types";

export interface ProjectLayoutProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(수정/삭제 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/** Outlet 하위 페이지(설정 등)가 useOutletContext로 받는 값 */
export interface JiraOutletContext {
  projects: Project[];
  onProjectsChanged: () => void | Promise<void>;
}

const PAGE_LABELS: Record<string, string> = {
  dashboard: "대시보드",
  board: "보드",
  backlog: "백로그",
  issues: "이슈",
  settings: "설정",
};

/**
 * 프로젝트 내부 레이아웃 — 브레드크럼 + 콘텐츠.
 * 사이드바는 전역(GlobalSideNav)이 담당한다 (새 지라 내비게이션).
 */
export function ProjectLayout({ projects, onProjectsChanged }: ProjectLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const current = projects.find((p) => p.id === projectId);
  if (!current) {
    // 프로젝트가 없거나 존재하지 않는 ID → 프로젝트 디렉터리로
    return <Navigate to="/projects" replace />;
  }

  const segment = location.pathname.split("/")[3] ?? "board";
  const pageLabel = PAGE_LABELS[segment] ?? "보드";

  return (
    <div className="jira-main">
      <nav aria-label="브레드크럼" className="breadcrumbs">
        <button type="button" onClick={() => navigate("/projects")}>
          프로젝트
        </button>
        <span aria-hidden>/</span>
        <button type="button" onClick={() => navigate(`/projects/${current.id}/board`)}>
          {current.name}
        </button>
        <span aria-hidden>/</span>
        <span aria-current="page">{pageLabel}</span>
      </nav>
      <main className="jira-content">
        <Outlet context={{ projects, onProjectsChanged } satisfies JiraOutletContext} />
      </main>
    </div>
  );
}
