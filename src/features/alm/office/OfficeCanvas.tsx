import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router";
import { Badge } from "@chanho/react";
import type { AgentActiveMeeting, AgentBudget, AgentOfficePersona } from "../store/types";
import type { AgentPersonaState } from "../components/AgentGlyphs";
import {
  avatarPaths,
  avatarVars,
  backgroundPaths,
  backgroundTopPaths,
  microBubblePaths,
  plantSpots,
  roomFurniturePaths,
  roomGeometry,
  spritePaths,
  userPaths,
  WINDOWS,
  type AvatarFrame,
  ROOM_W,
} from "./pixel";
import { PixelSprite } from "./PixelSprite";
import { personaLook } from "./avatarConfig";
import {
  bubbleText,
  coffeeCopy,
  FAR_SEATS_X,
  formatUsd,
  isAwaitingRunner,
  isLocalRun,
  meetingName,
  meetingRoomAccessibleName,
  meetingRunStatus,
  meetingSignText,
  NEAR_SEATS_X,
  officeSummaryText,
  personaAccessibleName,
  personaState,
  todayCostTotal,
  type MeetingSeat,
} from "./officeModel";
import { useOfficeAmbience, type AmbienceSnapshot, type Stroll } from "./useOfficeAmbience";
import {
  avatarPosition,
  botFootTile,
  botSpriteXY,
  cellOf,
  DOORMAT_X,
  findPath,
  idleSpot,
  isReachable,
  tileAt,
  userSpriteXY,
  type Facing,
  type Tile,
  type WalkGrid,
} from "./walkGrid";

/** 자리 이동 시간 — CSS `transition: transform 640ms steps(8)`과 같은 값 */
const WALK_MS = 640;
/** 페르소나마다 루프 위상을 흩는 간격 */
const PHASE_STEP_MS = 170;
/** 사무실 고양이(P3e §4.6) — 사용자 채택(2026-09-27). false면 에셋만 남기고 그리지 않는다 */
export const OFFICE_CAT = true;
/** 커피 팝·고양이 반응이 떠 있는 시간 */
const COFFEE_POP_MS = 5000;
const CAT_AWAKE_MS = 2000;

export interface OfficeCanvasProps {
  /** 정렬된 페르소나(스펙 §1.5) — 인덱스가 책상·유휴 자리를 고정한다 */
  personas: readonly AgentOfficePersona[];
  /** 진행 중 회의와 그 좌석(`meetingSeats`) — 팀 카드와 같은 파생을 쓴다 */
  activeMeeting: AgentActiveMeeting | null;
  seats: ReadonlyMap<string, MeetingSeat>;
  budget: AgentBudget;
  gatesHref: string;
  selectedId: string | null;
  boardOpen: boolean;
  meetingOpen: boolean;
  boardCount: number;
  /** 게시판 회의록 게시물 수 */
  postCount: number;
  /** 진행 중 목표(에픽) 수 — 게시판을 한 번도 열지 않아 모르면 null */
  goalCount: number | null;
  todayReports: number;
  onOpenBoard: (opener: HTMLElement) => void;
  onOpenMeeting: (opener: HTMLElement) => void;
  /** 클릭 반응(커피값·고양이)을 라이브 영역으로 */
  onAnnounce: (text: string) => void;
  // ── P3g 사람 아바타·1:1 대화 ──
  /** 보행 맵(인원·방 높이로 memo) — 바닥 클릭 좌표를 타일로 바꾼다 */
  grid: WalkGrid;
  /** 사람 아바타 — 입장 전이면 null */
  user: CanvasUser | null;
  /** 말 걸기 대상(다가가는 중부터 대화가 끝날 때까지) — 💬 표시·말풍선 숨김·디렉터 제외 */
  talkTargetId: string | null;
  /** 대화 장면이 열려 있다 — 디렉터 정지 + CSS 애니 정지(캔버스가 가려져 있다) */
  dialogOpen: boolean;
  /** 맡기기 성공 뒤 봇이 일어나 책상으로 걷는 연출(서버 응답으로 만든 낙관적 상태) */
  botWalk: BotWalkRequest | null;
  /** 페르소나 버튼·빈 책상 = 걸어가서 말 걸기(P3g §2.5) */
  onTalk: (id: string, opener: HTMLElement) => void;
  /** 바닥 클릭 = 이동 */
  onFloor: (tile: Tile) => void;
  /** "나" 버튼 키보드(방향키·Enter) */
  onMeKey: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** "나" 버튼 접근 이름 — "나 — {구역}. 방향키로 이동, Enter로 옆 팀원에게 말 걸기" */
  meLabel: string;
}

export interface CanvasUser {
  tile: Tile;
  facing: Facing;
  moving: boolean;
  stepMs: number;
  pin: Tile | null;
  alignX: number;
  puff: number;
  /** 대화 위치에 도착해 장면이 열려 있으면 "나" 표를 숨긴다(대상 봇을 가리므로) */
  tagHidden: boolean;
  /** 피부·머리 슬롯(로그인 사용자 id 해시) */
  vars: Record<string, string>;
}

export interface BotWalkRequest {
  personaId: string;
  /** 연출 시작 자리(낙관적 상태를 덮기 전 아바타 좌상단) */
  from: { x: number; y: number };
  /** 같은 봇에게 두 번 맡겨도 다시 걷게 하는 순번 */
  seq: number;
}

type Pose = "seat" | "slump" | "stand" | "seatFar" | "seatBack";

function poseOf(state: AgentPersonaState): Pose | null {
  if (state === "RUNNING" || state === "WAITING_APPROVAL" || state === "REMOTE") return "seat";
  if (state === "BLOCKED") return "slump";
  if (state === "QUEUED" || state === "IDLE") return "stand";
  return null;
}

const seatPose = (seat: MeetingSeat): Pose => (seat.side === "far" ? "seatFar" : seat.side === "near" ? "seatBack" : "stand");

