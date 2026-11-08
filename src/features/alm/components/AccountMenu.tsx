import { Dropdown } from "@chanho/react";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import type { User } from "../store/types";
import { UserAvatar } from "./UserAvatar";

export interface AccountMenuProps {
  user: User | null;
  label: string;
  onLogout?: () => void;
}

/** 제품과 무관한 계정 명령은 아바타 한 곳에 모은다. */
export function AccountMenu({ user, label, onLogout }: AccountMenuProps) {
  const navigate = useNavigate();

  return (
    <Dropdown
      align="end"
      trigger={
        <button type="button" className="alm-user-menu-trigger" aria-label="사용자 메뉴" title={label}>
          <UserAvatar user={user} name={label} size="small" />
        </button>
      }
      items={[
        {
          label,
          description: "내 프로필과 개인 설정 보기",
          icon: <UserRound size={16} aria-hidden="true" />,
          onSelect: () => navigate("/settings/personal"),
        },
        {
          label: "API 토큰",
          description: "스크립트·CI에서 쓰는 개인 토큰 관리",
          icon: <KeyRound size={16} aria-hidden="true" />,
          onSelect: () => window.location.assign("/app/tokens"),
        },
        ...(onLogout
          ? [{
              label: "로그아웃",
              description: "이 기기에서 로그아웃합니다",
              icon: <LogOut size={16} aria-hidden="true" />,
              onSelect: onLogout,
            }]
          : []),
      ]}
    />
  );
}
