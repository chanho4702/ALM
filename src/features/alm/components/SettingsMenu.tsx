import {
  Bell,
  Bot,
  Command,
  Keyboard,
  ListChecks,
  Moon,
  Server,
  Settings,
  SlidersHorizontal,
  Sun,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Button, Dropdown } from "@chanho/react";
import type { DropdownItem } from "@chanho/react";
import { useOrgProfile } from "./OrgAccountGate";
import { ORG_ADMIN_BASE } from "./SettingsSideNav";
import { useAiTeamActive } from "./useAiTeamActive";
import { useThemePreference } from "./ThemeToggle";

// 위키 스페이스 5, 페이지 47 — "꺼지지 않는 개발팀"(agent-service) 가이드 페이지.
// 같은 오리진에서 nginx가 두 앱을 함께 서빙하므로 절대 경로 하나로 충분하다.
const AI_TEAM_GUIDE_URL = "/wiki/spaces/5/pages/47";

/**
 * 상단바 ⚙ 메뉴 — 지라의 설정 드롭다운과 같은 구조: 그룹 제목 아래 "아이콘 · 이름 · 설명" 항목.
 * 개인 설정(일반·알림) / ALM 관리자 설정(사용자·팀·시스템·프로젝트·이슈 항목).
 *
 * 관리자 그룹은 **전역 관리자에게만** 보인다. 판정은 `/api/org/me.globalRoles`(위키와 같은 응답)
 * 하나이며, 예전처럼 관리자 엔드포인트를 찔러 403을 화면에 띄우지 않는다.
 */
export function SettingsMenu({
  onOpenCommandPalette,
  onOpenShortcutHelp,
}: {
  onOpenCommandPalette: () => void;
  onOpenShortcutHelp: () => void;
}) {
  const navigate = useNavigate();
  const { isGlobalAdmin } = useOrgProfile();
  const aiTeamActive = useAiTeamActive();
  const { theme, toggle } = useThemePreference();
  const aiTeamItems: DropdownItem[] = aiTeamActive
    ? [
        {
          label: "AI 팀 가이드",
          description: "꺼지지 않는 개발팀(에이전트) 사용법을 위키에서 확인합니다",
          icon: <Bot size={16} />,
          onSelect: () => window.open(AI_TEAM_GUIDE_URL, "_blank", "noopener,noreferrer"),
        },
      ]
    : [];
  const adminItems: DropdownItem[] = isGlobalAdmin
    ? [
        { separator: true },
        { heading: "ALM 관리자 설정" },
        {
          label: "사용자·팀",
          description: "사용자 초대, 팀과 전역 역할, 승인 대기 계정을 관리합니다",
          icon: <Users size={16} />,
          onSelect: () => navigate(ORG_ADMIN_BASE),
        },
        {
          label: "시스템",
          description: "공지 배너, 감사 로그, 시스템 현황을 관리합니다",
          icon: <Server size={16} />,
          onSelect: () => navigate("/settings/system"),
        },
        {
          label: "이슈 항목",
          description: "이슈 타입, 상태 카테고리, 워크플로 스킴을 구성합니다",
          icon: <ListChecks size={16} />,
          onSelect: () => navigate("/settings/issue-types"),
        },
      ]
    : [];
  return (
    <Dropdown
      align="end"
      className="settings-menu"
      trigger={
        <Button
          variant="ghost"
          iconOnly
          className="topbar-icon"
          aria-label="설정"
          title="설정"
        >
          <Settings size={18} />
        </Button>
      }
      items={[
        { heading: "개인 설정" },
        {
          label: theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
          description: "화면 색을 바꿉니다. 이 브라우저에만 저장됩니다",
          icon: theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />,
          onSelect: toggle,
        },
        {
          label: "일반 설정",
          description: "시작 화면, 자동 관찰 같은 개인 기본 설정을 관리합니다",
          icon: <SlidersHorizontal size={16} />,
          onSelect: () => navigate("/settings/personal"),
        },
        {
          label: "알림 설정",
          description: "어떤 일이 있을 때 앱 내 알림을 받을지 정합니다",
          icon: <Bell size={16} />,
          onSelect: () => navigate("/settings/notifications"),
        },
        {
          label: "명령 팔레트",
          description: "이동과 이슈 작업을 한곳에서 실행합니다",
          icon: <Command size={16} aria-hidden="true" />,
          onSelect: onOpenCommandPalette,
        },
        {
          label: "단축키 도움말",
          description: "키보드로 빠르게 다니는 법",
          icon: <Keyboard size={16} aria-hidden="true" />,
          onSelect: onOpenShortcutHelp,
        },
        ...aiTeamItems,
        ...adminItems,
      ]}
    />
  );
}
