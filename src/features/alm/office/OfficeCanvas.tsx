import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { Badge } from "@chanho/react";
import type { AgentOfficePersona } from "../store/types";
import type { AgentPersonaState } from "../components/AgentGlyphs";
import {
  avatarPaths,
  avatarVars,
  backgroundPaths,
  roomGeometry,
  spritePaths,
  type AvatarFrame,
  ROOM_W,
} from "./pixel";
import { PixelSprite } from "./PixelSprite";
import { bubbleText, officeSummaryText, personaAccessibleName, personaState } from "./officeModel";

/** 자리 이동 시간 — CSS `transition: transform 640ms steps(8)`과 같은 값 */
const WALK_MS = 640;
/** 페르소나마다 루프 위상을 흩는 간격 */
const PHASE_STEP_MS = 170;

export interface OfficeCanvasProps {
  /** 정렬된 페르소나(스펙 §1.5) — 인덱스가 책상·유휴 자리를 고정한다 */
  personas: readonly AgentOfficePersona[];
  gatesHref: string;
  selectedId: string | null;
  boardOpen: boolean;
  boardCount: number;
  todayReports: number;
  onOpenPersona: (id: string, opener: HTMLElement) => void;
  onOpenBoard: (opener: HTMLElement) => void;
}

type Pose = "seat" | "slump" | "stand";

interface Seat {
  x0: number;
  y0: number;
}

const cellOf = (i: number): Seat => ({ x0: 64 * (i % 4), y0: 40 + 64 * Math.floor(i / 4) });

function poseOf(state: AgentPersonaState): Pose | null {
  if (state === "RUNNING" || state === "WAITING_APPROVAL") return "seat";
  if (state === "BLOCKED") return "slump";
  if (state === "QUEUED" || state === "IDLE") return "stand";
  return null;
}

/** 아바타 좌상단(아트 픽셀) — 앉음은 자기 책상, 대기열은 책상 옆, 유휴는 휴게 구역의 고정 자리(k = i) */
function avatarPosition(state: AgentPersonaState, i: number): { x: number; y: number } | null {
  const { x0, y0 } = cellOf(i);
  switch (state) {
    case "RUNNING":
    case "WAITING_APPROVAL":
    case "BLOCKED":
      return { x: x0 + 16, y: y0 };
    case "QUEUED":
      return { x: x0 + 44, y: y0 + 10 };
    case "IDLE":
      return { x: 270 + 24 * (i % 3), y: 52 + 32 * Math.floor(i / 3) };
    default:
      return null;
  }
}

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
  const frame = (f: AvatarFrame) => <PixelSprite paths={avatarPaths(persona.role, f)} />;
  return (
    <>
      <path className="px-shadow" d="M2 22h12v2h-12z" />
      <Loop ms={1200} phase={index} a={frame("standA")} b={frame("standB")} />
    </>
  );
}

/**
 * 페르소나 한 명의 아바타 — 폴링마다 다시 마운트하지 않는다(루프 리셋 방지). 자리가 바뀌면
 * transform 전이로 8계단 걸어가고, 걷는 동안은 서기 프레임, 도착하면 상태 프레임으로 바꾼다.
 */
