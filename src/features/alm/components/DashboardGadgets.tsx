import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button, EmptyState, Lozenge, Spinner } from "@chanho/react";
import type { DashboardGadget, GadgetType, Issue, ProjectWorklogRow, Sprint, User, WorkflowStatus } from "../store/types";
import {
  aggregateIssues,
  findIssues,
  listAllStatuses,
  listIssues,
  listProjectChanges,
  listProjectStatuses,
  listProjectWorklogs,
  listSprints,
  listUsers,
  queryIssuesPage,
  listProjects,
} from "../store/jiraStore";
import { parseSmartQuery } from "../store/searchQuery";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";
import { priorityAppearance, priorityName, statusAppearance } from "./labels";
import { usePriorities } from "./usePriorities";
import { burnupSeries } from "../pages/reportMetricsExt";
import { todayKey } from "../pages/dashboardMetrics";
import { historySince } from "../pages/reportMetrics";
import { recentRange, worklogSummary, type WorklogSummary } from "../pages/worklogMetrics";
import { BurnupCard } from "./ReportCharts";

export const GADGET_LABELS: Record<GadgetType, string> = {
  "status-distribution": "상태 분포",
  "assignee-load": "담당자별 이슈",
  "priority-distribution": "우선순위 분포",
  "sprint-burnup": "스프린트 번업",
  "recent-issues": "최근 업데이트",
  "filter-results": "필터 결과",
  "worklog-summary": "기록 시간(워크로그)",
};

export const GADGET_DESCRIPTIONS: Record<GadgetType, string> = {
  "status-distribution": "프로젝트 이슈를 상태별로 센다",
  "assignee-load": "담당자마다 열린 이슈가 몇 개인지",
  "priority-distribution": "열린 이슈의 우선순위 분포",
  "sprint-burnup": "진행 중인 스프린트의 범위·완료 추이",
  "recent-issues": "최근 갱신된 이슈 목록",
  "filter-results": "스마트 검색 쿼리 결과",
  "worklog-summary": "기간 동안 누가 몇 시간을 기록했는지",
};

/** 프로젝트가 꼭 필요한 가젯 */
export const PROJECT_SCOPED: ReadonlySet<GadgetType> = new Set([
  "status-distribution",
  "assignee-load",
  "priority-distribution",
  "sprint-burnup",
  "worklog-summary",
]);

