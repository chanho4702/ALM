import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, Lozenge, Tabs } from "@chanho/react";
import type { Issue, Project, User, WorkflowStatus } from "../store/types";
import {
  findIssues,
  getCurrentUser,
  getIssueByKey,
  listProjects,
  statusMetaByProject,
} from "../store/jiraStore";
import {
  forgetViewedIssues,
  listRecentProjectIds,
  listStarredProjectIds,
  listViewedIssues,
  VIEWED_ISSUES_CHANGED_EVENT,
} from "../store/uiStore";
import { settleWithConcurrency } from "../store/concurrency";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { StatusGlyph } from "../components/StatusGlyph";
import {
  statusAppearance,
  statusName,
} from "../components/labels";
import { relTime } from "../components/time";
import { ListSkeleton, PageSkeleton } from "../components/Skeletons";

/** 최근 업데이트·최근 본 탭의 날짜 그룹 (지라: Today / Yesterday / …) */
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

/** 최근 업데이트 탭 건수 */
const RECENT_LIMIT = 15;
/** 추천 작업 최대 건수 */
const RECOMMEND_LIMIT = 8;
/** 나에게 배정됨 탭이 보여 주는 최대 건수 — 넘으면 전체 건수와 함께 "일부만 표시"를 알린다 */
const ASSIGNED_LIMIT = 50;
/** 담당자 필요 후보를 고를 때 읽는 최대 건수(마감 임박분은 앞 사유로 빠지므로 여유 있게) */
const UNASSIGNED_SCAN = 50;

/** 최근 본 탭 — 기록(키·연 시각)을 이슈로 되살린 결과. 기록 순서(최신순)를 그대로 둔다 */
type ViewedState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: { issue: Issue; viewedAt: string }[] };

