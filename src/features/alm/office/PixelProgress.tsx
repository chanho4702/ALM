import { progressCells } from "./officeModel";

const CELLS = 10;

/**
 * 도트 진행바(P3e §3.3) — 게시판 "지금 만드는 것" 전용 로컬 컴포넌트. 10칸 고정, 칸 8px·간격 2px·테두리 2px.
 * DS `ProgressBar`를 쓰지 않는 이유: 게시판은 사무실 소품이라 픽셀 결을 맞춘다(패널 안 픽셀 요소 3번째). 옆의
 * "n/m 완료" 텍스트가 시각 정보의 텍스트 병기다.
 */
export function PixelProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const filled = progressCells(done, total, CELLS);
  return (
    <span
      className="office-pixel-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={label}
      data-filled={filled}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <i key={i} aria-hidden="true" className={i < filled ? "is-filled" : undefined} />
      ))}
    </span>
  );
}
