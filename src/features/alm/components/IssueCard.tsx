import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, Card, Lozenge, Tag } from "@chanho/react";
import type { Issue } from "../store/types";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PRIORITY_APPEARANCE, PRIORITY_LABELS } from "./labels";

export interface IssueCardProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
  /** 부모 에픽 이름 — 있으면 지라의 에픽 태그(warning Lozenge) 표시 */
  epicName?: string;
  /** 카드 클릭 시 (이슈 상세 열기). PointerSensor distance 5로 드래그와 구분된다 */
  onOpen?: () => void;
}

export function IssueCard({ issue, assigneeName, epicName, onOpen }: IssueCardProps) {
  return (
    // interactive Card는 <button>으로 렌더 — hover elevation은 Card가 제공한다.
    // 내부는 phrasing 콘텐츠(span)만 둔다.
    <Card interactive padding="sm" className="issue-card" onClick={onOpen}>
      <span className="issue-card-title">{issue.title}</span>
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
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
        {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      </span>
    </Card>
  );
}

/**
 * useSortable 래퍼. DragOverlay에는 래핑 없는 IssueCard를 써야 한다
 * (같은 id로 useSortable을 두 번 등록하면 안 되기 때문).
 */
export function SortableIssueCard(props: IssueCardProps) {
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
      <IssueCard {...props} />
    </div>
  );
}
