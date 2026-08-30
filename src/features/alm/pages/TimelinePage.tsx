import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useParams } from "react-router";
import { EmptyState, Radio, RadioGroup, Spinner } from "@chanho/react";
import { Gantt, Willow } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import type { Issue, IssueLink, IssueTypeDef, WorkflowStatus } from "../store/types";
import { listIssues, listIssueLinks, listProjectStatuses } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { useIssueTypes } from "../components/useIssueTypes";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { statusKind, typeLevel } from "../components/labels";

type ViewMode = "Day" | "Week" | "Month";
const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "Day", label: "일" },
  { value: "Week", label: "주" },
  { value: "Month", label: "월" },
];

/** 의미를 진행률로 — 간트 막대의 채움 */
const PROGRESS = { new: 0, active: 50, complete: 100 } as const;

const dayOf = (iso: string) => iso.slice(0, 10);
/** "YYYY-MM-DD" → 로컬 자정 Date (UTC 파싱은 하루가 밀린다) */
const localDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const fmtDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

interface TimelineRow {
  issue: Issue;
  isChild: boolean;
  parentId: string | null;
  start: string;
  end: string;
}

/** 상위(에픽) → 하위 순으로 늘어놓는다. 지라 타임라인처럼 계층이 보이게 */
function buildRows(issues: Issue[], types: IssueTypeDef[]): TimelineRow[] {
  const sorted = [...issues].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const toRow = (issue: Issue, parentId: string | null): TimelineRow => {
    const start = dayOf(issue.createdAt);
    // 마감일이 없거나 시작보다 이르면 하루짜리로 눕힌다
    const end = issue.dueDate && issue.dueDate >= start ? issue.dueDate : start;
    return { issue, isChild: parentId !== null, parentId, start, end };
  };

  const rows: TimelineRow[] = [];
  const grouped = new Set<string>();
  for (const epic of sorted.filter((issue) => typeLevel(types, issue.type) === "epic")) {
    rows.push(toRow(epic, null));
    grouped.add(epic.id);
    for (const child of sorted.filter((issue) => issue.parentId === epic.id)) {
      rows.push(toRow(child, epic.id));
      grouped.add(child.id);
    }
  }
  for (const issue of sorted) {
    if (!grouped.has(issue.id)) rows.push(toRow(issue, null));
  }
  return rows;
}

/** 보기 단위별 눈금과 칸 너비 — 상단 줄은 큰 단위, 아랫줄은 선택 단위 */
function scalesFor(mode: ViewMode) {
  const monthLong = (date: Date) =>
    date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
  switch (mode) {
    case "Day":
      return {
        cellWidth: 40,
        scales: [
          { unit: "month", step: 1, format: monthLong },
          { unit: "day", step: 1, format: (date: Date) => String(date.getDate()) },
        ],
      };
    case "Week":
      return {
        cellWidth: 84,
        scales: [
          { unit: "month", step: 1, format: monthLong },
          {
            unit: "week",
            step: 1,
            format: (date: Date) => `${date.getMonth() + 1}/${date.getDate()}~`,
          },
        ],
      };
    default:
      return {
        cellWidth: 120,
        scales: [
          { unit: "year", step: 1, format: (date: Date) => `${date.getFullYear()}년` },
          {
            unit: "month",
            step: 1,
            format: (date: Date) => date.toLocaleDateString("ko-KR", { month: "short" }),
          },
        ],
      };
  }
}

/** 차트가 렌더 중 던지면 화면 전체가 아니라 차트만 대체본으로 바꾼다 */
class ChartBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * 타임라인(간트) — SVAR React Gantt(MIT, `@svar-ui/react-gantt`)가 그리드+차트를 그린다.
 * 상위(에픽)는 요약 막대, 하위는 그 아래 접힘 트리, 차단 링크는 의존선(끝→시작)이다.
 * 그래픽을 못 그리는 환경(jsdom 등)에서는 이슈 목록과 일정 표가 같은 정보를 준다.
 */
