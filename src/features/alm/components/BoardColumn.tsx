import { useState } from "react";
import type { FormEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, Button, Lozenge, TextField } from "@chanho/react";
import type { Issue, IssueStatus } from "../store/types";
import { SortableIssueCard } from "./IssueCard";
import { STATUS_APPEARANCE, STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  status: IssueStatus;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
  /** 카드 클릭 시 이슈 상세 열기 */
  onOpenIssue?: (key: string) => void;
  /** 컬럼 하단 인라인 생성 — 지라의 "+ 만들기" (해당 상태로 바로 생성) */
  onCreateIssue?: (status: IssueStatus, title: string) => void | Promise<void>;
  /** 보드 컬럼 커스텀 이름 (미지정 시 상태 라벨) */
  columnName?: string;
  /** WIP 제한 — 초과 시 danger 강조 (이동 자체는 허용) */
  wipLimit?: number | null;
  /** 스윔레인에서 밴드별 유니크 droppable id (기본: status) — "밴드키:status" 형식 */
  droppableId?: string;
  /** issueId → 부모 에픽 이름 (카드 에픽 태그) */
  epicNames?: Record<string, string>;
}

export function BoardColumn({
  status,
  issues,
  userNames,
  onOpenIssue,
  onCreateIssue,
  columnName,
  wipLimit = null,
  droppableId,
  epicNames = {},
}: BoardColumnProps) {
  const label = columnName ?? STATUS_LABELS[status];
  const overWip = wipLimit !== null && issues.length > wipLimit;
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  // 컬럼 droppable id = status 문자열(스윔레인은 "밴드키:status") → resolveMove가 컬럼 드롭을 인식한다
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? status });

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !onCreateIssue) return;
    await onCreateIssue(status, title);
    setTitle("");
    setCreating(false);
  };

  return (
    <section
      className={["board-column", isOver ? "is-over" : null, overWip ? "is-over-wip" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      data-testid={`board-column-${status}`}
    >
      <header className="board-column-header">
        <Lozenge appearance={STATUS_APPEARANCE[status]}>{label}</Lozenge>
        <Badge appearance={overWip ? "danger" : "neutral"}>
          {wipLimit !== null ? `${issues.length}/${wipLimit}` : issues.length}
        </Badge>
        {overWip ? (
          <span className="board-wip-warning" role="img" aria-label="WIP 제한 초과">
            ⚠
          </span>
        ) : null}
      </header>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-column-cards">
          {issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
              epicName={epicNames[issue.id]}
              onOpen={onOpenIssue ? () => onOpenIssue(issue.key) : undefined}
            />
          ))}
        </div>
      </SortableContext>
      {onCreateIssue ? (
        creating ? (
          <form className="board-column-create" onSubmit={handleCreateSubmit}>
            <TextField
              label={`${label} 컬럼에 이슈 만들기`}
              placeholder="무엇을 해야 하나요?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setTitle("");
                  setCreating(false);
                }
              }}
            />
            <div className="board-column-create-actions">
              <Button
                type="button"
                size="small"
                variant="ghost"
                onClick={() => {
                  setTitle("");
                  setCreating(false);
                }}
              >
                취소
              </Button>
              <Button type="submit" size="small" disabled={!title.trim()}>
                만들기
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="small"
            className="board-column-add"
            onClick={() => setCreating(true)}
          >
            + 이슈 만들기
          </Button>
        )
      ) : null}
    </section>
  );
}
