import { Bell, FolderKanban, KeyRound, ListChecks, Settings, Server, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router";
import { Button, Dropdown } from "@chanho/react";

/**
 * 상단바 ⚙ 메뉴 — 지라의 설정 드롭다운과 같은 구조: 그룹 제목 아래 "아이콘 · 이름 · 설명" 항목.
 * 개인 설정(일반·알림) / ALM 관리자 설정(시스템·프로젝트·이슈 항목).
 */
export function SettingsMenu() {
  const navigate = useNavigate();
  return (
    <Dropdown
      align="end"
      className="settings-menu"
      trigger={
        <Button
          size="small"
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
          // 토큰 관리 화면은 계정 포털(myFront `/app`)에 있다 — 같은 오리진이지만 다른 SPA라
          // 라우터가 아니라 전체 페이지 이동이다.
          label: "API 토큰",
          description: "스크립트·CI에서 쓰는 개인 토큰을 발급하고 폐기합니다",
          icon: <KeyRound size={16} />,
          onSelect: () => window.location.assign("/app/tokens"),
        },
        { separator: true },
        { heading: "ALM 관리자 설정" },
        {
          label: "시스템",
          description: "공지 배너, 감사 로그, 시스템 현황을 관리합니다",
          icon: <Server size={16} />,
          onSelect: () => navigate("/settings/system"),
        },
        {
          label: "프로젝트",
          description: "프로젝트 세부, 사용자·권한, 바로 가기를 관리합니다",
          icon: <FolderKanban size={16} />,
          onSelect: () => navigate("/projects"),
        },
        {
          label: "이슈 항목",
          description: "이슈 타입, 상태 카테고리, 워크플로 스킴을 구성합니다",
          icon: <ListChecks size={16} />,
          onSelect: () => navigate("/settings/issue-types"),
        },
      ]}
    />
  );
}
