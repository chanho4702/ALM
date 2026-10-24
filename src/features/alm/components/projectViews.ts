/**
 * 프로젝트 뷰 목록 — 가로 뷰 탭(ProjectLayout)과 사이드바의 현재 프로젝트 하위 페이지(GlobalSideNav)가
 * 같은 목록을 쓴다. 예전엔 두 곳이 따로 적혀 사이드바에 리포트·보관함이 없었다(같은 내비가 화면마다 달랐다).
 * 지라의 프로젝트 뷰 순서 — 요약이 첫 탭.
 */
export const PROJECT_VIEW_TABS = [
  { id: "dashboard", label: "요약" },
  { id: "reports", label: "리포트" },
  { id: "releases", label: "릴리스" },
  { id: "timeline", label: "타임라인" },
  { id: "board", label: "보드" },
  { id: "backlog", label: "백로그" },
  { id: "issues", label: "이슈" },
  { id: "archive", label: "보관함" },
] as const;

/** 트리아지 인박스(V35) — 프로젝트 설정에서 켠 경우만(useTriageEnabled) "이슈" 다음에 붙는다 */
export const TRIAGE_TAB = { id: "triage", label: "트리아지" } as const;

/** AI 사무실 — agent-service가 붙은 플랫폼(useAiTeamActive)에서만 뷰 목록 맨 끝에 붙는다 */
export const AI_OFFICE_TAB = { id: "ai-office", label: "AI 사무실" } as const;

export type ProjectViewTab = { id: string; label: string };

export function projectViewTabs(aiTeamActive: boolean, triageEnabled = false): ProjectViewTab[] {
  const tabs: ProjectViewTab[] = [];
  for (const tab of PROJECT_VIEW_TABS) {
    tabs.push(tab);
    if (tab.id === "issues" && triageEnabled) tabs.push(TRIAGE_TAB);
  }
  return aiTeamActive ? [...tabs, AI_OFFICE_TAB] : tabs;
}
