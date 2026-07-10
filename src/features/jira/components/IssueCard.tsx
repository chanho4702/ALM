import { Avatar, Lozenge } from "@chanho/react";
import type { Issue } from "../store/types";
import { PRIORITY_APPEARANCE, PRIORITY_LABELS } from "./labels";

export interface IssueCardProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
}

export function IssueCard({ issue, assigneeName }: IssueCardProps) {
  return (
    <article className="issue-card">
      <p className="issue-card-title">{issue.title}</p>
      <div className="issue-card-meta">
        <span className="issue-card-key">{issue.key}</span>
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
        {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      </div>
    </article>
  );
}