export function TimelinePage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [links, setLinks] = useState<IssueLink[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("Day");
  const types = useIssueTypes();
  // SVG 계측이 없는 환경(jsdom)은 그리기 전에 대체본으로 보낸다 — 침묵 실패가 아니라 상태로 남긴다
  const [chartFailed, setChartFailed] = useState(
    () =>
      typeof SVGGraphicsElement === "undefined" ||
      !("getBBox" in SVGGraphicsElement.prototype),
  );

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
  const rows = useMemo(() => (issues ? buildRows(issues, types) : []), [issues, types]);

  /** 자식이 있는 상위 이슈 — 초기화 뒤 API로 펼친다 (task 데이터의 open 플래그는 라이브러리가 죽는다) */
  const parentIds = useMemo(
    () => [...new Set(rows.map((row) => row.parentId).filter((id): id is string => id !== null))],
    [rows],
  );
  const tasks = useMemo(() => {
    return rows.map((row) => ({
        id: row.issue.id,
        text: `${row.issue.key} ${row.issue.title}`,
        start: localDate(row.start),
        // 라이브러리의 end는 배타적 — 마감일 당일까지 칠하려면 하루를 더한다
        end: addDays(localDate(row.end), 1),
        progress: PROGRESS[statusKind(statuses, row.issue.status)],
        type: typeLevel(types, row.issue.type) === "epic" ? "summary" : "task",
        parent: row.parentId ?? 0,
        key: row.issue.key,
      }));
  }, [rows, statuses, types]);

  const ganttLinks = useMemo(() => {
    const ids = new Set(rows.map((row) => row.issue.id));
    return links
      .filter((link) => link.type === "blocks" && ids.has(link.sourceId) && ids.has(link.targetId))
      .map((link) => ({ id: link.id, source: link.sourceId, target: link.targetId, type: "e2s" as const }));
  }, [links, rows]);

  const { scales, cellWidth } = useMemo(() => scalesFor(viewMode), [viewMode]);
  const columns = useMemo(
    () => [
      { id: "text", header: "이슈", flexgrow: 1 },
      { id: "start", header: "시작", width: 100, template: (value: Date) => fmtDay(value) },
      // 배타적 end를 마감일로 되돌려 보여준다
      { id: "end", header: "종료", width: 100, template: (value: Date) => fmtDay(addDays(value, -1)) },
    ],
    [],
  );
  const markers = useMemo(() => [{ start: new Date(), text: "오늘", css: "timeline-today" }], []);

  // 이벤트 핸들러는 생성 시점의 클로저를 붙든다 — 최신 행을 ref로 읽어 stale 참조를 피한다
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handleSelect = (ev: { id: string | number }) => {
    const issue = rowsRef.current.find((row) => row.issue.id === String(ev.id))?.issue;
    if (issue) openIssue(issue.key);
  };

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
          <span className="timeline-hint">막대나 행을 누르면 이슈가 열립니다. 점선은 차단 관계입니다.</span>
        </div>

        {chartFailed ? (
          <>
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
            <p className="dash-empty">
              이 환경에서는 간트 그래픽을 그릴 수 없습니다. 아래 표로 같은 일정을 볼 수 있습니다.
            </p>
          </>
        ) : (
          <div className="timeline-chart">
            <ChartBoundary onError={() => setChartFailed(true)}>
              <Willow fonts={false}>
                <Gantt
                  tasks={tasks}
                  links={ganttLinks}
                  scales={scales}
                  columns={columns}
                  markers={markers}
                  cellWidth={cellWidth}
                  cellHeight={36}
                  scaleHeight={30}
                  readonly
                  init={(api) => {
                    for (const id of parentIds) api.exec("open-task", { id, mode: true });
                  }}
                  onselecttask={handleSelect}
                />
              </Willow>
            </ChartBoundary>
          </div>
        )}

        <details className="reports-table" open={chartFailed}>
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
