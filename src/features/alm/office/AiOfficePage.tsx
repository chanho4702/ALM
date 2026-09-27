import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import type { AgentCurrentRun, AgentOffice, AgentPersonaActivity, AgentRunSummary } from "../store/types";
import { fetchPersonaActivity, getCurrentUser } from "../store/jiraStore";
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
import { OfficeDialog, type DialogCloseResult } from "./OfficeDialog";
import { DialogMemory, useDialogLog } from "./useDialogLog";
import { useOfficeWalker } from "./useOfficeWalker";
import { roomGeometry, userVars } from "./pixel";
import { awayNotice, NOBODY_NEAR } from "./officeDialogCopy";
import {
  avatarPosition,
  personaPlace,
  resolveTarget,
  standingFeet,
  stepTile,
  talkSpot,
  tileKey,
  walkGrid,
  zoneName,
  type Facing,
  type Tile,
} from "./walkGrid";
import {
  epicGoals,
  finishedRuns,
  formatUsd,
  meetingSeats,
  officeCounts,
  personaState,
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

/** 말 걸기(P3g §3.1) — 다가가는 중(approaching) → 장면 열림(open). 대상이 움직이면 goal을 바꿔 다시 경로를 잡는다 */
interface TalkState {
  personaId: string;
  phase: "approaching" | "open";
  /** 대화를 시작한 요소 — 닫히면 포커스를 돌린다 */
  opener: HTMLElement | null;
  /** 지금 향하는 대화 위치 타일 키 */
  goal: string;
}

/** 맡기기 성공 뒤 낙관적 currentRun — 다음 폴링 결과가 오면 폐기(서버가 이긴다) */
interface Optimistic {
  personaId: string;
  run: AgentCurrentRun;
  stamp: number | null;
}

const ARROW_FACING: Record<string, Facing> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

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
  const [optimistic, setOptimistic] = useState<Optimistic | null>(null);
  const [botWalk, setBotWalk] = useState<{ personaId: string; from: { x: number; y: number }; seq: number } | null>(null);
  const walkSeq = useRef(0);
  // 다음 폴링 결과가 오면 낙관적 상태·봇 걷기 연출을 버린다 — 서버 상태를 따른다
  useEffect(() => {
    if (optimistic && optimistic.stamp !== data.lastUpdated) {
      setOptimistic(null);
      setBotWalk(null);
    }
  }, [data.lastUpdated, optimistic]);
  const basePersonas = useMemo(() => sortPersonas(office?.personas ?? []), [office]);
  const personas = useMemo(
    () =>
      optimistic
        ? basePersonas.map((p) => (p.id === optimistic.personaId ? { ...p, currentRun: optimistic.run } : p))
        : basePersonas,
    [basePersonas, optimistic],
  );
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

  const openPersona = useCallback((id: string, el: HTMLElement | null) => {
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
    const current = panel?.kind === "persona" ? personaButton(panel.id) : null;
    const fallback = current ?? document.querySelector<HTMLElement>('.ai-office [aria-controls="ai-office-panel"][aria-expanded="true"]');
    setPanel(null);
    const target = opener?.isConnected && isFocusable(opener) ? opener : fallback;
    requestAnimationFrame(() => target?.focus());
  }, [opener, panel]);

  const setView = useCallback(
    (value: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === "team") next.set("view", "team");
          else next.delete("view");
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // ── P3g 사람 아바타·1:1 대화 — 상태는 페이지에 둔다(사무실 ↔ 팀 카드 탭 전환에도 유지, 라우트를 떠나면 초기화) ──
  const [memory] = useState(() => new DialogMemory());
  const [logVersion, setLogVersion] = useState(0);
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getCurrentUser().then(
      (u) => alive && setMeId(u.id),
      () => alive && setMeId(null),
    );
    return () => {
      alive = false;
    };
  }, []);
  const meVars = useMemo(() => userVars(meId), [meId]);

  const personaCount = personas.length;
  const grid = useMemo(
    () => (office && personaCount > 0 ? walkGrid(personaCount, roomGeometry(personaCount).height) : null),
    [office !== null, personaCount], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const walker = useOfficeWalker(grid);
  const places = useMemo(
    () => personas.map((p, i) => personaPlace(personaState(p), i, seats.has(p.id))),
    [personas, seats],
  );
  const soft = useMemo(() => new Set([...standingFeet(places).values()].map(tileKey)), [places]);

  const [talk, setTalk] = useState<TalkState | null>(null);
  const [talkActivity, setTalkActivity] = useState<{ personaId: string; activity: AgentPersonaActivity | null; failed: boolean } | null>(null);
  const dialogLog = useDialogLog(talk?.personaId ?? null, memory);
  const loadLog = dialogLog.load;
  const talkId = talk?.personaId ?? null;
  // 다가가는 동안 미리 받아 둔다 — "지금 뭐 해?" 즉답·인사("또 오셨네요")의 전제
  useEffect(() => {
    if (talkId) loadLog();
  }, [talkId, loadLog]);

  const openTalk = useCallback((id: string) => {
    setTalk((t) => (t && t.personaId === id ? { ...t, phase: "open" } : t));
  }, []);

  const startTalk = useCallback(
    (id: string, opener: HTMLElement | null) => {
      const index = personas.findIndex((p) => p.id === id);
      const persona = personas[index];
      if (!persona || !grid) return;
      const spot = talkSpot(grid, places[index], places);
      if (!spot) {
        setNote(awayNotice(persona.name));
        return;
      }
      if (view !== "office") setView("office");
      const options = { soft, face: spot.facing, alignX: spot.alignX, onArrive: () => openTalk(id) };
      // 같은 봇을 걷는 중에 한 번 더 — 남은 걸음을 건너뛰고 대화 위치로 바로("뽁")
      if (talk?.personaId === id && talk.phase === "approaching") {
        walker.jumpTo(spot.tile, options);
        return;
      }
      setTalk({ personaId: id, phase: "approaching", opener, goal: tileKey(spot.tile) });
      setTalkActivity({ personaId: id, activity: null, failed: false });
      fetchPersonaActivity(id).then(
        (activity) => setTalkActivity((prev) => (prev?.personaId === id ? { ...prev, activity } : prev)),
        () => setTalkActivity((prev) => (prev?.personaId === id ? { ...prev, failed: true } : prev)),
      );
      walker.walkTo(spot.tile, options);
    },
    [grid, openTalk, personas, places, setView, soft, talk, view, walker],
  );

  // 걷는 동안 대상이 움직이면 새 대화 위치로, 비활성이 되면 걷기·핀 취소
  useEffect(() => {
    if (!talk || talk.phase !== "approaching" || !grid) return;
    const index = personas.findIndex((p) => p.id === talk.personaId);
    const persona = personas[index];
    const spot = persona && persona.active ? talkSpot(grid, places[index], places) : null;
    if (!spot) {
      walker.cancel();
      setTalk(null);
      setNote(awayNotice(persona?.name ?? "그 팀원"));
      return;
    }
    const key = tileKey(spot.tile);
    if (key === talk.goal) return;
    setTalk({ ...talk, goal: key });
    walker.walkTo(spot.tile, { soft, face: spot.facing, alignX: spot.alignX, onArrive: () => openTalk(talk.personaId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, grid]);

  const onFloor = useCallback(
    (tile: Tile) => {
      if (!grid || talk?.phase === "open") return;
      // 걷는 동안 바닥을 누르면 말 걸기 의도를 취소하고 그냥 이동한다
      if (talk) setTalk(null);
      const goal = resolveTarget(grid, tile, soft);
      if (goal) walker.walkTo(goal, { soft });
    },
    [grid, soft, talk, walker],
  );

  const onMeKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const facing = ARROW_FACING[e.key];
      if (facing) {
        e.preventDefault();
        if (talk) {
          walker.cancel();
          setTalk(null);
        }
        walker.step(facing);
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (!grid) return;
      const here = walker.tile;
      const ahead = stepTile(here, walker.facing);
      const near = personas
        .map((p, i) => ({ p, i, spot: p.active ? talkSpot(grid, places[i], places) : null }))
        .filter(({ spot }) => spot && Math.abs(spot.tile.tx - here.tx) + Math.abs(spot.tile.ty - here.ty) <= 1)
        .map((c) => {
          const at = c.spot!.tile.tx === here.tx && c.spot!.tile.ty === here.ty;
          const rank = at && c.spot!.facing === walker.facing ? 0 : at ? 1 : c.spot!.tile.tx === ahead.tx && c.spot!.tile.ty === ahead.ty ? 2 : 3;
          return { ...c, rank };
        })
        .sort((a, b) => a.rank - b.rank || a.i - b.i);
      if (near.length > 0) startTalk(near[0].p.id, e.currentTarget);
      else setNote(NOBODY_NEAR);
    },
    [grid, personas, places, startTalk, talk, walker],
  );

  // 구역 이름 — "나" 접근 이름 안, 그리고 구역이 바뀔 때만 live로 읽는다(걸음마다 읽지 않는다)
  const zone = grid ? zoneName(grid, { tx: walker.tile.tx, ty: Math.min(grid.rows - 1, walker.tile.ty) }) : "입구";
  const lastZone = useRef(zone);
  useEffect(() => {
    if (zone === lastZone.current) return;
    lastZone.current = zone;
    setNote(`나 — ${zone}`);
  }, [zone]);

  const canvasUser =
    grid && walker.entered
      ? {
          tile: walker.tile,
          facing: walker.facing,
          moving: walker.moving,
          stepMs: walker.stepMs,
          pin: walker.pin,
          alignX: walker.alignX,
          puff: walker.puff,
          tagHidden: talk?.phase === "open",
          vars: meVars,
        }
      : null;

  const talkFromPanel = useCallback(
    (id: string, el: HTMLElement) => {
      setPanel(null);
      startTalk(id, el);
    },
    [startTalk],
  );

  const applyAssigned = useCallback(
    (personaId: string, run: AgentRunSummary) => {
      const index = basePersonas.findIndex((p) => p.id === personaId);
      const persona = basePersonas[index];
      // 쉬고 있던 봇만 — 바쁜 봇에게 맡긴 run은 서버 대기열 뒤에 선다(자리가 바뀌지 않는다)
      if (!persona || persona.currentRun || run.status !== "QUEUED") return;
      const from = seats.has(personaId) ? null : avatarPosition(personaState(persona), index);
      setOptimistic({ personaId, run: toCurrentRun(run), stamp: data.lastUpdated });
      walkSeq.current += 1;
      if (from) setBotWalk({ personaId, from, seq: walkSeq.current });
    },
    [basePersonas, data.lastUpdated, seats],
  );

  const onDialogClosed = useCallback(
    (result: DialogCloseResult) => {
      const t = talk;
      setTalk(null);
      if (!t) return;
      if (panel?.kind === "persona" && panel.id === t.personaId) setLogVersion((v) => v + 1);
      if (result.kind === "navigate") {
        navigate(result.to);
        return;
      }
      if (result.kind === "panel") {
        setLogVersion((v) => v + 1);
        openPersona(t.personaId, personaButton(t.personaId));
        return;
      }
      if (result.kind === "assigned") applyAssigned(t.personaId, result.run);
      const target = t.opener?.isConnected && isFocusable(t.opener) ? t.opener : personaButton(t.personaId);
      requestAnimationFrame(() => target?.focus());
    },
    [applyAssigned, navigate, openPersona, panel, talk],
  );

  const talkPersona = talk ? personas.find((p) => p.id === talk.personaId) : undefined;
  // 장면이 열린 채 대상이 응답에서 사라지면(삭제 등) 장면은 내려가므로 대화 상태도 비운다 — 캔버스가 멈춘 채 남지 않게
  useEffect(() => {
    if (talk?.phase === "open" && office && !talkPersona) setTalk(null);
  }, [office, talk, talkPersona]);

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
                  dialogMemory={memory}
                  logVersion={logVersion}
                  onTalk={talkFromPanel}
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
            onOpenBoard={openBoard}
            onOpenMeeting={openMeeting}
            onAnnounce={setNote}
            grid={grid ?? EMPTY_GRID}
            user={canvasUser}
            talkTargetId={talk?.personaId ?? null}
            dialogOpen={talk?.phase === "open"}
            botWalk={botWalk}
            onTalk={startTalk}
            onFloor={onFloor}
            onMeKey={onMeKey}
            meLabel={`나 — ${zone}. 방향키로 이동, Enter로 옆 팀원에게 말 걸기`}
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
            onTalk={startTalk}
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
      {talk?.phase === "open" && talkPersona && office ? (
        <OfficeDialog
          persona={talkPersona}
          inMeeting={seats.has(talkPersona.id)}
          meetingType={seats.has(talkPersona.id) ? (activeMeeting?.type ?? null) : null}
          activity={talkActivity?.personaId === talkPersona.id ? talkActivity.activity : null}
          activityFailed={talkActivity?.personaId === talkPersona.id && talkActivity.failed}
          recentRuns={office.recentRuns}
          personas={personas}
          features={office.features}
          budget={office.budget}
          canManage={canManage}
          projectId={projectId}
          userVars={meVars}
          stageEl={document.querySelector<HTMLElement>(".ai-office .ai-office-stage")}
          log={dialogLog}
          links={links}
          announcement={data.announcement}
          onClosed={onDialogClosed}
        />
      ) : null}
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

/** 사무실 로딩 전 캔버스에 넘기는 빈 맵 — 캔버스는 사무실이 있을 때만 그려지므로 실제로 쓰이지 않는다 */
const EMPTY_GRID = walkGrid(0, 192);

/** 캔버스에서 그 페르소나를 가리키는 지금 버튼 — 폴링으로 자리가 바뀌면 연 요소가 사라질 수 있다 */
function personaButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.ai-office .office-hit[data-persona="${CSS.escape(id)}"]`);
}

const isFocusable = (el: HTMLElement) => el.matches("button, a, input, textarea, [tabindex]");

function toCurrentRun(run: AgentRunSummary): AgentCurrentRun {
  return {
    id: run.id,
    status: run.status as AgentCurrentRun["status"],
    issueKey: run.issueKey,
    type: run.type,
    trigger: run.trigger,
    attempt: run.attempt,
    model: run.model,
    startedAt: run.startedAt,
    // 러너 대기 여부는 서버만 안다 — 다음 폴링이 채운다
    executionSite: run.executionSite,
  };
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
