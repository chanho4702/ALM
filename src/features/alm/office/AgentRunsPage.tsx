import { useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button, EmptyState, Select, Table, type TableColumn } from "@chanho/react";
import { ChevronLeft, ChevronRight, FolderKanban, Globe, List, Users } from "lucide-react";
import type { AgentRunStatus, AgentRunSummary } from "../store/types";
import { fetchAgentRuns } from "../store/jiraStore";
import {
  AGENT_RUN_STATUS_LABEL,
  AgentRunStatusIcon,
  AgentRunStatusLozenge,
  AgentRunTriggerGlyph,
  AgentRunTypeGlyph,
} from "../components/AgentGlyphs";
import { formatDateTime, relTime } from "../components/time";
import { useIssueModal } from "../components/useIssueModal";
import { formatRunCost, personaDisplay, RUN_COST_NONE } from "./runModel";
import { linkableIssueKey, PROJECT_WIDE_LABEL } from "./officeModel";
import {
  AiTeamGate,
  SupervisionBody,
  SupervisionHeader,
  usePersonaDirectory,
  useProjectKey,
} from "./SupervisionFrame";
import { usePolledLoad } from "./usePolledLoad";

const ALL = "all";
const ALL_PROJECTS = "all";
/** 한 페이지 run 수 — 서버 기본(20)과 같다 */
export const RUNS_PAGE_SIZE = 20;

const RUN_STATUSES = Object.keys(AGENT_RUN_STATUS_LABEL) as AgentRunStatus[];
const isRunStatus = (value: string | null): value is AgentRunStatus =>
  value !== null && (RUN_STATUSES as string[]).includes(value);

/** 시각 셀 — 상대 표기 + title에 절대 시각. 값이 없으면 "—"(Invalid Date 노출 금지) */
function TimeCell({ iso }: { iso: string | null }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return <span className="agent-sup-subtle">—</span>;
  return <time dateTime={iso} title={formatDateTime(iso)}>{relTime(iso)}</time>;
}

/**
 * 실행 기록(P3a AGP-12 · P4c D-P4c-1) — `/projects/:projectId/ai-office/runs`. 서버가 거르고(상태·페르소나·프로젝트)
 * id 내림차순으로 페이지를 준다. 필터·페이지는 URL 쿼리(`?status=`, `?persona=`, `?scope=all`, `?page=`(1부터))로 공유된다.
 */
export default function AgentRunsPage() {
  return (
    <AiTeamGate loadingLabel="실행 기록 불러오는 중">
      <AgentRuns />
    </AiTeamGate>
  );
}

