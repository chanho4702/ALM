import type { Project } from "../store/types";

/** 키 문자열 → 0~359 색상 각도. 같은 프로젝트는 항상 같은 색을 갖는다 */
function hueFromKey(key: string): number {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

export interface ProjectAvatarProps {
  project: Pick<Project, "key">;
  /** sm 20px(사이드바) · md 32px(헤더/카드) · lg 40px(프로젝트 헤더) */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** 지라의 프로젝트 아바타 — 프로젝트마다 다른 색의 그라데이션 사각 아이콘 + 키 이니셜 */
export function ProjectAvatar({ project, size = "md", className }: ProjectAvatarProps) {
  const hue = hueFromKey(project.key);
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
      {project.key.charAt(0)}
    </span>
  );
}