function Avatar({
  persona,
  index,
  pose,
  x,
  y,
  hovered,
}: {
  persona: AgentOfficePersona;
  index: number;
  pose: Pose;
  x: number;
  y: number;
  hovered: boolean;
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

  const shown: Pose = walking ? "stand" : pose;
  return (
    <g
      className="office-avatar"
      data-pose={shown}
      style={vars({ ...avatarVars(persona.slug, persona.role), "--ax": x, "--ay": y })}
    >
      <g className={hovered ? "office-avatar-lift is-hover" : "office-avatar-lift"}>
        {shown === "stand" ? (
          <StandingFrames persona={persona} index={index} />
        ) : (
          <PixelSprite paths={avatarPaths(persona.role, shown === "slump" ? "slump" : "seat")} />
        )}
      </g>
    </g>
  );
}

/** 책상 세트(의자·책상·모니터·손·돋보기·빨간 표식) — 셀 원점 기준 */
function DeskSet({ persona, index }: { persona: AgentOfficePersona; index: number }) {
  const { x0, y0 } = cellOf(index);
  const state = personaState(persona);
  const run = persona.currentRun;
  const hand = spritePaths("HAND", "char");
  return (
    <g
      className="office-desk"
      data-state={state}
      style={vars(avatarVars(persona.slug, persona.role))}
    >
      <PixelSprite paths={spritePaths("CHAIR", "furn")} x={x0 + 17} y={y0 + 6} />
      <PixelSprite paths={spritePaths("DESK", "furn")} x={x0 + 4} y={y0 + 16} />
      {state === "RUNNING" ? (
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
      {run && run.type === "REVIEW" && state !== "INACTIVE" ? (
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
function StateOverlay({ state, index }: { state: AgentPersonaState; index: number }) {
  const { x0, y0 } = cellOf(index);
  const bob = (name: "ALERT" | "ZZ" | "HOURGLASS", x: number, y: number, ms: number) => {
    const paths = spritePaths(name, "ovl");
    return (
      <g className="office-fx" data-overlay={name.toLowerCase()}>
        <Loop ms={ms} phase={index} a={<PixelSprite paths={paths} x={x} y={y} />} b={<PixelSprite paths={paths} x={x} y={y - 1} />} />
      </g>
    );
  };
  if (state === "WAITING_APPROVAL") return bob("ALERT", x0 + 31, y0, 800);
  if (state === "BLOCKED") return bob("ZZ", x0 + 30, y0, 1400);
  if (state === "QUEUED") return bob("HOURGLASS", x0 + 56, y0 + 2, 1000);
  return null;
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
  gatesHref,
  selectedId,
  boardOpen,
  boardCount,
  todayReports,
  onOpenPersona,
  onOpenBoard,
}: OfficeCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const k = useScale(stageRef);
  const geo = roomGeometry(personas.length);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // 첫 렌더는 제자리에 둔다 — 첫 데이터 적용 뒤에만 이동 전이를 켠다(페이지를 열 때 전원이 걸어 들어오지 않게)
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="ai-office-stage" aria-label="AI 사무실 평면도" ref={stageRef}>
      <p className="ai-office-sr">{officeSummaryText(personas)}</p>
      <div
        className={animated ? "ai-office-room is-animated" : "ai-office-room"}
        style={vars({ "--room-w": geo.width, "--room-h": geo.height, "--k": k })}
      >
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
          {personas.map((persona, i) => (
            <DeskSet key={persona.id} persona={persona} index={i} />
          ))}
          {personas.map((persona, i) => {
            const state = personaState(persona);
            const pose = poseOf(state);
            const pos = avatarPosition(state, i);
            if (!pose || !pos) return null;
            return (
              <Avatar
                key={persona.id}
                persona={persona}
                index={i}
                pose={pose}
                x={pos.x}
                y={pos.y}
                hovered={hoveredId === persona.id}
              />
            );
          })}
          {personas.map((persona, i) => (
            <StateOverlay key={persona.id} state={personaState(persona)} index={i} />
          ))}
        </svg>

        <div className="ai-office-layer">
          <button
            type="button"
            className="office-hit-board"
            style={vars({ "--x": 258, "--y": 4, "--w": 64, "--h": 22 })}
            aria-label={`게시판 — 최근 작업 보고서 ${boardCount}건`}
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

          {personas.map((persona, i) => (
            <PersonaHtml
              key={persona.id}
              persona={persona}
              index={i}
              selected={selectedId === persona.id}
              hovered={hoveredId === persona.id}
              gatesHref={gatesHref}
              onOpen={onOpenPersona}
              onHover={setHoveredId}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** 명패·말풍선·히트 버튼·❗ 링크 — 좌표는 전부 아트 픽셀 정수(--x, --y)이고 CSS가 k를 곱한다 */
function PersonaHtml({
  persona,
  index,
  selected,
  hovered,
  gatesHref,
  onOpen,
  onHover,
}: {
  persona: AgentOfficePersona;
  index: number;
  selected: boolean;
  hovered: boolean;
  gatesHref: string;
  onOpen: (id: string, opener: HTMLElement) => void;
  onHover: (id: string | null) => void;
}) {
  const { x0, y0 } = cellOf(index);
  const state = personaState(persona);
  const bubble = bubbleText(persona);
  const standing = state === "QUEUED" || state === "IDLE";
  const pos = avatarPosition(state, index);
  const tailX = (state === "QUEUED" ? x0 + 52 : x0 + 24) - (x0 + 2);
  const label = personaAccessibleName(persona);
  const hoverProps = {
    onPointerEnter: () => onHover(persona.id),
    onPointerLeave: () => onHover(null),
  };
  const deskBox = vars({ "--x": x0 + 4, "--y": y0 - 1, "--w": 40, "--h": 42 });

  return (
    <>
      <span
        className={["office-nameplate", selected ? "is-selected" : "", hovered ? "is-hover" : ""].filter(Boolean).join(" ")}
        style={vars({ "--x": x0 + 24, "--y": y0 + 33 })}
        aria-hidden="true"
      >
        {state === "INACTIVE" ? `${persona.name} · 비활성` : persona.name}
      </span>
      {bubble ? (
        <div
          className="office-bubble"
          data-testid={`office-bubble-${persona.id}`}
          style={vars({ "--x": x0 + 2, "--y": y0 - 1, "--tail": tailX })}
          aria-hidden="true"
        >
          <div className="office-bubble-box">
            <span className="office-bubble-line">{bubble.line1}</span>
            {bubble.line2 ? <span className="office-bubble-line">{bubble.line2}</span> : null}
          </div>
        </div>
      ) : null}

      {standing && pos ? (
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
            style={vars({ "--x": pos.x - 2, "--y": pos.y, "--w": 20, "--h": 24 })}
            aria-label={label}
            aria-controls="ai-office-panel"
            aria-expanded={selected}
            data-state={state}
            onClick={(e) => onOpen(persona.id, e.currentTarget)}
            {...hoverProps}
          />
        </>
      ) : (
        <button
          type="button"
          className={selected ? "office-hit is-selected" : "office-hit"}
          style={deskBox}
          aria-label={label}
          aria-controls="ai-office-panel"
          aria-expanded={selected}
          data-state={state}
          onClick={(e) => onOpen(persona.id, e.currentTarget)}
          {...hoverProps}
        />
      )}

      {state === "WAITING_APPROVAL" ? (
        <Link
          className="office-hit-alert"
          to={`${gatesHref}?persona=${encodeURIComponent(persona.id)}`}
          style={vars({ "--x": x0 + 29, "--y": y0 - 2, "--w": 12, "--h": 15 })}
          aria-label={`${persona.name}의 승인 대기 — 승인 인박스 열기`}
        />
      ) : null}
    </>
  );
}
