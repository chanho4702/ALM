import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Badge, Banner, Button, EmptyState, Lozenge, Spinner, Tabs } from "@chanho/react";
import {
  Building2,
  CircleAlert,
  Clock,
  Coins,
  History,
  Inbox,
  Keyboard,
  LayoutGrid,
  OctagonX,
  Power,
  RefreshCw,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { AgentOffice } from "../store/types";
import { useAiTeamStatus } from "../components/useAiTeamActive";
import { useAgentPermissions } from "../components/useAgentPermissions";
import { useIssueModal } from "../components/useIssueModal";
import { relTimeFine } from "../components/time";
import { OfficeCanvas } from "./OfficeCanvas";
import { MeetingConveneModal } from "./MeetingConveneModal";
import { OfficePanel, type GoalsView, type OfficeLinks, type PanelTarget } from "./OfficePanel";
import { TeamCards } from "./TeamCards";
import { useOfficeData, type OfficeData } from "./useOfficeData";
import { useEpicGoals } from "./useEpicGoals";
import {
  epicGoals,
  finishedRuns,
  formatUsd,
  meetingSeats,
  officeCounts,
  sortPersonas,
  todayCostTotal,
  todayReportCount,
} from "./officeModel";
import "./ai-office.css";

/**
 * 패널을 밀어내기(도킹)로 둘 최소 본문 폭 — 그보다 좁으면 캔버스 위에 뜬다(스펙 §1.6, P3e §1.1 정정:
 * 380 패널 + 24 gap + 928 k=2 방 + 32 패딩 + 2 테두리 = 1366 → 1380)
 */
const DOCK_MIN_WIDTH = 1380;
const NO_BUDGET = { monthlyCapUsd: null, platformMonthToDateUsd: 0, killSwitch: false } as const;
/** "마지막 갱신"이 이만큼 지나면 경고색 */
const STALE_AFTER_MS = 30_000;

type View = "office" | "team";
type PanelState = { kind: "persona"; id: string } | { kind: "board" } | { kind: "meeting" } | null;

/**
 * AI 사무실(P3a AGP-39·40·11) — `/projects/:projectId/ai-office`. 라우트 lazy 청크라
 * 픽셀 에셋·갈무리11 폰트(ai-office.css의 @font-face)는 이 화면을 여는 사람만 받는다.
 */
export default function AiOfficePage() {
  const { projectId = "" } = useParams();
  const status = useAiTeamStatus();
  if (status === "unknown") {
    return (
      <div className="board-loading">
        <Spinner size="large" label="AI 사무실 불러오는 중" />
      </div>
    );
  }
  if (status === "inactive") {
    return (
      <EmptyState title="AI 팀이 아직 없습니다" description="agent-service가 연결된 플랫폼에서만 쓸 수 있습니다" />
    );
  }
  // 프로젝트가 바뀌면 폴링·패널 상태를 새로 시작한다(이전 프로젝트 조회가 늦게 도착해 덮는 경합 차단)
  return <AiOffice key={projectId} projectId={projectId} />;
}

function useDocked(): [(el: HTMLDivElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setDocked(el.clientWidth >= DOCK_MIN_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, docked];
}

function AiOffice({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get("view") === "team" ? "team" : "office";
  const [panel, setPanel] = useState<PanelState>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const data = useOfficeData(projectId, panel?.kind === "persona" ? panel.id : null);
  const { issueModal } = useIssueModal(() => undefined);
  const { canManage } = useAgentPermissions(projectId);
  const [conveneOpen, setConveneOpen] = useState(false);
  const [note, setNote] = useState("");
  const goalsData = useEpicGoals(projectId, panel?.kind === "board");
  useEffect(() => {
    if (data.announcement) setNote(data.announcement);
  }, [data.announcement]);

  const base = `/projects/${projectId}/ai-office`;
  const links: OfficeLinks = useMemo(
    () => ({
      gates: `${base}/gates`,
      runs: `${base}/runs`,
      run: (runId: string) => `${base}/runs/${encodeURIComponent(runId)}`,
      issue: (key: string) => {
        const next = new URLSearchParams(searchParams);
        next.set("issue", key);
        return `?${next.toString()}`;
      },
    }),
    [base, searchParams],
  );

  const office = data.office;
  const personas = useMemo(() => sortPersonas(office?.personas ?? []), [office]);
  const personaById = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);
  const finished = useMemo(() => finishedRuns(office?.recentRuns ?? []), [office]);
  const activeMeeting = office?.activeMeeting ?? null;
  const seats = useMemo(() => meetingSeats(activeMeeting, personas), [activeMeeting, personas]);
  const goals = useMemo(
    () => (goalsData.loaded ? epicGoals(goalsData.issues, goalsData.types, goalsData.statuses, personas) : []),
    [goalsData.loaded, goalsData.issues, goalsData.types, goalsData.statuses, personas],
  );
  const goalsView: GoalsView = {
    status: goalsData.status,
    goals,
    statuses: goalsData.statuses,
    types: goalsData.types,
    retry: goalsData.retry,
  };

  const panelTarget: PanelTarget | null =
    panel?.kind === "board" || panel?.kind === "meeting"
      ? { kind: panel.kind }
      : panel?.kind === "persona" && personaById.get(panel.id)
        ? { kind: "persona", persona: personaById.get(panel.id)! }
        : null;

  const openPersona = useCallback((id: string, el: HTMLElement) => {
    setOpener(el);
    setPanel((prev) => (prev?.kind === "persona" && prev.id === id ? prev : { kind: "persona", id }));
  }, []);
  const openBoard = useCallback((el: HTMLElement) => {
    setOpener(el);
    setPanel({ kind: "board" });
  }, []);
  const openMeeting = useCallback((el: HTMLElement) => {
    setOpener(el);
    setPanel({ kind: "meeting" });
  }, []);
  const closePanel = useCallback(() => {
    // 연 요소가 폴링으로 바뀌었으면(유휴→책상 등) 같은 페르소나를 가리키는 현재 버튼으로 돌아간다
    const fallback = document.querySelector<HTMLElement>('.ai-office [aria-controls="ai-office-panel"][aria-expanded="true"]');
    setPanel(null);
    const target = opener?.isConnected ? opener : fallback;
    requestAnimationFrame(() => target?.focus());
  }, [opener]);

  const setView = (value: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "team") next.set("view", "team");
        else next.delete("view");
        return next;
      },
      { replace: true },
    );

  const pending = office?.pendingGateCount ?? 0;

  const body = (which: View) => (
    <div className="ai-office-view">
      <div className="ai-office-links">
        <Button
          variant="ghost"
          size="small"
          iconBefore={<History size={14} aria-hidden />}
          onClick={() => navigate(links.runs)}
        >
          실행 기록
        </Button>
        <Button
          variant="ghost"
          size="small"
          iconBefore={<Inbox size={14} aria-hidden />}
          aria-label={pending > 0 ? `승인 인박스, 대기 ${pending}건` : "승인 인박스"}
          onClick={() => navigate(links.gates)}
        >
          승인 인박스
          {pending > 0 ? <Badge appearance="danger">{pending}</Badge> : null}
        </Button>
        {/* 회의 소집은 예산을 쓰는 행위라 서버도 관리자(전역 또는 이 프로젝트 ADMIN)만 받는다 — 버튼도 그들에게만 */}
        {canManage ? (
          <Button
            variant="ghost"
            size="small"
            iconBefore={<UsersRound size={14} aria-hidden />}
            onClick={() => setConveneOpen(true)}
          >
            회의 소집
          </Button>
        ) : null}
      </div>
      {office ? <OfficeSummary data={data} office={office} gatesHref={links.gates} /> : null}
      {office?.budget.killSwitch ? (
        <Banner variant="danger">
          킬 스위치가 켜져 있어 모든 AI 작업이 멈췄습니다. 새 실행은 시작되지 않습니다.
        </Banner>
      ) : null}
      {data.stale ? (
        <Banner variant="warning" action={{ label: "지금 다시 시도", onClick: data.refresh }}>
          사무실 상태를 새로 고치지 못했습니다. 마지막으로 받은 상태를 보여 주고 있습니다 (10초 뒤 다시 시도)
        </Banner>
      ) : null}
      <OfficeBody
        which={which}
        data={data}
        panel={panel}
        onRetry={data.refresh}
        renderPanel={
          panelTarget
            ? (docked) => (
                <OfficePanel
                  target={panelTarget}
                  personaNames={personaById}
                  recentFinished={finished}
                  boardPosts={office?.boardPosts ?? []}
                  activity={data.activity}
                  activityStatus={data.activityStatus}
                  links={links}
                  docked={docked}
                  meeting={activeMeeting}
                  goals={goalsView}
                  onClose={closePanel}
                  onRetry={data.refresh}
                  onOpenPersona={openPersona}
                  onOpenBoard={openBoard}
                  onConvene={canManage ? () => setConveneOpen(true) : undefined}
                />
              )
            : null
        }
      >
        {which === "office" ? (
          <OfficeCanvas
            personas={personas}
            activeMeeting={activeMeeting}
            seats={seats}
            budget={office?.budget ?? NO_BUDGET}
            gatesHref={links.gates}
            selectedId={panel?.kind === "persona" ? panel.id : null}
            boardOpen={panel?.kind === "board"}
            meetingOpen={panel?.kind === "meeting"}
            boardCount={finished.length}
            postCount={office?.boardPosts.length ?? 0}
            goalCount={goalsData.loaded ? goals.filter((g) => g.kind !== "complete").length : null}
            todayReports={todayReportCount(office?.recentRuns ?? [])}
            onOpenPersona={openPersona}
            onOpenBoard={openBoard}
            onOpenMeeting={openMeeting}
            onAnnounce={setNote}
          />
        ) : (
          <TeamCards
            personas={personas}
            activeMeeting={activeMeeting}
            seats={seats}
            finished={finished}
            selectedId={panel?.kind === "persona" ? panel.id : null}
            links={links}
            onOpenPersona={openPersona}
          />
        )}
      </OfficeBody>
    </div>
  );

  return (
    <div className="ai-office">
      <Tabs
        label="AI 사무실 보기"
        className="ai-office-tabs"
        value={view}
        onValueChange={setView}
        items={[
          {
            value: "office",
            label: (
              <span className="status-cell">
                <Building2 size={14} aria-hidden /> 사무실
              </span>
            ),
            ariaLabel: "사무실",
            content: body("office"),
          },
          {
            value: "team",
            label: (
              <span className="status-cell">
                <LayoutGrid size={14} aria-hidden /> 팀 카드
              </span>
            ),
            ariaLabel: "팀 카드",
            content: body("team"),
          },
        ]}
      />
      <div className="ai-office-sr" aria-live="polite">
        {note}
      </div>
      {issueModal}
      {canManage ? (
        <MeetingConveneModal
          projectId={projectId}
          personas={personas}
          open={conveneOpen}
          onOpenChange={setConveneOpen}
          onCreated={data.refresh}
        />
      ) : null}
    </div>
  );
}

