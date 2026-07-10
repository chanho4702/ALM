import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Select } from "@chanho/react";
import type { Project, User } from "../store/types";
import { getCurrentUser } from "../store/jiraStore";
import { ProjectCreateModal } from "./ProjectCreateModal";

export interface JiraLayoutProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

export function JiraLayout({ projects, onProjectsChanged }: JiraLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = projects.find((p) => p.id === projectId);
  if (!current) {
    // 존재하지 않는 프로젝트 ID → 첫 프로젝트 보드로
    return <Navigate to={`/projects/${projects[0].id}/board`} replace />;
  }

  return (
    <div className="jira-layout">
      <aside className="jira-sidebar">
        <div className="jira-sidebar-brand">ALM</div>
        <Select
          label="프로젝트"
          options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
          value={current.id}
          onValueChange={(id) => navigate(`/projects/${id}/board`)}
        />
        <nav className="jira-nav">
          <NavLink to={`/projects/${current.id}/board`}>보드</NavLink>
          <NavLink to={`/projects/${current.id}/backlog`}>백로그</NavLink>
          <NavLink to={`/projects/${current.id}/issues`}>이슈</NavLink>
        </nav>
        <ProjectCreateModal
          onCreated={async (project) => {
            await onProjectsChanged();
            navigate(`/projects/${project.id}/board`);
          }}
        />
      </aside>
      <div className="jira-main">
        <header className="jira-header">{me ? <Avatar name={me.name} size="small" /> : null}</header>
        <main className="jira-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
