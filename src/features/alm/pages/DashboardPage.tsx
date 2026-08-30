import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Card, EmptyState, Lozenge, ProgressBar, Spinner } from "@chanho/react";
import type { Issue, Sprint, StatusKind, User, WorkflowStatus } from "../store/types";
import { listIssues, listProjectStatuses, listSprints, listUsers } from "../store/jiraStore";
import {
  KIND_LABELS,
  estimateSummary,
  formatPlannedRange,
  statusKind,
} from "../components/labels";
import {
  assigneeLead,
  DistributionList,
  IssueMiniList,
  type IssueMiniRow,
} from "../components/DashboardCards";
import { useIssueModal } from "../components/useIssueModal";
import {
  assigneeDistribution,
  dueRows,
  recentlyUpdated,
  remainingDays,
  statusDistribution,
  todayKey,
  workProgress,
} from "./dashboardMetrics";

/** 상태 카운트 타일 — 색 액센트는 상태 언어(neutral/info/success)를 따른다 */
const STAT_TILES: { key: string; label: string; kind: StatusKind | null; tone: string }[] = [
  { key: "total", label: "전체 이슈", kind: null, tone: "brand" },
  { key: "todo", label: KIND_LABELS.new, kind: "new", tone: "neutral" },
  { key: "inprogress", label: KIND_LABELS.active, kind: "active", tone: "info" },
  { key: "done", label: KIND_LABELS.complete, kind: "complete", tone: "success" },
];

