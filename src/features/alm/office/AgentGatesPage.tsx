import { useCallback, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button, EmptyState, Lozenge, Select, Switch } from "@chanho/react";
import { Check, CircleCheck, CircleX, Clock, Hourglass, Users, X } from "lucide-react";
import type { AgentGate, AgentGateDecision, AgentRunSummary } from "../store/types";
import { approveGate, fetchAgentGates, fetchAgentRuns, rejectGate } from "../store/jiraStore";
import { AGENT_GATE_KIND_LABEL, AgentGateKindGlyph, AgentRunStatusLozenge } from "../components/AgentGlyphs";
import { formatDateTime, relTime } from "../components/time";
import { useIssueModal } from "../components/useIssueModal";
import { useAgentPermissions } from "../components/useAgentPermissions";
import { gatesForPersona, personaDisplay } from "./runModel";
import {
  AiTeamGate,
  SupervisionBody,
  SupervisionHeader,
  useConfirmedAction,
  usePersonaDirectory,
} from "./SupervisionFrame";
import { usePolledLoad } from "./usePolledLoad";

const ALL_PERSONAS = "all";

interface GateInbox {
  gates: AgentGate[];
  runs: AgentRunSummary[];
}

function DecisionLozenge({ decision }: { decision: AgentGateDecision | null }) {
  if (decision === "APPROVE") {
    return (
      <Lozenge appearance="success" className="agent-lozenge">
        <CircleCheck size={12} aria-hidden />
        승인됨
      </Lozenge>
    );
  }
  if (decision === "REJECT") {
    return (
      <Lozenge appearance="danger" className="agent-lozenge">
        <CircleX size={12} aria-hidden />
        거절됨
      </Lozenge>
    );
  }
  return (
    <Lozenge appearance="warning" className="agent-lozenge">
      <Hourglass size={12} aria-hidden />
      결정 대기
    </Lozenge>
  );
}

/**
 * 승인 인박스(P3a AGP-13) — `/projects/:projectId/ai-office/gates`. 기본은 결정 전 게이트 전부,
 * 토글하면 최근 50건(결정 포함 — 서버가 주는 대로). `?persona=`는 게이트의 run → personaId로 거른다
 * (사무실 ❗·팀 카드 "승인 인박스" 링크가 넘긴다). 승인·거절은 이 프로젝트 관리자(전역 관리자 포함)에게만 보이고 서버가 최종 판정한다.
 * 서버가 거절 사유를 받지 않아 사유 입력은 두지 않는다.
 */
export default function AgentGatesPage() {
  return (
    <AiTeamGate loadingLabel="승인 인박스 불러오는 중">
      <AgentGates />
    </AiTeamGate>
  );
}

