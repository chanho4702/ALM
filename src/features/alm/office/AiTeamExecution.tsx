import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge, Banner, Button, Card, EmptyState, Modal, Radio, RadioGroup, Spinner, Table, TextField, useToast } from "@chanho/react";
import { Copy, Download, Globe, KeyRound, RotateCcw, Save, Terminal } from "lucide-react";
import type { AgentExecutionSite, AgentExecutionSiteSetting, AgentRunner, AgentRunnerIssued } from "../store/types";
import { fetchExecutionSite, issueAgentRunner, listAgentRunners, revokeAgentRunner, saveExecutionSite } from "../store/jiraStore";
import {
  AGENT_EXECUTION_SITE_LABEL,
  AgentExecutionSiteIcon,
  AgentRunnerStatusLozenge,
} from "../components/AgentGlyphs";
import { relTimeFine } from "../components/time";
import { errorText, LoadState, useLoad, When, type Load } from "./aiTeamShared";
import { useConfirmedAction } from "./SupervisionFrame";

/** 러너 jar 최신 릴리스(러너 CI가 `runner-latest` 태그에 올린다) */
export const RUNNER_JAR_URL = "https://github.com/chanho4702/agent-service/releases/download/runner-latest/agent-runner.jar";

const RUNNER_NAME_MAX = 80;

/** 러너 실행 명령(PowerShell) — 서버 주소는 지금 보고 있는 플랫폼(nginx 앞단). 토큰은 env로(명령행 인자는 다른 프로세스 목록에 보인다 — 러너도 경고한다) */
export function runnerCommand(token: string, origin: string = window.location.origin): string {
  return `$env:RUNNER_TOKEN="${token}"; java -jar agent-runner.jar --server ${origin}`;
}

/** Radio 값 — "기본값 따름"은 저장값 null. Radix Radio도 빈 문자열 값을 쓰지 않는다 */
type SiteChoice = AgentExecutionSite | "DEFAULT";

const SITE_DESCRIPTION: Record<AgentExecutionSite, string> = {
  SERVER: "24시간 실행, 등록된 LLM API 키로 과금",
  LOCAL: "러너가 켜진 PC의 Claude 구독·키 사용, 그 PC가 켜져 있어야 함",
};

export interface ExecutionSectionProps {
  projectId: string;
  canManage: boolean;
  /** 권한 판정이 끝났는가 — 전에는 편집 UI를 열지 않는다 */
  loaded: boolean;
  isGlobalAdmin: boolean;
}

/**
 * 프로젝트 설정 "AI 팀" — 실행 위치 + 러너(P4a AGP-69, D-P4-1·3·4). 실행 위치 조회는 누구나, 바꾸기·러너 목록·발급·철회는
 * 프로젝트 관리자(판정은 서버가 다시 한다). 구 백엔드(실행 위치 API 404)면 카드 하나로 "지원 안 함"만 안내한다.
 */
export function ExecutionSection({ projectId, canManage, loaded, isGlobalAdmin }: ExecutionSectionProps) {
  const siteLoader = useCallback(() => fetchExecutionSite(projectId), [projectId]);
  const [site, reloadSite] = useLoad(siteLoader);
  const runnerLoader = useCallback(() => listAgentRunners(projectId), [projectId]);
  const [runners, reloadRunners] = useLoad(canManage ? runnerLoader : null);
  // 조회 결과가 바뀔 때만 새 객체 — 러너 재조회로 부모가 다시 그려져도 실행 위치 폼의 고르던 값이 초기화되지 않게
  const siteLoad = useMemo<Load<AgentExecutionSiteSetting>>(
    () => (site.status === "ready" ? { status: "ready", data: site.data! } : site),
    [site],
  );

  if (site.status === "ready" && site.data === null) {
    return (
      <Card padding="lg" title="실행 위치">
        <EmptyState
          title="이 서버는 실행 위치를 고를 수 없습니다"
          description="agent-service가 서버·내 PC 러너 실행(P4a)을 지원하면 여기서 고를 수 있습니다. 지금은 모든 작업이 서버에서 실행됩니다."
        />
      </Card>
    );
  }

  const runnerList = runners.status === "ready" ? runners.data : null;

  return (
    <>
      <SiteCard load={siteLoad} projectId={projectId} canManage={canManage} loaded={loaded} onRetry={reloadSite} />
      <RunnerCard
        projectId={projectId}
        canManage={canManage}
        loaded={loaded}
        isGlobalAdmin={isGlobalAdmin}
        load={runners}
        runners={runnerList}
        effectiveSite={site.status === "ready" ? (site.data?.effectiveSite ?? null) : null}
        onRetry={reloadRunners}
        onChanged={reloadRunners}
      />
    </>
  );
}