const vars = (v: Record<string, string | number>) => v as CSSProperties;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** 두 프레임 루프 — CSS가 f-a/f-b를 번갈아 보인다(JS 타이머 없음, 스펙 §8.1) */
function Loop({ ms, phase, a, b }: { ms: number; phase: number; a: ReactNode; b: ReactNode }) {
  return (
    <g className="office-loop" style={vars({ "--loop": `${ms}ms`, "--phase": `${-phase * PHASE_STEP_MS}ms` })}>
      <g className="f-a">{a}</g>
      <g className="f-b">{b}</g>
    </g>
  );
}

function StandingFrames({ persona, index }: { persona: AgentOfficePersona; index: number }) {
  const look = personaLook(persona);
  const frame = (f: AvatarFrame) => <PixelSprite paths={avatarPaths(persona.role, f, look)} />;
  return (
    <>
      <path className="px-shadow" d="M2 22h12v2h-12z" />
      <Loop ms={1200} phase={index} a={frame("standA")} b={frame("standB")} />
    </>
  );
}

/** 산책 프레임(P3e §4.1) — 걷기 2프레임 250ms, 커피 머신 앞 뒷모습 정지, 복귀 뒤 컵 든 채 숨쉬기 */
function StrollFrames({ persona, stroll }: { persona: AgentOfficePersona; stroll: Stroll }) {
  const look = personaLook(persona);
  const frame = (f: AvatarFrame) => <PixelSprite paths={avatarPaths(persona.role, f, look)} />;
  const cup = (dy = 0) => <PixelSprite paths={spritePaths("CUP", "item")} x={12} y={14 + dy} />;
  if (!stroll.walking && stroll.leg === 3) return frame("back");
  if (!stroll.walking) {
    return (
      <>
        <path className="px-shadow" d="M2 22h12v2h-12z" />
        <Loop
          ms={1200}
          phase={0}
          a={
            <>
              {frame("standA")}
              {cup()}
            </>
          }
          b={
            <>
              {frame("standB")}
              {cup(1)}
            </>
          }
        />
      </>
    );
  }
  const back = stroll.facing === "back";
  return (
    <>
      <path className="px-shadow" d="M2 22h12v2h-12z" />
      <Loop ms={250} phase={0} a={frame(back ? "walkBackA" : "walkA")} b={frame(back ? "walkBackB" : "walkB")} />
      {stroll.cup ? cup() : null}
    </>
  );
}

/**
 * 페르소나 한 명의 아바타 — 폴링마다 다시 마운트하지 않는다(루프 리셋 방지). 자리가 바뀌면
 * transform 전이로 8계단 걸어가고, 걷는 동안은 서기 프레임, 도착하면 상태 프레임으로 바꾼다.
 * 산책 중에는 구간마다 거리/16초 전이(2ap당 한 계단)로 걷는다 — 취소되면 지금 좌표에서 새 목표로 8계단.
 */
function Avatar({
  persona,
  index,
  pose,
  x,
  y,
  hovered,
  stroll,
}: {
  persona: AgentOfficePersona;
  index: number;
  pose: Pose;
  x: number;
  y: number;
  hovered: boolean;
  stroll: Stroll | null;
}) {
  const [walking, setWalking] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const prev = last.current;
    last.current = { x, y };
    if (!prev || (prev.x === x && prev.y === y) || prefersReducedMotion()) return;
    setWalking(true);
    const timer = setTimeout(() => setWalking(false), WALK_MS);
    return () => clearTimeout(timer);
  }, [x, y]);

  const look = personaLook(persona);
  const shown: Pose = walking ? "stand" : pose;
  let body: ReactNode;
  if (stroll) body = <StrollFrames persona={persona} stroll={stroll} />;
  else if (shown === "stand") body = <StandingFrames persona={persona} index={index} />;
  else body = <PixelSprite paths={avatarPaths(persona.role, shown, look)} />;
  return (
    <g
      className={stroll ? "office-avatar is-strolling" : "office-avatar"}
      data-pose={stroll ? "stroll" : shown}
      data-persona={persona.id}
      style={vars({
        ...avatarVars(persona.slug, persona.role, look),
        "--ax": x,
        "--ay": y,
        ...(stroll ? { "--walk-ms": stroll.legMs, "--walk-steps": stroll.steps } : {}),
      })}
    >
      <g className={hovered ? "office-avatar-lift is-hover" : "office-avatar-lift"}>{body}</g>
    </g>
  );
}

/** 책상 세트(의자·책상·모니터·손·돋보기·빨간 표식) — 셀 원점 기준. 회의실에 간 사람은 모니터 OFF + 포스트잇 */
function DeskSet({ persona, index, away }: { persona: AgentOfficePersona; index: number; away: boolean }) {
  const { x0, y0 } = cellOf(index);
  const state = personaState(persona);
  const run = persona.currentRun;
  const hand = spritePaths("HAND", "char");
  return (
    <g
      className="office-desk"
      data-state={state}
      data-away={away ? "true" : undefined}
      style={vars(avatarVars(persona.slug, persona.role, personaLook(persona)))}
    >
      <PixelSprite paths={spritePaths("CHAIR", "furn")} x={x0 + 17} y={y0 + 6} />
      <PixelSprite paths={spritePaths("DESK", "furn")} x={x0 + 4} y={y0 + 16} />
      {state === "RUNNING" && !away ? (
        <Loop
          ms={600}
          phase={index}
          a={
            <>
              <PixelSprite paths={spritePaths("MONITOR_ON_A", "furn")} x={x0 + 5} y={y0 + 6} />
              <PixelSprite paths={hand} x={x0 + 19} y={y0 + 16} />
              <PixelSprite paths={hand} x={x0 + 27} y={y0 + 17} />
            </>
          }
          b={
            <>
              <PixelSprite paths={spritePaths("MONITOR_ON_B", "furn")} x={x0 + 5} y={y0 + 6} />
              <PixelSprite paths={hand} x={x0 + 19} y={y0 + 17} />
              <PixelSprite paths={hand} x={x0 + 27} y={y0 + 16} />
            </>
          }
        />
      ) : (
        <PixelSprite paths={spritePaths("MONITOR_OFF", "furn")} x={x0 + 5} y={y0 + 6} />
      )}
      {isLocalRun(run) && !isAwaitingRunner(run) && state !== "INACTIVE" && !away ? (
        // 내 PC 러너 run(P4a D-P4-4) — 모니터 화면 위 작은 도트 집. 정지 1프레임. 러너 대기 중엔 아직 어디서도 안 도니 말풍선만
        <g className="office-fx" data-overlay="house">
          <PixelSprite paths={spritePaths("HOUSE", "ovl")} x={x0 + 8} y={y0 + 8} />
        </g>
      ) : null}
      {away ? (
        <PixelSprite
          className="office-postit"
          paths={spritePaths("POSTIT", "note")}
          x={x0 + 8}
          y={y0 + 8}
        />
      ) : null}
      {run && run.type === "REVIEW" && state !== "INACTIVE" && !away ? (
        <PixelSprite
          className="office-fx"
          paths={spritePaths("MAGNIFIER", "ovl")}
          x={x0 + 32}
          y={y0 + 14}
        />
      ) : null}
      {state === "BLOCKED" ? (
        <PixelSprite className="office-fx" paths={spritePaths("RED_MARK", "ovl")} x={x0 + 36} y={y0 + 22} />
      ) : null}
    </g>
  );
}

