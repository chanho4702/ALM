import { useCallback, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button, EmptyState } from "@chanho/react";
import { CornerDownRight, GitFork, Inbox, Play, CircleSlash } from "lucide-react";
import type { AgentRunSummary } from "../store/types";
import { cancelRun, fetchAgentRuns, resumeRun } from "../store/jiraStore";
import {
  AGENT_RUN_STATUS_LABEL,
  AGENT_RUN_TYPE_LABEL,
  AgentRunStatusLozenge,
  AgentRunTriggerGlyph,
  AgentRunTypeGlyph,
  AgentExecutionSiteGlyph,
} from "../components/AgentGlyphs";
import { formatDateTime, relTime } from "../components/time";
import { useIssueModal } from "../components/useIssueModal";
import { useAgentPermissions } from "../components/useAgentPermissions";
import { canCancel, canResume, personaDisplay, runLineage } from "./runModel";
import { linkableIssueKey, PROJECT_WIDE_LABEL } from "./officeModel";
import {
  AiTeamGate,
  SupervisionBody,
  SupervisionHeader,
  useConfirmedAction,
  usePersonaDirectory,
} from "./SupervisionFrame";
import { usePolledLoad } from "./usePolledLoad";
import { RunDirectivesSection } from "./RunDirectives";

/**
 * 실행 상세(P3a AGP-12) — `/projects/:projectId/ai-office/runs/:runId`. 상세 전용 API가 없어 목록 요약에서
 * 찾는다(요약 필드 전부 + 계보). 서버가 주지 않는 에러 로그·산출물 링크는 그리지 않는다.
 * 관리자 액션(취소·재개)은 이 프로젝트를 관리할 수 있는 사람(`canManage` — 전역 관리자 또는 프로젝트 ADMIN)에게만
 * 보이고, 최종 판정은 서버가 run의 프로젝트로 다시 한다(403·409 → 토스트).
 */
export default function AgentRunDetailPage() {
  return (
    <AiTeamGate loadingLabel="실행 상세 불러오는 중">
      <AgentRunDetail />
    </AiTeamGate>
  );
}

function when(iso: string | null): ReactNode {
  if (!iso || Number.isNaN(Date.parse(iso))) return <span className="agent-sup-subtle">—</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {formatDateTime(iso)} ({relTime(iso)})
    </time>
  );
}

