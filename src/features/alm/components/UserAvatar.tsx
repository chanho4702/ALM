import { Avatar } from "@chanho/react";
import type { AvatarProps } from "@chanho/react";
import type { User } from "../store/types";

export interface UserAvatarProps extends Omit<AvatarProps, "name" | "src"> {
  /** 표시할 사용자. 사진이 있으면 사진, 없으면 이니셜 */
  user?: User | null;
  /** 디렉터리에서 사용자를 못 찾았을 때 쓰는 이름 폴백(코멘트 작성자 등) */
  name?: string;
}

/**
 * 사용자 아바타 공용 헬퍼 — 프로필 사진(`user.avatarUrl`)을 DS `Avatar`의 `src`에 넣는다.
 *
 * 화면에서 `<Avatar name={...}>`를 직접 쓰면 사진이 있는 사용자도 이니셜로 나온다.
 * 사람을 그리는 자리는 전부 이 컴포넌트를 쓴다(프로젝트 아이콘은 `ProjectAvatar`가 따로 있다).
 * `avatarUrl`은 스토어가 만든다 — 목업은 dataURL, REST는 인증 fetch로 만든 object URL이다.
 */
export function UserAvatar({ user, name, ...rest }: UserAvatarProps) {
  return <Avatar name={user?.name ?? name ?? ""} src={user?.avatarUrl ?? undefined} {...rest} />;
}
