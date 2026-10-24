import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check } from "lucide-react";
import { Card, Lozenge, Tag } from "@chanho/react";
import { Flag } from "lucide-react";
import type { Issue, User } from "../store/types";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { usePriorities } from "./usePriorities";
import { UserAvatar } from "./UserAvatar";
import "./board-workflow.css";

export interface IssueCardProps {
  issue: Issue;
  /** 담당자. 미지정이면 undefined → 아바타 생략 (프로필 사진은 UserAvatar가 읽는다) */
  assignee?: User;
  /** 부모 에픽 이름 — 있으면 지라의 에픽 태그(warning Lozenge) 표시 */
  epicName?: string;
  /** 카드 클릭 시 (이슈 상세 열기). PointerSensor distance 5로 드래그와 구분된다 */
  onOpen?: () => void;
}

export function IssueCard({ issue, assignee, epicName, onOpen }: IssueCardProps) {
  const priorities = usePriorities();
  return (
    // interactive Card는 <button>으로 렌더 — hover elevation은 Card가 제공한다.
    // 내부는 phrasing 콘텐츠(span)만 둔다.
    <Card interactive padding="sm" className={issue.flagged ? "issue-card is-flagged" : "issue-card"} onClick={onOpen}>
      <span className="issue-card-title">{issue.title}</span>
      {issue.flagged ? <IssueFlagMark /> : null}
      {epicName ? (
        <span className="issue-card-epic">
          <Lozenge appearance="warning">{epicName}</Lozenge>
        </span>
      ) : null}
      {issue.labels.length > 0 ? (
        <span className="issue-card-labels">
          {issue.labels.map((label) => (
            <Tag key={label} label={label} />
          ))}
        </span>
      ) : null}
      <span className="issue-card-meta">
        <IssueTypeGlyph type={issue.type} />
        <span className="issue-card-key">{issue.key}</span>
        <PriorityGlyph defs={priorities} priority={issue.priority} />
        {issue.storyPoints !== null && issue.storyPoints !== undefined ? (
          <span className="issue-points" title={`스토리 포인트 ${issue.storyPoints}`} aria-label={`스토리 포인트 ${issue.storyPoints}`}>
            {issue.storyPoints}
          </span>
        ) : null}
        {assignee ? <UserAvatar user={assignee} size="small" /> : null}
      </span>
    </Card>
  );
}

/** 플래그(막힘, D2) 표시 — 아이콘 + 텍스트(색만으로 알리지 않는다). 카드·목록 행·백로그 행이 함께 쓴다 */
export function IssueFlagMark() {
  return (
    <span className="issue-flag">
      <Flag size={12} aria-hidden />
      막힘
    </span>
  );
}

/**
 * useSortable 래퍼. DragOverlay에는 래핑 없는 IssueCard를 써야 한다
 * (같은 id로 useSortable을 두 번 등록하면 안 되기 때문).
 */
export function SortableIssueCard({ selected = false, ...props }: IssueCardProps & { selected?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.issue.id,
  });
  return (
    <div
      ref={setNodeRef}
      // data-issue-key: 다중 선택(⌘/Shift 클릭)·우클릭 메뉴·미리보기가 이 카드를 찾는 표식(useIssueInteractions)
      data-issue-key={props.issue.key}
      className={selected ? "issue-selectable is-selected" : "issue-selectable"}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <IssueCard {...props} />
      {selected ? (
        <span className="issue-selected-mark">
          <Check size={12} aria-hidden />
          <span className="visually-hidden">선택됨</span>
        </span>
      ) : null}
    </div>
  );
}
