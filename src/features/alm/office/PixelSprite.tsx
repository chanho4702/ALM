import type { CSSProperties } from "react";
import type { AgentRole } from "../store/types";
import { avatarPaths, avatarVars, spritePaths, type PixelPath } from "./pixel";

/** 원점 기준 path 목록을 정수 좌표로 옮겨 그린다 */
export function PixelSprite({
  paths,
  x = 0,
  y = 0,
  className,
}: {
  paths: readonly PixelPath[];
  x?: number;
  y?: number;
  className?: string;
}) {
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined} className={className}>
      {paths.map((p) => (
        <path key={p.cls} className={p.cls} d={p.d} />
      ))}
    </g>
  );
}

/**
 * 패널·팀 카드의 정지 초상 — 앉은 프레임(머리·어깨 16×16)을 SVG viewBox로 키운다.
 * 크기는 CSS(`.office-portrait`)가 정한다 — transform: scale()을 쓰지 않는다(스펙 §2.1).
 */
export function OfficePortrait({ slug, role, className }: { slug: string; role: AgentRole; className?: string }) {
  return (
    <span className={className ? `office-portrait ${className}` : "office-portrait"} aria-hidden="true">
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" focusable="false" style={avatarVars(slug, role) as CSSProperties}>
        <PixelSprite paths={avatarPaths(role, "seat")} />
      </svg>
    </span>
  );
}

/** 회의실 모드 초상(P3e §2.8) — 화이트보드 가운데 32×22 크롭(회의 중이면 차트가 그려진 판) */
export function WhiteboardPortrait({ active }: { active: boolean }) {
  return (
    <span className="office-portrait is-board" aria-hidden="true">
      <svg viewBox="8 0 32 22" shapeRendering="crispEdges" focusable="false">
        <PixelSprite paths={spritePaths(active ? "WHITEBOARD_ACTIVE" : "WHITEBOARD_IDLE", "wb")} />
      </svg>
    </span>
  );
}

/** 게시판 모드 초상 — BOARD 가운데 32×22 크롭 */
export function BoardPortrait() {
  return (
    <span className="office-portrait is-board" aria-hidden="true">
      <svg viewBox="16 0 32 22" shapeRendering="crispEdges" focusable="false">
        <PixelSprite paths={spritePaths("BOARD", "board")} />
      </svg>
    </span>
  );
}
