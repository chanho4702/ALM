import { ProjectRealtimeProvider, RealtimeStatusBadge } from "./realtime/ProjectRealtime";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Button, Dropdown, Lozenge } from "@chanho/react";
import { Check, ChevronDown, ExternalLink, MoreHorizontal, Star } from "lucide-react";
import type { Project, ProjectShortcut } from "../store/types";
import { listProjectShortcuts } from "../store/jiraStore";
import { SHORTCUTS_CHANGED_EVENT } from "./ProjectShortcutsPanel";
import { UI_CHANGED_EVENT, UI_USER_CHANGED_EVENT, listStarredProjectIds, toggleProjectStar } from "../store/uiStore";
import { ProjectAvatar } from "./ProjectAvatar";
import { useAiTeamActive } from "./useAiTeamActive";
import { projectViewTabs, type ProjectViewTab } from "./projectViews";
import { useTriageEnabled } from "./useTriageEnabled";

export interface ProjectLayoutProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(수정/삭제 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/** Outlet 하위 페이지(설정 등)가 useOutletContext로 받는 값 */
export interface JiraOutletContext {
  projects: Project[];
  onProjectsChanged: () => void | Promise<void>;
}

/**
 * 프로젝트 내부 레이아웃 — 지라의 프로젝트 화면 상단 구조.
 * 브레드크럼(프로젝트/이름) → 프로젝트 헤더(아바타·이름·별표) → 가로 뷰 탭 → 콘텐츠.
 */
export function ProjectLayout({ projects, onProjectsChanged }: ProjectLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const aiTeamActive = useAiTeamActive();
  const triageEnabled = useTriageEnabled(projectId);

  const refreshStarred = useCallback(() => {
    void listStarredProjectIds().then(setStarredIds);
  }, []);

  useEffect(() => {
    refreshStarred();
    window.addEventListener(UI_CHANGED_EVENT, refreshStarred);
    window.addEventListener(UI_USER_CHANGED_EVENT, refreshStarred);
    return () => {
      window.removeEventListener(UI_CHANGED_EVENT, refreshStarred);
      window.removeEventListener(UI_USER_CHANGED_EVENT, refreshStarred);
    };
  }, [refreshStarred]);

  const current = projects.find((p) => p.id === projectId);
  // 훅은 조기 반환보다 먼저 — 예전엔 없는 프로젝트일 때 useShortcuts를 건너뛰어 훅 순서가 흔들렸다
  const shortcuts = useShortcuts(current?.id ?? "");
  if (!current) {
    // 프로젝트가 없거나 존재하지 않는 ID → 프로젝트 디렉터리로
    return <Navigate to="/projects" replace />;
  }

  const rawSegment = location.pathname.split("/")[3] ?? "board";
  // /boards/:boardId 도 "보드" 탭으로 취급한다
  const segment = rawSegment === "boards" ? "board" : rawSegment;
  const starred = starredIds.includes(current.id);

  return (
    <ProjectRealtimeProvider key={current.id} projectId={current.id}>
    <div className="jira-main">
      {/* 지라 브레드크럼: "프로젝트 / 프로젝트명" — 현재 뷰는 탭이 보여준다 */}
      <nav aria-label="브레드크럼" className="breadcrumbs">
        <button type="button" onClick={() => navigate("/projects")}>
          프로젝트
        </button>
        <span aria-hidden>/</span>
        <span aria-current="page">{current.name}</span>
      </nav>

      <header className="project-header">
        <ProjectAvatar project={current} size="md" />
        <h1 className="project-header-name" title={current.name}>
          {current.name}
        </h1>
        {current.archivedAt ? (
          <Lozenge appearance="neutral" data-testid="project-archived-lozenge">
            보관됨 · 읽기 전용
          </Lozenge>
        ) : null}
        <Button
          variant="ghost"
          size="small"
          iconOnly
          className={starred ? "project-star is-starred" : "project-star"}
          aria-label={`${current.name} 별표`}
          aria-pressed={starred}
          onClick={() => void toggleProjectStar(current.id, current.name)}
        >
          <Star size={16} fill={starred ? "currentColor" : "none"} aria-hidden />
        </Button>
        {/* 지라 프로젝트 헤더의 ⋯ — 사이드바 프로젝트 메뉴와 같은 항목(설정 진입은 뷰 탭이 아니라 메뉴) */}
        <Dropdown
          trigger={
            <Button variant="ghost" size="small" iconOnly className="project-header-more" aria-label="프로젝트 작업">
              <MoreHorizontal size={16} aria-hidden />
            </Button>
          }
          items={[
            { label: "프로젝트 설정", onSelect: () => navigate(`/projects/${current.id}/settings`) },
            { label: "이슈 목록", onSelect: () => navigate(`/projects/${current.id}/issues`) },
          ]}
        />
        <RealtimeStatusBadge />
        {shortcuts.length > 0 ? (
          <nav aria-label="바로 가기" className="project-shortcuts">
            {shortcuts.map((shortcut) => (
              <a key={shortcut.id} href={shortcut.url} target="_blank" rel="noreferrer" title={shortcut.url}>
                <ExternalLink size={14} aria-hidden />
                <span className="project-shortcut-name">{shortcut.name}</span>
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      <ProjectTabs
        tabs={projectViewTabs(aiTeamActive, triageEnabled)}
        active={segment}
        onSelect={(id) => navigate(`/projects/${current.id}/${id}`)}
      />

      <main className="jira-content">
        <Outlet context={{ projects, onProjectsChanged } satisfies JiraOutletContext} />
      </main>
    </div>
    </ProjectRealtimeProvider>
  );
}

/**
 * 가로 뷰 탭 — 폭이 모자라면 지라처럼 넘치는 탭을 "더 보기 ▾" 메뉴로 접는다(가로 스크롤로 잘리지 않게).
 *
 * 탭 폭은 보이지 않는 측정 줄에서 잰다. 측정 줄의 글자는 CSS `content: attr(data-label)`로만 그려
 * 텍스트 노드를 남기지 않는다 — 탭 이름으로 찾는 질의(`getByText("보드")`)가 두 개를 물지 않게.
 * ResizeObserver가 없는 환경(jsdom)에서는 전부 보인다.
 */
function ProjectTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: ProjectViewTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const tabKey = tabs.map((t) => t.id).join("|");
  const tabCount = tabs.length;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure || typeof ResizeObserver === "undefined") {
      setVisibleCount(tabCount);
      return;
    }
    const compute = () => {
      const cells = [...measure.children] as HTMLElement[];
      const widths = cells.slice(0, tabCount).map((c) => c.getBoundingClientRect().width);
      const moreWidth = cells[tabCount]?.getBoundingClientRect().width ?? 0;
      const style = getComputedStyle(nav);
      const gap = parseFloat(style.columnGap) || 0;
      const available = nav.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
      if (total <= available + 0.5) {
        setVisibleCount(tabCount);
        return;
      }
      let used = moreWidth;
      let count = 0;
      for (const w of widths) {
        const next = used + gap + w;
        if (next > available) break;
        used = next;
        count += 1;
      }
      setVisibleCount(count);
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [tabKey, tabCount]);

  const shown = tabs.slice(0, visibleCount);
  const overflow = tabs.slice(visibleCount);
  const activeOverflowTab = overflow.find((t) => t.id === active);

  return (
    <nav aria-label="프로젝트 뷰" className="project-tabs" ref={navRef}>
      {shown.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? "project-tab is-active" : "project-tab"}
          aria-current={active === tab.id ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      {overflow.length > 0 ? (
        <Dropdown
          trigger={
            <button
              type="button"
              className={activeOverflowTab ? "project-tab project-tab-more is-active" : "project-tab project-tab-more"}
              aria-current={activeOverflowTab ? "page" : undefined}
            >
              {/* 고른 탭이 메뉴 안에 있으면 무엇을 보고 있는지 트리거가 알려 준다 */}
              {activeOverflowTab ? activeOverflowTab.label : "더 보기"}
              <ChevronDown size={16} aria-hidden />
            </button>
          }
          items={overflow.map((tab) => ({
            label: tab.label,
            icon: active === tab.id ? <Check size={16} aria-hidden /> : <span className="dropdown-icon-spacer" aria-hidden />,
            onSelect: () => onSelect(tab.id),
          }))}
        />
      ) : null}
      <div className="project-tabs-measure" ref={measureRef} aria-hidden="true">
        {tabs.map((tab) => (
          <span key={tab.id} className="project-tab" data-label={tab.label} />
        ))}
        {/* "더 보기" 자리는 가장 긴 탭 이름이 트리거에 들어가도 남도록 넉넉히 잰다 */}
        <span className="project-tab project-tab-more" data-label="AI 사무실">
          <ChevronDown size={16} aria-hidden />
        </span>
      </div>
    </nav>
  );
}

/** 프로젝트 바로 가기 — 설정에서 바뀌면 같은 탭에서 바로 갱신된다 */
function useShortcuts(projectId: string): ProjectShortcut[] {
  const [shortcuts, setShortcuts] = useState<ProjectShortcut[]>([]);
  useEffect(() => {
    if (!projectId) {
      setShortcuts([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      void listProjectShortcuts(projectId)
        .then((rows) => {
          if (!cancelled) setShortcuts(rows);
        })
        .catch(() => {
          if (!cancelled) setShortcuts([]);
        });
    load();
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SHORTCUTS_CHANGED_EVENT, load);
    };
  }, [projectId]);
  return shortcuts;
}
