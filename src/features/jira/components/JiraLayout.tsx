import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Avatar, Button, Select, SideNav, TopBar } from "@chanho/react";
import type { SideNavItem } from "@chanho/react";
import type { Project, User } from "../store/types";
import { getCurrentUser } from "../store/jiraStore";
import { ProjectCreateModal } from "./ProjectCreateModal";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../../../auth/AuthGate";

export interface JiraLayoutProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

const NAV_ITEMS: SideNavItem[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "board", label: "보드" },
  { id: "backlog", label: "백로그" },
  { id: "issues", label: "이슈" },
];

export function JiraLayout({ projects, onProjectsChanged }: JiraLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser, logout } = useAuth();
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
          <div className="sidenav-footer-actions">
            <ProjectCreateModal
              onCreated={async (project) => {
                await onProjectsChanged();
                navigate(`/projects/${project.id}/board`);
              }}
            />
            <Button variant="ghost" onClick={() => navigate("/projects")}>
              프로젝트 관리
            </Button>
          </div>
        }
      />
      <div className="jira-main">
        <TopBar
          brand={<span className="jira-brand">ALM</span>}
          actions={
            <>
              <ThemeToggle />
              {authUser ? (
                <>
                  <span className="jira-auth-user">{authUser.name ?? authUser.email}</span>
                  <Button size="small" variant="ghost" onClick={() => void logout()}>
                    로그아웃
                  </Button>
                </>
              ) : null}
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
