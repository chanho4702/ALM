import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, Lozenge, Spinner, Tabs } from "@chanho/react";
import type { Issue, Project, StatusKind, User, WorkflowStatus } from "../store/types";
import {
  getCurrentUser,
  listIssues,
  listProjects,
  statusMetaByProject,
} from "../store/jiraStore";
import { listRecentProjectIds, listStarredProjectIds } from "../store/uiStore";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import {
  statusAppearance,
  statusKind,
  statusName,
} from "../components/labels";

/** "3시간 전" 식 상대 시간 — 지라 홈의 시간 표기 모방 */
function relTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const hour = 3_600_000;
  if (diff < hour) return "방금 전";
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}시간 전`;
  const days = Math.floor(diff / (24 * hour));
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

/** 최근 업데이트 탭의 날짜 그룹 (지라: Today / Yesterday / …) */
function dateBucket(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const stamp = date.getTime();
  if (stamp >= startOfToday) return "오늘";
  if (stamp >= startOfToday - 86_400_000) return "어제";
  if (stamp >= startOfToday - 6 * 86_400_000) return "이번 주";
  return "이전";
}

/** 추천 작업의 사유 — 지라 For you의 Recommended actions 모방 (프론트 계산) */
interface Recommendation {
  issue: Issue;
  reason: string;
  appearance: "danger" | "warning" | "info";
}

/**
 * 지라의 For you 홈 모방 — 인사말 → "이어서 하기" 카드 → 추천 작업/배정/최근/별표 탭.
 * 모든 데이터는 전 프로젝트 합산이다.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [statusMeta, setStatusMeta] = useState<Record<string, Record<string, WorkflowStatus>>>({});
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [currentUser, projectList, meta, recents, starred] = await Promise.all([
        getCurrentUser(),
        listProjects(),
        statusMetaByProject(),
        listRecentProjectIds(),
        listStarredProjectIds(),
      ]);
      const perProject = await Promise.all(projectList.map((p) => listIssues(p.id)));
      if (cancelled) return;
      setMe(currentUser);
      setProjects(projectList);
      setStatusMeta(meta);
      setRecentIds(recents);
      setStarredIds(starred);
      setIssues(perProject.flat());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "알 수 없음";
  const openIssue = (issue: Issue) =>
    navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`);

  /** 이슈 → 상태 의미 — 프로젝트별 해석 메타에서 읽고, 없으면 기본 id로 폴백 */
  const kindOf = (issue: Issue): StatusKind =>
    statusKind(Object.values(statusMeta[issue.projectId] ?? {}), issue.status);

  /** 이어서 하기 — 최근 방문 프로젝트(없으면 전체 앞순) + 최근 업데이트 이슈 */
  const resumeProjects = useMemo(() => {
    const byRecent = recentIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => Boolean(p));
    const rest = projects.filter((p) => !recentIds.includes(p.id));
    return [...byRecent, ...rest].slice(0, 3);
  }, [recentIds, projects]);

  const resumeIssues = useMemo(
    () => [...(issues ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
    [issues],
  );

  /** 추천 작업 — 기한 지남 > 마감 임박(일주일) > 높은 우선순위 미배정 */
  const recommendations = useMemo<Recommendation[]>(() => {
    if (!issues) return [];
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const overdue: Recommendation[] = [];
    const dueSoon: Recommendation[] = [];
    const unassigned: Recommendation[] = [];
    for (const issue of issues) {
      if (kindOf(issue) === "complete") continue;
      if (issue.dueDate && issue.dueDate < today) {
        overdue.push({ issue, reason: "기한 지남", appearance: "danger" });
      } else if (issue.dueDate && issue.dueDate <= soon) {
        dueSoon.push({ issue, reason: "마감 임박", appearance: "warning" });
      } else if (issue.assigneeId === null && issue.priority === "high") {
        unassigned.push({ issue, reason: "담당자 필요", appearance: "info" });
      }
    }
    const byDue = (a: Recommendation, b: Recommendation) =>
      (a.issue.dueDate ?? "9999").localeCompare(b.issue.dueDate ?? "9999");
    return [...overdue.sort(byDue), ...dueSoon.sort(byDue), ...unassigned].slice(0, 8);
  }, [issues, statusMeta]);

  const myIssues = useMemo(
    () =>
      (issues ?? [])
        .filter((i) => me && i.assigneeId === me.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [issues, me],
  );

  const recentIssues = useMemo(
    () => [...(issues ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 15),
    [issues],
  );

  /** 최근 업데이트를 날짜 그룹으로 — 그룹 등장 순서 유지 */
  const recentGroups = useMemo(() => {
    const groups: { label: string; items: Issue[] }[] = [];
    for (const issue of recentIssues) {
      const label = dateBucket(issue.updatedAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(issue);
      else groups.push({ label, items: [issue] });
    }
    return groups;
  }, [recentIssues]);

  const starredProjects = useMemo(
    () => projects.filter((p) => starredIds.includes(p.id)),
    [projects, starredIds],
  );

  if (issues === null || me === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="홈 불러오는 중" />
      </div>
    );
  }

  /** 이슈 행 — 지라 홈 리스트 행 모방: 글리프 · 제목/메타 2줄 · (사유) · 상태 */
  const issueRow = (issue: Issue, reason?: Recommendation) => {
    const ws = statusMeta[issue.projectId]?.[issue.status];
    const statusList = ws ? [ws] : undefined;
    return (
      <li key={issue.id}>
        <button type="button" className="home-row" onClick={() => openIssue(issue)}>
          <IssueTypeGlyph type={issue.type} />
          <span className="home-row-main">
            <span className="home-row-title">{issue.title}</span>
            <span className="home-row-meta">
              {issue.key} · {projectName(issue.projectId)} · {relTime(issue.updatedAt)}
            </span>
          </span>
          {reason ? <Lozenge appearance={reason.appearance}>{reason.reason}</Lozenge> : null}
          <Lozenge appearance={statusAppearance(statusList, issue.status)}>
            {statusName(statusList, issue.status)}
          </Lozenge>
        </button>
      </li>
    );
  };

  const projectRow = (project: Project) => (
    <li key={project.id}>
      <button
        type="button"
        className="home-row"
        onClick={() => navigate(`/projects/${project.id}/board`)}
      >
        <ProjectAvatar project={project} size="sm" />
        <span className="home-row-main">
          <span className="home-row-title">{project.name}</span>
          <span className="home-row-meta">{project.key} · 프로젝트</span>
        </span>
      </button>
    </li>
  );

  const todayLabel = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <main className="project-list-content home-page">
      <header className="home-greeting">
        <p className="home-greeting-date">{todayLabel}</p>
        <h1 className="home-greeting-title">안녕하세요, {me.name}님</h1>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          title="아직 프로젝트가 없습니다"
          description="첫 프로젝트를 만들어 보드를 시작하세요."
          primaryAction={{ label: "첫 프로젝트 만들기", onClick: () => navigate("/projects/new") }}
        />
      ) : (
        <>
          <section className="home-resume" aria-label="이어서 하기">
            <h2 className="home-section-title">이어서 하기</h2>
            <div className="home-resume-cards" data-testid="resume-cards">
              {resumeProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="home-resume-card"
                  onClick={() => navigate(`/projects/${project.id}/board`)}
                >
                  <ProjectAvatar project={project} size="md" />
                  <span className="home-resume-card-body">
                    <span className="home-resume-card-title">{project.name}</span>
                    <span className="home-resume-card-meta">{project.key} · 프로젝트</span>
                  </span>
                </button>
              ))}
              {resumeIssues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className="home-resume-card"
                  onClick={() => openIssue(issue)}
                >
                  <span className="home-resume-card-glyph">
                    <IssueTypeGlyph type={issue.type} />
                  </span>
                  <span className="home-resume-card-body">
                    <span className="home-resume-card-title">{issue.title}</span>
                    <span className="home-resume-card-meta">
                      {issue.key} · {relTime(issue.updatedAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <Tabs
            label="For you"
            className="home-tabs"
            items={[
              {
                value: "recommended",
                label: "추천 작업",
                content:
                  recommendations.length === 0 ? (
                    <EmptyState
                      title="모두 따라잡았습니다"
                      description="기한이 지났거나 임박한 이슈, 담당자가 필요한 이슈가 없습니다."
                    />
                  ) : (
                    <ul className="home-issue-list" data-testid="recommended-issues">
                      {recommendations.map((rec) => issueRow(rec.issue, rec))}
                    </ul>
                  ),
              },
              {
                value: "assigned",
                label: `나에게 배정됨${myIssues.length > 0 ? ` ${myIssues.length}` : ""}`,
                content:
                  myIssues.length === 0 ? (
                    <EmptyState
                      title="담당하고 있는 이슈가 없습니다"
                      description="이슈 상세에서 담당자를 지정하면 여기에 모입니다."
                    />
                  ) : (
                    <ul className="home-issue-list" data-testid="my-issues">
                      {myIssues.map((issue) => issueRow(issue))}
                    </ul>
                  ),
              },
              {
                value: "recent",
                label: "최근 업데이트",
                content: (
                  <div data-testid="recent-issues">
                    {recentGroups.map((group) => (
                      <section key={group.label} className="home-date-group">
                        <h3 className="home-date-group-title">{group.label}</h3>
                        <ul className="home-issue-list">
                          {group.items.map((issue) => issueRow(issue))}
                        </ul>
                      </section>
                    ))}
                  </div>
                ),
              },
              {
                value: "starred",
                label: "별표",
                content:
                  starredProjects.length === 0 ? (
                    <EmptyState
                      title="별표한 항목이 없습니다"
                      description="사이드바에서 프로젝트에 별표를 붙이면 여기에 모입니다."
                    />
                  ) : (
                    <ul className="home-issue-list" data-testid="starred-projects">
                      {starredProjects.map(projectRow)}
                    </ul>
                  ),
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