/** 본문 그리드(캔버스/카드 + 패널) — 로딩·첫 실패·빈 팀 상태도 여기서 */
function OfficeBody({
  which,
  data,
  panel,
  renderPanel,
  onRetry,
  children,
}: {
  which: View;
  data: OfficeData;
  panel: PanelState;
  renderPanel: ((docked: boolean) => ReactNode) | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  const [bodyRef, docked] = useDocked();
  let content: ReactNode = children;
  if (data.status === "loading") {
    content =
      which === "office" ? (
        <section className="ai-office-stage is-placeholder" aria-label="AI 사무실 평면도">
          <div className="ai-office-room is-placeholder">
            <Spinner size="large" label="사무실을 불러오는 중" />
          </div>
        </section>
      ) : (
        <div className="board-loading">
          <Spinner size="large" label="AI 팀을 불러오는 중" />
        </div>
      );
  } else if (data.status === "error") {
    content = (
      <section className="ai-office-stage is-placeholder" aria-label="AI 사무실 평면도">
        <EmptyState
          title="사무실 상태를 불러오지 못했습니다"
          description="agent-service 연결을 확인하세요"
          primaryAction={{ label: "다시 시도", onClick: onRetry }}
        />
      </section>
    );
  } else if (data.office && data.office.personas.length === 0) {
    content = <EmptyState title="AI 팀이 아직 없습니다" description="페르소나가 등록되면 이곳에 자리가 생깁니다" />;
  }
  const cls = ["ai-office-body", docked ? "is-docked" : "is-overlay", panel ? "has-panel" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} ref={bodyRef} data-docked={docked ? "true" : "false"}>
      {content}
      {renderPanel ? renderPanel(docked) : null}
    </div>
  );
}

