import { Badge } from "@chanho/react";
import type { Issue, IssueStatus } from "../store/types";
import { IssueCard } from "./IssueCard";
import { STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  status: IssueStatus;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
}

export function BoardColumn({ status, issues, userNames }: BoardColumnProps) {
  const label = STATUS_LABELS[status];
  return (
    <section className="board-column" aria-label={label} data-testid={`board-column-${status}`}>
      <header className="board-column-header">
        <h3>{label}</h3>
        <Badge>{issues.length}</Badge>
      </header>
      <div className="board-column-cards">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
          />
        ))}
      </div>
    </section>
  );
}