/** 상대 시간 — 요약 목록의 "무엇이 방금 움직였나"용 */
function relativeTime(iso: string, now = Date.now()): string {
  const diffMinutes = Math.round((now - Date.parse(iso)) / 60000);
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}일 지남`;
  if (daysLeft === 0) return "오늘 마감";
  return `${daysLeft}일 남음`;
}

/**
 * 프로젝트 요약 — "지금 이 프로젝트가 어떤 상태인가"를 첫 화면에서 답한다.
 * 설계: docs/superpowers/specs/2026-08-28-project-summary-dashboard-design.md
 */
export function DashboardPage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);

  // 프로젝트를 바꾸는 중에 먼저 시작한 조회가 늦게 끝나면 이전 프로젝트 데이터로 화면을 덮는다.
  // 세대 번호로 마지막 요청만 반영한다(모달 저장 후 재조회도 같은 경로를 쓴다).
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    const [issueList, userList, statusList, sprintList] = await Promise.all([
      listIssues(projectId),
      listUsers(),
      listProjectStatuses(projectId),
      listSprints(projectId),
    ]);
    if (mine !== generation.current) return;
    setIssues(issueList);
    setUsers(userList);
    setStatuses(statusList);
    setSprints(sprintList);
  }, [projectId]);

  useEffect(() => {
    setIssues(null); // 프로젝트가 바뀌면 이전 데이터를 보여주지 않고 로딩으로 되돌린다
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const today = todayKey();
  const rows = issues ?? [];

  const counts = useMemo(() => {
    const byKind: Record<StatusKind, number> = { new: 0, active: 0, complete: 0 };
    for (const issue of rows) byKind[statusKind(statuses, issue.status)] += 1;
    return byKind;
  }, [rows, statuses]);

  const progress = useMemo(() => workProgress(rows, statuses), [rows, statuses]);
  const risky = useMemo(() => dueRows(rows, statuses, today), [rows, statuses, today]);
  const overdueCount = risky.filter((row) => row.overdue).length;
  const activeSprint = sprints.find((sprint) => sprint.state === "active") ?? null;
  const sprintIssues = useMemo(
    () => (activeSprint ? rows.filter((issue) => issue.sprintId === activeSprint.id) : []),
    [rows, activeSprint],
  );
  const sprintProgress = useMemo(
    () => workProgress(sprintIssues, statuses),
    [sprintIssues, statuses],
  );

  if (issues === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="대시보드 불러오는 중" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="아직 이슈가 없습니다"
        description="백로그에서 첫 이슈를 만들면 현황이 여기에 나타납니다."
      />
    );
  }

  const total = rows.length;
  const sprintEstimate = estimateSummary(sprintIssues);
  const sprintDaysLeft = activeSprint ? remainingDays(activeSprint.plannedEnd, today) : null;

  return (
    <>
      <div className="dashboard">
        <div className="dashboard-stats">
          {STAT_TILES.map((tile) => (
            <Card key={tile.key} padding="md" className={`stat-tile stat-tile-${tile.tone}`}>
              <span className="stat-tile-label">{tile.label}</span>
              <span className="stat-tile-value" data-testid={`stat-${tile.key}`}>
                {tile.kind ? counts[tile.kind] : total}
              </span>
              <span className="stat-tile-sub">
                {tile.kind
                  ? `전체의 ${Math.round((counts[tile.kind] / total) * 100)}%`
                  : "프로젝트 누적"}
              </span>
            </Card>
          ))}
        </div>

        <div className="dashboard-grid">
          <Card padding="md" title="활성 스프린트" role="region" aria-label="활성 스프린트">
            {activeSprint ? (
              <div className="dash-sprint">
                <p className="dash-sprint-name">{activeSprint.name}</p>
                {activeSprint.goal ? (
                  <p className="dash-sprint-goal">{activeSprint.goal}</p>
                ) : (
                  <p className="dash-empty">목표가 아직 없습니다. 백로그에서 계획을 적어보세요.</p>
                )}
                <p className="dash-sprint-meta">
                  {formatPlannedRange(activeSprint.plannedStart, activeSprint.plannedEnd) || "기간 미설정"}
                  {sprintDaysLeft === null
                    ? ""
                    : sprintDaysLeft < 0
                      ? ` · 종료 예정일 ${-sprintDaysLeft}일 지남`
                      : ` · ${sprintDaysLeft}일 남음`}
                </p>
                <p className="dash-sprint-progress">
                  {`${sprintProgress.total}개 중 ${sprintProgress.done}개 완료`}
                </p>
                <ProgressBar
                  label="활성 스프린트 완료율"
                  value={sprintProgress.percent}
                  variant="success"
                />
                <p className="dash-sprint-meta">
                  예상 {sprintEstimate.totalHours}h
                  {sprintEstimate.missing > 0 ? ` · 미입력 ${sprintEstimate.missing}건` : ""}
                </p>
              </div>
            ) : (
              <p className="dash-empty">
                진행 중인 스프린트가 없습니다. 백로그에서 스프린트를 시작하세요.
              </p>
            )}
          </Card>

          <Card padding="md" title="완료 진행" role="region" aria-label="완료 진행">
            <div className="dash-progress">
              <span className="dash-progress-value">{progress.percent}%</span>
              <span className="dash-progress-sub">{`${progress.done} / ${progress.total} 완료`}</span>
              <ProgressBar label="프로젝트 완료율" value={progress.percent} variant="success" />
              <div className="dash-progress-flags">
                <Lozenge appearance={risky.length - overdueCount > 0 ? "warning" : "neutral"}>
                  {`마감 임박 ${risky.length - overdueCount}건`}
                </Lozenge>
                <Lozenge appearance={overdueCount > 0 ? "danger" : "neutral"}>
                  {`지연 ${overdueCount}건`}
                </Lozenge>
              </div>
            </div>
          </Card>

          <Card padding="md" title="상태별 분포" role="region" aria-label="상태별 분포">
            <DistributionList
              rows={statusDistribution(rows, statuses)}
              testId="status-stats"
              emptyText="워크플로 상태가 없습니다."
            />
          </Card>

          <Card padding="md" title="담당자별 작업량" role="region" aria-label="담당자별 작업량">
            <DistributionList
              rows={assigneeDistribution(rows, users)}
              testId="assignee-stats"
              emptyText="배정된 이슈가 없습니다."
              lead={assigneeLead}
            />
          </Card>

          <Card padding="md" title="마감 임박·지연" role="region" aria-label="마감 임박·지연">
            <IssueMiniList
              rows={risky.slice(0, 5).map<IssueMiniRow>((row) => ({
                issue: row.issue,
                meta: (
                  <Lozenge appearance={row.overdue ? "danger" : "warning"}>
                    {dueLabel(row.daysLeft)}
                  </Lozenge>
                ),
              }))}
              statuses={statuses}
              emptyText="마감이 임박한 이슈가 없습니다."
              onOpen={openIssue}
            />
          </Card>

          <Card padding="md" title="최근 업데이트" role="region" aria-label="최근 업데이트">
            <IssueMiniList
              rows={recentlyUpdated(rows).map<IssueMiniRow>((issue) => ({
                issue,
                meta: relativeTime(issue.updatedAt),
              }))}
              statuses={statuses}
              emptyText="최근 변경이 없습니다."
              onOpen={openIssue}
            />
          </Card>
        </div>
      </div>
      {issueModal}
    </>
  );
}
