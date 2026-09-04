import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useParams } from "react-router";
import { Button, EmptyState, Spinner } from "@chanho/react";
import { Gantt, Willow } from "@svar-ui/react-gantt";
import type { ITask } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import type { Issue, IssueLink, IssueTypeDef, WorkflowStatus } from "../store/types";
import { listIssues, listIssueLinks, listProjectStatuses } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { useIssueTypes } from "../components/useIssueTypes";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { statusKind, statusName, typeLevel } from "../components/labels";

type ViewMode = "Day" | "Week" | "Month";
const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "Day", label: "일" },
  { value: "Week", label: "주" },
  { value: "Month", label: "월" },
];

/** 의미를 진행률로 — 간트 막대의 채움 */
const PROGRESS = { new: 0, active: 50, complete: 100 } as const;

/**
 * 상태별 막대 종류. SVAR는 `taskTypes`에 등록된 id를 막대 클래스로 그대로 붙여 주므로
 * (`wx-bar wx-task <id>`), 색은 CSS에서 토큰으로 준다 — 인라인 색 지정이 필요 없다.
 * `point*`는 마감일이 없어 하루로 눕는 이슈 — 막대 대신 점 마커로 그린다.
 */
const BAR_TYPE = { new: "almNew", active: "almActive", complete: "almDone" } as const;
const POINT_TYPE = {
  new: "almPointNew",
  active: "almPointActive",
  complete: "almPointDone",
} as const;
const TASK_TYPES = [
  { id: "task", label: "이슈" },
  { id: "summary", label: "에픽" },
  { id: "milestone", label: "마일스톤" },
  { id: BAR_TYPE.new, label: "할 일" },
  { id: BAR_TYPE.active, label: "진행 중" },
  { id: BAR_TYPE.complete, label: "완료" },
  { id: POINT_TYPE.new, label: "할 일(기간 없음)" },
  { id: POINT_TYPE.active, label: "진행 중(기간 없음)" },
  { id: POINT_TYPE.complete, label: "완료(기간 없음)" },
];

/** 막대 안에 "KEY 제목"이 들어가려면 이 정도는 필요하다 — 그보다 좁으면 막대 오른쪽 바깥에 쓴다 */
const LABEL_MIN_WIDTH = 140;

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
/** 주/월 칸의 끝(다음 칸 시작) — "오늘이 이 칸에 드는가" 판정에 쓴다 */
const nextUnitStart = (date: Date, unit: string) =>
  unit === "week"
    ? addDays(date, 7)
    : new Date(date.getFullYear(), date.getMonth() + 1, 1);

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

/**
 * 보기 단위별 눈금과 칸 너비 — 윗줄은 큰 단위, 아랫줄은 선택 단위.
 * 지라처럼 숫자만 나열하지 않도록 아랫줄에도 최소한의 맥락(월/일)을 남긴다.
 */
