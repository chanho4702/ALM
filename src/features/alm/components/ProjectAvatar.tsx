import type { Project } from "../store/types";
import { TYPE_ICONS } from "./typeIcons";

/** 키 문자열 → 0~359 색상 각도. 같은 프로젝트는 항상 같은 색을 갖는다 */
function hueFromKey(key: string): number {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

/** 프로젝트 색 선택지 — 이름을 저장하고 색상 각도로 그린다(토큰 밖 hex를 저장하지 않는다) */
export const PROJECT_COLOR_OPTIONS: { value: string; label: string; hue: number }[] = [
  { value: "blue", label: "파랑", hue: 215 },
  { value: "teal", label: "청록", hue: 175 },
  { value: "green", label: "초록", hue: 145 },
  { value: "purple", label: "보라", hue: 270 },
  { value: "pink", label: "분홍", hue: 330 },
  { value: "orange", label: "주황", hue: 30 },
  { value: "red", label: "빨강", hue: 5 },
];

export interface ProjectAvatarProps {
  project: Pick<Project, "key"> & Partial<Pick<Project, "icon" | "color">>;
  /** sm 20px(사이드바) · md 32px(헤더/카드) · lg 40px(프로젝트 헤더) */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICON_PX = { sm: 12, md: 18, lg: 22 } as const;

/**
 * 지라의 프로젝트 아바타 — 프로젝트마다 다른 색의 그라데이션 사각 + 키 이니셜.
 * 세부 설정에서 아이콘/색을 고르면 그것을 쓰고, 없으면 키 해시 색 + 이니셜.
 */
export function ProjectAvatar({ project, size = "md", className }: ProjectAvatarProps) {
  const picked = PROJECT_COLOR_OPTIONS.find((c) => c.value === project.color);
  const hue = picked ? picked.hue : hueFromKey(project.key);
  const Icon = project.icon ? TYPE_ICONS[project.icon] : undefined;
  return (
    <span
      className={["project-avatar2", `project-avatar2-${size}`, className]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 45) % 360} 62% 40%))`,
      }}
      aria-hidden
    >
      {Icon ? <Icon size={ICON_PX[size]} /> : project.key.charAt(0)}
    </span>
  );
}