function AgentRuns() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectKey = useProjectKey(projectId);
  const personas = usePersonaDirectory();
  const { issueModal } = useIssueModal(() => undefined);

  const statusParam = searchParams.get("status");
  const status = isRunStatus(statusParam) ? statusParam : null;
  const personaId = searchParams.get("persona");
  const scopeAll = searchParams.get("scope") === ALL_PROJECTS || projectKey === null;
  const pageParam = Number(searchParams.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam - 1 : 0;

  const loadRuns = useCallback(
    () =>
      fetchAgentRuns({
        status: status ?? undefined,
        personaId: personaId ?? undefined,
        projectId: scopeAll ? undefined : projectId,
        page,
        size: RUNS_PAGE_SIZE,
      }),
    [status, personaId, scopeAll, projectId, page],
  );
  const load = usePolledLoad(loadRuns);

  /** 조건이 바뀌면 첫 페이지로(`page`를 지운다) */
  const setParam = (key: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  const goPage = (index: number) => setParam("page", index > 0 ? String(index + 1) : null);

  const base = `/projects/${projectId}/ai-office`;
  const issueHref = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("issue", key);
    return `?${next.toString()}`;
  };

  const result = load.data;
  const rows = result?.items ?? [];
  const total = result?.total ?? 0;
  const first = result ? result.page * result.size + 1 : 0;
  const last = result ? result.page * result.size + rows.length : 0;
  const filtered = status !== null || personaId !== null;

  const personaOptions = [
    { value: ALL, label: "전체 페르소나", icon: <Users size={14} aria-hidden /> },
    ...[...personas.values()].map((p) => ({
      value: String(p.id),
      label: p.name,
      icon: p.emoji ? <span aria-hidden="true">{p.emoji}</span> : undefined,
    })),
  ];
  // 목록에 없는 id가 쿼리로 오면 그 값도 선택지로 둔다 — Select가 빈 트리거가 되지 않게(승인 인박스와 같은 규칙)
  if (personaId && !personas.has(personaId)) {
    personaOptions.push({ value: personaId, label: `페르소나 #${personaId}`, icon: undefined });
  }

  const columns: TableColumn<AgentRunSummary>[] = [
    {
      key: "id",
      header: "실행",
      width: "88px",
      render: (run) => (
        <Link to={`${base}/runs/${encodeURIComponent(run.id)}`} aria-label={`실행 #${run.id} 상세`}>
          #{run.id}
        </Link>
      ),
    },
    {
      key: "issueKey",
      header: "이슈",
      render: (run) =>
        linkableIssueKey(run) ? (
          <Link className="agent-sup-issue" to={issueHref(run.issueKey!)}>
            {run.issueKey}
          </Link>
        ) : (
          <span className="agent-sup-subtle">{run.issueKey ? PROJECT_WIDE_LABEL : "이슈 없음"}</span>
        ),
    },
    {
      key: "persona",
      header: "페르소나",
      render: (run) => {
        const p = personaDisplay(personas, run.personaId);
        return (
          <span className="status-cell">
            {p.emoji ? <span aria-hidden="true">{p.emoji}</span> : null}
            {p.name}
          </span>
        );
      },
    },
    { key: "type", header: "종류", render: (run) => <AgentRunTypeGlyph type={run.type} /> },
    { key: "trigger", header: "트리거", render: (run) => <AgentRunTriggerGlyph trigger={run.trigger} /> },
    { key: "status", header: "상태", render: (run) => <AgentRunStatusLozenge status={run.status} /> },
    { key: "attempt", header: "시도", align: "right", width: "64px", render: (run) => run.attempt },
    {
      key: "model",
      header: "모델",
      render: (run) => (run.model ? <code className="agent-sup-code">{run.model}</code> : <span className="agent-sup-subtle">—</span>),
    },
    { key: "startedAt", header: "시작", render: (run) => <TimeCell iso={run.startedAt} /> },
    { key: "endedAt", header: "종료", render: (run) => <TimeCell iso={run.endedAt} /> },
    {
      key: "cost",
      header: "비용",
      align: "right",
      render: (run) => formatRunCost(run.cost) ?? <span className="agent-sup-subtle">{RUN_COST_NONE}</span>,
    },
  ];

  return (
    <section className="agent-sup" aria-labelledby="agent-sup-title-runs">
      <SupervisionHeader title="실행 기록" titleId="agent-sup-title-runs" backHref={base} backLabel="AI 사무실" load={load}>
        <div className="agent-sup-filters">
          <Select
            label="상태"
            value={status ?? ALL}
            onValueChange={(value) => setParam("status", value === ALL ? null : value)}
            options={[
              { value: ALL, label: "전체 상태", icon: <List size={14} aria-hidden /> },
              ...RUN_STATUSES.map((s) => ({
                value: s,
                label: AGENT_RUN_STATUS_LABEL[s],
                icon: <AgentRunStatusIcon status={s} />,
              })),
            ]}
          />
          <Select
            label="페르소나"
            value={personaId ?? ALL}
            onValueChange={(value) => setParam("persona", value === ALL ? null : value)}
            options={personaOptions}
          />
          {projectKey ? (
            <Select
              label="범위"
              value={scopeAll ? ALL_PROJECTS : "project"}
              onValueChange={(value) => setParam("scope", value === ALL_PROJECTS ? ALL_PROJECTS : null)}
              options={[
                { value: "project", label: `이 프로젝트(${projectKey})`, icon: <FolderKanban size={14} aria-hidden /> },
                { value: ALL_PROJECTS, label: "전체 프로젝트", icon: <Globe size={14} aria-hidden /> },
              ]}
            />
          ) : null}
        </div>
      </SupervisionHeader>
      <SupervisionBody load={load} loadingLabel="실행 기록 불러오는 중" errorTitle="실행 기록을 불러오지 못했습니다">
        {rows.length === 0 && page > 0 && total > 0 ? (
          <EmptyState
            title="이 페이지에는 실행이 없습니다"
            description={`전체 ${total}건 — 페이지 범위를 넘었습니다`}
            primaryAction={{ label: "첫 페이지로", onClick: () => goPage(0) }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="조건에 맞는 실행이 없습니다"
            description={
              filtered
                ? "상태·페르소나 조건을 풀면 더 많은 실행을 봅니다"
                : scopeAll
                  ? "AI 팀이 실행을 시작하면 여기에 쌓입니다"
                  : "범위를 '전체 프로젝트'로 넓히면 다른 프로젝트 실행도 봅니다"
            }
          />
        ) : (
          <>
            <div className="agent-sup-toolbar">
              <p className="agent-sup-count">{`${total}건`}</p>
              <nav className="issue-pager" aria-label="실행 기록 페이지">
                <span className="issue-pager-range">{`${first}–${last}`}</span>
                <Button
                  size="small"
                  variant="ghost"
                  iconBefore={<ChevronLeft size={14} aria-hidden />}
                  disabled={!result || result.page === 0}
                  onClick={() => goPage(page - 1)}
                >
                  이전
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  disabled={!result?.hasNext}
                  onClick={() => goPage(page + 1)}
                >
                  다음
                  <ChevronRight size={14} aria-hidden />
                </Button>
              </nav>
            </div>
            <div className="issue-table-scroll">
              <Table aria-label="실행 기록" columns={columns} rows={rows} />
            </div>
          </>
        )}
      </SupervisionBody>
      {issueModal}
    </section>
  );
}
