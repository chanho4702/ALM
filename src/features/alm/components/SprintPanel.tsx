import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, Badge, Button, Dropdown, Lozenge } from "@chanho/react";
import type { Issue, Sprint, WorkflowStatus } from "../store/types";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import {
  PRIORITY_APPEARANCE,
  PRIORITY_LABELS,
  statusAppearance,
  statusName,
} from "./labels";

/** 이슈를 옮길 수 있는 대상. sprintId null = 백로그 */
export interface MoveTarget {
  sprintId: string | null;
  label: string; // "백로그" | "Sprint 2" ...
}

export interface BacklogIssueRowProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
  /** 프로젝트의 해석된 워크플로 상태 (이름/색 표시용) */
  statuses?: WorkflowStatus[];
  moveTargets: MoveTarget[];
  onMove: (issue: Issue, sprintId: string | null) => void;
  onDelete: (issue: Issue) => void;
  onOpen: (key: string) => void;
}

/** 백로그/스프린트 패널 공용 이슈 행. 행 클릭 = 상세 모달, 우측 ⋯ = Dropdown 액션 */
export function BacklogIssueRow({
  issue,
  assigneeName,
  statuses,
  moveTargets,
  onMove,
  onDelete,
  onOpen,
}: BacklogIssueRowProps) {
  return (
    // 행 안에 Dropdown 버튼이 중첩되므로 <button>이 아니라 role="button"으로 (button-in-button 방지)
    <div
      className="backlog-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(issue.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(issue.key);
        }
      }}
    >
      <IssueTypeGlyph type={issue.type} />
      <span className="backlog-row-key">{issue.key}</span>
      <span className="backlog-row-title">{issue.title}</span>
      <Lozenge appearance={statusAppearance(statuses, issue.status)}>
        {statusName(statuses, issue.status)}
      </Lozenge>
      <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
        {PRIORITY_LABELS[issue.priority]}
      </Lozenge>
      {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      {/*
        Dropdown 전체를 stopPropagation 래퍼로 감싼다.
        React Portal은 실제 DOM 위치와 무관하게 "렌더 트리(fiber)" 기준으로 합성 이벤트가 버블링된다
        (https://react.dev/reference/react-dom/createPortal#rendering-to-a-different-part-of-the-dom-tree).
        Radix DropdownMenu.Content/Item은 document.body에 Portal로 렌더되지만 fiber 상으로는
        여전히 이 <Dropdown>의 자식이므로, 메뉴 항목 클릭 이벤트가 이 span → 상위 .backlog-row
        div까지 버블링해 onOpen(행 클릭 = 모달 열기)이 잘못 실행된다.
        트리거 Button의 onClick stopPropagation만으로는 트리거 버튼 자체 클릭만 막을 뿐, 실제
        DOM 트리에서 별도 서브트리인 Portal 메뉴 항목 클릭까지는 막지 못한다 — 그래서 fiber
        조상인 이 span에서 한 번 더 막아야 한다.
      */}
      <span onClick={(e) => e.stopPropagation()}>
        <Dropdown
          trigger={
            <Button variant="subtle" size="small" aria-label={`${issue.key} 액션`}>
              ⋯
            </Button>
          }
          items={[
            // 현재 위치는 이동 대상에서 제외 (백로그 이슈면 "백로그로 이동" 없음)
            ...moveTargets
              .filter((target) => target.sprintId !== issue.sprintId)
              .map((target) => ({
                label: `${target.label}로 이동`,
                onSelect: () => onMove(issue, target.sprintId),
              })),
            { label: "삭제", danger: true, onSelect: () => onDelete(issue) },
          ]}
        />
      </span>
    </div>
  );
}

/**
 * useSortable 래퍼 — DragOverlay에는 래핑 없는 BacklogIssueRow를 쓴다
 * (같은 id로 useSortable을 두 번 등록하면 안 되기 때문, SortableIssueCard와 동일 패턴).
 */
export function SortableBacklogRow(props: BacklogIssueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.issue.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <BacklogIssueRow {...props} />
    </div>
  );
}

/** 패널의 드롭 영역 — droppable id는 "backlog" 또는 sprintId (resolveBacklogMove 입력) */
export function BacklogDropZone({
  panelId,
  issueIds,
  children,
}: {
  panelId: string;
  issueIds: string[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: panelId });
  return (
    <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={isOver ? "sprint-panel-issues is-over" : "sprint-panel-issues"}
      >
        {children}
      </div>
    </SortableContext>
  );
}

export interface SprintPanelProps {
  sprint: Sprint;
  /** 이 스프린트의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
  /** 프로젝트의 해석된 워크플로 상태 */
  statuses?: WorkflowStatus[];
  moveTargets: MoveTarget[];
  onStart: (sprint: Sprint) => void;
  onComplete: (sprint: Sprint) => void;
  onMove: (issue: Issue, sprintId: string | null) => void;
  onDelete: (issue: Issue) => void;
  onOpen: (key: string) => void;
}

/** planned/active 스프린트 패널 — planned엔 시작 Button, active엔 완료 Button (스펙 §4) */
export function SprintPanel({
  sprint,
  issues,
  userNames,
  statuses,
  moveTargets,
  onStart,
  onComplete,
  onMove,
  onDelete,
  onOpen,
}: SprintPanelProps) {
  return (
    <section className="sprint-panel" aria-label={sprint.name}>
      <header className="sprint-panel-header">
        <h3>{sprint.name}</h3>
        <Badge appearance={sprint.state === "active" ? "brand" : "neutral"}>{issues.length}</Badge>
        {sprint.state === "planned" ? (
          <Button size="small" onClick={() => onStart(sprint)}>
            스프린트 시작
          </Button>
        ) : null}
        {sprint.state === "active" ? (
          <Button size="small" variant="subtle" onClick={() => onComplete(sprint)}>
            스프린트 완료
          </Button>
        ) : null}
      </header>
      <BacklogDropZone panelId={sprint.id} issueIds={issues.map((i) => i.id)}>
        {issues.map((issue) => (
          <SortableBacklogRow
            key={issue.id}
            issue={issue}
            assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
            statuses={statuses}
            moveTargets={moveTargets}
            onMove={onMove}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        ))}
        {issues.length === 0 ? <p className="sprint-panel-empty">이슈가 없습니다</p> : null}
      </BacklogDropZone>
    </section>
  );
}
