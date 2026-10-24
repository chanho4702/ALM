import { useEffect, useRef, useState } from "react";
import { ExternalLink, GitCommitHorizontal, GitPullRequest, X } from "lucide-react";
import { Button, Lozenge, Tag } from "@chanho/react";
import type { DevelopmentSummary, Issue, PriorityDef, Sprint, User, WorkflowStatus } from "../store/types";
import { getIssueDevelopment } from "../store/jiraStore";
import { htmlToText } from "../store/richText";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { UserAvatar } from "./UserAvatar";
import { priorityName, statusAppearance, statusName } from "./labels";
import { formatDate } from "./time";
import "./interaction.css";

export interface IssuePeekProps {
  issue: Issue;
  statuses: WorkflowStatus[];
  users: User[];
  priorities: PriorityDef[];
  sprints?: Sprint[];
  onClose: () => void;
  onOpen: (key: string) => void;
}

/**
 * 이슈 미리보기(리니어 Peek) — 화면을 떠나지 않고 옆 패널에 읽기 전용 요약을 띄운다.
 *
 * 모달이 아니다(포커스를 가두지 않는다): 목록·보드·백로그의 단축키(j/k·Space·Esc)가 계속 동작해야
 * 이웃 이슈로 넘기거나 닫을 수 있다. 그래서 `role="complementary"` 영역 + 이름으로만 알린다.
 * 편집은 상세 모달 몫이다(Enter·"상세 열기").
 */
export function IssuePeek({ issue, statuses, users, priorities, sprints = [], onClose, onOpen }: IssuePeekProps) {
  const assignee = issue.assigneeId ? users.find((user) => user.id === issue.assigneeId) : undefined;
  const sprint = issue.sprintId ? sprints.find((s) => s.id === issue.sprintId) : undefined;
  const description = htmlToText(issue.description).trim();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 이웃 이슈로 넘기면 본문 스크롤을 맨 위로
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [issue.id]);
  // 개발 요약(커밋·PR 수) — 이웃 이슈로 넘길 때마다 그 이슈 것만. 늦게 온 옛 응답은 버린다
  const [dev, setDev] = useState<{ issueId: string; summary: DevelopmentSummary | null; failed: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    getIssueDevelopment(issue.id).then(
      (result) => alive && setDev({ issueId: issue.id, summary: result.summary, failed: false }),
      () => alive && setDev({ issueId: issue.id, summary: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [issue.id]);
  const devSummary = dev?.issueId === issue.id ? dev : null;

  return (
    <aside className="issue-peek" aria-label={`${issue.key} 미리보기`}>
      <header className="issue-peek-header">
        <IssueTypeGlyph type={issue.type} />
        <span className="issue-peek-key">{issue.key}</span>
        <span className="issue-peek-spacer" />
        <Button
          size="small"
          variant="ghost"
          iconBefore={<ExternalLink size={14} />}
          onClick={() => onOpen(issue.key)}
          title="상세 열기 (Enter)"
        >
          상세 열기
        </Button>
        <Button
          size="small"
          variant="ghost"
          iconOnly
          aria-label="미리보기 닫기"
          title="닫기 (Esc · Space)"
          iconBefore={<X size={16} />}
          onClick={onClose}
        />
      </header>
      <div className="issue-peek-body" ref={bodyRef}>
        <h2 className="issue-peek-title">{issue.title}</h2>
        <dl className="issue-peek-fields">
          <dt>상태</dt>
          <dd>
            <span className="status-cell">
              <StatusGlyph status={issue.status} statuses={statuses} variant="icon" />
              <Lozenge appearance={statusAppearance(statuses, issue.status)}>{statusName(statuses, issue.status)}</Lozenge>
            </span>
          </dd>
          <dt>담당자</dt>
          <dd>
            {issue.assigneeId ? (
              <span className="issue-assignee-cell">
                <UserAvatar user={assignee} name={assignee?.name ?? ""} size="small" />
                {assignee?.name ?? "알 수 없는 사용자"}
              </span>
            ) : (
              "미지정"
            )}
          </dd>
          <dt>우선순위</dt>
          <dd>
            <span className="status-cell">
              <PriorityGlyph defs={priorities} priority={issue.priority} size={14} variant="icon" />
              <span>{priorityName(priorities, issue.priority)}</span>
            </span>
          </dd>
          <dt>스프린트</dt>
          <dd>{sprint ? sprint.name : issue.sprintId ? "알 수 없는 스프린트" : "백로그"}</dd>
          <dt>라벨</dt>
          <dd>
            {issue.labels.length > 0 ? (
              <span className="issue-peek-labels">
                {issue.labels.map((label) => (
                  <Tag key={label} label={label} />
                ))}
              </span>
            ) : (
              "없음"
            )}
          </dd>
          <dt>예상 시간</dt>
          <dd>{issue.estimateHours === null ? "—" : `${issue.estimateHours}h`}</dd>
          <dt>마감일</dt>
          <dd>{issue.dueDate ? formatDate(issue.dueDate) : "—"}</dd>
          <dt>개발</dt>
          <dd data-testid="issue-peek-development">
            {devSummary === null ? (
              "…"
            ) : devSummary.failed || !devSummary.summary ? (
              "불러오지 못했습니다"
            ) : devSummary.summary.commits + devSummary.summary.pullRequests === 0 ? (
              "없음"
            ) : (
              <span className="status-cell">
                <GitCommitHorizontal size={14} aria-hidden />
                <span>커밋 {devSummary.summary.commits}건</span>
                <GitPullRequest size={14} aria-hidden />
                <span>PR {devSummary.summary.pullRequests}건</span>
              </span>
            )}
          </dd>
          <dt>생성일</dt>
          <dd>{formatDate(issue.createdAt)}</dd>
          <dt>수정일</dt>
          <dd>{formatDate(issue.updatedAt)}</dd>
        </dl>
        <section className="issue-peek-description" aria-label="설명">
          <h3>설명</h3>
          {description ? <p>{description}</p> : <p className="issue-peek-empty">설명이 없습니다</p>}
        </section>
      </div>
      <footer className="issue-peek-footer" aria-hidden="true">
        <span><kbd className="keyboard-shortcut-kbd">J</kbd><kbd className="keyboard-shortcut-kbd">K</kbd> 이웃 이슈</span>
        <span><kbd className="keyboard-shortcut-kbd">Enter</kbd> 상세</span>
        <span><kbd className="keyboard-shortcut-kbd">Esc</kbd> 닫기</span>
      </footer>
    </aside>
  );
}
