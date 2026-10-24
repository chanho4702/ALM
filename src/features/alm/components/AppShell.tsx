import { lazy, useEffect, useRef, useState } from "react";
import { Bell, Command, Menu, Search } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Badge, Button, Modal, TopBar } from "@chanho/react";
import type { Issue, Project, User } from "../store/types";
import { AVATAR_CHANGED_EVENT, getCurrentUser, listNotificationInbox } from "../store/jiraStore";
import { INBOX_CHANGED_EVENT } from "./inboxEvents";
import { recordProjectVisit, setUiUser } from "../store/uiStore";
import { LazyModal } from "./LazyContent";
import { GlobalSideNav } from "./GlobalSideNav";
import { SettingsSideNav, isSettingsPath } from "./SettingsSideNav";
import { ThemeToggle } from "./ThemeToggle";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { UserAvatar } from "./UserAvatar";
import { SettingsMenu } from "./SettingsMenu";
import { ShortcutHelpModal } from "./ShortcutHelpModal";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { CommandPaletteHost } from "./CommandPaletteHost";
import { openCommandPalette } from "./commandScope";
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
  const [unreadCount, setUnreadCount] = useState(0);
  const mobile = useMobileShell();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.key, mobile]);

  /** 벨 배지 — 인박스의 읽지 않음 수(미뤄 둔 것·보관한 것 제외). 못 읽으면 배지만 숨긴다(벨은 그대로 인박스를 연다) */
  const reloadNotifications = () =>
    void listNotificationInbox({ filter: "unread", limit: 1 }).then(
      (page) => setUnreadCount(page.unreadCount),
      () => setUnreadCount(0),
    );

  useEffect(() => {
    // 개인 설정에서 프로필 사진을 바꾸면 상단바 아바타도 바로 따라간다(새로고침 없이)
    const loadMe = () =>
      void getCurrentUser().then((user) => {
        // 즐겨찾기·만들기 초안은 사용자별 — 현재 사용자를 알자마자 uiStore 자리를 맞춘다
        setUiUser(user.id);
        setMe(user);
      });
    loadMe();
    reloadNotifications();
    window.addEventListener(AVATAR_CHANGED_EVENT, loadMe);
    window.addEventListener(INBOX_CHANGED_EVENT, reloadNotifications);
    return () => {
      window.removeEventListener(AVATAR_CHANGED_EVENT, loadMe);
      window.removeEventListener(INBOX_CHANGED_EVENT, reloadNotifications);
    };
  }, []);

  // 현재 URL의 프로젝트 — 전역 만들기 모달의 기본 프로젝트
  const currentProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // 프로젝트 방문 기록 → 사이드바 "최근" 섹션
  useEffect(() => {
    if (currentProject) void recordProjectVisit(currentProject.id);
  }, [currentProject?.id]);

  const openSearch = () => {
    setSearchQuery("");
    setSearchOpen(true);
  };

  /** `/` — 지라처럼 상단바 검색란에 포커스(첫 글자에 검색 모달이 열린다). 좁은 화면은 검색란이 없어 모달을 연다 */
  const focusSearch = () => {
    const input = shellRef.current?.querySelector<HTMLInputElement>(":scope > header input[type='search']");
    if (input) input.focus();
    else openSearch();
  };

  // 지라 클라우드 전역 단축키 — 모달이 열려 있거나 입력 중이면 동작하지 않는다(useKeyboardShortcuts)
  useKeyboardShortcuts({
    "?": () => setShortcutHelpOpen(true),
    "/": focusSearch,
    c: () => {
      if (projects.length > 0) setCreateOpen(true);
    },
    "g d": () => navigate("/dashboards"),
    "g p": () => navigate("/projects"),
    "g b": () => {
      if (currentProject) navigate(`/projects/${currentProject.id}/board`);
    },
    "g i": () => navigate(currentProject ? `/projects/${currentProject.id}/issues` : "/search"),
    // Linear g i(Inbox) 자리는 지라 이슈 목록이 쓰고 있어 인박스는 g n(notifications)
    "g n": () => navigate("/notifications"),
  });

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
    <Button onClick={() => setCreateOpen(true)}>만들기</Button>
  ) : null;
  /** 벨 = 인박스 열기(Linear Inbox 전체 화면) */
  const openNotifications = () => {
    reloadNotifications();
    navigate("/notifications");
  };
  // 명령 팔레트 — 마우스로도 열 수 있게 상단바에 둔다(키는 ⌘K / Ctrl+K)
  const paletteAction = (
    <Button
      variant="ghost"
      className="topbar-icon"
      aria-label="명령 팔레트"
      aria-keyshortcuts="Control+K Meta+K"
      title="명령 팔레트 (Ctrl+K)"
      onClick={() => openCommandPalette()}
    >
      <Command size={18} />
    </Button>
  );
  const notificationAction = (
    <Button
      variant="ghost"
      className="notification-bell topbar-icon"
      aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 미읽음` : "알림"}
      aria-keyshortcuts="G N"
      title="인박스 열기 (g n)"
      onClick={openNotifications}
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
          <Button variant="ghost" onClick={() => void logout()}>로그아웃</Button>
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
    <div ref={shellRef} className={mobile ? "app-shell app-shell-mobile" : "app-shell"}>
      {mobile ? (
        <header className="app-mobile-topbar">
          <Modal
            trigger={
              <Button
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
              variant="ghost"
              iconBefore={<Search size={18} />}
              aria-label="이슈 검색 열기"
              onClick={openSearch}
            />
            {createAction}
            {paletteAction}
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
            {paletteAction}
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
      <ShortcutHelpModal open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
      <CommandPaletteHost
        projects={projects}
        currentProject={currentProject}
        onCreateIssue={() => setCreateOpen(true)}
        onShowShortcuts={() => setShortcutHelpOpen(true)}
        onOpenNotifications={openNotifications}
      />
    </div>
  );
}