/** 날짜 그룹으로 묶는다 — 입력 순서(최신순)대로 그룹이 등장한다 */
function groupByDate<T>(items: readonly T[], at: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dateBucket(at(item));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** 홈이 서버에서 받는 조각들 — 이슈 전량이 아니라 목적별 상위 N건과 건수(total)다 */
interface HomeData {
  recent: Issue[];
  assigned: { items: Issue[]; total: number };
  overdue: { items: Issue[]; total: number };
  dueSoon: { items: Issue[]; total: number };
  unassignedHigh: Issue[];
  /** 추천·요약의 마감 임박 기준일(YYYY-MM-DD) — 조회할 때의 값을 그대로 쓴다 */
  soon: string;
}

/**
 * 지라의 For you 홈 모방 — 인사말 → "이어서 하기" 카드 → 추천 작업/배정/최근/별표 탭.
 * 모든 데이터는 볼 수 있는 전 프로젝트 합산이며, 서버 검색 조건(미완료·마감일 범위·정렬·상위 N)으로 받는다 —
 * 프로젝트마다 이슈 전량을 내려받지 않는다.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [home, setHome] = useState<HomeData | null>(null); // null = 로딩 중
  const [statusMeta, setStatusMeta] = useState<Record<string, Record<string, WorkflowStatus>>>({});
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [tab, setTab] = useState("recommended"); // 오늘 요약 줄에서 탭을 바꿀 수 있게 제어 모드
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [viewed, setViewed] = useState<ViewedState>({ status: "loading" });
  /** 최근 본을 다시 읽을 때 올린다(오류 후 다시 시도) */
  const [viewedReload, setViewedReload] = useState(0);
  /** 이미 읽은 viewedReload 값 — 탭을 오가도 다시 읽지 않는다 */
  const viewedLoadedFor = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const updatedDesc = { field: "updated", dir: "desc" } as const;
      const dueAsc = { field: "due", dir: "asc" } as const;
      // 목적별 검색을 바로 병렬로 시작한다 — 사용자·상태 메타·프로젝트 조회를 기다리지 않는다.
      // "나에게 배정됨"만 사용자 id가 필요해 사용자 조회 뒤에 이어 붙는다.
      const currentUserData = getCurrentUser();
      const [currentUser, recent, assigned, overdue, dueSoon, unassignedHigh, projectList, meta, recents, starred] =
        await Promise.all([
          currentUserData,
          findIssues({}, { page: 0, size: RECENT_LIMIT }, updatedDesc),
          currentUserData.then((user) =>
            findIssues({ assigneeIds: [user.id], openOnly: true }, { page: 0, size: ASSIGNED_LIMIT }, updatedDesc),
          ),
          // 추천 순서: 기한 지남 → 마감 임박(7일) → 높은 우선순위 미배정. total이 오늘 요약 건수다
          findIssues({ openOnly: true, dueBefore: today }, { page: 0, size: RECOMMEND_LIMIT }, dueAsc),
          findIssues({ openOnly: true, dueFrom: today, dueTo: soon }, { page: 0, size: RECOMMEND_LIMIT }, dueAsc),
          findIssues(
            { openOnly: true, assigneeIds: ["unassigned"], priorities: ["high"] },
            { page: 0, size: UNASSIGNED_SCAN },
            updatedDesc,
          ),
          listProjects(),
          statusMetaByProject(),
          listRecentProjectIds(),
          listStarredProjectIds(),
        ]);
      if (cancelled) return;
      setMe(currentUser);
      setProjects(projectList);
      setStatusMeta(meta);
      setRecentIds(recents);
      setStarredIds(starred);
      setHome({
        recent: recent.items,
        assigned: { items: assigned.items, total: assigned.total },
        overdue: { items: overdue.items, total: overdue.total },
        dueSoon: { items: dueSoon.items, total: dueSoon.total },
        unassignedHigh: unassignedHigh.items,
        soon,
      });
    })().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.");
    });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  // 최근 본 캐시 무효화 — 탭을 떠나면 다음 진입 때 다시 읽고, 이슈를 열어 기록이 바뀌면(홈에 머문 채 다른 탭에서
  // 연 경우 포함) 다음 표시 때 새 기록을 읽는다. 지금 "최근 본"을 보고 있으면 바로 다시 읽는다.
  useEffect(() => {
    if (tab !== "viewed") viewedLoadedFor.current = null;
  }, [tab]);
  useEffect(() => {
    const onViewedChanged = () => setViewedReload((value) => value + 1);
    window.addEventListener(VIEWED_ISSUES_CHANGED_EVENT, onViewedChanged);
    return () => window.removeEventListener(VIEWED_ISSUES_CHANGED_EVENT, onViewedChanged);
  }, []);

  /**
   * 최근 본 — 탭을 처음 열 때 기록을 읽어 이슈로 되살린다(최대 20건, 동시 5건).
   * 없어진 이슈(삭제·프로젝트 삭제·이동으로 키 변경 = 조회 결과 없음)는 조용히 빼고 기록에서도 지운다.
   * 권한·일시 오류로 일부만 실패하면 이번 표시에서만 빼고, 전부 실패하면 빈 목록이 아니라 오류로 보여 준다.
   */
  useEffect(() => {
    if (tab !== "viewed" || me === null || viewedLoadedFor.current === viewedReload) return;
    viewedLoadedFor.current = viewedReload;
    let cancelled = false;
    let done = false;
    setViewed({ status: "loading" });
    void (async () => {
      const entries = await listViewedIssues(me.id);
      const results = await settleWithConcurrency(entries, (entry) => getIssueByKey(entry.key));
      if (cancelled) return;
      const items: { issue: Issue; viewedAt: string }[] = [];
      const gone: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected") return;
        if (result.value) items.push({ issue: result.value, viewedAt: entries[index].viewedAt });
        else gone.push(entries[index].key);
      });
      const allFailed = entries.length > 0 && results.every((result) => result.status === "rejected");
      done = true;
      setViewed(allFailed ? { status: "error" } : { status: "ready", items });
      void forgetViewedIssues(me.id, gone);
    })().catch(() => {
      if (cancelled) return;
      done = true;
      setViewed({ status: "error" });
    });
    return () => {
      cancelled = true;
      // 읽는 도중 탭을 떠나면 다음에 탭을 열 때 다시 읽는다(로딩에 멈춰 있지 않게)
      if (!done) viewedLoadedFor.current = null;
    };
  }, [tab, me, viewedReload]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "알 수 없음";
  const openIssue = (issue: Issue) =>
    navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`);


  /**
   * 이어서 하기 — 최근 방문 프로젝트(없으면 전체 앞순) + 최근 업데이트 이슈.
   * 지라처럼 한 줄(최대 4장)로 끊는다: 프로젝트 2장까지, 남는 자리를 이슈로 채운다.
   */
  const RESUME_MAX = 4;
  const resumeProjects = useMemo(() => {
    const byRecent = recentIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => Boolean(p));
    const rest = projects.filter((p) => !recentIds.includes(p.id));
    return [...byRecent, ...rest].slice(0, 2);
  }, [recentIds, projects]);

  const recentIssues = home?.recent ?? [];
  const resumeIssues = recentIssues.slice(0, Math.max(0, RESUME_MAX - resumeProjects.length));

  /** 추천 작업 — 기한 지남 > 마감 임박(일주일) > 높은 우선순위 미배정(마감 임박분은 앞 사유로 이미 잡힌다) */
  const recommendations = useMemo<Recommendation[]>(() => {
    if (!home) return [];
    const overdue = home.overdue.items.map((issue): Recommendation => ({ issue, reason: "기한 지남", appearance: "danger" }));
    const dueSoon = home.dueSoon.items.map((issue): Recommendation => ({ issue, reason: "마감 임박", appearance: "warning" }));
    const unassigned = home.unassignedHigh
      .filter((issue) => !(issue.dueDate && issue.dueDate <= home.soon))
      .map((issue): Recommendation => ({ issue, reason: "담당자 필요", appearance: "info" }));
    return [...overdue, ...dueSoon, ...unassigned].slice(0, RECOMMEND_LIMIT);
  }, [home]);

  /** 오늘 요약 — 기한 지남/이번 주 마감(추천 작업과 같은 기준: 미완료 + 마감일 기준 7일). 서버 total이다 */
  const dueCounts = { overdue: home?.overdue.total ?? 0, thisWeek: home?.dueSoon.total ?? 0 };

  const myIssues = home?.assigned.items ?? [];
  const myIssueTotal = home?.assigned.total ?? 0;

  /** 최근 업데이트를 날짜 그룹으로 — 그룹 등장 순서 유지 */
  const recentGroups = useMemo(() => groupByDate(recentIssues, (issue) => issue.updatedAt), [recentIssues]);

  /** 최근 본을 연 날짜로 묶는다(수정 시각이 아니라 내가 본 시각) */
  const viewedGroups = useMemo(
    () => (viewed.status === "ready" ? groupByDate(viewed.items, (item) => item.viewedAt) : []),
    [viewed],
  );

  const starredProjects = useMemo(
    () => projects.filter((p) => starredIds.includes(p.id)),
    [projects, starredIds],
  );

  if (loadError !== null) {
    return (
      <main className="project-list-content home-page">
        <div role="alert">
          <EmptyState
            title="홈을 불러오지 못했습니다"
            description={loadError}
            primaryAction={{ label: "다시 시도", onClick: () => setRetry((value) => value + 1) }}
          />
        </div>
      </main>
    );
  }

  if (home === null || me === null) {
    return (
      <PageSkeleton label="홈 불러오는 중" lines={10} />
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
          <span className="status-cell">
            <StatusGlyph status={issue.status} statuses={statusList} variant="icon" />
            <Lozenge appearance={statusAppearance(statusList, issue.status)}>
              {statusName(statusList, issue.status)}
            </Lozenge>
          </span>
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
        {projects.length > 0 ? (
          // 오늘 요약 — 이미 계산한 값 재사용, 누르면 해당 탭으로 이동한다
          <p className="home-greeting-summary" data-testid="home-summary">
            <button type="button" onClick={() => setTab("assigned")}>
              나에게 배정 {myIssueTotal}
            </button>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => setTab("recommended")}>
              기한 지남 {dueCounts.overdue}
            </button>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => setTab("recommended")}>
              이번 주 마감 {dueCounts.thisWeek}
            </button>
          </p>
        ) : null}
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
            value={tab}
            onValueChange={setTab}
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
                label: `나에게 배정됨${myIssueTotal > 0 ? ` ${myIssueTotal}` : ""}`,
                content:
                  myIssues.length === 0 ? (
                    <EmptyState
                      title="담당하고 있는 이슈가 없습니다"
                      description="이슈 상세에서 담당자를 지정하면 여기에 모입니다."
                    />
                  ) : (
                    <>
                      <ul className="home-issue-list" data-testid="my-issues">
                        {myIssues.map((issue) => issueRow(issue))}
                      </ul>
                      {myIssueTotal > myIssues.length ? (
                        <p className="home-list-note">
                          {`최근 수정한 ${myIssues.length}건만 표시합니다(전체 ${myIssueTotal}건) — 나머지는 검색에서 확인하세요.`}
                        </p>
                      ) : null}
                    </>
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
              {
                value: "viewed",
                label: "최근 본",
                content:
                  viewed.status === "error" ? (
                    <div role="alert">
                      <EmptyState
                        title="최근 본 이슈를 불러오지 못했습니다"
                        description="잠시 후 다시 시도해 주세요."
                        primaryAction={{ label: "다시 시도", onClick: () => setViewedReload((value) => value + 1) }}
                      />
                    </div>
                  ) : viewed.status !== "ready" ? (
                    <ListSkeleton label="최근 본 이슈 불러오는 중" rows={5} />
                  ) : viewed.items.length === 0 ? (
                    <EmptyState
                      title="최근 본 이슈가 없습니다"
                      description="이슈 상세를 열면 여기에 최근 본 순서대로 모입니다."
                    />
                  ) : (
                    <div data-testid="viewed-issues">
                      {viewedGroups.map((group) => (
                        <section key={group.label} className="home-date-group">
                          <h3 className="home-date-group-title">{group.label}</h3>
                          <ul className="home-issue-list">
                            {group.items.map((item) => issueRow(item.issue))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ),
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
