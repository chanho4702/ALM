import { ArrowLeft, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import type { Project } from "../store/types";
import { ProjectAvatar } from "./ProjectAvatar";

/** 프로젝트 설정 구획 — URL 세그먼트(`/projects/:id/settings/:section`)와 메뉴 라벨 */
export const PROJECT_SETTINGS_SECTIONS = [
  { id: "general", label: "일반" },
  { id: "members", label: "사용자·권한" },
  { id: "components", label: "컴포넌트" },
  { id: "workflow", label: "워크플로" },
  { id: "types", label: "이슈 타입" },
  { id: "import", label: "가져오기" },
] as const;

/** 전역 관리 구획 — `/settings/:section` */
export const GLOBAL_SETTINGS_SECTIONS = [
  { id: "personal", label: "일반 설정", group: "개인 설정" },
  { id: "notifications", label: "알림 설정", group: "개인 설정" },
  { id: "categories", label: "상태 카테고리", group: "이슈 항목" },
  { id: "statuses", label: "상태", group: "이슈 항목" },
  { id: "issue-types", label: "이슈 타입", group: "이슈 항목" },
  { id: "priorities", label: "우선순위", group: "이슈 항목" },
  { id: "link-types", label: "링크 타입", group: "이슈 항목" },
  { id: "types", label: "이슈 타입 스킴", group: "이슈 항목" },
  { id: "workflows", label: "워크플로 스킴", group: "이슈 항목" },
  { id: "audit", label: "감사 로그", group: "시스템" },
  { id: "system", label: "시스템 현황", group: "시스템" },
  { id: "banner", label: "공지 배너", group: "시스템" },
] as const;

export type ProjectSettingsSection = (typeof PROJECT_SETTINGS_SECTIONS)[number]["id"];
export type GlobalSettingsSection = (typeof GLOBAL_SETTINGS_SECTIONS)[number]["id"];

export const isProjectSettingsSection = (value: string): value is ProjectSettingsSection =>
  PROJECT_SETTINGS_SECTIONS.some((section) => section.id === value);
export const isGlobalSettingsSection = (value: string): value is GlobalSettingsSection =>
  GLOBAL_SETTINGS_SECTIONS.some((section) => section.id === value);

/** 설정 라우트인가 — AppShell이 전역 사이드바 대신 설정 사이드바를 세울지 판단한다 */
export const isSettingsPath = (pathname: string) =>
  /^\/settings(\/|$)/.test(pathname) || /^\/projects\/[^/]+\/settings(\/|$)/.test(pathname);

export interface SettingsSideNavProps {
  projects: Project[];
}

/**
 * 설정 전용 사이드바 — 설정에 들어오면 전역 사이드바 자리를 이것이 차지한다(지라의 프로젝트 설정
 * 사이드바). 돌아가기 → 머리(무엇의 설정인가) → 구획 메뉴. 구획은 URL이 진실이라 새로고침·공유가 된다.
 */
export function SettingsSideNav({ projects }: SettingsSideNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const projectMatch = pathname.match(/^\/projects\/([^/]+)\/settings(?:\/([^/?]+))?/);
  const project = projectMatch ? projects.find((p) => p.id === projectMatch[1]) : undefined;
  const globalMatch = pathname.match(/^\/settings(?:\/([^/?]+))?/);

  const items: ReadonlyArray<{ id: string; label: string; group?: string }> = project
    ? PROJECT_SETTINGS_SECTIONS
    : GLOBAL_SETTINGS_SECTIONS;
  const active = project ? (projectMatch?.[2] ?? "general") : (globalMatch?.[1] ?? "types");
  const base = project ? `/projects/${project.id}/settings` : "/settings";

  const itemClass = (isActive: boolean) =>
    isActive ? "global-nav-item is-active" : "global-nav-item";

  return (
    <nav className="global-nav settings-nav" aria-label="설정 메뉴">
      <div className="global-nav-scroll">
        <button
          type="button"
          className="settings-nav-back"
          onClick={() => navigate(project ? `/projects/${project.id}/board` : "/home")}
        >
          <ArrowLeft size={16} aria-hidden />
          {project ? "프로젝트로 돌아가기" : "홈으로"}
        </button>

        <div className="settings-nav-head">
          {project ? (
            <ProjectAvatar project={project} size="sm" />
          ) : (
            <span className="settings-nav-glyph" aria-hidden>
              <Settings size={16} />
            </span>
          )}
          <span className="settings-nav-head-text">
            <span className="settings-nav-eyebrow">{project ? "프로젝트 설정" : "설정"}</span>
            <span className="settings-nav-name" title={project?.name}>
              {project ? project.name : "개인 · ALM 관리"}
            </span>
          </span>
        </div>

        <ul className="global-nav-list">
          {items.map((item, index) => (
            <li key={item.id}>
              {item.group && items[index - 1]?.group !== item.group ? (
                <span className="global-nav-section settings-nav-group">{item.group}</span>
              ) : null}
              <button
                type="button"
                className={itemClass(active === item.id)}
                aria-current={active === item.id ? "page" : undefined}
                onClick={() => navigate(`${base}/${item.id}`)}
              >
                <span className="global-nav-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
