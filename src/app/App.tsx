import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Project } from "../features/alm/store/types";
import { listProjects } from "../features/alm/store/jiraStore";
import { AppShell } from "../features/alm/components/AppShell";
import { ProjectLayout } from "../features/alm/components/ProjectLayout";
import { BoardPage } from "../features/alm/pages/BoardPage";
import { BoardRedirect } from "../features/alm/pages/BoardRedirect";
import { BacklogPage } from "../features/alm/pages/BacklogPage";
import { IssueListPage } from "../features/alm/pages/IssueListPage";
import { ProjectListPage } from "../features/alm/pages/ProjectListPage";
import { ProjectCreatePage } from "../features/alm/pages/ProjectCreatePage";
import { DashboardPage } from "../features/alm/pages/DashboardPage";
import { HomePage } from "../features/alm/pages/HomePage";
import { SearchPage } from "../features/alm/pages/SearchPage";
import { GlobalSettingsPage } from "../features/alm/pages/GlobalSettingsPage";

/**
 * 리포트만 차트 라이브러리(recharts)를 쓴다 — 첫 화면 번들에 넣지 않고 라우트 단위로 쪼갠다.
 */
/** 프로젝트 설정은 워크플로 캔버스(@xyflow/react)를 쓴다 — 설정에 들어온 사람만 내려받는다 */
const ProjectSettingsPage = lazy(() =>
  import("../features/alm/pages/ProjectSettingsPage").then((module) => ({
    default: module.ProjectSettingsPage,
  })),
);

/** 타임라인도 차트 라이브러리(SVAR React Gantt)를 쓴다 — 방문자만 내려받게 라우트를 쪼갠다 */
const TimelinePage = lazy(() =>
  import("../features/alm/pages/TimelinePage").then((module) => ({ default: module.TimelinePage })),
);

const ReleasesPage = lazy(() =>
  import("../features/alm/pages/ReleasesPage").then((module) => ({ default: module.ReleasesPage })),
);

const ReportsPage = lazy(() =>
  import("../features/alm/pages/ReportsPage").then((module) => ({ default: module.ReportsPage })),
);

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  const reload = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (projects === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="불러오는 중" />
      </div>
    );
  }

  return (
    <Routes>
      {/* 전역 셸(상단바 + 상주 사이드바) 아래에 모든 화면이 놓인다 — 새 지라 구조 */}
      <Route element={<AppShell projects={projects} onProjectsChanged={reload} />}>
        {/* For you 홈 — 내 담당·최근 업데이트 */}
        <Route path="/home" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        {/* 전역 관리 — 구획은 URL 세그먼트, 메뉴는 설정 사이드바(SettingsSideNav) */}
        <Route path="/settings" element={<Navigate to="/settings/types" replace />} />
        <Route path="/settings/:section" element={<GlobalSettingsPage />} />
        <Route
          path="/projects"
          element={<ProjectListPage projects={projects} onProjectsChanged={reload} />}
        />
        <Route path="/projects/new" element={<ProjectCreatePage onProjectsChanged={reload} />} />
        <Route
          path="/projects/:projectId"
          element={<ProjectLayout projects={projects} onProjectsChanged={reload} />}
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="releases"
            element={
              <Suspense
                fallback={
                  <div className="board-loading">
                    <Spinner size="large" label="릴리스 불러오는 중" />
                  </div>
                }
              >
                <ReleasesPage />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense
                fallback={
                  <div className="board-loading">
                    <Spinner size="large" label="리포트 불러오는 중" />
                  </div>
                }
              >
                <ReportsPage />
              </Suspense>
            }
          />
          <Route
            path="timeline"
            element={
              <Suspense
                fallback={
                  <div className="board-loading">
                    <Spinner size="large" label="타임라인 불러오는 중" />
                  </div>
                }
              >
                <TimelinePage />
              </Suspense>
            }
          />
          <Route path="board" element={<BoardRedirect />} />
          <Route path="boards/:boardId" element={<BoardPage />} />
          <Route path="backlog" element={<BacklogPage />} />
          <Route path="issues" element={<IssueListPage />} />
        </Route>
        {/* 프로젝트 설정 — 뷰 탭(ProjectLayout) 바깥의 별도 페이지, 사이드바는 설정 메뉴로 바뀐다 */}
        <Route path="/projects/:projectId/settings" element={<Navigate to="general" replace />} />
        <Route
          path="/projects/:projectId/settings/:section"
          element={
            <Suspense
              fallback={
                <div className="board-loading">
                  <Spinner size="large" label="설정 불러오는 중" />
                </div>
              }
            >
              <ProjectSettingsPage projects={projects} onProjectsChanged={reload} />
            </Suspense>
          }
        />
        {/* "/" 포함 그 외 전부 → 홈 */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
