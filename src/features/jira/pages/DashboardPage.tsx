import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Avatar, Card, EmptyState, PageHeader, ProgressBar, Spinner } from "@chanho/react";
import type { Issue, IssueStatus, User } from "../store/types";
import { listIssues, listUsers } from "../store/jiraStore";
import { STATUS_LABELS } from "../components/labels";

/** 상태 카운트 타일 — 색 액센트는 상태 언어(neutral/info/success)를 따른다 */
const STAT_TILES: { key: string; label: string; status: IssueStatus | null; tone: string }[] = [
  { key: "total", label: "전체 이슈", status: null, tone: "brand" },
  { key: "todo", label: STATUS_LABELS.todo, status: "todo", tone: "neutral" },
  { key: "inprogress", label: STATUS_LABELS.inprogress, status: "inprogress", tone: "info" },
  { key: "done", label: STATUS_LABELS.done, status: "done", tone: "success" },
];

/** 프로젝트 진입 요약 — 상태별 카운트와 담당자별 분포 (스펙 §10) */
export function DashboardPage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      const [issueList, userList] = await Promise.all([listIssues(projectId), listUsers()]);
      if (cancelled) return;
      setIssues(issueList);
      setUsers(userList);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const counts = useMemo(() => {
    const byStatus: Record<IssueStatus, number> = { todo: 0, inprogress: 0, done: 0 };
    for (const issue of issues ?? []) byStatus[issue.status] += 1;
    return byStatus;
  }, [issues]);

  /** 담당자별 개수 — 유저 전원(0건 포함) + 미지정, 많은 순 정렬 */
  const assigneeRows = useMemo(() => {
    if (!issues) return [];
    const byAssignee = new Map<string | null, number>();
    for (const user of users) byAssignee.set(user.id, 0);
    byAssignee.set(null, 0);
    for (const issue of issues) {
      byAssignee.set(issue.assigneeId, (byAssignee.get(issue.assigneeId) ?? 0) + 1);
    }
    return [...byAssignee.entries()]
      .map(([id, count]) => ({
        id: id ?? "unassigned",
        name: id ? (users.find((u) => u.id === id)?.name ?? "미지정") : "미지정",
        isUser: id !== null,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [issues, users]);

  if (issues === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="대시보드 불러오는 중" />
      </div>
    );
  }

  const total = issues.length;

  return (
    <>
      <PageHeader title="대시보드" />
      {total === 0 ? (
        <EmptyState
          title="아직 이슈가 없습니다"
          description="백로그에서 첫 이슈를 만들면 현황이 여기에 나타납니다."
        />
      ) : (
        <div className="dashboard">
          <div className="dashboard-stats">
            {STAT_TILES.map((tile) => (
              <Card key={tile.key} padding="md" className={`stat-tile stat-tile-${tile.tone}`}>
                <span className="stat-tile-label">{tile.label}</span>
                <span className="stat-tile-value" data-testid={`stat-${tile.key}`}>
                  {tile.status ? counts[tile.status] : total}
                </span>
                <span className="stat-tile-sub">
                  {tile.status
                    ? `전체의 ${Math.round((counts[tile.status] / total) * 100)}%`
                    : "프로젝트 누적"}
                </span>
              </Card>
            ))}
          </div>
          <Card padding="md" title="담당자별 이슈">
            <ul className="assignee-stats" data-testid="assignee-stats">
              {assigneeRows.map((row) => (
                <li key={row.id} className="assignee-stat-row">
                  {row.isUser ? (
                    <Avatar name={row.name} size="small" />
                  ) : (
                    <span className="assignee-stat-unassigned" aria-hidden>
                      —
                    </span>
                  )}
                  <span className="assignee-stat-name">{row.name}</span>
                  <ProgressBar
                    label={`${row.name} 이슈 비율`}
                    value={Math.round((row.count / total) * 100)}
                    className="assignee-stat-bar"
                  />
                  <span className="assignee-stat-count">{row.count}개</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
