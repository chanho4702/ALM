import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Dropdown, Lozenge } from "@chanho/react";
import type { Issue, Sprint, User, WorkflowStatus } from "../store/types";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";
import {
  priorityAppearance,
  priorityName,
  estimateSummary,
  formatPlannedRange,
  statusAppearance,
  statusName,
} from "./labels";
import { usePriorities } from "./usePriorities";
import { UserAvatar } from "./UserAvatar";

/** 이슈를 옮길 수 있는 대상. sprintId null = 백로그 */
export interface MoveTarget {
  sprintId: string | null;
  label: string; // "백로그" | "Sprint 2" ...
}

export interface BacklogIssueRowProps {
  issue: Issue;
  /** 담당자. 미지정이면 undefined → 아바타 생략 */
  assignee?: User;
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
  assignee,
  statuses,
  moveTargets,
  onMove,
  onDelete,
  onOpen,
}: BacklogIssueRowProps) {
  const priorities = usePriorities();
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
      <span className="status-cell">
        <StatusGlyph status={issue.status} statuses={statuses} variant="icon" />
        <Lozenge appearance={statusAppearance(statuses, issue.status)}>
          {statusName(statuses, issue.status)}
        </Lozenge>
      </span>
      {/* 이름은 Lozenge가 갖는다 — 아이콘은 색·모양만 거든다(중복 낭독 방지) */}
      <ValueWithIcon
        icon={<PriorityGlyph defs={priorities} priority={issue.priority} size={14} variant="icon" />}
      >
        <Lozenge appearance={priorityAppearance(priorities, issue.priority)}>
          {priorityName(priorities, issue.priority)}
        </Lozenge>
      </ValueWithIcon>
      {assignee ? <UserAvatar user={assignee} size="small" /> : null}
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
              <MoreHorizontal size={16} />
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

/**
 * 패널 계획 합계 — 스프린트 패널과 백로그 패널이 같은 표기를 공유한다.
 * 미입력이 없으면 그 칩은 렌더하지 않는다(잡음 제거).
 */
export function PanelEstimateSummary({ issues }: { issues: Issue[] }) {
  const { totalHours, missing } = estimateSummary(issues);
  return (
    <>
      <span className="sprint-panel-estimate">예상 {totalHours}h</span>
      {missing > 0 ? <span className="sprint-panel-estimate">미입력 {missing}건</span> : null}
    </>
  );
}

export interface SprintPanelProps {
  sprint: Sprint;
  /** 이 스프린트의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 사용자 (아바타·프로필 사진용) */
  usersById: Record<string, User>;
  /** 프로젝트의 해석된 워크플로 상태 */
  statuses?: WorkflowStatus[];
  moveTargets: MoveTarget[];
  onStart: (sprint: Sprint) => void;
  onComplete: (sprint: Sprint) => void;
  /** 계획 메타(이름·목표·기간) 편집 열기 */
  onEditPlan: (sprint: Sprint) => void;
  onMove: (issue: Issue, sprintId: string | null) => void;
  onDelete: (issue: Issue) => void;
  onOpen: (key: string) => void;
}

/** planned/active 스프린트 패널 — planned엔 시작 Button, active엔 완료 Button (스펙 §4) */
export function SprintPanel({
  sprint,
  issues,
  usersById,
  statuses,
  moveTargets,
  onStart,
  onComplete,
  onEditPlan,
  onMove,
  onDelete,
  onOpen,
}: SprintPanelProps) {
  const period = formatPlannedRange(sprint.plannedStart, sprint.plannedEnd);
  return (
    <section className="sprint-panel" aria-label={sprint.name}>
      <header className="sprint-panel-header">
        <h3>{sprint.name}</h3>
        {period ? <span className="sprint-panel-period">{period}</span> : null}
        <Badge appearance={sprint.state === "active" ? "brand" : "neutral"}>{issues.length}</Badge>
        <PanelEstimateSummary issues={issues} />
        {/* 액션 둘을 한 그룹으로 — 머리글 메타와 버튼 사이가 벌어지지 않게 (지라 백로그) */}
        <div className="sprint-panel-actions">
          <Button
            variant="subtle"
            size="small"
            aria-label={`${sprint.name} 계획 수정`}
            onClick={() => onEditPlan(sprint)}
          >
            계획 수정
          </Button>
          {sprint.state === "planned" ? (
            <Button size="small" onClick={() => onStart(sprint)}>
              스프린트 시작
            </Button>
          ) : null}
          {sprint.state === "active" ? (
            <Button size="small" variant="secondary" onClick={() => onComplete(sprint)}>
              스프린트 완료
            </Button>
          ) : null}
        </div>
      </header>
      {sprint.goal ? <p className="sprint-panel-goal">{sprint.goal}</p> : null}
      <BacklogDropZone panelId={sprint.id} issueIds={issues.map((i) => i.id)}>
        {issues.map((issue) => (
          <SortableBacklogRow
            key={issue.id}
            issue={issue}
            assignee={issue.assigneeId ? usersById[issue.assigneeId] : undefined}
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
