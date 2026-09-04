import { useState } from "react";
import type { FormEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Badge, Button, TextField } from "@chanho/react";
import type { LozengeProps } from "@chanho/react";
import type { Issue, IssueStatus, User, WorkflowStatus } from "../store/types";
import { SortableIssueCard } from "./IssueCard";
import { StatusGlyph } from "./StatusGlyph";
import { STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  /** 워크플로 상태 id */
  status: string;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 사용자 (아바타·프로필 사진용) */
  usersById: Record<string, User>;
  /** 카드 클릭 시 이슈 상세 열기 */
  onOpenIssue?: (key: string) => void;
  /** 컬럼 하단 인라인 생성 — 지라의 "+ 만들기" (해당 상태로 바로 생성) */
  onCreateIssue?: (status: string, title: string) => void | Promise<void>;
  /** 컬럼 표시 이름 (미지정 시 기본 상태 라벨 폴백) */
  columnName?: string;
  /**
   * 컬럼 Lozenge 색 — 상태 카테고리에서 파생 (기본: 카테고리 id 폴백).
   * @deprecated 색·아이콘 모두 `workflowStatus`에서 온다. 안 넘기면 기본 3상태 폴백.
   */
  appearance?: NonNullable<LozengeProps["appearance"]>;
  /** 해석된 워크플로 상태 — 머리글 글리프의 아이콘·색·읽어 줄 이름의 원천 */
  workflowStatus?: WorkflowStatus;
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
  usersById,
  onOpenIssue,
  onCreateIssue,
  columnName,
  appearance,
  workflowStatus,
  wipLimit = null,
  droppableId,
  epicNames = {},
}: BoardColumnProps) {
  const label = columnName ?? STATUS_LABELS[status as IssueStatus] ?? status;
  // `workflowStatus`가 진짜 원천이고, 옛 `appearance`만 받은 호출부는 색·이름만이라도 살린다
  const glyphStatus: WorkflowStatus | undefined =
    workflowStatus ??
    (appearance
      ? { id: status, name: label, category: status, order: 0, color: appearance }
      : undefined);
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
        {/* 지라식 플레인 텍스트 머리글 — 아이콘은 카테고리 색으로 거들고 이름이 진짜 식별자다.
            색만으로 구분하지 않도록 상태마다 모양이 다르다(레지스트리 `StatusDef.icon`) */}
        <StatusGlyph
          status={status}
          statuses={glyphStatus ? [glyphStatus] : undefined}
          size={16}
        />
        <span className="board-column-name">{label}</span>
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
              assignee={issue.assigneeId ? usersById[issue.assigneeId] : undefined}
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
            iconBefore={<Plus size={14} />}
            onClick={() => setCreating(true)}
          >
            이슈 만들기
          </Button>
        )
      ) : null}
    </section>
  );
}
