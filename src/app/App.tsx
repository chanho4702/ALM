import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Project } from "../features/jira/store/types";
import { listProjects } from "../features/jira/store/jiraStore";
import { JiraLayout } from "../features/jira/components/JiraLayout";
import { EmptyProjects } from "../features/jira/components/EmptyProjects";
import { BoardPage } from "../features/jira/pages/BoardPage";
import { BacklogPage } from "../features/jira/pages/BacklogPage";
import { IssueListPage } from "../features/jira/pages/IssueListPage";

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

  if (projects.length === 0) {
    return <EmptyProjects onCreated={reload} />;
  }

  return (
    <Routes>
      <Route
        path="/projects/:projectId"
        element={<JiraLayout projects={projects} onProjectsChanged={reload} />}
      >
        <Route path="board" element={<BoardPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="issues" element={<IssueListPage />} />
      </Route>
      {/* "/" 포함 그 외 전부 → 첫 프로젝트 보드 */}
      <Route path="*" element={<Navigate to={`/projects/${projects[0].id}/board`} replace />} />
    </Routes>
  );
}