function AgentGates() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canManage } = useAgentPermissions(projectId);
  const personas = usePersonaDirectory();
  const { issueModal } = useIssueModal(() => undefined);

  const showArchive = searchParams.get("archive") === "1";
  const personaId = searchParams.get("persona");

  const loadInbox = useCallback(async (): Promise<GateInbox> => {
    const [gates, runs] = await Promise.all([fetchAgentGates({ pending: !showArchive }), fetchAgentRuns()]);
    return { gates, runs };
  }, [showArchive]);
  const load = usePolledLoad(loadInbox);
  const action = useConfirmedAction(load.refresh);

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

  const runs = load.data?.runs ?? [];
  const runById = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs]);
  const gates = useMemo(
    () => gatesForPersona(load.data?.gates ?? [], load.data?.runs ?? [], personaId),
    [load.data, personaId],
  );

  const personaOptions = [
    { value: ALL_PERSONAS, label: "전체 페르소나", icon: <Users size={14} aria-hidden /> },
    ...[...personas.values()].map((p) => ({
      value: String(p.id),
      label: p.name,
      icon: p.emoji ? <span aria-hidden="true">{p.emoji}</span> : undefined,
    })),
  ];
  // 목록에 없는 id가 쿼리로 오면(이름 조회 실패 등) 그 값도 선택지로 둔다 — Select가 빈 트리거가 되지 않게
  if (personaId && !personas.has(personaId)) {
    personaOptions.push({ value: personaId, label: `페르소나 #${personaId}`, icon: undefined });
  }

  const decide = (gate: AgentGate, decision: AgentGateDecision) => {
    const kind = AGENT_GATE_KIND_LABEL[gate.kind];
    const subject = gate.issueKey ? `${gate.issueKey} ${kind}` : kind;
    action.request(
      decision === "APPROVE"
        ? {
            title: `${subject} 요청 승인`,
            description: "승인하면 실행이 다음 시도로 이어집니다(새 실행이 대기열에 들어갑니다).",
            confirmLabel: "승인",
            successMessage: `${subject} 요청을 승인했습니다`,
            failureTitle: "승인하지 못했습니다",
            run: () => approveGate(gate.id),
          }
        : {
            title: `${subject} 요청 거절`,
            description: "거절하면 이 실행은 취소되고 이어지지 않습니다. 되돌릴 수 없습니다.",
            confirmLabel: "거절",
            danger: true,
            successMessage: `${subject} 요청을 거절했습니다`,
            failureTitle: "거절하지 못했습니다",
            run: () => rejectGate(gate.id),
          },
    );
  };

  return (
    <section className="agent-sup" aria-labelledby="agent-sup-title-gates">
      <SupervisionHeader title="승인 인박스" titleId="agent-sup-title-gates" backHref={base} backLabel="AI 사무실" load={load}>
        <div className="agent-sup-filters">
          <Select
            label="페르소나"
            value={personaId ?? ALL_PERSONAS}
            onValueChange={(value) => setParam("persona", value === ALL_PERSONAS ? null : value)}
            options={personaOptions}
          />
          <Switch
            label="결정된 요청 포함(최근 50건)"
            checked={showArchive}
            onCheckedChange={(checked) => setParam("archive", checked ? "1" : null)}
          />
        </div>
      </SupervisionHeader>
      <SupervisionBody load={load} loadingLabel="승인 인박스 불러오는 중" errorTitle="승인 요청을 불러오지 못했습니다">
        {gates.length === 0 ? (
          <EmptyState
            title={showArchive ? "승인 요청 기록이 없습니다" : "결정을 기다리는 요청이 없습니다"}
            description={personaId ? "페르소나 필터를 풀면 다른 요청도 봅니다" : "AI 팀이 승인을 요청하면 여기에 모입니다"}
          />
        ) : (
          <ul className="agent-gate-list" aria-label="승인 요청 목록">
            {gates.map((gate) => {
              const run = runById.get(gate.runId);
              const persona = run ? personaDisplay(personas, run.personaId) : null;
              const titleId = `agent-gate-${gate.id}`;
              return (
                <li key={gate.id}>
                  <article className="agent-gate" aria-labelledby={titleId}>
                    <header className="agent-gate-head">
                      <h3 id={titleId} className="agent-gate-title">
                        <AgentGateKindGlyph kind={gate.kind} />
                        <span className="agent-sup-subtle">요청 #{gate.id}</span>
                      </h3>
                      <DecisionLozenge decision={gate.decision} />
                      <span className="agent-gate-when status-cell">
                        <Clock size={14} aria-hidden />
                        {Number.isNaN(Date.parse(gate.requestedAt)) ? (
                          "—"
                        ) : (
                          <time dateTime={gate.requestedAt} title={formatDateTime(gate.requestedAt)}>
                            {relTime(gate.requestedAt)} 요청
                          </time>
                        )}
                      </span>
                    </header>
                    <p className="agent-gate-request">{gate.request || "요청 내용이 없습니다"}</p>
                    <p className="agent-gate-meta">
                      <span className="status-cell">
                        실행{" "}
                        <Link
                          to={`${base}/runs/${encodeURIComponent(gate.runId)}`}
                          aria-label={`실행 #${gate.runId} 상세`}
                        >
                          #{gate.runId}
                        </Link>
                        {run ? <AgentRunStatusLozenge status={run.status} /> : null}
                      </span>
                      {gate.issueKey ? (
                        <Link className="agent-sup-issue" to={issueHref(gate.issueKey)}>
                          {gate.issueKey}
                        </Link>
                      ) : (
                        <span className="agent-sup-subtle">이슈 없음</span>
                      )}
                      {persona ? (
                        <span className="status-cell">
                          {persona.emoji ? <span aria-hidden="true">{persona.emoji}</span> : null}
                          {persona.name}
                        </span>
                      ) : null}
                    </p>
                    {canManage && gate.decision === null ? (
                      <div className="agent-gate-actions">
                        <Button
                          variant="primary"
                          size="small"
                          iconBefore={<Check size={14} aria-hidden />}
                          aria-label={`요청 #${gate.id} 승인`}
                          onClick={() => decide(gate, "APPROVE")}
                        >
                          승인
                        </Button>
                        <Button
                          variant="secondary"
                          size="small"
                          iconBefore={<X size={14} aria-hidden />}
                          aria-label={`요청 #${gate.id} 거절`}
                          onClick={() => decide(gate, "REJECT")}
                        >
                          거절
                        </Button>
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </SupervisionBody>
      {action.dialog}
      {issueModal}
    </section>
  );
}
