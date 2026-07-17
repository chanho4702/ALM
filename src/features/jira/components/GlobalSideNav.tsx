import { useLocation, useNavigate } from "react-router";
import type { Project } from "../store/types";

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
 * 홈/프로젝트 + "프로젝트" 섹션(목록, 현재 프로젝트는 하위 페이지가 중첩 확장).
 */
export function GlobalSideNav({ projects }: GlobalSideNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const projectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/([^/?]+))?/);
  const currentProjectId = projectMatch && projectMatch[1] !== "new" ? projectMatch[1] : undefined;
  const currentPage = projectMatch?.[2];

  const isHome = pathname === "/home" || pathname === "/";
  const isDirectory = pathname === "/projects" || pathname === "/projects/new";

  const itemClass = (active: boolean) =>
    active ? "global-nav-item is-active" : "global-nav-item";

  return (
    <nav className="global-nav" aria-label="전역 내비게이션">
      <ul className="global-nav-list">
        <li>
          <button type="button" className={itemClass(isHome)} onClick={() => navigate("/home")}>
            홈
          </button>
        </li>
        <li>
          <button
            type="button"
            className={itemClass(isDirectory)}
            onClick={() => navigate("/projects")}
          >
            프로젝트
          </button>
        </li>
      </ul>

      {projects.length > 0 ? (
        <>
          <span className="global-nav-section">프로젝트</span>
          <ul className="global-nav-list">
            {projects.map((project) => {
              const isCurrent = project.id === currentProjectId;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    className={itemClass(isCurrent && !currentPage)}
                    onClick={() => navigate(`/projects/${project.id}/board`)}
                  >
                    <span className="project-avatar global-nav-avatar" aria-hidden>
                      {project.key.charAt(0)}
                    </span>
                    <span className="global-nav-project-name">{project.name}</span>
                  </button>
                  {isCurrent ? (
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
    </nav>
  );
}