/** 머리 위 오버레이(❗·Zz·⌛) — 프레임 B는 1ap 위(통통·둥실) */
function Bob({ name, x, y, ms, phase }: { name: "ALERT" | "ZZ" | "HOURGLASS"; x: number; y: number; ms: number; phase: number }) {
  const paths = spritePaths(name, "ovl");
  return (
    <g className="office-fx" data-overlay={name.toLowerCase()}>
      <Loop ms={ms} phase={phase} a={<PixelSprite paths={paths} x={x} y={y} />} b={<PixelSprite paths={paths} x={x} y={y - 1} />} />
    </g>
  );
}

/** 원격 접속 신호(AGP-63) — 바깥 전파가 켜졌다 꺼지는 2프레임(프레임 B는 바깥 전파 없음). reduced-motion이면 A 정지 */
function RemoteSignal({ x, y, phase }: { x: number; y: number; phase: number }) {
  return (
    <g className="office-fx" data-overlay="remote">
      <Loop
        ms={1200}
        phase={phase}
        a={<PixelSprite paths={spritePaths("REMOTE_SIGNAL_A", "ovl")} x={x} y={y} />}
        b={<PixelSprite paths={spritePaths("REMOTE_SIGNAL_B", "ovl")} x={x} y={y} />}
      />
    </g>
  );
}

function StateOverlay({ state, index }: { state: AgentPersonaState; index: number }) {
  const { x0, y0 } = cellOf(index);
  if (state === "REMOTE") return <RemoteSignal x={x0 + 31} y={y0 + 2} phase={index} />;
  if (state === "WAITING_APPROVAL") return <Bob name="ALERT" x={x0 + 31} y={y0} ms={800} phase={index} />;
  if (state === "BLOCKED") return <Bob name="ZZ" x={x0 + 30} y={y0} ms={1400} phase={index} />;
  if (state === "QUEUED") return <Bob name="HOURGLASS" x={x0 + 56} y={y0 + 2} ms={1000} phase={index} />;
  return null;
}

/** 화분 — 기본 프레임과 흔들림 프레임을 겹치고 CSS가 긴 주기 안에서 두 번 짧게 바꾼다(JS 없음, §4.3) */
function Plant({ x, y, periodS }: { x: number; y: number; periodS: number }) {
  return (
    <g className="office-plant" style={vars({ "--sway": `${periodS}s` })}>
      <PixelSprite className="office-plant-a" paths={spritePaths("PLANT", "plant")} x={x} y={y} />
      <PixelSprite className="office-plant-b" paths={spritePaths("PLANT_SWAY", "plant")} x={x} y={y} />
    </g>
  );
}

/** 창밖 — 라이트 구름 / 다크 별똥별(유리 영역 clip, 테마 전환은 CSS, §4.4) */
function Sky({ clipBase }: { clipBase: string }) {
  return (
    <>
      <defs>
        {WINDOWS.map((w, i) => (
          <clipPath key={`d${i}`} id={`${clipBase}-day-${i}`}>
            <rect x={w.x + 2} y={w.y + 2} width={28} height={5} />
          </clipPath>
        ))}
        {WINDOWS.map((w, i) => (
          <clipPath key={`n${i}`} id={`${clipBase}-night-${i}`}>
            <rect x={w.x + 2} y={w.y + 2} width={28} height={11} />
          </clipPath>
        ))}
      </defs>
      <g className="office-sky-day">
        {WINDOWS.map((w, i) => (
          <g key={i} clipPath={`url(#${clipBase}-day-${i})`}>
            <g className="office-cloud" style={vars({ "--delay": i === 0 ? "0s" : "-21s", "--still": i === 0 ? 20 : 30 })}>
              <PixelSprite paths={spritePaths("CLOUD", "sky")} x={w.x - 12} y={w.y + 2} />
            </g>
          </g>
        ))}
      </g>
      <g className="office-sky-night">
        {WINDOWS.map((w, i) => (
          <g key={i} clipPath={`url(#${clipBase}-night-${i})`}>
            <g className="office-meteor" style={vars({ "--period": i === 0 ? "71s" : "97s" })}>
              <PixelSprite paths={spritePaths("METEOR", "sky")} x={w.x + 12} y={w.y + 2} />
            </g>
          </g>
        ))}
      </g>
    </>
  );
}

/**
 * 사람 아바타(P3g §2.1·§2.3) — 칸마다 transform 전이(걷기 시간·8계단). 걷는 중이면 다리 2프레임 루프(칸 시간과 같은 주기),
 * 멈추면 마지막 방향의 서기 프레임, 정면이면 머그를 든다. 포인터는 통과시킨다(밑의 바닥·봇 클릭이 된다).
 */
