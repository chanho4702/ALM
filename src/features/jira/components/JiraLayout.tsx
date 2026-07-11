import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Avatar, Select, SideNav, TopBar } from "@chanho/react";
import type { SideNavItem } from "@chanho/react";
import type { Project, User } from "../store/types";
import { getCurrentUser } from "../store/jiraStore";
import { ProjectCreateModal } from "./ProjectCreateModal";
import { ThemeToggle } from "./ThemeToggle";

export interface JiraLayoutProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

const NAV_ITEMS: SideNavItem[] = [
  { id: "board", label: "보드" },
  { id: "backlog", label: "백로그" },
  { id: "issues", label: "이슈" },
];

export function JiraLayout({ projects, onProjectsChanged }: JiraLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = projects.find((p) => p.id === projectId);
  if (!current) {
    // 존재하지 않는 프로젝트 ID → 첫 프로젝트 보드로
    return <Navigate to={`/projects/${projects[0].id}/board`} replace />;
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
          <Select
            label="프로젝트"
            options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
            value={current.id}
            onValueChange={(id) => navigate(`/projects/${id}/board`)}
          />
        }
        footer={
          <ProjectCreateModal
            onCreated={async (project) => {
              await onProjectsChanged();
              navigate(`/projects/${project.id}/board`);
            }}
          />
        }
      />
      <div className="jira-main">
        <TopBar
          brand={<span className="jira-brand">ALM</span>}
          actions={
            <>
              <ThemeToggle />
              {me ? <Avatar name={me.name} size="small" /> : null}
            </>
          }
        />
        <main className="jira-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