function durationText(run: AgentRunSummary): string | null {
  if (!run.startedAt || !run.endedAt) return null;
  const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function AgentRunDetail() {
  const { projectId = "", runId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canManage } = useAgentPermissions(projectId);
  const personas = usePersonaDirectory();
  const loadRuns = useCallback(() => fetchAgentRuns(), []);
  const load = usePolledLoad(loadRuns);
  const { issueModal } = useIssueModal(() => undefined);
  const action = useConfirmedAction(load.refresh);

  const base = `/projects/${projectId}/ai-office`;
  const runHref = (id: string) => `${base}/runs/${encodeURIComponent(id)}`;
  const issueHref = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("issue", key);
    return `?${next.toString()}`;
  };

  const runs = load.data ?? [];
  const run = runs.find((r) => r.id === runId) ?? null;

  const runLink = (r: AgentRunSummary) => (
    <Link to={runHref(r.id)} aria-label={`실행 #${r.id} 상세`}>
      #{r.id}
    </Link>
  );

  let content: ReactNode;
  if (!run) {
    content = (
      <EmptyState
        title={`실행 #${runId} — 찾을 수 없습니다`}
        description="삭제됐거나 다른 플랫폼의 실행입니다"
        primaryAction={{ label: "실행 기록으로", onClick: () => navigate(`${base}/runs`) }}
      />
    );
  } else {
    const persona = personaDisplay(personas, run.personaId);
    const lineage = runLineage(runs, run);
    const duration = durationText(run);
    const showCancel = canManage && canCancel(run.status);
    const showResume = canManage && canResume(run.status);
    content = (
      <div className="agent-run-detail">
        <div className="agent-run-detail-head">
          <AgentRunStatusLozenge status={run.status} />
          <span className="agent-run-detail-caption">
            {AGENT_RUN_TYPE_LABEL[run.type]} · 시도 {run.attempt}
          </span>
          {showResume || showCancel || run.status === "WAITING_APPROVAL" ? (
            <div className="agent-run-detail-actions">
              {run.status === "WAITING_APPROVAL" ? (
                <Button
                  variant="secondary"
                  size="small"
                  iconBefore={<Inbox size={14} aria-hidden />}
                  onClick={() => navigate(`${base}/gates?persona=${encodeURIComponent(run.personaId)}`)}
                >
                  승인 인박스
                </Button>
              ) : null}
              {showResume ? (
                <Button
                  variant="primary"
                  size="small"
                  iconBefore={<Play size={14} aria-hidden />}
                  onClick={() =>
                    action.request({
                      title: `실행 #${run.id} 재개`,
                      description: `${AGENT_RUN_STATUS_LABEL[run.status]} 상태의 실행을 이어 갈까요? 시도 ${run.attempt + 1}의 새 실행이 대기열에 들어가고 이 실행은 닫힙니다.`,
                      confirmLabel: "재개",
                      successMessage: `실행 #${run.id} — 재개했습니다`,
                      failureTitle: "재개하지 못했습니다",
                      run: () => resumeRun(run.id),
                    })
                  }
                >
                  재개
                </Button>
              ) : null}
              {showCancel ? (
                <Button
                  variant="danger"
                  size="small"
                  iconBefore={<CircleSlash size={14} aria-hidden />}
                  onClick={() =>
                    action.request({
                      title: `실행 #${run.id} 취소`,
                      description:
                        "이 실행을 닫을까요? 이미 돌고 있는 워커 프로세스는 강제로 멈추지 않으며, 되돌릴 수 없습니다.",
                      confirmLabel: "실행 취소",
                      danger: true,
                      successMessage: `실행 #${run.id} — 취소했습니다`,
                      failureTitle: "취소하지 못했습니다",
                      run: () => cancelRun(run.id),
                    })
                  }
                >
                  실행 취소
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <dl className="agent-run-fields" aria-label="실행 요약">
          <div>
            <dt>이슈</dt>
            <dd>
              {linkableIssueKey(run) ? (
                <Link className="agent-sup-issue" to={issueHref(run.issueKey!)}>
                  {run.issueKey}
                </Link>
              ) : (
                <span className="agent-sup-subtle">{run.issueKey ? PROJECT_WIDE_LABEL : "이슈 없음"}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>페르소나</dt>
            <dd>
              <span className="status-cell">
                {persona.emoji ? <span aria-hidden="true">{persona.emoji}</span> : null}
                {persona.name}
              </span>
            </dd>
          </div>
          <div>
            <dt>종류</dt>
            <dd>
              <AgentRunTypeGlyph type={run.type} />
            </dd>
          </div>
          <div>
            <dt>트리거</dt>
            <dd>
              <AgentRunTriggerGlyph trigger={run.trigger} />
            </dd>
          </div>
          <div>
            <dt>실행 위치</dt>
            <dd>
              <AgentExecutionSiteGlyph site={run.executionSite ?? "SERVER"} />
              {run.runnerId ? <span className="agent-sup-subtle"> · 러너 #{run.runnerId}</span> : null}
            </dd>
          </div>
          <div>
            <dt>시도</dt>
            <dd>{run.attempt}</dd>
          </div>
          <div>
            <dt>모델</dt>
            <dd>{run.model ? <code className="agent-sup-code">{run.model}</code> : <span className="agent-sup-subtle">—</span>}</dd>
          </div>
          <div>
            <dt>시작</dt>
            <dd>{when(run.startedAt)}</dd>
          </div>
          <div>
            <dt>종료</dt>
            <dd>
              {when(run.endedAt)}
              {duration ? <span className="agent-sup-subtle"> · {duration} 걸림</span> : null}
            </dd>
          </div>
        </dl>

        <RunDirectivesSection key={run.id} run={run} canManage={canManage} onStale={() => void load.refresh()} />

        <section className="agent-run-lineage" aria-labelledby="agent-run-lineage-title">
          <h3 id="agent-run-lineage-title" className="agent-sup-subtitle">
            <GitFork size={16} aria-hidden /> 계보
          </h3>
          <dl className="agent-run-fields">
            <div>
              <dt>부모 실행</dt>
              <dd>
                {run.parentRunId ? (
                  lineage.parent ? (
                    <span className="status-cell">
                      {runLink(lineage.parent)}
                      <AgentRunTypeGlyph type={lineage.parent.type} size={12} />
                      <AgentRunStatusLozenge status={lineage.parent.status} />
                    </span>
                  ) : (
                    <Link to={runHref(run.parentRunId)} aria-label={`실행 #${run.parentRunId} 상세`}>
                      #{run.parentRunId}
                    </Link>
                  )
                ) : (
                  <span className="agent-sup-subtle">없음</span>
                )}
              </dd>
            </div>
            <div>
              <dt>파생 실행</dt>
              <dd>
                {lineage.children.length === 0 ? (
                  <span className="agent-sup-subtle">없음</span>
                ) : (
                  <ul className="agent-run-children">
                    {lineage.children.map((child) => (
                      <li key={child.id} className="status-cell">
                        <CornerDownRight size={14} aria-hidden />
                        {runLink(child)}
                        <AgentRunTypeGlyph type={child.type} size={12} />
                        <AgentRunStatusLozenge status={child.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>

          {/* 합성 키가 같은 run은 같은 프로젝트의 서로 다른 회의다 — "한 이슈의 시도" 타임라인이 아니다 */}
          {linkableIssueKey(run) ? (
            <>
              <h4 className="agent-sup-minor">{`${run.issueKey}의 실행 — 시도 순`}</h4>
              <ol className="agent-run-timeline" aria-label={`${run.issueKey} 실행 타임라인`}>
                {lineage.sameIssue.map((r) => {
                  const current = r.id === run.id;
                  const p = personaDisplay(personas, r.personaId);
                  return (
                    <li
                      key={r.id}
                      className={current ? "agent-run-step is-current" : "agent-run-step"}
                      aria-current={current ? "true" : undefined}
                    >
                      <span className="agent-run-step-attempt">시도 {r.attempt}</span>
                      {current ? <strong>#{r.id}</strong> : runLink(r)}
                      <AgentRunTypeGlyph type={r.type} size={12} />
                      <AgentRunStatusLozenge status={r.status} />
                      <span className="agent-sup-subtle">
                        {p.name}
                        {r.startedAt && !Number.isNaN(Date.parse(r.startedAt)) ? ` · ${relTime(r.startedAt)} 시작` : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <section className="agent-sup" aria-labelledby="agent-sup-title-run">
      <SupervisionHeader
        title={`실행 #${runId}`}
        titleId="agent-sup-title-run"
        backHref={`${base}/runs`}
        backLabel="실행 기록"
        load={load}
      />
      <SupervisionBody load={load} loadingLabel="실행 상세 불러오는 중" errorTitle="실행 정보를 불러오지 못했습니다">
        {content}
      </SupervisionBody>
      {action.dialog}
      {issueModal}
    </section>
  );
}
