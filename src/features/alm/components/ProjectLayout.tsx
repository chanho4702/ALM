import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@chanho/react";
import type { Project } from "../store/types";
import { UI_CHANGED_EVENT, listStarredProjectIds, toggleProjectStar } from "../store/uiStore";
import { ProjectAvatar } from "./ProjectAvatar";

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

/** 지라의 프로젝트 뷰 탭 — 요약이 첫 탭 */
const VIEW_TABS = [
  { id: "dashboard", label: "요약" },
  { id: "reports", label: "리포트" },
  { id: "releases", label: "릴리스" },
  { id: "timeline", label: "타임라인" },
  { id: "board", label: "보드" },
  { id: "backlog", label: "백로그" },
  { id: "issues", label: "이슈" },
];

/**
 * 프로젝트 내부 레이아웃 — 지라의 프로젝트 화면 상단 구조.
 * 브레드크럼(프로젝트/이름) → 프로젝트 헤더(아바타·이름·별표) → 가로 뷰 탭 → 콘텐츠.
 */
export function ProjectLayout({ projects, onProjectsChanged }: ProjectLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [starredIds, setStarredIds] = useState<string[]>([]);

  const refreshStarred = useCallback(() => {
    void listStarredProjectIds().then(setStarredIds);
  }, []);

  useEffect(() => {
    refreshStarred();
    window.addEventListener(UI_CHANGED_EVENT, refreshStarred);
    return () => window.removeEventListener(UI_CHANGED_EVENT, refreshStarred);
  }, [refreshStarred]);

  const current = projects.find((p) => p.id === projectId);
  if (!current) {
    // 프로젝트가 없거나 존재하지 않는 ID → 프로젝트 디렉터리로
    return <Navigate to="/projects" replace />;
  }

  const rawSegment = location.pathname.split("/")[3] ?? "board";
  // /boards/:boardId 도 "보드" 탭으로 취급한다
  const segment = rawSegment === "boards" ? "board" : rawSegment;
  const starred = starredIds.includes(current.id);

  return (
    <div className="jira-main">
      {/* 지라 브레드크럼: "프로젝트 / 프로젝트명" — 현재 뷰는 탭이 보여준다 */}
      <nav aria-label="브레드크럼" className="breadcrumbs">
        <button type="button" onClick={() => navigate("/projects")}>
          프로젝트
        </button>
        <span aria-hidden>/</span>
        <span aria-current="page">{current.name}</span>
      </nav>

      <header className="project-header">
        <ProjectAvatar project={current} size="lg" />
        <h1 className="project-header-name">{current.name}</h1>
        <Button
          variant="ghost"
          size="small"
          className={starred ? "project-star is-starred" : "project-star"}
          aria-label={`${current.name} 별표`}
          aria-pressed={starred}
          onClick={() => void toggleProjectStar(current.id)}
        >
          {starred ? "★" : "☆"}
        </Button>
      </header>

      {/* 가로 뷰 탭 — 밑줄 액티브, 라우터 이동 */}
      <nav aria-label="프로젝트 뷰" className="project-tabs">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={segment === tab.id ? "project-tab is-active" : "project-tab"}
            aria-current={segment === tab.id ? "page" : undefined}
            onClick={() => navigate(`/projects/${current.id}/${tab.id}`)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="jira-content">
        <Outlet context={{ projects, onProjectsChanged } satisfies JiraOutletContext} />
      </main>
    </div>
  );
}
