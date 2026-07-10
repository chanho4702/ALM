import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@chanho/react";
import type { Issue, IssueStatus } from "../store/types";
import { SortableIssueCard } from "./IssueCard";
import { STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  status: IssueStatus;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
  /** 카드 클릭 시 이슈 상세 열기 */
  onOpenIssue?: (key: string) => void;
}

export function BoardColumn({ status, issues, userNames, onOpenIssue }: BoardColumnProps) {
  const label = STATUS_LABELS[status];
  // 컬럼 droppable id = status 문자열 → resolveMove가 컬럼 드롭을 인식한다
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section className="board-column" aria-label={label} data-testid={`board-column-${status}`}>
      <header className="board-column-header">
        <h3>{label}</h3>
        <Badge>{issues.length}</Badge>
      </header>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-column-cards">
          {issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
              onOpen={onOpenIssue ? () => onOpenIssue(issue.key) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