// ── 실행 위치 ────────────────────────────────────────────────

function SiteCard({
  load,
  projectId,
  canManage,
  loaded,
  onRetry,
}: {
  load: Load<AgentExecutionSiteSetting>;
  projectId: string;
  canManage: boolean;
  loaded: boolean;
  onRetry: () => Promise<void>;
}) {
  const toast = useToast();
  const [setting, setSetting] = useState<AgentExecutionSiteSetting | null>(null);
  const [choice, setChoice] = useState<SiteChoice>("DEFAULT");
  const [saving, setSaving] = useState(false);

  // 서버 값이 오면(처음·재조회) 폼을 그 값으로
  useEffect(() => {
    if (load.status !== "ready") return;
    setSetting(load.data);
    setChoice(load.data.site ?? "DEFAULT");
  }, [load]);

  const saved: SiteChoice = setting?.site ?? "DEFAULT";
  const editable = loaded && canManage;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editable || saving || choice === saved) return;
    setSaving(true);
    try {
      const next = await saveExecutionSite(projectId, choice === "DEFAULT" ? null : choice);
      setSetting(next);
      setChoice(next.site ?? "DEFAULT");
      toast({ title: "실행 위치를 저장했습니다", description: "이미 만든 실행은 바뀌지 않습니다", appearance: "success" });
    } catch (error) {
      toast({ title: "실행 위치를 저장하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      setSaving(false);
    }
  };

  let body: ReactNode;
  if (load.status !== "ready" || !setting) {
    body = <LoadState load={load} label="실행 위치 불러오는 중" errorTitle="실행 위치를 불러오지 못했습니다" onRetry={() => void onRetry()} />;
  } else {
    body = (
      <form className="ai-team-site-form" onSubmit={save}>
        <div className="ai-team-effective is-site" role="status" aria-label="적용 중인 실행 위치">
          <AgentExecutionSiteIcon site={setting.effectiveSite} size={20} />
          <span>
            이 프로젝트의 새 작업은 <strong>{AGENT_EXECUTION_SITE_LABEL[setting.effectiveSite]}</strong>에서 실행됩니다
            {setting.site === null ? <span className="ai-team-hint"> · 기본값 따름</span> : null}
          </span>
        </div>
        <RadioGroup
          className="ai-team-site-options"
          value={choice}
          disabled={!editable || saving}
          onValueChange={(v) => setChoice(v as SiteChoice)}
          aria-label="실행 위치"
        >
          <Radio
            value="DEFAULT"
            label={
              <SiteOption
                icon={<RotateCcw size={16} aria-hidden />}
                title={`기본값 따름 (${AGENT_EXECUTION_SITE_LABEL[setting.defaultSite]})`}
                description="플랫폼 전역 기본 위치를 따릅니다"
              />
            }
          />
          {(["SERVER", "LOCAL"] as const).map((site) => (
            <Radio
              key={site}
              value={site}
              label={
                <SiteOption
                  icon={<AgentExecutionSiteIcon site={site} size={16} />}
                  title={AGENT_EXECUTION_SITE_LABEL[site]}
                  description={SITE_DESCRIPTION[site]}
                />
              }
            />
          ))}
        </RadioGroup>
        {editable ? (
          <div className="ai-team-form-actions">
            <Button type="submit" iconBefore={<Save size={16} aria-hidden />} disabled={choice === saved || saving}>
              실행 위치 저장
            </Button>
          </div>
        ) : loaded ? (
          <p className="ai-team-subtle">실행 위치는 프로젝트 관리자만 바꿀 수 있습니다.</p>
        ) : null}
      </form>
    );
  }

  return (
    <Card padding="lg" title="실행 위치">
      <p className="admin-scheme-note ai-team-note">
        AI 직원의 작업(맡기기·자동 배정·회의)이 실제로 도는 곳입니다. 바꿔도 이미 만든 실행은 그대로이고, 맡길 때 따로 고를 수도 있습니다.
      </p>
      {body}
    </Card>
  );
}

function SiteOption({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <span className="ai-team-site-option">
      <span className="status-cell ai-team-site-title">
        {icon}
        {title}
      </span>
      <span className="ai-team-subtle">{description}</span>
    </span>
  );
}

// ── 러너 ─────────────────────────────────────────────────────

