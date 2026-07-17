import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Project } from "../features/jira/store/types";
import { listProjects } from "../features/jira/store/jiraStore";
import { AppShell } from "../features/jira/components/AppShell";
import { ProjectLayout } from "../features/jira/components/ProjectLayout";
import { BoardPage } from "../features/jira/pages/BoardPage";
import { BacklogPage } from "../features/jira/pages/BacklogPage";
import { IssueListPage } from "../features/jira/pages/IssueListPage";
import { ProjectListPage } from "../features/jira/pages/ProjectListPage";
import { ProjectCreatePage } from "../features/jira/pages/ProjectCreatePage";
import { ProjectSettingsPage } from "../features/jira/pages/ProjectSettingsPage";
import { DashboardPage } from "../features/jira/pages/DashboardPage";

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
      {/* 전역 셸(상단 나비) 아래에 모든 화면이 놓인다 — 지라 구조 */}
      <Route element={<AppShell projects={projects} onProjectsChanged={reload} />}>
        {/* 프로젝트 디렉터리가 앱의 홈이다 — 빈 상태(0개)도 이 페이지가 처리한다 */}
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
          <Route path="board" element={<BoardPage />} />
          <Route path="backlog" element={<BacklogPage />} />
          <Route path="issues" element={<IssueListPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
        {/* "/" 포함 그 외 전부 → 프로젝트 디렉터리 */}
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  );
}