/** 요약 바(스펙 §1.2) — 캔버스 밖이라 DS 토큰·컴포넌트만 */
function OfficeSummary({ data, office, gatesHref }: { data: OfficeData; office: AgentOffice; gatesHref: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const counts = officeCounts(office.personas);
  const cap = office.budget.monthlyCapUsd;
  const updatedIso = data.lastUpdated ? new Date(data.lastUpdated).toISOString() : office.generatedAt;
  const late = data.stale || (data.lastUpdated !== null && now - data.lastUpdated > STALE_AFTER_MS);

  return (
    <dl className="ai-office-summary" aria-label="AI 팀 요약">
      <SummaryItem icon={<Coins size={16} aria-hidden />} label="오늘 비용">
        {formatUsd(todayCostTotal(office.personas))}
      </SummaryItem>
      <SummaryItem icon={<Wallet size={16} aria-hidden />} label="이달 비용">
        {formatUsd(office.budget.platformMonthToDateUsd)}
        {cap !== null ? ` / ${formatUsd(cap)}` : ""}
      </SummaryItem>
      <SummaryItem icon={<Keyboard size={16} aria-hidden />} label="작업 중">
        {counts.byState.RUNNING}
      </SummaryItem>
      <SummaryItem icon={<CircleAlert size={16} aria-hidden />} label="승인 대기">
        {office.pendingGateCount > 0 ? (
          <Link className="ai-office-summary-warn" to={gatesHref}>
            {office.pendingGateCount}
          </Link>
        ) : (
          0
        )}
      </SummaryItem>
      <SummaryItem icon={office.budget.killSwitch ? <OctagonX size={16} aria-hidden /> : <Power size={16} aria-hidden />} label="킬 스위치">
        {office.budget.killSwitch ? (
          <Lozenge appearance="danger" className="agent-lozenge">
            <OctagonX size={12} aria-hidden />
            정지됨
          </Lozenge>
        ) : (
          <Lozenge appearance="success" className="agent-lozenge">
            <Power size={12} aria-hidden />
            가동 중
          </Lozenge>
        )}
      </SummaryItem>
      <SummaryItem icon={<Clock size={16} aria-hidden />} label="마지막 갱신">
        <span className={late ? "ai-office-summary-warn" : undefined}>{relTimeFine(updatedIso, now)}</span>
        <Button
          variant="ghost"
          size="small"
          iconOnly
          aria-label="지금 새로 고침"
          disabled={data.refreshing}
          className={data.refreshing ? "ai-office-refresh is-spinning" : "ai-office-refresh"}
          onClick={data.refresh}
        >
          <RefreshCw size={14} aria-hidden />
        </Button>
      </SummaryItem>
    </dl>
  );
}

function SummaryItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="ai-office-summary-item">
      <span className="ai-office-summary-icon">{icon}</span>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
