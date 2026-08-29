import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  Card,
  EmptyState,
  Lozenge,
  Radio,
  RadioGroup,
  Select,
  Spinner,
} from "@chanho/react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Issue, IssueChange, Sprint, WorkflowStatus } from "../store/types";
import {
  listIssues,
  listProjectChanges,
  listProjectStatuses,
  listSprints,
  listUsers,
} from "../store/jiraStore";
import type { User } from "../store/types";
import { useIssueModal } from "../components/useIssueModal";
import { IssueMiniList, type IssueMiniRow } from "../components/DashboardCards";
import { estimateSummary, formatPlannedRange, RESOLUTION_LABELS } from "../components/labels";
import { todayKey } from "./dashboardMetrics";
import { burndownSeries, sprintReport, type BurndownUnit } from "./reportMetrics";

const UNIT_LABELS: Record<BurndownUnit, string> = { hours: "예상 시간", count: "이슈 수" };

/** 스프린트 선택 우선순위 — 진행 중 → 가장 최근 완료 → 가장 최근 계획 */
function defaultSprint(sprints: Sprint[]): Sprint | null {
  return (
    sprints.find((s) => s.state === "active") ??
    [...sprints].reverse().find((s) => s.state === "done") ??
    sprints.at(-1) ??
    null
  );
}

/**
 * 리포트 — 번다운과 스프린트 리포트. 집계는 `reportMetrics`가 하고 이 화면은 배치·표기만 한다.
 * 설계: docs/superpowers/specs/2026-08-29-sprint-report-burndown-design.md
 */
