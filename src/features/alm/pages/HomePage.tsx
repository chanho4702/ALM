import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card, EmptyState, Lozenge, PageHeader, Spinner } from "@chanho/react";
import type { Issue, Project, User } from "../store/types";
import { getCurrentUser, listIssues, listProjects } from "../store/jiraStore";
import { STATUS_APPEARANCE, STATUS_LABELS } from "../components/labels";

/** 지라의 For you 홈 — 내 담당 이슈와 최근 업데이트를 전 프로젝트에서 모아 보여준다 */
export function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [currentUser, projectList] = await Promise.all([getCurrentUser(), listProjects()]);
      const perProject = await Promise.all(projectList.map((p) => listIssues(p.id)));
      if (cancelled) return;
      setMe(currentUser);
      setProjects(projectList);
      setIssues(perProject.flat());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (issues === null || me === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="홈 불러오는 중" />
      </div>
    );
  }

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "알 수 없음";
  const openIssue = (issue: Issue) =>
    navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`);

  const myIssues = issues
    .filter((i) => i.assigneeId === me.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);
  const recent = [...issues].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);

  const issueRow = (issue: Issue) => (
    <li key={issue.id}>
      <button type="button" className="search-result-row" onClick={() => openIssue(issue)}>
        <span className="issue-key-cell">{issue.key}</span>
        <span className="search-result-title">{issue.title}</span>
        <span className="search-result-project">{projectName(issue.projectId)}</span>
        <Lozenge appearance={STATUS_APPEARANCE[issue.status]}>
          {STATUS_LABELS[issue.status]}
        </Lozenge>
      </button>
    </li>
  );

  return (
    <main className="project-list-content">
      <PageHeader title={`안녕하세요, ${me.name}님`} />
      {projects.length === 0 ? (
        <EmptyState
          title="아직 프로젝트가 없습니다"
          description="첫 프로젝트를 만들어 보드를 시작하세요."
          primaryAction={{ label: "첫 프로젝트 만들기", onClick: () => navigate("/projects/new") }}
        />
      ) : (
        <div className="home-sections">
          <Card padding="md" title="내 담당 이슈">
            {myIssues.length === 0 ? (
              <p className="issue-comment-empty">담당하고 있는 이슈가 없습니다.</p>
            ) : (
              <ul className="home-issue-list" data-testid="my-issues">
                {myIssues.map(issueRow)}
              </ul>
            )}
          </Card>
          <Card padding="md" title="최근 업데이트">
            <ul className="home-issue-list" data-testid="recent-issues">
              {recent.map(issueRow)}
            </ul>
          </Card>
        </div>
      )}
    </main>
  );
}
