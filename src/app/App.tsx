import { useCallback, useEffect, useState } from "react";
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
import { ProjectSettingsPage } from "../features/alm/pages/ProjectSettingsPage";
import { DashboardPage } from "../features/alm/pages/DashboardPage";
import { HomePage } from "../features/alm/pages/HomePage";
import { TimelinePage } from "../features/alm/pages/TimelinePage";
import { SearchPage } from "../features/alm/pages/SearchPage";

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
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="board" element={<BoardRedirect />} />
          <Route path="boards/:boardId" element={<BoardPage />} />
          <Route path="backlog" element={<BacklogPage />} />
          <Route path="issues" element={<IssueListPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        {/* "/" 포함 그 외 전부 → 홈 */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