export function ReportsPage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [changes, setChanges] = useState<IssueChange[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [unit, setUnit] = useState<BurndownUnit>("hours");

  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    const [issueList, sprintList, statusList, changeList, userList] = await Promise.all([
      listIssues(projectId),
      listSprints(projectId),
      listProjectStatuses(projectId),
      listProjectChanges(projectId),
      listUsers(),
    ]);
    if (mine !== generation.current) return;
    setIssues(issueList);
    setSprints(sprintList);
    setStatuses(statusList);
    setChanges(changeList);
    setUsers(userList);
    setSprintId((current) => current ?? defaultSprint(sprintList)?.id ?? null);
  }, [projectId]);

  useEffect(() => {
    setIssues(null);
    setSprintId(null);
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);
  const today = todayKey();
  const sprint = sprints.find((s) => s.id === sprintId) ?? null;

  const series = useMemo(() => {
    if (!sprint || !issues) return null;
    return burndownSeries({ sprint, issues, changes, statuses, unit, today });
  }, [sprint, issues, changes, statuses, unit, today]);

  const report = useMemo(() => {
    if (!sprint || !issues) return null;
    return sprintReport({
      sprint,
      issues,
      changes,
      statuses,
      sprints,
      now: new Date().toISOString(),
    });
  }, [sprint, issues, changes, statuses, sprints]);

  const userNames = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user.name])),
    [users],
  );

  if (issues === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="리포트 불러오는 중" />
      </div>
    );
  }

  if (sprints.length === 0 || !sprint || !series || !report) {
    return (
      <EmptyState
        title="아직 스프린트가 없습니다"
        description="백로그에서 스프린트를 만들고 시작하면 번다운과 리포트가 나타납니다."
      />
    );
  }

  const unitSuffix = series.unit === "hours" ? "h" : "건";
  const completedEstimate = estimateSummary(report.completed);

  return (
    <>
      <div className="dashboard">
        <div className="reports-toolbar">
          <Select
            label="스프린트"
            value={sprint.id}
            options={sprints.map((item) => ({
              value: item.id,
              label: `${item.name}${item.state === "active" ? " (진행 중)" : item.state === "done" ? " (완료)" : ""}`,
            }))}
            onValueChange={setSprintId}
          />
          <p className="dash-sprint-meta">
            {formatPlannedRange(sprint.plannedStart, sprint.plannedEnd) || "기간 미설정"}
            {sprint.goal ? ` · ${sprint.goal}` : ""}
          </p>
        </div>

        <Card padding="md" title="번다운" role="region" aria-label="번다운">
          <div className="reports-burndown">
            <RadioGroup
              value={unit}
              onValueChange={(next) => setUnit(next as BurndownUnit)}
              aria-label="번다운 단위"
              className="reports-units"
            >
              <Radio value="hours" label={UNIT_LABELS.hours} />
              <Radio value="count" label={UNIT_LABELS.count} />
            </RadioGroup>

            {series.unit === "hours" && series.missingEstimates > 0 ? (
              <p className="reports-warning">
                {`예상 미입력 ${series.missingEstimates}건 — 이 이슈는 시간 합계에 들어가지 않습니다. 이슈 수 기준으로도 확인하세요.`}
              </p>
            ) : null}

            {series.historyMissing > 0 ? (
              <p className="reports-warning">
                {`변경 이력이 없어 현재 상태로 대신 계산한 이슈 ${series.historyMissing}건 — 그 이슈는 선이 평평합니다. 이력 기록 이전에 만들어진 데이터입니다.`}
              </p>
            ) : null}

            {series.poolSize === 0 ? (
              <p className="dash-empty">이 스프린트에는 이슈가 없습니다.</p>
            ) : series.started ? (
              <>
                <div
                  className="reports-chart"
                  role="img"
                  aria-label={`${sprint.name} 번다운. 시작 총량 ${series.total}${unitSuffix}, 마지막 잔여 ${
                    [...series.points].reverse().find((point) => point.remaining !== null)?.remaining ?? 0
                  }${unitSuffix}`}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={series.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="var(--chanho-color-border-default)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value: string) => value.slice(5)}
                        stroke="var(--chanho-color-text-subtle)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--chanho-color-text-subtle)" fontSize={12} width={36} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--chanho-color-background-surface-overlay)",
                          border: "1px solid var(--chanho-color-border-default)",
                          borderRadius: "var(--chanho-radius-medium)",
                          color: "var(--chanho-color-text-default)",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={24}
                        wrapperStyle={{ fontSize: 12, color: "var(--chanho-color-text-subtle)" }}
                      />
                      {/* 기준선은 점선, 잔여선은 실선 — 색만으로 구분하지 않는다 */}
                      <Line
                        name="기준선"
                        type="linear"
                        dataKey="ideal"
                        stroke="var(--chanho-color-text-subtle)"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        name="잔여"
                        type="stepAfter"
                        dataKey="remaining"
                        stroke="var(--chanho-color-background-brand)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <details className="reports-table">
                  <summary>표로 보기</summary>
                  <table aria-label="번다운 값">
                    <thead>
                      <tr>
                        <th scope="col">날짜</th>
                        <th scope="col">잔여</th>
                        <th scope="col">기준선</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.points.map((point) => (
                        <tr key={point.date}>
                          <td>{point.date}</td>
                          <td>{point.remaining === null ? "—" : `${point.remaining}${unitSuffix}`}</td>
                          <td>{`${point.ideal}${unitSuffix}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <p className="dash-empty">
                시작하지 않은 스프린트입니다. 시작하면 번다운이 그려집니다.
              </p>
            )}
          </div>
        </Card>

        <Card padding="md" title="스프린트 리포트" role="region" aria-label="스프린트 리포트">
          <div className="reports-report">
            <div className="dash-progress-flags">
              <Lozenge appearance="success">{`완료 ${report.completed.length}건`}</Lozenge>
              <Lozenge appearance={report.notCompleted.length > 0 ? "warning" : "neutral"}>
                {`미완료 ${report.notCompleted.length}건`}
              </Lozenge>
              <Lozenge appearance="neutral">{`완료 예상 시간 ${completedEstimate.totalHours}h`}</Lozenge>
            </div>

            <section aria-label="완료 이슈">
              <h4 className="reports-group">완료</h4>
              <IssueMiniList
                rows={report.completed.map<IssueMiniRow>((issue) => ({
                  issue,
                  // "왜 끝났는가"가 회고의 재료다 — 완료됨이 아닌 해결은 눈에 띄게
                  meta: issue.resolution && issue.resolution !== "done"
                    ? `${userNames[issue.assigneeId ?? ""] ?? "미지정"} · ${RESOLUTION_LABELS[issue.resolution]}`
                    : (issue.assigneeId ? userNames[issue.assigneeId] : "미지정"),
                }))}
                statuses={statuses}
                emptyText="완료된 이슈가 없습니다."
                onOpen={openIssue}
              />
            </section>

            <section aria-label="미완료 이슈">
              <h4 className="reports-group">미완료</h4>
              <IssueMiniList
                rows={report.notCompleted.map<IssueMiniRow>((row) => ({
                  issue: row.issue,
                  meta: row.destination ? `${row.destination}로 이관` : "이 스프린트에 남아 있음",
                }))}
                statuses={statuses}
                emptyText="미완료 이슈가 없습니다."
                onOpen={openIssue}
              />
            </section>

            {report.added.length > 0 || report.removed.length > 0 ? (
              <section aria-label="스코프 변경">
                <h4 className="reports-group">스코프 변경</h4>
                <IssueMiniList
                  rows={[
                    ...report.added.map<IssueMiniRow>((issue) => ({
                      issue,
                      meta: <Lozenge appearance="warning">시작 후 추가</Lozenge>,
                    })),
                    ...report.removed.map<IssueMiniRow>((issue) => ({
                      issue,
                      meta: <Lozenge appearance="neutral">시작 후 제거</Lozenge>,
                    })),
                  ]}
                  statuses={statuses}
                  emptyText="스코프 변경이 없습니다."
                  onOpen={openIssue}
                />
              </section>
            ) : null}
          </div>
        </Card>
      </div>
      {issueModal}
    </>
  );
}
