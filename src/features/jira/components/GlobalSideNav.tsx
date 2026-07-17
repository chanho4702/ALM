import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Project } from "../store/types";
import { ProjectAvatar } from "./ProjectAvatar";
import {
  SIDENAV_DEFAULT_WIDTH,
  SIDENAV_MAX_WIDTH,
  SIDENAV_MIN_WIDTH,
  UI_CHANGED_EVENT,
  getSideNavWidth,
  isSideNavCollapsed,
  listRecentProjectIds,
  listStarredProjectIds,
  setSideNavCollapsed,
  setSideNavWidth,
} from "../store/uiStore";

const clampWidth = (width: number) =>
  Math.min(SIDENAV_MAX_WIDTH, Math.max(SIDENAV_MIN_WIDTH, width));

/** 프로젝트 하위 페이지 — 현재 프로젝트 항목 아래에 중첩 표시된다 */
const PROJECT_PAGES = [
  { id: "dashboard", label: "요약" },
  { id: "timeline", label: "타임라인" },
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
  const [width, setWidth] = useState(SIDENAV_DEFAULT_WIDTH);
  /** 드래그 중 최신 너비 — pointerup에서 저장할 값 */
  const widthRef = useRef(SIDENAV_DEFAULT_WIDTH);

  const refresh = useCallback(() => {
    void listRecentProjectIds().then(setRecentIds);
    void listStarredProjectIds().then(setStarredIds);
    void isSideNavCollapsed().then(setCollapsed);
    void getSideNavWidth().then((w) => {
      widthRef.current = w;
      setWidth(w);
    });
  }, []);

  /** 핸들 드래그 — 움직이는 동안은 로컬 상태만, 놓을 때 저장 */
  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const onMove = (move: globalThis.PointerEvent) => {
      const next = clampWidth(startWidth + (move.clientX - startX));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void setSideNavWidth(widthRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** 키보드 접근성 — ←/→ 16px 단위, Home = 기본값 복원 */
  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = clampWidth(widthRef.current - 16);
    else if (event.key === "ArrowRight") next = clampWidth(widthRef.current + 16);
    else if (event.key === "Home") next = SIDENAV_DEFAULT_WIDTH;
    if (next === null) return;
    event.preventDefault();
    widthRef.current = next;
    setWidth(next);
    void setSideNavWidth(next);
  };

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
      <ProjectAvatar project={project} size="sm" />
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
      style={collapsed ? undefined : { width }}
    >
      <div className="global-nav-scroll">
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

      </div>
      {/* 지라식 접기 토글 — 사이드바 경계선 상단에 떠 있는 원형 chevron */}
      <button
        type="button"
        className="global-nav-toggle"
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        onClick={() => void setSideNavCollapsed(!collapsed)}
      >
        <span aria-hidden>{collapsed ? "›" : "‹"}</span>
      </button>
      {collapsed ? null : (
        <div
          className="global-nav-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 너비 조절"
          aria-valuemin={SIDENAV_MIN_WIDTH}
          aria-valuemax={SIDENAV_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          title="드래그로 너비 조절 (더블클릭: 기본값)"
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() => {
            widthRef.current = SIDENAV_DEFAULT_WIDTH;
            setWidth(SIDENAV_DEFAULT_WIDTH);
            void setSideNavWidth(SIDENAV_DEFAULT_WIDTH);
          }}
        />
      )}
    </nav>
  );
}