function scalesFor(mode: ViewMode) {
  const monthLong = (date: Date) =>
    date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
  switch (mode) {
    case "Day":
      return {
        cellWidth: 36,
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
            format: (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`,
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

/** 간트에 넘기는 행 — SVAR의 ITask에 우리 필드를 얹는다(라이브러리가 그대로 보존한다) */
interface GanttRow extends ITask {
  key: string;
  text: string;
  issueType: string;
  statusLabel: string;
  startDay: string;
  endDay: string;
  isPoint: boolean;
  /** 라이브러리가 계산해 넣는 막대 픽셀 폭 */
  $w?: number;
}

/**
 * 왼쪽 패널의 한 줄 — 타입 글리프 + 키(작게) + 제목. 접기 셰브런과 들여쓰기는
 * 라이브러리의 트리 셀이 이 컴포넌트 바깥에 그려 준다.
 */
function makeNameCell(types: IssueTypeDef[]) {
  return function NameCell({ row }: { row: ITask }) {
    const task = row as GanttRow;
    return (
      <span className="tl-name">
        <IssueTypeGlyph type={task.issueType} types={types} />
        <span className="tl-name-key">{task.key}</span>
        <span className="tl-name-title">{task.text}</span>
      </span>
    );
  };
}

/**
 * 막대 안 라벨. 막대가 좁으면(또는 기간이 없는 점 마커면) 막대 오른쪽 바깥에 옅게 쓴다 —
 * 색만으로 상태를 구분하지 않기 위해 어떤 경우에도 키·제목이 함께 보인다.
 */
function BarLabel({ data }: { data: ITask }) {
  const task = data as GanttRow;
  const inside = !task.isPoint && (task.$w ?? 0) >= LABEL_MIN_WIDTH;
  const tip = `${task.key} ${task.text} · ${task.statusLabel} · ${task.startDay} ~ ${task.endDay}`;
  // 툴팁은 라벨이 아니라 막대(라이브러리가 그린다)에 건다 — 라벨이 막대 밖으로 밀려나는
  // 좁은 막대·점 마커에서도 막대 위 어디서나 날짜·상태가 뜬다
  const attachTip = useCallback(
    (el: HTMLDivElement | null) => el?.closest(".wx-bar")?.setAttribute("title", tip),
    [tip],
  );
  return (
    <div ref={attachTip} className={inside ? "tl-bar-text" : "tl-bar-text is-out"}>
      {`${task.key} ${task.text}`}
    </div>
  );
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
 * 지라 클라우드 타임라인 구성: 왼쪽은 이슈 한 열(글리프·키·제목)만, 오른쪽은 가로줄 없는
 * 차트에 주/월 경계선과 주말 음영, 상위(에픽)는 요약 막대, 차단 링크는 의존선(끝→시작)이다.
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
    return rows.map((row) => {
      const kind = statusKind(statuses, row.issue.status);
      const isEpic = typeLevel(types, row.issue.type) === "epic";
      const isPoint = row.end === row.start;
      return {
        id: row.issue.id,
        text: row.issue.title,
        start: localDate(row.start),
        // 라이브러리의 end는 배타적 — 마감일 당일까지 칠하려면 하루를 더한다
        end: addDays(localDate(row.end), 1),
        progress: PROGRESS[kind],
        type: isEpic ? "summary" : (isPoint ? POINT_TYPE : BAR_TYPE)[kind],
        parent: row.parentId ?? 0,
        key: row.issue.key,
        issueType: row.issue.type,
        statusLabel: statusName(statuses, row.issue.status),
        startDay: row.start,
        endDay: row.end,
        // 에픽은 자식에 맞춰 늘어나므로 점 마커로 눕히지 않는다
        isPoint: isPoint && !isEpic,
      };
    });
  }, [rows, statuses, types]);

  const ganttLinks = useMemo(() => {
    const ids = new Set(rows.map((row) => row.issue.id));
    return links
      .filter((link) => link.type === "blocks" && ids.has(link.sourceId) && ids.has(link.targetId))
      .map((link) => ({ id: link.id, source: link.sourceId, target: link.targetId, type: "e2s" as const }));
  }, [links, rows]);

  const { scales, cellWidth } = useMemo(() => scalesFor(viewMode), [viewMode]);
  const columns = useMemo(
    () => [{ id: "text", header: "이슈", flexgrow: 1, cell: makeNameCell(types) }],
    [types],
  );
  /**
   * 칸마다 클래스를 붙여 배경 격자를 대신한다 — 라이브러리 기본 격자(캔버스)는 CSS에서 껐다.
   * 주말은 음영, 상위 단위가 바뀌는 칸(주 시작·월 시작)만 옅은 세로선, 오늘은 강조.
   * 오늘 선을 `markers`로 그리지 않는 이유: 이 배포본(dist)은 markers를 초기화에서 비운다.
   */
  const today = useMemo(() => fmtDay(new Date()), []);
  /** 오늘 표시는 가장 작은 눈금 줄에만 — 위 줄(월/연)까지 칠하면 두 번 강조된다 */
  const minUnit = viewMode === "Day" ? "day" : viewMode === "Week" ? "week" : "month";
  const highlightTime = useCallback(
    (date: Date, unit: string) => {
      const marks: string[] = [];
      if (unit === "day") {
        const dow = date.getDay();
        if (dow === 0 || dow === 6) marks.push("tl-weekend");
        if (dow === 1) marks.push("tl-edge");
      } else if (unit === "week") {
        // 한 달의 첫 주에만 경계선 — 주 눈금에서 월이 바뀌는 지점
        if (date.getDate() <= 7) marks.push("tl-edge");
      } else {
        marks.push("tl-edge");
      }

      if (unit === minUnit) {
        const from = fmtDay(date);
        const to = fmtDay(unit === "day" ? addDays(date, 1) : nextUnitStart(date, unit));
        if (today >= from && today < to) {
          marks.push("tl-today-cell");
          // 칸이 하루보다 넓으면 선 대신 띠로 — 오늘 위치를 선으로 속이지 않는다
          if (unit !== "day") marks.push("tl-today-span");
        }
      }
      return marks.join(" ");
    },
    [today, minUnit],
  );

  // 이벤트 핸들러는 생성 시점의 클로저를 붙든다 — 최신 행을 ref로 읽어 stale 참조를 피한다
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handleSelect = (ev: { id: string | number }) => {
    const issue = rowsRef.current.find((row) => row.issue.id === String(ev.id))?.issue;
    if (issue) openIssue(issue.key);
  };

  const apiRef = useRef<{ exec: (action: string, params?: unknown) => unknown } | null>(null);
  const scrollToToday = () => apiRef.current?.exec("scroll-chart", { date: new Date() });

  // 눈금을 바꾸면 라이브러리가 트리의 open 상태를 초기화한다 — 상위 행을 다시 펼친다
  useEffect(() => {
    for (const id of parentIds) apiRef.current?.exec("open-task", { id, mode: true });
  }, [parentIds, viewMode, chartFailed]);

  const span = useMemo(() => {
    if (rows.length === 0) return null;
    const starts = rows.map((row) => row.start).sort();
    const ends = rows.map((row) => row.end).sort();
    return { from: starts[0], to: ends[ends.length - 1] };
  }, [rows]);

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
          <span className="timeline-summary">
            이슈 {rows.length}개{span ? ` · ${span.from} ~ ${span.to}` : ""}
          </span>
          {/* 차트가 없으면 조작할 대상도 없다 — 대체본에선 요약만 남긴다 */}
          {!chartFailed && (
            <div className="timeline-actions">
              <Button variant="ghost" size="small" onClick={scrollToToday}>
                오늘
              </Button>
              <div className="timeline-units" role="group" aria-label="보기 단위">
                {VIEW_MODES.map((mode) => (
                  <Button
                    key={mode.value}
                    size="small"
                    variant={viewMode === mode.value ? "secondary" : "ghost"}
                    aria-pressed={viewMode === mode.value}
                    onClick={() => setViewMode(mode.value)}
                  >
                    {mode.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="timeline-help" id="timeline-help">
          막대나 행을 누르면 이슈 상세가 열립니다. 이어진 선은 차단 관계입니다.
        </p>

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
          <div
            className="timeline-chart"
            role="group"
            aria-label="타임라인 차트"
            aria-describedby="timeline-help"
          >
            <ChartBoundary
              onError={() => {
                apiRef.current = null; // 파괴된 인스턴스에 exec하지 않는다
                setChartFailed(true);
              }}
            >
              <Willow fonts={false}>
                <Gantt
                  tasks={tasks}
                  links={ganttLinks}
                  scales={scales}
                  columns={columns}
                  taskTypes={TASK_TYPES}
                  taskTemplate={BarLabel}
                  highlightTime={highlightTime}
                  cellBorders="column"
                  cellWidth={cellWidth}
                  cellHeight={40}
                  scaleHeight={30}
                  gridWidth={320}
                  readonly
                  init={(api) => {
                    apiRef.current = api;
                    for (const id of parentIds) api.exec("open-task", { id, mode: true });
                  }}
                  // 이벤트 이름은 케밥→파스칼("select-task"→onSelectTask)이다.
                  // 타입 선언(on${RemoveHyphen})만 보고 onselecttask로 쓰면 조용히 안 불린다.
                  onSelectTask={handleSelect}
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