function UserAvatar({ user }: { user: CanvasUser }) {
  const { x, y } = userSpriteXY(user.tile);
  const frame = (f: "stand" | "walkA" | "walkB") => <PixelSprite paths={userPaths(user.facing, f)} />;
  return (
    <g
      className={user.moving ? "office-user is-moving" : "office-user"}
      data-facing={user.facing}
      data-moving={user.moving ? "true" : undefined}
      style={vars({ ...user.vars, "--ux": x + user.alignX, "--uy": y, "--step-ms": user.stepMs })}
    >
      <path className="px-shadow" d="M2 23h12v1h-12z" />
      {user.moving ? (
        <Loop ms={user.stepMs} phase={0} a={frame("walkA")} b={frame("walkB")} />
      ) : (
        <>
          {frame("stand")}
          {user.facing === "down" ? <PixelSprite paths={spritePaths("CUP", "item")} x={12} y={14} /> : null}
        </>
      )}
      {user.puff > 0 ? <PixelSprite key={user.puff} className="office-user-puff" paths={spritePaths("MB_PUFF", "puff")} x={4} y={4} /> : null}
    </g>
  );
}

/** 목적지 핀 — 400ms 2프레임 통통(핀만 1ap 위, 바닥 고리는 고정). 바닥 층(책상 셀 다음)에 칠한다 */
function DestinationPin({ tile }: { tile: Tile }) {
  const x = 16 * tile.tx + 4;
  const y = 16 * tile.ty + 6;
  return (
    <g className="office-pin" data-testid="office-pin">
      <Loop
        ms={400}
        phase={0}
        a={<PixelSprite paths={spritePaths("PIN_A", "pin")} x={x} y={y} />}
        b={<PixelSprite paths={spritePaths("PIN_B", "pin")} x={x} y={y} />}
      />
    </g>
  );
}

/** 대화 표시(§7.1) — 말 걸기 대상 머리 위, 400ms 2프레임 통통 */
function TalkMark({ x, y }: { x: number; y: number }) {
  const paths = spritePaths("TALK_MARK", "mb");
  return (
    <g className="office-fx" data-overlay="talk">
      <Loop ms={400} phase={0} a={<PixelSprite paths={paths} x={x} y={y} />} b={<PixelSprite paths={paths} x={x} y={y - 1} />} />
    </g>
  );
}

/**
 * 맡기기 뒤 봇 걷기(§5.4-7) — 이번 이동만 A* 경로 + 걷기 프레임(정면/뒷모습), 1타일/250ms. 출발 타일이 닿지 않는 곳이면
 * (회의실 좌석 등) 연출 없이 P3a 이동으로 둔다. 마지막 칸 뒤 대기열 자리 좌표로 반걸음 맞춘다.
 */
