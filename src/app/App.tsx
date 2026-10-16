import { lazy, useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Project } from "../features/alm/store/types";
import { listProjects } from "../features/alm/store/jiraStore";
import { AppShell } from "../features/alm/components/AppShell";
import { StartRedirect } from "../features/alm/components/StartRedirect";
import { ProjectLayout } from "../features/alm/components/ProjectLayout";
import { BoardRedirect } from "../features/alm/pages/BoardRedirect";
import { ProjectListPage } from "../features/alm/pages/ProjectListPage";
import { HomePage } from "../features/alm/pages/HomePage";
import { OrgAccountGate } from "../features/alm/components/OrgAccountGate";
import { LazyPage } from "../features/alm/components/LazyContent";
import { ORG_ADMIN_BASE } from "../features/alm/components/SettingsSideNav";

/** 홈·프로젝트 목록 외 화면은 방문할 때 내려받는다(DnD·워크플로·편집기 포함). */
const BoardPage = lazy(() =>
  import("../features/alm/pages/BoardPage").then((module) => ({ default: module.BoardPage })),
);
const BacklogPage = lazy(() =>
  import("../features/alm/pages/BacklogPage").then((module) => ({ default: module.BacklogPage })),
);
const IssueListPage = lazy(() =>
  import("../features/alm/pages/IssueListPage").then((module) => ({ default: module.IssueListPage })),
);
const TrashPage = lazy(() =>
  import("../features/alm/pages/TrashPage").then((module) => ({ default: module.TrashPage })),
);
const DashboardsPage = lazy(() =>
  import("../features/alm/pages/DashboardsPage").then((module) => ({ default: module.DashboardsPage })),
);
const DashboardViewPage = lazy(() =>
  import("../features/alm/pages/DashboardViewPage").then((module) => ({ default: module.DashboardViewPage })),
);
const ArchivePage = lazy(() =>
  import("../features/alm/pages/ArchivePage").then((module) => ({ default: module.ArchivePage })),
);
const ProjectCreatePage = lazy(() =>
  import("../features/alm/pages/ProjectCreatePage").then((module) => ({ default: module.ProjectCreatePage })),
);
const DashboardPage = lazy(() =>
  import("../features/alm/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const SearchPage = lazy(() =>
  import("../features/alm/pages/SearchPage").then((module) => ({ default: module.SearchPage })),
);
const GlobalSettingsPage = lazy(() =>
  import("../features/alm/pages/GlobalSettingsPage").then((module) => ({ default: module.GlobalSettingsPage })),
);

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

/** AI 사무실은 픽셀 에셋·갈무리11 폰트를 쓴다 — 사무실을 여는 사람만 내려받는다 */
const AiOfficePage = lazy(() => import("../features/alm/office/AiOfficePage"));
/** run 목록·상세·승인 인박스 — 사무실 밖 DS 화면(픽셀 에셋·폰트 없음), 각자 청크 */
const AgentRunsPage = lazy(() => import("../features/alm/office/AgentRunsPage"));
const AgentRunDetailPage = lazy(() => import("../features/alm/office/AgentRunDetailPage"));
const AgentGatesPage = lazy(() => import("../features/alm/office/AgentGatesPage"));

/** 조직 관리는 공용 패키지(@chanho/org-admin) 전체를 끌어온다 — 여는 사람만 내려받는다 */
const OrgAdminPage = lazy(() =>
  import("../features/alm/pages/OrgAdminPage").then((module) => ({ default: module.OrgAdminPage })),
);

/**
 * 로그인(AuthGate) 뒤 계정 상태 게이트 — 승인 대기·정지 계정은 셸 대신 안내를 본다.
 * 프로젝트 조회보다 **먼저** 놓는다: 그 계정은 org-service가 ALM 호출까지 403으로 막으므로
 * 뒤에 두면 빈 스피너에 갇힌다. 전역 역할도 여기서 한 번 읽어 아래 화면들이 같은 판정을 쓴다.
 */
export function App() {
  return (
    <OrgAccountGate>
      <AppRoutes />
    </OrgAccountGate>
  );
}

function AppRoutes() {
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
        <Route path="/" element={<StartRedirect />} />
        <Route path="/home" element={<HomePage />} />
        <Route
          path="/search"
          element={
            <LazyPage label="검색">
              <SearchPage />
            </LazyPage>
          }
        />
        <Route
          path="/dashboards"
          element={
            <LazyPage label="대시보드 목록">
              <DashboardsPage />
            </LazyPage>
          }
        />
        <Route
          path="/dashboards/:dashboardId"
          element={
            <LazyPage label="대시보드">
              <DashboardViewPage />
            </LazyPage>
          }
        />
        {/* 전역 관리 — 구획은 URL 세그먼트, 메뉴는 설정 사이드바(SettingsSideNav) */}
        <Route path="/settings" element={<Navigate to="/settings/types" replace />} />
        {/*
          조직 관리는 공용 패키지(@chanho/org-admin)가 자기 하위 경로를 정의하는 스플랫이다.
          `/settings/org`(구획 없음)는 `/settings/:section`이 먼저 잡아 "없는 구획"으로 튕기므로
          정적 경로로 한 줄 더 두고 목록으로 보낸다.
        */}
        <Route path={ORG_ADMIN_BASE} element={<Navigate to={`${ORG_ADMIN_BASE}/users`} replace />} />
        <Route
          path={`${ORG_ADMIN_BASE}/*`}
          element={
            <LazyPage label="조직 관리">
              <OrgAdminPage projects={projects} />
            </LazyPage>
          }
        />
        <Route
          path="/settings/:section"
          element={
            <LazyPage label="설정">
              <GlobalSettingsPage />
            </LazyPage>
          }
        />
        <Route
          path="/projects"
          element={<ProjectListPage projects={projects} onProjectsChanged={reload} />}
        />
        <Route
          path="/projects/new"
          element={
            <LazyPage label="프로젝트 만들기">
              <ProjectCreatePage onProjectsChanged={reload} />
            </LazyPage>
          }
        />
        <Route
          path="/projects/trash"
          element={
            <LazyPage label="휴지통">
              <TrashPage onProjectsChanged={reload} />
            </LazyPage>
          }
        />
        <Route
          path="/projects/:projectId"
          element={<ProjectLayout projects={projects} onProjectsChanged={reload} />}
        >
          <Route
            path="dashboard"
            element={
              <LazyPage label="요약">
                <DashboardPage />
              </LazyPage>
            }
          />
          <Route
            path="releases"
            element={
              <LazyPage label="릴리스">
                <ReleasesPage />
              </LazyPage>
            }
          />
          <Route
            path="reports"
            element={
              <LazyPage label="리포트">
                <ReportsPage />
              </LazyPage>
            }
          />
          <Route
            path="timeline"
            element={
              <LazyPage label="타임라인">
                <TimelinePage />
              </LazyPage>
            }
          />
          <Route path="board" element={<BoardRedirect />} />
          <Route
            path="boards/:boardId"
            element={
              <LazyPage label="보드">
                <BoardPage />
              </LazyPage>
            }
          />
          <Route
            path="backlog"
            element={
              <LazyPage label="백로그">
                <BacklogPage />
              </LazyPage>
            }
          />
          <Route
            path="issues"
            element={
              <LazyPage label="이슈 목록">
                <IssueListPage />
              </LazyPage>
            }
          />
          <Route
            path="archive"
            element={
              <LazyPage label="보관함">
                <ArchivePage />
              </LazyPage>
            }
          />
          <Route
            path="ai-office"
            element={
              <LazyPage label="AI 사무실">
                <AiOfficePage />
              </LazyPage>
            }
          />
          <Route
            path="ai-office/runs"
            element={
              <LazyPage label="실행 기록">
                <AgentRunsPage />
              </LazyPage>
            }
          />
          <Route
            path="ai-office/runs/:runId"
            element={
              <LazyPage label="실행 상세">
                <AgentRunDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="ai-office/gates"
            element={
              <LazyPage label="승인 인박스">
                <AgentGatesPage />
              </LazyPage>
            }
          />
        </Route>
        {/* 프로젝트 설정 — 뷰 탭(ProjectLayout) 바깥의 별도 페이지, 사이드바는 설정 메뉴로 바뀐다 */}
        <Route path="/projects/:projectId/settings" element={<Navigate to="general" replace />} />
        <Route
          path="/projects/:projectId/settings/:section"
          element={
            <LazyPage label="설정">
              <ProjectSettingsPage projects={projects} onProjectsChanged={reload} />
            </LazyPage>
          }
        />
        {/* "/" 포함 그 외 전부 → 홈 */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
