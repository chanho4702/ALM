import type { ReactNode } from "react";
import { Skeleton, SkeletonAvatar, SkeletonListItem, SkeletonText } from "@chanho/react";
import "./skeletons.css";

/**
 * 페이지·목록 로딩 자리(DS Skeleton, react 0.13.0). 블록은 장식(aria-hidden)이고 영역 하나가
 * `role="status"` + 접근 이름(label)으로 "불러오는 중"을 알린다 — 스피너 시절의 상태 이름 계약
 * (`getByRole("status", { name: "보드 불러오는 중" })`)을 그대로 지킨다.
 *
 * 크기는 실제 화면과 같은 자리를 잡는다(레이아웃 시프트 0): 보드는 `.board-columns` 그리드,
 * 백로그는 `.sprint-panel` 상자와 36px 행, 셸은 상단바 48px + 사이드바 240px(항목 32px).
 */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={["skeleton-region", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/** 화면 머리 줄(제목 + 오른쪽 버튼 자리) — 보드 툴바·백로그 머리·페이지 제목과 같은 32px 높이 */
function HeadingRow({ actions = 1 }: { actions?: number }) {
  return (
    <div className="skeleton-heading">
      <Skeleton width={180} height={20} />
      <span className="skeleton-heading-actions">
        {Array.from({ length: actions }, (_, index) => (
          <Skeleton key={index} width={96} height={32} radius="medium" />
        ))}
      </span>
    </div>
  );
}

/** 일반 화면 — 제목 줄 + 본문 문단(설정·관리·리포트처럼 모양이 제각각인 화면의 공통 자리) */
export function PageSkeleton({ label, lines = 6, children }: { label: string; lines?: number; children?: ReactNode }) {
  return (
    <LoadingRegion label={label} className="skeleton-page">
      <HeadingRow />
      {children ?? <SkeletonText lines={lines} />}
    </LoadingRegion>
  );
}

/** 전역 셸 — 계정 확인·프로젝트 목록 로딩처럼 셸이 아직 없는 첫 화면 */
export function ShellSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="skeleton-shell">
      <div className="skeleton-shell-topbar">
        <Skeleton width={48} height={20} />
        <Skeleton className="skeleton-shell-search" height={32} radius="medium" />
        <span className="skeleton-shell-account">
          <Skeleton width={72} height={32} radius="medium" />
          <SkeletonAvatar size="small" />
        </span>
      </div>
      <div className="skeleton-shell-body">
        <div className="skeleton-shell-nav">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="skeleton-shell-nav-item">
              <Skeleton width={16} height={16} />
              <Skeleton variant="text" width={index % 3 === 0 ? "70%" : "55%"} />
            </span>
          ))}
        </div>
        <div className="skeleton-shell-main">
          <HeadingRow />
          <SkeletonText lines={5} />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** 보드 — 컬럼 4 × 카드 3(카드 높이는 제목 두 줄 + 메타 줄의 실제 카드와 같다) */
export function BoardSkeleton({ label, columns = 4, cards = 3 }: { label: string; columns?: number; cards?: number }) {
  return (
    <LoadingRegion label={label} className="skeleton-board">
      <HeadingRow actions={2} />
      <div className="board-columns">
        {Array.from({ length: columns }, (_, column) => (
          <div key={column} className="board-column">
            <span className="skeleton-board-column-head">
              <Skeleton width={16} height={16} />
              <Skeleton variant="text" width={72} />
            </span>
            {Array.from({ length: cards }, (_, card) => (
              <span key={card} className="skeleton-board-card">
                <Skeleton variant="text" width={card % 2 === 0 ? "85%" : "65%"} />
                <span className="skeleton-board-card-meta">
                  <Skeleton width={16} height={16} />
                  <Skeleton variant="text" width={48} />
                  <SkeletonAvatar size="small" />
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** 백로그 — 스프린트·백로그 패널 2 × 행 5(행은 실제 `.backlog-row`와 같은 36px) */
export function BacklogSkeleton({ label, panels = 2, rows = 5 }: { label: string; panels?: number; rows?: number }) {
  return (
    <LoadingRegion label={label} className="skeleton-backlog">
      <HeadingRow />
      {Array.from({ length: panels }, (_, panel) => (
        <div key={panel} className="sprint-panel">
          <span className="skeleton-backlog-head">
            <Skeleton width={120} height={16} />
            <Skeleton width={24} height={16} radius="full" />
          </span>
          <div className="skeleton-backlog-rows">
            {Array.from({ length: rows }, (_, row) => (
              <span key={row} className="skeleton-backlog-row">
                <Skeleton width={16} height={16} />
                <Skeleton variant="text" width={56} />
                <Skeleton variant="text" className="skeleton-grow" width={row % 2 === 0 ? "60%" : "45%"} />
                <Skeleton width={64} height={16} />
                <SkeletonAvatar size="small" />
              </span>
            ))}
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** 목록 — 메뉴·패널 안 한 줄 목록(최근 본 이슈·대화 기록 등) */
export function ListSkeleton({
  label,
  rows = 5,
  media = "icon",
  lines = 1,
}: {
  label: string;
  rows?: number;
  media?: "avatar" | "icon" | "none";
  lines?: 1 | 2;
}) {
  return (
    <LoadingRegion label={label} className="skeleton-list">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListItem key={index} media={media} lines={lines} width={index % 2 === 0 ? "60%" : "45%"} />
      ))}
    </LoadingRegion>
  );
}

/** 대시보드 가젯 판 — 실제 `.gadget-grid`(2열)와 같은 칸에 가젯 상자 */
export function GadgetsSkeleton({ label, count = 4 }: { label: string; count?: number }) {
  return (
    <LoadingRegion label={label} className="skeleton-page">
      <HeadingRow actions={2} />
      <div className="gadget-grid">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="gadget skeleton-gadget">
            <span className="skeleton-gadget-head">
              <Skeleton width={140} height={16} />
            </span>
            <span className="skeleton-gadget-body">
              <Skeleton height={160} radius="medium" />
            </span>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** 가젯 하나의 본문 — 가젯 머리는 이미 그려져 있다 */
export function GadgetBodySkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="skeleton-gadget-inline">
      <SkeletonText lines={4} />
    </LoadingRegion>
  );
}

/** 큰 블록 하나(타임라인 간트·차트) — 높이는 실제 블록과 같게 */
export function BlockSkeleton({ label, height, actions = 1 }: { label: string; height: number; actions?: number }) {
  return (
    <LoadingRegion label={label} className="skeleton-page">
      <HeadingRow actions={actions} />
      <Skeleton height={height} radius="medium" />
    </LoadingRegion>
  );
}

/** 대화상자 본문 — 필드 라벨 + 입력 자리 몇 줄 */
export function FormSkeleton({ label, fields = 4 }: { label: string; fields?: number }) {
  return (
    <LoadingRegion label={label} className="skeleton-form">
      {Array.from({ length: fields }, (_, index) => (
        <span key={index} className="skeleton-form-field">
          <Skeleton variant="text" width={80} />
          <Skeleton height={36} radius="medium" />
        </span>
      ))}
    </LoadingRegion>
  );
}
