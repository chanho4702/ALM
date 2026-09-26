import { useCallback, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { EmptyState, Select, Table, type TableColumn } from "@chanho/react";
import { Activity, CircleCheck, FolderKanban, Globe, List } from "lucide-react";
import type { AgentRunSummary } from "../store/types";
import { fetchAgentRuns } from "../store/jiraStore";
import {
  AgentRunStatusLozenge,
  AgentRunTriggerGlyph,
  AgentRunTypeGlyph,
} from "../components/AgentGlyphs";
import { formatDateTime, relTime } from "../components/time";
import { useIssueModal } from "../components/useIssueModal";
import { filterRuns, personaDisplay, sortRunsNewestFirst, type RunGroup } from "./runModel";
import {
  AiTeamGate,
  SupervisionBody,
  SupervisionHeader,
  usePersonaDirectory,
  useProjectKey,
} from "./SupervisionFrame";
import { usePolledLoad } from "./usePolledLoad";

const ALL_PROJECTS = "all";

/** 시각 셀 — 상대 표기 + title에 절대 시각. 값이 없으면 "—"(Invalid Date 노출 금지) */
function TimeCell({ iso }: { iso: string | null }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return <span className="agent-sup-subtle">—</span>;
  return <time dateTime={iso} title={formatDateTime(iso)}>{relTime(iso)}</time>;
}

/**
 * 실행 기록(P3a AGP-12) — `/projects/:projectId/ai-office/runs`. 서버 runs API는 전역이라
 * 프로젝트 범위는 이슈키 접두어로 거른다(기본: 이 프로젝트). 필터는 URL 쿼리(`?group=`, `?scope=all`)로 공유된다.
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
  const loadRuns = useCallback(() => fetchAgentRuns(), []);
  const load = usePolledLoad(loadRuns);
  const { issueModal } = useIssueModal(() => undefined);

  const groupParam = searchParams.get("group");
  const group: RunGroup = groupParam === "active" || groupParam === "finished" ? groupParam : "all";
  const scopeAll = searchParams.get("scope") === ALL_PROJECTS || projectKey === null;

  const setParam = (key: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const base = `/projects/${projectId}/ai-office`;
  const issueHref = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("issue", key);
    return `?${next.toString()}`;
  };

  const rows = useMemo(
    () =>
      sortRunsNewestFirst(
        filterRuns(load.data ?? [], { group, projectKey: scopeAll ? null : projectKey }),
      ),
    [load.data, group, scopeAll, projectKey],
  );

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
        run.issueKey ? (
          <Link className="agent-sup-issue" to={issueHref(run.issueKey)}>
            {run.issueKey}
          </Link>
        ) : (
          <span className="agent-sup-subtle">이슈 없음</span>
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
  ];

  return (
    <section className="agent-sup" aria-labelledby="agent-sup-title-runs">
      <SupervisionHeader title="실행 기록" titleId="agent-sup-title-runs" backHref={base} backLabel="AI 사무실" load={load}>
        <div className="agent-sup-filters">
          <Select
            label="상태"
            value={group}
            onValueChange={(value) => setParam("group", value === "all" ? null : value)}
            options={[
              { value: "all", label: "전체", icon: <List size={14} aria-hidden /> },
              { value: "active", label: "활성", icon: <Activity size={14} aria-hidden /> },
              { value: "finished", label: "종결", icon: <CircleCheck size={14} aria-hidden /> },
            ]}
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
        {rows.length === 0 ? (
          <EmptyState
            title="조건에 맞는 실행이 없습니다"
            description={
              scopeAll ? "AI 팀이 실행을 시작하면 여기에 쌓입니다" : "범위를 '전체 프로젝트'로 넓히면 다른 프로젝트 실행도 봅니다"
            }
          />
        ) : (
          <>
            <p className="agent-sup-count">{`${rows.length}건`}</p>
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
