import { useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { SideNav } from "@chanho/react";
import type { SideNavItem } from "@chanho/react";
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

const NAV_ITEMS: SideNavItem[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "board", label: "보드" },
  { id: "backlog", label: "백로그" },
  { id: "issues", label: "이슈" },
  { id: "settings", label: "설정" },
];

const NAV_LABELS = Object.fromEntries(NAV_ITEMS.map((i) => [i.id, i.label]));

/**
 * 프로젝트 내부 레이아웃 — 지라의 프로젝트 사이드바.
 * 헤더는 스위처가 아니라 프로젝트 아이덴티티(전환은 전역 나비의 "프로젝트" 드롭다운).
 */
export function ProjectLayout({ projects, onProjectsChanged }: ProjectLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const current = projects.find((p) => p.id === projectId);
  if (!current) {
    // 프로젝트가 없거나 존재하지 않는 ID → 프로젝트 디렉터리로
    return <Navigate to="/projects" replace />;
  }

  // 현재 경로의 마지막 세그먼트로 활성 항목을 판별한다
  const activeId = NAV_ITEMS.find((i) => location.pathname.endsWith(`/${i.id}`))?.id ?? "board";

  return (
    <div className="jira-layout">
      <SideNav
        items={NAV_ITEMS}
        activeId={activeId}
        // href 없이 onSelect로만 이동 → 풀 리로드 없이 react-router가 처리한다
        onSelect={(id) => navigate(`/projects/${current.id}/${id}`)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        header={
          <div className="project-identity">
            <span className="project-avatar project-identity-avatar" aria-hidden>
              {current.key.charAt(0)}
            </span>
            <div className="project-identity-text">
              <strong className="project-identity-name">{current.name}</strong>
              <span className="project-identity-meta">{current.key} · 소프트웨어 프로젝트</span>
            </div>
          </div>
        }
      />
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
          <span aria-current="page">{NAV_LABELS[activeId]}</span>
        </nav>
        <main className="jira-content">
          <Outlet context={{ projects, onProjectsChanged } satisfies JiraOutletContext} />
        </main>
      </div>
    </div>
  );
}
