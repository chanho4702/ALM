import { useEffect, useState } from "react";
import { Bell, Settings } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Badge, Button, TopBar } from "@chanho/react";
import type { Issue, Notification, Project, User } from "../store/types";
import {
  getCurrentUser,
  getIssueByKey,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../store/jiraStore";
import { recordProjectVisit } from "../store/uiStore";
import { CreateIssueModal } from "./CreateIssueModal";
import { GlobalSideNav } from "./GlobalSideNav";
import { SettingsSideNav, isSettingsPath } from "./SettingsSideNav";
import { NotificationsModal } from "./NotificationsModal";
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const reloadNotifications = () => void listNotifications().then(setNotifications);

  useEffect(() => {
    void getCurrentUser().then(setMe);
    reloadNotifications();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const openNotification = async (notification: Notification) => {
    await markNotificationRead(notification.id);
    reloadNotifications();
    setNotificationsOpen(false);
    const issue = await getIssueByKey(notification.issueKey);
    if (issue) navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`);
  };

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
            <Button
              size="small"
              variant="ghost"
              className="notification-bell topbar-icon"
              aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 미읽음` : "알림"}
              onClick={() => {
                reloadNotifications(); // 열기 전 최신화
                setNotificationsOpen(true);
              }}
            >
              <Bell size={18} />
              {unreadCount > 0 ? <Badge appearance="danger">{unreadCount}</Badge> : null}
            </Button>
            <Button
              size="small"
              variant="ghost"
              iconOnly
              className="topbar-icon"
              aria-label="전역 관리"
              title="전역 관리"
              onClick={() => navigate("/settings")}
            >
              <Settings size={18} />
            </Button>
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
        {/* 설정에 들어오면 전역 사이드바 자리를 설정 메뉴가 차지한다 — 지라의 프로젝트 설정 사이드바 */}
        {isSettingsPath(location.pathname) ? (
          <SettingsSideNav projects={projects} />
        ) : (
          <GlobalSideNav projects={projects} />
        )}
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
        onAdvanced={(query) => {
          setSearchOpen(false);
          navigate(`/search?q=${encodeURIComponent(query)}`);
        }}
      />
      <NotificationsModal
        notifications={notifications}
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        onNavigate={(n) => void openNotification(n)}
        onMarkAllRead={() => {
          void markAllNotificationsRead().then(reloadNotifications);
        }}
      />
    </div>
  );
}
