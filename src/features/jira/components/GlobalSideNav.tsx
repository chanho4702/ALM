import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Project } from "../store/types";
import {
  UI_CHANGED_EVENT,
  isSideNavCollapsed,
  listRecentProjectIds,
  listStarredProjectIds,
  setSideNavCollapsed,
} from "../store/uiStore";

/** 프로젝트 하위 페이지 — 현재 프로젝트 항목 아래에 중첩 표시된다 */
const PROJECT_PAGES = [
  { id: "dashboard", label: "대시보드" },
  { id: "board", label: "보드" },
  { id: "backlog", label: "백로그" },
  { id: "issues", label: "이슈" },
  { id: "settings", label: "설정" },
];

export interface GlobalSideNavProps {
  projects: Project[];
}

/**
 * 새 지라 내비게이션의 전역 사이드바 — 모든 화면에 상주한다.
 * 홈/프로젝트 + 최근 · 별표 · 프로젝트 섹션. 접으면 아이콘 레일이 된다.
 */
export function GlobalSideNav({ projects }: GlobalSideNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(() => {
    void listRecentProjectIds().then(setRecentIds);
    void listStarredProjectIds().then(setStarredIds);
    void isSideNavCollapsed().then(setCollapsed);
  }, []);

  // uiStore 변경(방문 기록·별표 토글·접기)을 구독한다 — 발행처는 uiStore.persist
  useEffect(() => {
    refresh();
    window.addEventListener(UI_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(UI_CHANGED_EVENT, refresh);
  }, [refresh]);

  const projectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/([^/?]+))?/);
  const currentProjectId = projectMatch && projectMatch[1] !== "new" ? projectMatch[1] : undefined;
  const currentPage = projectMatch?.[2];

  const isHome = pathname === "/home" || pathname === "/";
  const isDirectory = pathname === "/projects" || pathname === "/projects/new";

  const itemClass = (active: boolean) =>
    active ? "global-nav-item is-active" : "global-nav-item";

  const byId = (id: string) => projects.find((p) => p.id === id);
  const recentProjects = recentIds.map(byId).filter((p): p is Project => Boolean(p));
  const starredProjects = starredIds.map(byId).filter((p): p is Project => Boolean(p));

  /** 프로젝트 행 — 아바타 + 이름 (접힘이면 아바타만) */
  const projectRow = (project: Project, active: boolean) => (
    <button
      type="button"
      className={itemClass(active)}
      aria-label={project.name}
      title={project.name}
      onClick={() => navigate(`/projects/${project.id}/board`)}
    >
      <span className="project-avatar global-nav-avatar" aria-hidden>
        {project.key.charAt(0)}
      </span>
      <span className="global-nav-label global-nav-project-name">{project.name}</span>
    </button>
  );

  /** 섹션 렌더 — 접힘 상태에서는 섹션을 통째로 숨긴다 (아이콘 레일) */
  const projectSection = (label: string, items: Project[], testId: string) => {
    if (collapsed || items.length === 0) return null;
    return (
      <>
        <span className="global-nav-section">{label}</span>
        <ul className="global-nav-list" data-testid={testId}>
          {items.map((project) => (
            <li key={project.id}>{projectRow(project, false)}</li>
          ))}
        </ul>
      </>
    );
  };

  return (
    <nav
      className={collapsed ? "global-nav is-collapsed" : "global-nav"}
      aria-label="전역 내비게이션"
    >
      <ul className="global-nav-list">
        <li>
          <button
            type="button"
            className={itemClass(isHome)}
            aria-label="홈"
            title="홈"
            onClick={() => navigate("/home")}
          >
            <span className="global-nav-glyph" aria-hidden>
              홈
            </span>
            <span className="global-nav-label">홈</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={itemClass(isDirectory)}
            aria-label="프로젝트"
            title="프로젝트"
            onClick={() => navigate("/projects")}
          >
            <span className="global-nav-glyph" aria-hidden>
              프
            </span>
            <span className="global-nav-label">프로젝트</span>
          </button>
        </li>
      </ul>

      {projectSection("최근", recentProjects, "nav-recent")}
      {projectSection("별표", starredProjects, "nav-starred")}

      {projects.length > 0 ? (
        <>
          {collapsed ? null : <span className="global-nav-section">프로젝트</span>}
          <ul className="global-nav-list" data-testid="nav-projects">
            {projects.map((project) => {
              const isCurrent = project.id === currentProjectId;
              return (
                <li key={project.id}>
                  {projectRow(project, isCurrent && !currentPage)}
                  {isCurrent && !collapsed ? (
                    <ul className="global-nav-sub">
                      {PROJECT_PAGES.map((page) => (
                        <li key={page.id}>
                          <button
                            type="button"
                            className={itemClass(currentPage === page.id)}
                            onClick={() => navigate(`/projects/${project.id}/${page.id}`)}
                          >
                            {page.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <button
        type="button"
        className="global-nav-collapse"
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        onClick={() => void setSideNavCollapsed(!collapsed)}
      >
        <span aria-hidden>{collapsed ? "»" : "«"}</span>
        <span className="global-nav-label">{collapsed ? "" : "접기"}</span>
      </button>
    </nav>
  );
}
