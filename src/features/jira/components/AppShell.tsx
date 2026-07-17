import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Button, TopBar } from "@chanho/react";
import type { Issue, Project, User } from "../store/types";
import { getCurrentUser } from "../store/jiraStore";
import { recordProjectVisit } from "../store/uiStore";
import { CreateIssueModal } from "./CreateIssueModal";
import { GlobalSideNav } from "./GlobalSideNav";
import { SearchModal } from "./SearchModal";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../../../auth/AuthGate";

export interface AppShellProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때 App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/**
 * 새 지라 내비게이션의 전역 셸 — 상단바(검색·만들기·사용자) + 상주 전역 사이드바.
 * 프로젝트 전환/이동은 사이드바가 담당한다.
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

  // 프로젝트 방문 기록 → 사이드바 "최근" 섹션
  useEffect(() => {
    if (currentProject) void recordProjectVisit(currentProject.id);
  }, [currentProject?.id]);

  const openIssue = (issue: Issue) => {
    setSearchOpen(false);
    navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`);
  };

  return (
    <div className="app-shell">
      <TopBar
        brand={
          <button
            type="button"
            className="jira-brand jira-brand-link"
            onClick={() => navigate("/home")}
          >
            ALM
          </button>
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
            {projects.length > 0 ? (
              <Button size="small" onClick={() => setCreateOpen(true)}>
                만들기
              </Button>
            ) : null}
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
      <div className="app-body">
        <GlobalSideNav projects={projects} />
        <div className="app-shell-content">
          <Outlet />
        </div>
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
