import { lazy, useEffect, useState } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Badge, Button, Modal, TopBar } from "@chanho/react";
import type { Issue, Notification, Project, User } from "../store/types";
import {
  AVATAR_CHANGED_EVENT,
  getCurrentUser,
  getIssueByKey,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../store/jiraStore";
import { recordProjectVisit } from "../store/uiStore";
import { LazyModal } from "./LazyContent";
import { GlobalSideNav } from "./GlobalSideNav";
import { SettingsSideNav, isSettingsPath } from "./SettingsSideNav";
import { NotificationsModal } from "./NotificationsModal";
import { ThemeToggle } from "./ThemeToggle";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { UserAvatar } from "./UserAvatar";
import { SettingsMenu } from "./SettingsMenu";
import { useAuth } from "../../../auth/AuthGate";
import "./AppShell.css";

const MOBILE_QUERY = "(max-width: 720px)";

function useMobileShell() {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(MOBILE_QUERY);
    if (!query) return;
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return mobile;
}

const CreateIssueModal = lazy(() =>
  import("./CreateIssueModal").then((module) => ({ default: module.CreateIssueModal })),
);
const SearchModal = lazy(() =>
  import("./SearchModal").then((module) => ({ default: module.SearchModal })),
);

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
  const mobile = useMobileShell();
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.key, mobile]);

  const reloadNotifications = () => void listNotifications().then(setNotifications);

  useEffect(() => {
    // 개인 설정에서 프로필 사진을 바꾸면 상단바 아바타도 바로 따라간다(새로고침 없이)
    const loadMe = () => void getCurrentUser().then(setMe);
    loadMe();
    reloadNotifications();
    window.addEventListener(AVATAR_CHANGED_EVENT, loadMe);
    return () => window.removeEventListener(AVATAR_CHANGED_EVENT, loadMe);
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

  const brand = (
    <button type="button" className="jira-brand jira-brand-link" onClick={() => navigate("/")}>
      ALM
    </button>
  );
  const createAction = projects.length > 0 ? (
    <Button size="small" onClick={() => setCreateOpen(true)}>만들기</Button>
  ) : null;
  const notificationAction = (
    <Button
      size="small"
      variant="ghost"
      className="notification-bell topbar-icon"
      aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 미읽음` : "알림"}
      onClick={() => {
        reloadNotifications();
        setNotificationsOpen(true);
      }}
    >
      <Bell size={18} />
      {unreadCount > 0 ? <Badge appearance="danger">{unreadCount}</Badge> : null}
    </Button>
  );
  const accountActions = (
    <>
      <SettingsMenu />
      <ThemeToggle />
      {authUser ? (
        <>
          <span className="jira-auth-user">{authUser.name ?? authUser.email}</span>
          <Button size="small" variant="ghost" onClick={() => void logout()}>로그아웃</Button>
        </>
      ) : null}
      {me ? <UserAvatar user={me} size="small" /> : null}
    </>
  );
  const navigation = isSettingsPath(location.pathname) ? (
    <SettingsSideNav projects={projects} />
  ) : (
    <GlobalSideNav projects={projects} forceExpanded={mobile} />
  );

  return (
    <div className={mobile ? "app-shell app-shell-mobile" : "app-shell"}>
      {mobile ? (
        <header className="app-mobile-topbar">
          <Modal
            trigger={
              <Button
                size="small"
                variant="ghost"
                iconBefore={<Menu size={20} />}
                aria-label="내비게이션 열기"
              />
            }
            title="내비게이션"
            open={navigationOpen}
            onOpenChange={setNavigationOpen}
            className="app-mobile-navigation"
          >
            {navigation}
            <div className="app-mobile-account-actions">{accountActions}</div>
          </Modal>
          {brand}
          <div className="app-mobile-actions">
            <Button
              size="small"
              variant="ghost"
              iconBefore={<Search size={18} />}
              aria-label="이슈 검색 열기"
              onClick={() => {
                setSearchQuery("");
                setSearchOpen(true);
              }}
            />
            {createAction}
            {notificationAction}
          </div>
        </header>
      ) : <TopBar
        brand={brand}
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
            {createAction}
            {notificationAction}
            {accountActions}
          </>
        }
      />}
      <AnnouncementBanner />
      <div className="app-body">
        {/* 설정에 들어오면 전역 사이드바 자리를 설정 메뉴가 차지한다 — 지라의 프로젝트 설정 사이드바 */}
        {mobile ? null : navigation}
        <div className="app-shell-content">
          <Outlet />
        </div>
      </div>

      {createOpen ? (
        <LazyModal title="이슈 만들기" onClose={() => setCreateOpen(false)}>
          <CreateIssueModal
            projects={projects}
            defaultProjectId={currentProject?.id}
            open
            onOpenChange={setCreateOpen}
            onCreated={(issue) => navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`)}
          />
        </LazyModal>
      ) : null}
      {searchOpen ? (
        <LazyModal title="이슈 검색" onClose={() => setSearchOpen(false)}>
          <SearchModal
            projects={projects}
            initialQuery={searchQuery}
            open
            onOpenChange={setSearchOpen}
            onNavigate={openIssue}
            onAdvanced={(query) => {
              setSearchOpen(false);
              navigate(`/search?q=${encodeURIComponent(query)}`);
            }}
            onAql={(aql) => {
              setSearchOpen(false);
              navigate(`/search?aql=${encodeURIComponent(aql)}`);
            }}
          />
        </LazyModal>
      ) : null}
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