interface GadgetProps {
  gadget: DashboardGadget;
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    load()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function GadgetBody({ error, loading, children }: { error: string | null; loading: boolean; children: React.ReactNode }) {
  if (error) return <p className="gadget-error">{error}</p>;
  if (loading) return <Spinner size="small" label="가젯 불러오는 중" />;
  return <>{children}</>;
}

/** 가로 막대 목록 — 라벨 · 막대 · 수 */
function BarList({ rows, max }: { rows: { key: string; label: React.ReactNode; count: number }[]; max: number }) {
  if (rows.length === 0) return <p className="gadget-empty">표시할 이슈가 없습니다.</p>;
  return (
    <ul className="gadget-bars">
      {rows.map((row) => (
        <li key={row.key} className="gadget-bar-row">
          <span className="gadget-bar-label">{row.label}</span>
          <span className="gadget-bar-track" aria-hidden>
            <span className="gadget-bar-fill" style={{ width: `${max === 0 ? 0 : Math.round((row.count / max) * 100)}%` }} />
          </span>
          <span className="gadget-bar-count">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** 집계 버킷 → 키별 건수 */
const countsOf = (buckets: { key: string; count: number }[]) => new Map(buckets.map((b) => [b.key, b.count]));

export function StatusDistributionGadget({ gadget }: GadgetProps) {
  const projectId = gadget.config.projectId ?? "";
  // 이슈를 내려받아 세지 않는다 — 서버 집계(GROUP BY) 한 번 + 상태 메타
  const { data, error } = useAsync(
    async () => {
      const [aggregate, statuses] = await Promise.all([
        aggregateIssues({ projectIds: [projectId] }, "status"),
        listProjectStatuses(projectId),
      ]);
      return { counts: countsOf(aggregate.buckets), statuses };
    },
    [projectId],
  );
  const rows = useMemo(() => {
    if (!data) return [];
    // 워크플로 상태 순서대로, 0건 상태도 행으로 남긴다(이전과 같은 표시)
    return [...data.statuses]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        key: s.id,
        label: (
          <ValueWithIcon icon={<StatusGlyph status={s.id} statuses={data.statuses} variant="icon" />}>
            <Lozenge appearance={statusAppearance(data.statuses, s.id)}>{s.name}</Lozenge>
          </ValueWithIcon>
        ),
        count: data.counts.get(s.id) ?? 0,
      }));
  }, [data]);
  return (
    <GadgetBody error={error} loading={!data}>
      <BarList rows={rows} max={Math.max(0, ...rows.map((r) => r.count))} />
    </GadgetBody>
  );
}

export function AssigneeLoadGadget({ gadget }: GadgetProps) {
  const projectId = gadget.config.projectId ?? "";
  // 열린 이슈만 담당자별로 — 서버 집계(openOnly)가 완료 분류를 뺀다
  const { data, error } = useAsync(
    async () => {
      const [aggregate, users] = await Promise.all([
        aggregateIssues({ projectIds: [projectId], openOnly: true }, "assignee"),
        listUsers(),
      ]);
      return { buckets: aggregate.buckets, users };
    },
    [projectId],
  );
  const rows = useMemo(() => {
    if (!data) return [];
    // 버킷은 건수 내림차순으로 온다
    return data.buckets.map(({ key, count }) => ({
      key,
      label: key === "unassigned" ? "미지정" : (data.users.find((u) => u.id === key)?.name ?? `사용자 ${key}`),
      count,
    }));
  }, [data]);
  return (
    <GadgetBody error={error} loading={!data}>
      <BarList rows={rows} max={Math.max(0, ...rows.map((r) => r.count))} />
    </GadgetBody>
  );
}

export function PriorityDistributionGadget({ gadget }: GadgetProps) {
  const projectId = gadget.config.projectId ?? "";
  const priorities = usePriorities();
  // 열린 이슈의 우선순위 분포 — 서버 집계(openOnly)
  const { data, error } = useAsync(
    async () => ({ counts: countsOf((await aggregateIssues({ projectIds: [projectId], openOnly: true }, "priority")).buckets) }),
    [projectId],
  );
  const rows = useMemo(() => {
    if (!data) return [];
    // 레지스트리 순서대로(0건 포함), 레지스트리를 못 받았으면 나온 값만
    const ids = priorities.length > 0 ? priorities.map((p) => p.id) : [...data.counts.keys()];
    return ids
      .map((id) => ({
        key: id,
        label: (
          <ValueWithIcon
            icon={<PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />}
          >
            <Lozenge appearance={priorityAppearance(priorities, id)}>
              {priorityName(priorities, id)}
            </Lozenge>
          </ValueWithIcon>
        ),
        count: data.counts.get(id) ?? 0,
      }))
      .filter((r) => r.count > 0 || priorities.length > 0);
  }, [data, priorities]);
  return (
    <GadgetBody error={error} loading={!data}>
      <BarList rows={rows} max={Math.max(0, ...rows.map((r) => r.count))} />
    </GadgetBody>
  );
}

export function SprintBurnupGadget({ gadget }: GadgetProps) {
  const projectId = gadget.config.projectId ?? "";
  // 번업은 스프린트에 들어왔다 나간 이슈(변경 이력으로 찾는다)까지 범위에 넣으므로 스프린트 필터로
  // 좁히면 값이 틀어진다 — 프로젝트 이슈 전량을 그대로 읽는다(reportMetrics.candidates)
  const { data, error } = useAsync(
    async () => {
      const sprints = await listSprints(projectId);
      const sprint: Sprint | undefined = sprints.find((s) => s.state === "active") ?? sprints.find((s) => s.state === "planned");
      // 변경 이력은 이 스프린트 기간만(감사 A-08) — 시작 전 이력은 stateAt이 현재 값에서 거꾸로 메운다
      const since = historySince(sprint && sprint.state !== "planned" ? [sprint] : [], todayKey());
      const [issues, statuses, changes] = await Promise.all([
        listIssues(projectId),
        listProjectStatuses(projectId),
        listProjectChanges(projectId, { since }),
      ]);
      return { issues, sprint, statuses: statuses as WorkflowStatus[], changes };
    },
    [projectId],
  );
  if (data && !data.sprint) return <p className="gadget-empty">진행 중인 스프린트가 없습니다.</p>;
  const series = data?.sprint
    ? burnupSeries({ sprint: data.sprint, issues: data.issues, changes: data.changes, statuses: data.statuses, unit: "count", today: todayKey() })
    : null;
  return (
    <GadgetBody error={error} loading={!data}>
      {series && data?.sprint ? <BurnupCard series={series} sprintName={data.sprint.name} /> : null}
    </GadgetBody>
  );
}

function IssueRows({ issues, onOpen }: { issues: Issue[]; onOpen: (issue: Issue) => void }) {
  if (issues.length === 0) return <p className="gadget-empty">표시할 이슈가 없습니다.</p>;
  return (
    <ul className="issue-relation-list gadget-issues">
      {issues.map((issue) => (
        <li key={issue.id}>
          <button type="button" className="issue-relation-row" onClick={() => onOpen(issue)}>
            <IssueTypeGlyph type={issue.type} />
            <span className="issue-key-cell">{issue.key}</span>
            <span className="issue-relation-title">{issue.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RecentIssuesGadget({ gadget }: GadgetProps) {
  const navigate = useNavigate();
  const projectId = gadget.config.projectId;
  const period = gadget.config.period ?? 7;
  const { data, error } = useAsync(
    async () => {
      // 서버가 기간·정렬·상위 10건을 처리한다 — 프로젝트를 비우면 볼 수 있는 전 프로젝트
      const since = new Date();
      since.setDate(since.getDate() - period);
      const page = await findIssues(
        { projectIds: projectId ? [projectId] : undefined, updatedSince: since.toISOString() },
        { page: 0, size: 10 },
        { field: "updated", dir: "desc" },
      );
      return page.items;
    },
    [projectId, period],
  );
  return (
    <GadgetBody error={error} loading={!data}>
      <IssueRows issues={data ?? []} onOpen={(issue) => navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`)} />
    </GadgetBody>
  );
}

export function FilterResultsGadget({ gadget }: GadgetProps) {
  const navigate = useNavigate();
  const query = gadget.config.query ?? "";
  const priorities = usePriorities();
  const { data, error } = useAsync(
    async () => {
      // 상태 이름 어휘는 전역 레지스트리 한 번으로 — 프로젝트마다 상태를 따로 묻지 않는다
      const [users, projects, statuses] = await Promise.all([listUsers(), listProjects(), listAllStatuses()]);
      const parsed = parseSmartQuery(query, { users, projects, statuses, priorities });
      return (await queryIssuesPage(parsed, { page: 0, size: 10 })).items;
    },
    [query, priorities.length],
  );
  return (
    <GadgetBody error={error} loading={!data}>
      <p className="gadget-query">{query || "쿼리 없음 — 전체"}</p>
      <IssueRows issues={data ?? []} onOpen={(issue) => navigate(`/projects/${issue.projectId}/issues?issue=${issue.key}`)} />
    </GadgetBody>
  );
}

/** 워크로그 표 — 가젯과 리포트가 함께 쓴다 */
export function WorklogTable({ summary, rows }: { summary: WorklogSummary; rows: ProjectWorklogRow[] }) {
  if (rows.length === 0) return <p className="gadget-empty">기간 안에 기록된 시간이 없습니다.</p>;
  return (
    <div className="worklog-table">
      <p className="worklog-total">
        총 <strong>{summary.total}h</strong> · {summary.byAuthor.length}명 · {rows.length}건
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">사람</th>
            <th scope="col" className="worklog-num">시간</th>
            <th scope="col" className="worklog-num">비율</th>
          </tr>
        </thead>
        <tbody>
          {summary.byAuthor.map((row) => (
            <tr key={row.userId}>
              <td>{row.name}</td>
              <td className="worklog-num">{row.hours}h</td>
              <td className="worklog-num">{summary.total === 0 ? 0 : Math.round((row.hours / summary.total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorklogGadget({ gadget }: GadgetProps) {
  const projectId = gadget.config.projectId ?? "";
  const period = gadget.config.period ?? 7;
  const { data, error } = useAsync(
    async () => {
      const range = recentRange(period);
      const [rows, users] = await Promise.all([listProjectWorklogs(projectId, range), listUsers()]);
      return { rows, users: users as User[], range };
    },
    [projectId, period],
  );
  const summary = data ? worklogSummary(data.rows, data.users) : null;
  return (
    <GadgetBody error={error} loading={!data}>
      {data && summary ? (
        <>
          <p className="gadget-query">
            최근 {period}일 ({data.range.since} ~ {data.range.until})
          </p>
          <WorklogTable summary={summary} rows={data.rows} />
        </>
      ) : null}
    </GadgetBody>
  );
}

export function renderGadget(gadget: DashboardGadget) {
  switch (gadget.type) {
    case "status-distribution":
      return <StatusDistributionGadget gadget={gadget} />;
    case "assignee-load":
      return <AssigneeLoadGadget gadget={gadget} />;
    case "priority-distribution":
      return <PriorityDistributionGadget gadget={gadget} />;
    case "sprint-burnup":
      return <SprintBurnupGadget gadget={gadget} />;
    case "recent-issues":
      return <RecentIssuesGadget gadget={gadget} />;
    case "filter-results":
      return <FilterResultsGadget gadget={gadget} />;
    case "worklog-summary":
      return <WorklogGadget gadget={gadget} />;
    default:
      return <EmptyState title="알 수 없는 가젯" description={String((gadget as { type: string }).type)} />;
  }
}

export function GadgetEmptyHint({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      title="가젯이 없습니다"
      description="상태 분포, 담당자별 이슈, 기록 시간 같은 가젯을 골라 배치하세요."
      primaryAction={{ label: "가젯 추가", onClick: onAdd }}
    />
  );
}

export { Button as GadgetButton };
