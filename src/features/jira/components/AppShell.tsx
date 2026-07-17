import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Button, Dropdown, TopBar } from "@chanho/react";
import type { Issue, Project, User } from "../store/types";
import { getCurrentUser } from "../store/jiraStore";
import { CreateIssueModal } from "./CreateIssueModal";
import { SearchModal } from "./SearchModal";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../../../auth/AuthGate";

export interface AppShellProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때 App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/**
 * 지라의 전역 상단 내비게이션 — 모든 라우트를 감싼다.
 * 브랜드 · "프로젝트" 드롭다운 · 전역 "만들기" · 전역 검색 · 테마/사용자.
 */
export function AppShell({ projects }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser, logout } = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  // 현재 URL의 프로젝트 — 전역 만들기 모달의 기본 프로젝트
  const currentProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const currentProject = projects.find((p) => p.id === currentProjectId);

  const openIssue = (issue: Issue) => {
    setSearchOpen(false);
    navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`);
  };

  return (
    <div className="app-shell">
      <TopBar
        brand={
          <span className="topbar-nav">
            <button
              type="button"
              className="jira-brand jira-brand-link"
              onClick={() => navigate("/projects")}
            >
              ALM
            </button>
            <Dropdown
              trigger={
                <Button variant="ghost" size="small">
                  프로젝트 ▾
                </Button>
              }
              items={[
                ...projects.map((p) => ({
                  label: `${p.name} (${p.key})`,
                  onSelect: () => navigate(`/projects/${p.id}/board`),
                })),
                { label: "모든 프로젝트 보기", onSelect: () => navigate("/projects") },
                { label: "프로젝트 만들기", onSelect: () => navigate("/projects/new") },
              ]}
            />
            {projects.length > 0 ? (
              <Button size="small" onClick={() => setCreateOpen(true)}>
                만들기
              </Button>
            ) : null}
          </span>
        }
        // 첫 입력에 검색 모달을 열고, 이어지는 검색은 모달 안 인풋이 담당한다
        onSearch={(query) => {
          if (query.trim()) {
            setSearchQuery(query);
            setSearchOpen(true);
          }
        }}
        searchPlaceholder="이슈 검색"
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
      <div className="app-shell-content">
        <Outlet />
      </div>

      <CreateIssueModal
        projects={projects}
        defaultProjectId={currentProject?.id}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(issue) => navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`)}
      />
      <SearchModal
        projects={projects}
        initialQuery={searchQuery}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={openIssue}
      />
    </div>
  );
}