function RunnerCard({
  projectId,
  canManage,
  loaded,
  isGlobalAdmin,
  load,
  runners,
  effectiveSite,
  onRetry,
  onChanged,
}: {
  projectId: string;
  canManage: boolean;
  loaded: boolean;
  isGlobalAdmin: boolean;
  load: Load<AgentRunner[] | null>;
  runners: AgentRunner[] | null;
  effectiveSite: AgentExecutionSite | null;
  onRetry: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [issuing, setIssuing] = useState(false);
  const action = useConfirmedAction(onChanged);
  const local = runners?.filter((r) => r.kind === "LOCAL") ?? null;
  const noneOnline = local !== null && !local.some((r) => r.status === "ONLINE");

  const requestRevoke = (runner: AgentRunner) =>
    action.request({
      title: `러너 "${runner.name}" 철회`,
      description:
        "이 러너의 토큰은 바로 거부됩니다. 돌던 실행은 다음 생존 확인에서 차단되고, 이 러너에 묶인 대기 실행은 '러너 대기'로 남습니다(직접 취소). 되돌릴 수 없습니다.",
      confirmLabel: "철회",
      danger: true,
      successMessage: "러너를 철회했습니다",
      failureTitle: "러너를 철회하지 못했습니다",
      run: () => revokeAgentRunner(runner.id),
    });

  let body: ReactNode;
  if (!loaded) {
    body = <Spinner label="권한 확인 중" />;
  } else if (!canManage) {
    body = <p className="ai-team-subtle">러너 목록은 프로젝트 관리자만 볼 수 있습니다.</p>;
  } else if (load.status !== "ready") {
    body = <LoadState load={load} label="러너 불러오는 중" errorTitle="러너 목록을 불러오지 못했습니다" onRetry={() => void onRetry()} />;
  } else if (load.data === null) {
    body = <p className="ai-team-subtle">이 서버는 러너를 지원하지 않습니다.</p>;
  } else if (load.data.length === 0) {
    body = <EmptyState title="아직 러너가 없습니다" description="러너를 발급해 내 PC에서 실행하면 여기에 나타납니다" />;
  } else {
    body = (
      <Table
        aria-label="러너"
        columns={[
          { key: "name", header: "이름" },
          { key: "status", header: "상태" },
          { key: "heartbeat", header: "마지막 신호" },
          { key: "env", header: "환경" },
          { key: "runs", header: "현재 실행" },
          { key: "actions", header: "", ariaLabel: "작업" },
        ]}
        rows={load.data.map((runner) => {
          const revocable = runner.kind === "LOCAL" && runner.status !== "REVOKED" && (runner.projectId !== null || isGlobalAdmin);
          return {
            id: runner.id,
            name: (
              <span className="ai-team-runner-name">
                <span className="ai-team-staff-name">
                  {runner.name}
                  {runner.kind === "PLATFORM" ? <Badge>플랫폼</Badge> : runner.projectId === null ? <Badge>전역</Badge> : null}
                </span>
                {runner.tokenPrefix ? <span className="ai-team-hint">{runner.tokenPrefix}…</span> : null}
              </span>
            ),
            status: <AgentRunnerStatusLozenge status={runner.status} />,
            heartbeat: <When iso={runner.lastHeartbeatAt} format={relTimeFine} />,
            env: <RunnerEnv runner={runner} />,
            runs:
              runner.currentRunIds.length === 0 ? (
                <span className="ai-team-subtle">—</span>
              ) : (
                <span className="ai-team-runner-runs">
                  {runner.currentRunIds.map((id) => (
                    <Link key={id} to={`/projects/${projectId}/ai-office/runs/${id}`} aria-label={`실행 #${id} 상세`}>
                      #{id}
                    </Link>
                  ))}
                </span>
              ),
            actions: revocable ? (
              <Button variant="subtle" size="small" aria-label={`러너 ${runner.name} 철회`} onClick={() => requestRevoke(runner)}>
                철회
              </Button>
            ) : null,
          };
        })}
      />
    );
  }

  return (
    <Card
      padding="lg"
      title="러너"
      headerActions={
        loaded && canManage && load.status === "ready" && load.data !== null ? (
          <Button
            variant="subtle"
            size="small"
            iconBefore={<KeyRound size={16} aria-hidden />}
            onClick={() => setIssuing(true)}
          >
            러너 발급
          </Button>
        ) : null
      }
    >
      <p className="admin-scheme-note ai-team-note">
        러너는 내 PC에서 AI 직원의 작업을 대신 실행하는 작은 프로그램입니다. 그 PC의 Claude 구독(또는 그 PC의 키)으로 과금되고, 플랫폼·프로젝트 키는
        받지 않습니다.
      </p>
      {effectiveSite === "LOCAL" && noneOnline && canManage ? (
        <Banner variant="warning">
          실행 위치가 내 PC 러너인데 켜진 러너가 없습니다. 새 작업은 러너가 켜질 때까지 "러너 대기"로 남습니다.
        </Banner>
      ) : null}
      {body}
      {action.dialog}
      {canManage ? (
        <IssueRunnerModal
          projectId={projectId}
          open={issuing}
          onOpenChange={setIssuing}
          onIssued={() => void onChanged()}
        />
      ) : null}
    </Card>
  );
}

function RunnerEnv({ runner }: { runner: AgentRunner }) {
  const parts = [runner.version ? `v${runner.version}` : null, runner.os, runner.maxConcurrency ? `동시 ${runner.maxConcurrency}` : null].filter(
    (p): p is string => Boolean(p),
  );
  if (parts.length === 0) return <span className="ai-team-subtle">—</span>;
  return <span className="ai-team-subtle">{parts.join(" · ")}</span>;
}

/** 발급 모달 — 이름을 받고, 성공하면 같은 모달이 "토큰 한 번 보기 + 실행 명령"으로 바뀐다 */
function IssueRunnerModal({
  projectId,
  open,
  onOpenChange,
  onIssued,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<AgentRunnerIssued | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTouched(false);
    setSubmitting(false);
    setIssued(null);
  }, [open]);

  const nameError = !name.trim() ? "이름을 입력하세요" : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (nameError || submitting) return;
    setSubmitting(true);
    try {
      const result = await issueAgentRunner({ name: name.trim(), projectId });
      setIssued(result);
      onIssued();
    } catch (error) {
      toast({ title: "러너를 발급하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={issued ? "러너 토큰이 발급됐습니다" : "러너 발급"}
      description={issued ? undefined : "내 PC에서 실행할 러너의 토큰을 만듭니다. 이 프로젝트의 '내 PC 러너' 작업만 집어 갑니다."}
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
      className="ai-team-modal"
    >
      {issued ? (
        <IssuedRunner issued={issued} onClose={() => onOpenChange(false)} />
      ) : (
        <form className="ai-team-form" onSubmit={submit} noValidate>
          <TextField
            label="러너 이름"
            placeholder="예: 내 노트북"
            value={name}
            maxLength={RUNNER_NAME_MAX}
            description="어느 PC인지 알아볼 수 있게 지어 주세요"
            error={touched ? nameError : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="ai-team-form-actions">
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" iconBefore={<KeyRound size={16} aria-hidden />} disabled={submitting}>
              발급
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function IssuedRunner({ issued, onClose }: { issued: AgentRunnerIssued; onClose: () => void }) {
  const toast = useToast();
  const command = runnerCommand(issued.token);
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what}을(를) 복사했습니다`, appearance: "success" });
    } catch {
      toast({ title: "복사하지 못했습니다", description: "칸을 선택해 직접 복사하세요", appearance: "danger" });
    }
  };
  return (
    <div className="ai-team-form">
      <Banner variant="warning">이 창을 닫으면 토큰을 다시 볼 수 없습니다. 지금 안전한 곳에 복사해 두세요.</Banner>
      <p className="admin-scheme-note">{issued.name}</p>
      <div className="ai-team-token-reveal">
        <TextField label="러너 토큰" value={issued.token} readOnly onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" iconBefore={<Copy size={16} aria-hidden />} onClick={() => void copy(issued.token, "토큰")}>
          복사
        </Button>
      </div>
      <section className="ai-team-runner-setup" aria-label="러너 실행 방법">
        <h3 className="ai-team-legend">
          <Terminal size={16} aria-hidden /> 실행 방법
        </h3>
        <ol className="ai-team-runner-steps">
          <li>
            <a className="ai-team-download" href={RUNNER_JAR_URL} target="_blank" rel="noreferrer">
              <Download size={14} aria-hidden />
              agent-runner.jar 내려받기
            </a>
          </li>
          <li>
            내려받은 폴더에서 실행합니다.
            <div className="ai-team-command-row">
              <pre className="ai-team-command" aria-label="실행 명령">
                <code>{command}</code>
              </pre>
              <Button
                variant="secondary"
                size="small"
                iconBefore={<Copy size={14} aria-hidden />}
                onClick={() => void copy(command, "실행 명령")}
              >
                명령 복사
              </Button>
            </div>
          </li>
        </ol>
        <p className="ai-team-legend">필요한 것</p>
        <ul className="ai-team-runner-reqs">
          <li>Java 24 이상</li>
          <li>
            Claude Code 설치·로그인 — <code>claude</code> 명령이 PATH에 있어야 합니다
          </li>
        </ul>
        <p className="ai-team-subtle">
          <Globe size={12} aria-hidden /> 러너는 이 PC의 Claude 구독(또는 이 PC의 API 키)으로 일합니다. PC가 꺼지면 작업은 "러너 대기"로 기다립니다.
        </p>
      </section>
      <div className="ai-team-form-actions">
        <Button onClick={onClose}>완료</Button>
      </div>
    </div>
  );
}

