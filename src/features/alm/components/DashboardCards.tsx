import type { ReactNode } from "react";
import { Lozenge } from "@chanho/react";
import type { Issue, User, WorkflowStatus } from "../store/types";
import { statusAppearance, statusName } from "./labels";
import { StatusGlyph } from "./StatusGlyph";
import { UserAvatar } from "./UserAvatar";

export interface DistributionRow {
  id: string;
  name: string;
  count: number;
}

/**
 * 라벨 붙은 단일 색 가로 막대. 색으로 범주를 구분하지 않는다 — 신원은 행 이름이,
 * 크기 비교는 막대 길이가 진다(설계 §4: 상태 3분류 범주형 팔레트는 색 분리 검증 실패로 기각).
 * 막대는 텍스트를 갖지 않아서 행 낭독은 "이름 / N건"으로 끝난다.
 */
export function DistributionList({
  rows,
  testId,
  emptyText,
  lead,
}: {
  rows: DistributionRow[];
  testId?: string;
  emptyText: string;
  /** 행 앞 아바타 등 시각 보조 슬롯 */
  lead?: (row: DistributionRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="dash-empty">{emptyText}</p>;
  }
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="dash-dist" data-testid={testId}>
      {rows.map((row) => (
        <li key={row.id} className={lead ? "dash-dist-row has-lead" : "dash-dist-row"}>
          {lead ? lead(row) : null}
          <span className="dash-dist-name">{row.name}</span>
          <span className="dash-dist-track" aria-hidden>
            <span className="dash-dist-fill" style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <span className="dash-dist-count">{row.count}건</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 담당자 행 앞 슬롯 — 사람은 아바타(프로필 사진), 미지정·기타는 중립 원.
 * `usersById`를 주면 사진을 쓰고, 없으면 이름 이니셜로 떨어진다.
 */
export function assigneeLead(usersById: Record<string, User> = {}) {
  return function AssigneeLead(row: DistributionRow) {
    if (row.id === "unassigned" || row.id === "others") {
      return (
        <span className="dash-dist-lead-neutral" aria-hidden>
          {row.id === "unassigned" ? "—" : "+"}
        </span>
      );
    }
    return <UserAvatar user={usersById[row.id]} name={row.name} size="small" />;
  };
}

export interface IssueMiniRow {
  issue: Issue;
  /** 이슈 오른쪽에 붙는 보조 표시 (마감 D-2, 상대 시간 등) */
  meta: ReactNode;
}

/** 요약 카드용 이슈 목록 — 행 전체가 버튼이고 누르면 상세 모달로 간다 */
export function IssueMiniList({
  rows,
  statuses,
  emptyText,
  onOpen,
}: {
  rows: IssueMiniRow[];
  statuses: WorkflowStatus[];
  emptyText: string;
  onOpen: (key: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="dash-empty">{emptyText}</p>;
  }
  return (
    <ul className="dash-issues">
      {rows.map(({ issue, meta }) => (
        <li key={issue.id}>
          {/*
            aria-label을 주지 않는다 — 명시하면 자손 텍스트를 대체해 상태 Lozenge와 마감
            정보(지연·상대시간)가 낭독에서 빠진다. 버튼 이름은 자손 텍스트로 조립된다.
          */}
          <button type="button" className="dash-issue-row" onClick={() => onOpen(issue.key)}>
            <span className="dash-issue-key">{issue.key}</span>
            <span className="dash-issue-title">{issue.title}</span>
            <span className="status-cell">
              <StatusGlyph status={issue.status} statuses={statuses} />
              <Lozenge appearance={statusAppearance(statuses, issue.status)}>
                {statusName(statuses, issue.status)}
              </Lozenge>
            </span>
            <span className="dash-issue-meta">{meta}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