function useBotWalk(request: BotWalkRequest | null, target: { x: number; y: number } | null, grid: WalkGrid): Stroll | null {
  const [leg, setLeg] = useState<Stroll | null>(null);
  const reqSeq = request?.seq ?? null;
  const targetKey = target ? `${target.x},${target.y}` : null;
  useEffect(() => {
    setLeg(null);
    if (!request || !target || prefersReducedMotion()) return;
    const start = botFootTile(request.from);
    const goal = botFootTile(target);
    const route = isReachable(grid, start) && isReachable(grid, goal) ? findPath(grid, start, goal) : null;
    if (!route) return;
    const points = [...route.slice(1).map(botSpriteXY), target];
    let i = 0;
    let at = request.from;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const next = () => {
      if (i >= points.length) {
        setLeg(null);
        return;
      }
      const to = points[i++];
      const dist = Math.abs(to.x - at.x) + Math.abs(to.y - at.y);
      const legMs = Math.max(1, Math.round((dist * 250) / 16));
      setLeg({
        personaId: request.personaId,
        leg: 0,
        x: to.x,
        y: to.y,
        legMs,
        steps: Math.max(1, Math.round(dist / 2)),
        facing: to.y < at.y ? "back" : "front",
        walking: true,
        cup: false,
        home: target,
      });
      at = to;
      timer = setTimeout(next, legMs);
    };
    next();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
    // 같은 요청(seq)·같은 목표면 다시 걷지 않는다 — 폴링이 연출을 리셋하지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqSeq, targetKey, grid]);
  return leg;
}

/**
 * 디렉터 스냅샷(P3e §5.2) — 말 걸기 대상은 산책·작업 이펙트·미니 말풍선에서 뺀다(P3g §7.2). 대상이 산책 중이었으면
 * idleIds에서 빠지므로 디렉터가 즉시 걷어 유휴 자리로 돌린다. 선택·hover 중인 봇은 새 산책을 시작하지 않는다.
 * 원격 접속(REMOTE, AGP-63)은 책상에 앉아 있으니 산책 대상이 아니고, 워커 run이 아니라 작업 이펙트도 없다.
 */
export function ambienceSnapshot({
  personas,
  seats,
  activeMeeting,
  meetingPaused,
  excludeStrollIds,
  talkTargetId,
  killSwitch,
}: {
  personas: readonly AgentOfficePersona[];
  seats: ReadonlyMap<string, MeetingSeat>;
  activeMeeting: AgentActiveMeeting | null;
  meetingPaused: boolean;
  excludeStrollIds: readonly (string | null)[];
  talkTargetId: string | null;
  killSwitch: boolean;
}): AmbienceSnapshot {
  const notTarget = (id: string) => id !== talkTargetId;
  const seated = personas.filter((p) => seats.has(p.id) && seats.get(p.id)!.side !== "stand" && notTarget(p.id)).map((p) => p.id);
  const idle = (p: AgentOfficePersona) => personaState(p) === "IDLE" && !seats.has(p.id) && notTarget(p.id);
  return {
    meeting:
      activeMeeting && !meetingPaused && seated.length > 0
        ? { type: activeMeeting.type, hostId: activeMeeting.hostPersonaId, seatedIds: seated }
        : null,
    strollCandidates: personas.flatMap((p, i) => (idle(p) && !excludeStrollIds.includes(p.id) ? [{ id: p.id, ...idleSpot(i) }] : [])),
    idleIds: personas.filter(idle).map((p) => p.id),
    effectTargets: personas
      .filter((p) => personaState(p) === "RUNNING" && !seats.has(p.id) && notTarget(p.id))
      .map((p) => ({ id: p.id, attempt: p.currentRun?.attempt ?? 1 })),
    killSwitch,
  };
}

/** 스테이지 폭에 맞춘 정수 배율 k(2~4) — 비정수 배율은 도트가 뭉개진다 */
function useScale(stage: RefObject<HTMLDivElement | null>): number {
  const [k, setK] = useState(2);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
      const next = Math.min(4, Math.max(2, Math.floor(inner / ROOM_W)));
      setK((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stage]);
  return k;
}

export function OfficeCanvas({
  personas,
  activeMeeting,
  seats,
  budget,
  gatesHref,
  selectedId,
  boardOpen,
  meetingOpen,
  boardCount,
  postCount,
  goalCount,
  todayReports,
  onOpenBoard,
  onOpenMeeting,
  onAnnounce,
  grid,
  user,
  talkTargetId,
  dialogOpen,
  botWalk,
  onTalk,
  onFloor,
  onMeKey,
  meLabel,
}: OfficeCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const k = useScale(stageRef);
  const geo = roomGeometry(personas.length);
  const clipBase = `office-sky${useId().replace(/:/g, "")}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  const [catAwake, setCatAwake] = useState(0);
  // 첫 렌더는 제자리에 둔다 — 첫 데이터 적용 뒤에만 이동 전이를 켠다(페이지를 열 때 전원이 걸어 들어오지 않게)
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const runStatus = activeMeeting ? meetingRunStatus(activeMeeting, personas) : null;
  const meetingPaused = runStatus === "WAITING_APPROVAL" || runStatus === "BLOCKED";
  const name = activeMeeting ? meetingName(activeMeeting) : null;
  const host = activeMeeting ? personas.find((p) => p.id === activeMeeting.hostPersonaId) : undefined;
  const hostSeat = host ? seats.get(host.id) : undefined;

  const snapshot = useMemo(
    () =>
      ambienceSnapshot({
        personas,
        seats,
        activeMeeting,
        meetingPaused,
        excludeStrollIds: [selectedId, hoveredId],
        talkTargetId,
        killSwitch: budget.killSwitch,
      }),
    [personas, seats, activeMeeting, meetingPaused, selectedId, hoveredId, talkTargetId, budget.killSwitch],
  );
  // 장면이 열리면 디렉터 정지(캔버스가 가려져 있다), 닫히면 새 간격부터 재개 — 폴링은 계속 돈다
  const ambience = useOfficeAmbience({ snapshot, stageRef, enabled: !dialogOpen });
  const walkIndex = botWalk ? personas.findIndex((p) => p.id === botWalk.personaId) : -1;
  const walkTarget = walkIndex >= 0 ? avatarPosition(personaState(personas[walkIndex]), walkIndex) : null;
  const botLeg = useBotWalk(botWalk, walkTarget, grid);

  const reduced = ambience.reducedMotion;
  const todayUsd = todayCostTotal(personas);
  const copy = coffeeCopy(todayUsd, budget);

  useEffect(() => {
    if (!coffeeOpen) return;
    const timer = setTimeout(() => setCoffeeOpen(false), COFFEE_POP_MS);
    return () => clearTimeout(timer);
  }, [coffeeOpen]);
  useEffect(() => {
    if (catAwake === 0) return;
    const timer = setTimeout(() => setCatAwake(0), CAT_AWAKE_MS);
    return () => clearTimeout(timer);
  }, [catAwake]);

  const floorClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onFloor(tileAt(grid, (e.clientX - rect.left) / k, (e.clientY - rect.top) / k));
  };

  const toggleCoffee = () => {
    if (!coffeeOpen) onAnnounce(`오늘 커피값 ${formatUsd(todayUsd)} — ${copy}`);
    setCoffeeOpen(!coffeeOpen);
  };
  const pokeCat = () => {
    const next = catAwake + 1;
    setCatAwake(next);
    onAnnounce(`고양이: ${next >= 3 ? "…야옹?" : "야옹"}`);
  };

  const seatedCount = seats.size;
  // 아바타 자리 — 배열 순서는 페르소나 순서로 고정한다(순서를 바꾸면 DOM 이동으로 걷기 전이가 끊긴다)
  const placed = personas.flatMap((persona, index) => {
    const seat = seats.get(persona.id);
    const state = personaState(persona);
    const stroll =
      ambience.stroll?.personaId === persona.id ? ambience.stroll : botLeg?.personaId === persona.id ? botLeg : null;
    const pose = seat ? seatPose(seat) : poseOf(state);
    const pos = stroll ?? seat ?? avatarPosition(state, index);
    return pose && pos ? [{ persona, index, pose, pos, stroll, standing: stroll !== null || pose === "stand" }] : [];
  });
  // 사람은 "서 있는 스프라이트" 층에서 발 y로 정렬된다(§2.3) — 봇끼리는 겹치지 않으니 사람과 겹치는 서 있는 봇만 본다:
  // 그 봇의 발이 더 아래면 사람을 봇들보다 먼저(뒤에) 칠한다
  const userXY = user ? userSpriteXY(user.tile) : null;
  const userBehind =
    userXY !== null &&
    placed.some(
      ({ pos, standing }) =>
        standing &&
        pos.y + 22 > userXY.y + 23 &&
        Math.abs(pos.x - userXY.x) < 16 &&
        pos.y < userXY.y + 24 &&
        userXY.y < pos.y + 24,
    );
  const targetPlace = talkTargetId ? placed.find((p) => p.persona.id === talkTargetId) : undefined;
  const talkMark =
    targetPlace && !seats.has(talkTargetId!)
      ? { x: targetPlace.pos.x + 3, y: targetPlace.pos.y - (targetPlace.pose === "stand" ? 7 : 8) }
      : null;
  const catFrame = catAwake > 0 ? "CAT_AWAKE" : ambience.catStretch ? "CAT_STRETCH" : null;
  const roomCls = [
    "ai-office-room",
    animated ? "is-animated" : "",
    ambience.offscreen || dialogOpen ? "is-offscreen" : "",
    budget.killSwitch ? "is-killed" : "",
    ambience.stroll?.leg === 3 ? "is-brewing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="ai-office-stage" aria-label="AI 사무실 평면도" ref={stageRef}>
      <p className="ai-office-sr">{officeSummaryText(personas, seatedCount)}</p>
      <div className={roomCls} style={vars({ "--room-w": geo.width, "--room-h": geo.height, "--k": k })}>
        <svg
          viewBox={`0 0 ${geo.width} ${geo.height}`}
          width="100%"
          height="100%"
          shapeRendering="crispEdges"
          aria-hidden="true"
          focusable="false"
        >
          {backgroundPaths(geo).map((p, i) => (
            <path key={i} className={p.cls} d={p.d} />
          ))}
          <PixelSprite paths={spritePaths("DOORMAT", "mat")} x={DOORMAT_X} y={geo.height - 14} />
          <Sky clipBase={clipBase} />
          {backgroundTopPaths().map((p, i) => (
            <path key={`t${i}`} className={p.cls} d={p.d} />
          ))}
          <PixelSprite
            paths={spritePaths(activeMeeting ? "WHITEBOARD_ACTIVE" : "WHITEBOARD_IDLE", "wb")}
            x={386}
            y={3}
          />
          <PixelSprite
            className="office-lamp"
            paths={spritePaths(activeMeeting ? "MEETING_LAMP_ON" : "MEETING_LAMP_OFF", "lamp")}
            x={362}
            y={9}
          />
          {plantSpots(geo).map((spot) => (
            <Plant key={`${spot.x}-${spot.y}`} {...spot} />
          ))}
          {roomFurniturePaths(geo).map((p, i) => (
            <path key={`f${i}`} className={p.cls} d={p.d} />
          ))}
          {OFFICE_CAT ? (
            <g className="office-cat" data-cat={catFrame ?? "sleep"}>
              {catFrame ? (
                <PixelSprite paths={spritePaths(catFrame, "cat")} x={285} y={geo.height - 32} />
              ) : (
                <Loop
                  ms={2000}
                  phase={0}
                  a={<PixelSprite paths={spritePaths("CAT_SLEEP_A", "cat")} x={285} y={geo.height - 32} />}
                  b={<PixelSprite paths={spritePaths("CAT_SLEEP_B", "cat")} x={285} y={geo.height - 32} />}
                />
              )}
            </g>
          ) : null}
          {personas.map((persona, i) => (
            <DeskSet key={persona.id} persona={persona} index={i} away={seats.has(persona.id)} />
          ))}
          {user?.pin && !reduced ? <DestinationPin tile={user.pin} /> : null}
          {FAR_SEATS_X.map((sx, slot) =>
            slot === 2 ? (
              <PixelSprite key={sx} paths={spritePaths("CHAIR_HOST", "furn2")} x={sx + 1} y={82} />
            ) : (
              <PixelSprite key={sx} paths={spritePaths("CHAIR", "furn")} x={sx + 1} y={90} />
            ),
          )}
          <PixelSprite paths={spritePaths("MEETING_TABLE", "furn2")} x={360} y={98} />
          {user && userBehind ? <UserAvatar key="user-behind" user={user} /> : null}
          {placed.map(({ persona, index, pose, pos, stroll }) => (
            <Avatar
              key={persona.id}
              persona={persona}
              index={index}
              pose={pose}
              x={pos.x}
              y={pos.y}
              hovered={hoveredId === persona.id}
              stroll={stroll}
            />
          ))}
          {NEAR_SEATS_X.map((sx) => (
            <PixelSprite key={sx} paths={spritePaths("CHAIR_BACK", "furn2")} x={sx + 1} y={124} />
          ))}
          {user && !userBehind ? <UserAvatar key="user-front" user={user} /> : null}
          {ambience.stroll?.leg === 3 ? (
            <g className="office-steam">
              <Loop
                ms={400}
                phase={0}
                a={<PixelSprite paths={spritePaths("STEAM_A", "item")} x={333} y={5} />}
                b={<PixelSprite paths={spritePaths("STEAM_B", "item")} x={333} y={5} />}
              />
            </g>
          ) : null}
          {personas.map((persona, i) =>
            seats.has(persona.id) ? null : <StateOverlay key={persona.id} state={personaState(persona)} index={i} />,
          )}
          {talkMark ? <TalkMark x={talkMark.x} y={talkMark.y} /> : null}
          {hostSeat && runStatus === "WAITING_APPROVAL" ? (
            <Bob name="ALERT" x={hostSeat.x + 4} y={71} ms={800} phase={0} />
          ) : null}
          {hostSeat && runStatus === "BLOCKED" ? <Bob name="ZZ" x={hostSeat.x + 4} y={71} ms={1400} phase={0} /> : null}
          {ambience.effect
            ? (() => {
                const i = personas.findIndex((p) => p.id === ambience.effect!.personaId);
                if (i < 0) return null;
                const { x0, y0 } = cellOf(i);
                const fx = ambience.effect;
                const matrix = fx.kind === "SWEAT" ? "FX_SWEAT" : fx.kind === "BULB" ? "FX_BULB" : "FX_NOTE";
                return (
                  <g key={fx.id} className="office-work-fx" data-fx={fx.kind.toLowerCase()}>
                    <PixelSprite paths={spritePaths(matrix, "fx")} x={x0 + 31} y={y0 + (fx.kind === "SWEAT" ? 4 : 0)} />
                  </g>
                );
              })()
            : null}
          {ambience.bubbles.map((b) => {
            const seat = seats.get(b.personaId);
            if (!seat || seat.side === "stand") return null;
            return (
              <g key={b.id} transform={`translate(${seat.x + 2} ${seat.y - 12})`} data-mb={b.glyph.toLowerCase()}>
                <g className={seat.side === "far" ? "office-mb is-far" : "office-mb is-near"}>
                  <PixelSprite className="office-mb-puff" paths={spritePaths("MB_PUFF", "puff")} x={1} y={4} />
                  <PixelSprite className="office-mb-body" paths={microBubblePaths(b.glyph)} />
                </g>
              </g>
            );
          })}
          {reduced && activeMeeting && !meetingPaused && hostSeat && hostSeat.side !== "stand" ? (
            <g data-mb="still" transform={`translate(${hostSeat.x + 2} ${hostSeat.y - 12})`}>
              <PixelSprite paths={microBubblePaths("DOTS")} />
            </g>
          ) : null}
        </svg>

        <div
          className="ai-office-layer"
          onKeyDown={(e) => {
            if (e.key === "Escape" && coffeeOpen) setCoffeeOpen(false);
          }}
          onClickCapture={(e) => {
            if (coffeeOpen && !(e.target as HTMLElement).closest(".office-hit-coffee")) setCoffeeOpen(false);
          }}
        >
          {/* 바닥 클릭 = 이동(포인터 전용 — 키보드는 "나" 버튼의 방향키). 모든 버튼보다 아래 */}
          <div className="office-floor-hit" aria-hidden="true" onClick={floorClick} />
          {user ? (
            <div
              className={user.moving ? "office-me is-moving" : "office-me"}
              style={vars({ "--ux": userSpriteXY(user.tile).x + user.alignX, "--uy": userSpriteXY(user.tile).y, "--step-ms": user.stepMs })}
            >
              {user.tagHidden ? null : (
                <span className="office-nameplate office-me-tag" aria-hidden="true">
                  나
                </span>
              )}
              <button type="button" className="office-me-hit" aria-label={meLabel} onKeyDown={onMeKey} />
            </div>
          ) : null}
          <button
            type="button"
            className="office-hit-board"
            style={vars({ "--x": 258, "--y": 4, "--w": 64, "--h": 22 })}
            aria-label={
              goalCount === null
                ? `게시판 — 회의록 ${postCount}건, 최근 작업 보고서 ${boardCount}건`
                : `게시판 — 진행 중 목표 ${goalCount}개, 회의록 ${postCount}건, 최근 작업 보고서 ${boardCount}건`
            }
            aria-controls="ai-office-panel"
            aria-expanded={boardOpen}
            onClick={(e) => onOpenBoard(e.currentTarget)}
          />
          {todayReports > 0 ? (
            <span className="office-board-badge" style={vars({ "--x": 322, "--y": 4 })}>
              <Badge appearance="brand" aria-label={`오늘 새 보고서 ${todayReports}건`}>
                {todayReports}
              </Badge>
            </span>
          ) : null}

          <button
            type="button"
            className="office-hit-meeting"
            style={vars({ "--x": 356, "--y": 0, "--w": 108, "--h": 34 })}
            aria-label={meetingRoomAccessibleName(activeMeeting, Date.now())}
            aria-controls="ai-office-panel"
            aria-expanded={meetingOpen}
            onClick={(e) => onOpenMeeting(e.currentTarget)}
          />
          <span
            className={activeMeeting ? "office-nameplate office-meeting-sign is-live" : "office-nameplate office-meeting-sign"}
            style={vars({ "--x": 410, "--y": 25 })}
            aria-hidden="true"
          >
            {meetingSignText(activeMeeting, Date.now())}
          </span>

          <button
            type="button"
            className="office-hit-coffee"
            style={vars({ "--x": 326, "--y": 10, "--w": 20, "--h": 24 })}
            aria-label={`커피 머신 — 오늘 AI 비용 ${formatUsd(todayUsd)}`}
            aria-expanded={coffeeOpen}
            onClick={toggleCoffee}
          />
          {coffeeOpen ? (
            <div className="office-pop" data-testid="office-coffee-pop" style={vars({ "--right": 348, "--y": 35, "--tail": 336 })} aria-hidden="true">
              <div className="office-bubble-box">
                <span className="office-bubble-line">오늘 커피값 {formatUsd(todayUsd)}</span>
                <span className="office-bubble-line">{copy}</span>
              </div>
            </div>
          ) : null}

          {personas.map((persona, i) => (
            <PersonaHtml
              key={persona.id}
              persona={persona}
              index={i}
              seat={seats.get(persona.id) ?? null}
              meetingName={name}
              hostAlert={persona.id === host?.id && hostSeat && runStatus === "WAITING_APPROVAL" ? hostSeat : null}
              selected={selectedId === persona.id}
              hovered={hoveredId === persona.id}
              talking={talkTargetId === persona.id}
              gatesHref={gatesHref}
              onOpen={onTalk}
              onHover={setHoveredId}
            />
          ))}

          {OFFICE_CAT ? (
            <>
              <button
                type="button"
                className="office-hit-cat"
                style={vars({ "--x": 283, "--y": geo.height - 32, "--w": 20, "--h": 12 })}
                aria-label="사무실 고양이"
                onClick={pokeCat}
              />
              {catAwake > 0 ? (
                <div
                  className="office-bubble office-cat-bubble"
                  data-testid="office-cat-bubble"
                  style={vars({ "--x": 283, "--y": geo.height - 32, "--tail": 8 })}
                  aria-hidden="true"
                >
                  <div className="office-bubble-box">
                    <span className="office-bubble-line">{catAwake >= 3 ? "…야옹?" : "야옹"}</span>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** 명패·말풍선·히트 버튼·❗ 링크 — 좌표는 전부 아트 픽셀 정수(--x, --y)이고 CSS가 k를 곱한다 */
function PersonaHtml({
  persona,
  index,
  seat,
  meetingName: meeting,
  hostAlert,
  selected,
  hovered,
  talking,
  gatesHref,
  onOpen,
  onHover,
}: {
  persona: AgentOfficePersona;
  index: number;
  /** 회의실 좌석 — 있으면 버튼은 좌석 쪽 하나, 빈 책상은 포인터 전용 */
  seat: MeetingSeat | null;
  meetingName: string | null;
  /** 회의 run이 승인 대기면 진행자 좌석 위 ❗ 링크 */
  hostAlert: MeetingSeat | null;
  selected: boolean;
  hovered: boolean;
  /** 말 걸기 대상 — 그동안 P3a 말풍선을 숨긴다(💬 자리) */
  talking: boolean;
  gatesHref: string;
  onOpen: (id: string, opener: HTMLElement) => void;
  onHover: (id: string | null) => void;
}) {
  const { x0, y0 } = cellOf(index);
  const state = personaState(persona);
  const bubble = seat || talking ? null : bubbleText(persona);
  const standing = state === "QUEUED" || state === "IDLE";
  const pos = seat ?? avatarPosition(state, index);
  const tailX = (state === "QUEUED" ? x0 + 52 : x0 + 24) - (x0 + 2);
  const label = personaAccessibleName(persona, seat ? meeting : null);
  // 명판 이모지(AGP-62 §2.6) — 직원별로 켠다. 명패 자체가 aria-hidden이라 접근 이름은 그대로(이름·상태)
  const showEmoji = Boolean(persona.emoji) && personaLook(persona).showEmoji;
  const hoverProps = {
    onPointerEnter: () => onHover(persona.id),
    onPointerLeave: () => onHover(null),
  };
  const deskBox = vars({ "--x": x0 + 4, "--y": y0 - 1, "--w": 40, "--h": 42 });
  const movable = seat !== null || standing;
  const hitBox = seat
    ? vars({ "--x": seat.x - 2, "--y": seat.y, "--w": 20, "--h": seat.side === "stand" ? 24 : 16 })
    : pos
      ? vars({ "--x": pos.x - 2, "--y": pos.y, "--w": 20, "--h": 24 })
      : deskBox;

  return (
    <>
      <span
        className={["office-nameplate", selected ? "is-selected" : "", hovered ? "is-hover" : ""].filter(Boolean).join(" ")}
        style={vars({ "--x": x0 + 24, "--y": y0 + 33 })}
        aria-hidden="true"
      >
        {state === "INACTIVE" ? `${persona.name} · 비활성` : state === "REMOTE" ? `${persona.name} · 원격` : persona.name}
        {showEmoji ? <span className="office-nameplate-emoji" aria-hidden="true">{persona.emoji}</span> : null}
      </span>
      {seat && hovered ? (
        <span
          className="office-nameplate is-above"
          data-testid={`office-seat-plate-${persona.id}`}
          style={vars({ "--x": seat.x + 8, "--y": seat.y - 1 })}
          aria-hidden="true"
        >
          {persona.name}
        </span>
      ) : null}
      {bubble ? (
        <div
          className="office-bubble"
          data-testid={`office-bubble-${persona.id}`}
          style={vars({ "--x": x0 + 2, "--y": y0 - 1, "--tail": tailX })}
          aria-hidden="true"
        >
          <div className="office-bubble-box">
            {bubble.prefix && bubble.issueKey ? (
              <span className="office-bubble-line is-split">
                <span className="office-bubble-prefix">{bubble.prefix} ·</span>{" "}
                <span className="office-bubble-key">{bubble.issueKey}</span>
              </span>
            ) : (
              <span className="office-bubble-line">{bubble.line1}</span>
            )}
            {bubble.line2 ? <span className="office-bubble-line">{bubble.line2}</span> : null}
          </div>
        </div>
      ) : null}

      {movable && pos ? (
        <>
          {/* 탭 순서 중복 방지 — 빈 책상은 포인터 전용 영역, 버튼은 아바타가 있는 쪽 하나 */}
          <div
            role="presentation"
            aria-hidden="true"
            className="office-hit is-desk-only"
            style={deskBox}
            onClick={(e) => onOpen(persona.id, e.currentTarget)}
            {...hoverProps}
          />
          <button
            type="button"
            className={selected ? "office-hit is-selected" : "office-hit"}
            style={hitBox}
            aria-label={label}
            aria-haspopup="dialog"
            data-persona={persona.id}
            data-state={state}
            data-seat={seat ? seat.side : undefined}
            data-host={seat?.host ? "true" : undefined}
            onClick={(e) => onOpen(persona.id, e.currentTarget)}
            onFocus={seat ? () => onHover(persona.id) : undefined}
            onBlur={seat ? () => onHover(null) : undefined}
            {...hoverProps}
          />
        </>
      ) : (
        <button
          type="button"
          className={selected ? "office-hit is-selected" : "office-hit"}
          style={deskBox}
          aria-label={label}
          aria-haspopup="dialog"
          data-persona={persona.id}
          data-state={state}
          onClick={(e) => onOpen(persona.id, e.currentTarget)}
          {...hoverProps}
        />
      )}

      {state === "WAITING_APPROVAL" && !seat ? (
        <Link
          className="office-hit-alert"
          to={`${gatesHref}?persona=${encodeURIComponent(persona.id)}`}
          style={vars({ "--x": x0 + 29, "--y": y0 - 2, "--w": 12, "--h": 15 })}
          aria-label={`${persona.name}의 승인 대기 — 승인 인박스 열기`}
        />
      ) : null}
      {hostAlert ? (
        <Link
          className="office-hit-alert"
          to={`${gatesHref}?persona=${encodeURIComponent(persona.id)}`}
          style={vars({ "--x": hostAlert.x + 2, "--y": 69, "--w": 12, "--h": 15 })}
          aria-label={`${persona.name}의 회의 승인 대기 — 승인 인박스 열기`}
        />
      ) : null}
    </>
  );
}
