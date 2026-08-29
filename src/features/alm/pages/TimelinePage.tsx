import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { EmptyState, Radio, RadioGroup, Spinner } from "@chanho/react";
import Gantt from "frappe-gantt";
import "../../../app/vendor/frappe-gantt.css";
import type { Issue, IssueLink, WorkflowStatus } from "../store/types";
import { listIssues, listIssueLinks, listProjectStatuses } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { statusCategory } from "../components/labels";

type ViewMode = "Day" | "Week" | "Month";
const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "Day", label: "일" },
  { value: "Week", label: "주" },
  { value: "Month", label: "월" },
];

/** 카테고리를 진행률로 — 간트 막대의 채움 */
const PROGRESS: Record<string, number> = { todo: 0, inprogress: 50, done: 100 };

const dayOf = (iso: string) => iso.slice(0, 10);

interface TimelineRow {
  issue: Issue;
  isChild: boolean;
  start: string;
  end: string;
}

/** 에픽 → 하위 순으로 늘어놓는다. 지라 타임라인처럼 계층이 보이게 */
function buildRows(issues: Issue[]): TimelineRow[] {
  const sorted = [...issues].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const toRow = (issue: Issue, isChild: boolean): TimelineRow => {
    const start = dayOf(issue.createdAt);
    // frappe-gantt는 날짜만 준 종료일을 하루 뒤까지로 본다 — 여기서 하루를 더하면 이틀이 된다.
    // 마감일이 없거나 시작보다 이르면 하루짜리로 눕힌다(라이브러리가 역전 구간을 거부한다).
    const end = issue.dueDate && issue.dueDate >= start ? issue.dueDate : start;
    return { issue, isChild, start, end };
  };

  const rows: TimelineRow[] = [];
  const grouped = new Set<string>();
  for (const epic of sorted.filter((issue) => issue.type === "epic")) {
    rows.push(toRow(epic, false));
    grouped.add(epic.id);
    for (const child of sorted.filter((issue) => issue.parentId === epic.id)) {
      rows.push(toRow(child, true));
      grouped.add(child.id);
    }
  }
  for (const issue of sorted) {
    if (!grouped.has(issue.id)) rows.push(toRow(issue, false));
  }
  return rows;
}

/**
 * 타임라인(간트) — 막대는 frappe-gantt(MIT)가 그린다. 좌측 이슈 목록과 일정 표는 우리 DOM이라
 * 키보드·스크린리더·테스트가 그래픽에 의존하지 않는다(차트가 못 그려져도 화면은 성립한다).
 */
export function TimelinePage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [links, setLinks] = useState<IssueLink[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("Day");
  const [chartFailed, setChartFailed] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<Gantt | null>(null);

  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    const [issueList, statusList] = await Promise.all([
      listIssues(projectId),
      listProjectStatuses(projectId),
    ]);
    // 차단 링크를 간트 의존선으로 쓴다 — 이슈별 조회라 목록을 받은 뒤에 모은다
    const linkLists = await Promise.all(issueList.map((issue) => listIssueLinks(issue.id)));
    if (mine !== generation.current) return;
    setIssues(issueList);
    setStatuses(statusList);
    // 같은 링크가 양쪽 이슈 조회에 한 번씩 나오므로 id로 중복을 걷는다
    const unique = new Map(linkLists.flat().map((view) => [view.link.id, view.link]));
    setLinks([...unique.values()]);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);
  const rows = useMemo(() => (issues ? buildRows(issues) : []), [issues]);

  const tasks = useMemo(
    () =>
      rows.map((row) => ({
        id: row.issue.id,
        name: `${row.issue.key} ${row.issue.title}`,
        start: row.start,
        end: row.end,
        progress: PROGRESS[statusCategory(statuses, row.issue.status)] ?? 0,
        dependencies: links
          .filter((link) => link.type === "blocks" && link.targetId === row.issue.id)
          .map((link) => link.sourceId)
          .join(","),
      })),
    [rows, statuses, links],
  );

  // on_click은 생성 시점의 클로저를 붙든다 — 최신 행을 ref로 읽어 stale 참조를 피한다
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /**
   * frappe-gantt는 DOM에 직접 SVG를 그리고 생성자마다 document 레벨 리스너를 건다.
   * 그래서 **인스턴스를 하나만 만들어 갱신**한다(매번 새로 만들면 리스너가 쌓인다).
   * jsdom처럼 SVG 계측이 없는 환경에서는 실패하므로 표 대체본을 항상 제공하고 상태로 남긴다.
   */
  useEffect(() => {
    const container = chartRef.current;
    if (!container || tasks.length === 0) return;
    try {
      if (!ganttRef.current) {
        ganttRef.current = new Gantt(container, tasks, {
          view_mode: viewMode,
          readonly: true,
          popup: false,
          on_click: (task) => {
            const issue = rowsRef.current.find((row) => row.issue.id === task.id)?.issue;
            if (issue) openIssue(issue.key);
          },
        });
      } else {
        ganttRef.current.refresh(tasks);
        ganttRef.current.change_view_mode(viewMode);
      }
      setChartFailed(false);
    } catch {
      setChartFailed(true);
      ganttRef.current = null;
      container.innerHTML = "";
    }
  }, [tasks, viewMode, openIssue]);

  useEffect(
    () => () => {
      ganttRef.current = null;
      if (chartRef.current) chartRef.current.innerHTML = "";
    },
    [],
  );

  if (issues === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="타임라인 불러오는 중" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="타임라인에 표시할 이슈가 없습니다"
        description="이슈를 만들면 생성일부터 마감일까지 막대로 표시됩니다."
      />
    );
  }

  return (
    <>
      <section className="timeline" data-testid="timeline">
        <div className="timeline-toolbar">
          <RadioGroup
            value={viewMode}
            onValueChange={(next) => setViewMode(next as ViewMode)}
            aria-label="보기 단위"
            className="reports-units"
          >
            {VIEW_MODES.map((mode) => (
              <Radio key={mode.value} value={mode.value} label={mode.label} />
            ))}
          </RadioGroup>
        </div>

        <ul className="timeline-legend" aria-label="타임라인 이슈">
          {rows.map((row) => (
            <li
              key={row.issue.id}
              className={row.isChild ? "timeline-issue is-child" : "timeline-issue"}
            >
              <IssueTypeGlyph type={row.issue.type} />
              <span className="issue-key-cell">{row.issue.key}</span>
              <span className="timeline-issue-title">{row.issue.title}</span>
            </li>
          ))}
        </ul>

        <div className="timeline-chart" ref={chartRef} aria-hidden />
        {chartFailed ? (
          <p className="dash-empty">
            이 환경에서는 간트 그래픽을 그릴 수 없습니다. 아래 표로 같은 일정을 볼 수 있습니다.
          </p>
        ) : null}

        <details className="reports-table" open>
          <summary>일정 표</summary>
          <table aria-label="일정 표">
            <thead>
              <tr>
                <th scope="col">이슈</th>
                <th scope="col">시작</th>
                <th scope="col">종료</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.issue.id}>
                  <td>
                    <button
                      type="button"
                      className="dash-issue-row"
                      onClick={() => openIssue(row.issue.key)}
                    >
                      <span className="dash-issue-key">{row.issue.key}</span>
                      <span className="dash-issue-title">{row.issue.title}</span>
                    </button>
                  </td>
                  <td>{row.start}</td>
                  <td>{row.end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
      {issueModal}
    </>
  );
}
