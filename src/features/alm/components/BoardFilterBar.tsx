import { Button, Select, TextField } from "@chanho/react";
import type { Issue, IssueType, User } from "../store/types";
import { useIssueTypes } from "./useIssueTypes";
import { UserAvatar } from "./UserAvatar";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → 센티널
const ALL = "all";
export const UNASSIGNED = "unassigned";

/** 보드 화면의 즉석 필터 — 보드 저장 필터와 별개 (지라 quick filter) */
export interface QuickFilter {
  text: string;
  assigneeIds: string[]; // "unassigned" 센티널 포함 가능
  type: IssueType | null;
  label: string | null;
}

export const EMPTY_QUICK_FILTER: QuickFilter = {
  text: "",
  assigneeIds: [],
  type: null,
  label: null,
};

/** 퀵 필터를 이슈 목록에 적용한다 (화면 몫 — 저장 필터는 스토어) */
export function applyQuickFilter(issues: Issue[], quick: QuickFilter): Issue[] {
  let result = issues;
  const text = quick.text.trim().toLowerCase();
  if (text) {
    result = result.filter(
      (i) => i.title.toLowerCase().includes(text) || i.key.toLowerCase().includes(text),
    );
  }
  if (quick.assigneeIds.length > 0) {
    result = result.filter((i) =>
      i.assigneeId === null
        ? quick.assigneeIds.includes(UNASSIGNED)
        : quick.assigneeIds.includes(i.assigneeId),
    );
  }
  if (quick.type) result = result.filter((i) => i.type === quick.type);
  if (quick.label) result = result.filter((i) => i.labels.includes(quick.label!));
  return result;
}

export interface BoardFilterBarProps {
  users: User[];
  /** 라벨 Select 선택지 — 보드 이슈들의 라벨 합집합 */
  labelOptions: string[];
  quick: QuickFilter;
  onChange: (next: QuickFilter) => void;
}

export function BoardFilterBar({ users, labelOptions, quick, onChange }: BoardFilterBarProps) {
  const issueTypes = useIssueTypes();
  const hasActive =
    quick.text.trim() !== "" ||
    quick.assigneeIds.length > 0 ||
    quick.type !== null ||
    quick.label !== null;

  const toggleAssignee = (id: string) => {
    const next = quick.assigneeIds.includes(id)
      ? quick.assigneeIds.filter((a) => a !== id)
      : [...quick.assigneeIds, id];
    onChange({ ...quick, assigneeIds: next });
  };

  return (
    <div className="board-filter-bar" data-testid="board-filter-bar">
      {/* 라벨은 접근성을 위해 DOM에 남기고 시각적으로만 숨긴다 (지라 보드 툴바 = 한 줄) */}
      <TextField
        label="보드 검색"
        className="visually-hidden-label board-filter-search"
        placeholder="보드 검색"
        value={quick.text}
        onChange={(e) => onChange({ ...quick, text: e.target.value })}
      />
      {/* 지라의 담당자 아바타 스택 — 클릭 토글, 다중 선택 */}
      <div className="board-avatar-stack" role="group" aria-label="담당자 필터">
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className={
              quick.assigneeIds.includes(user.id)
                ? "board-avatar-toggle is-active"
                : "board-avatar-toggle"
            }
            aria-pressed={quick.assigneeIds.includes(user.id)}
            aria-label={`담당자 ${user.name}`}
            title={user.name}
            onClick={() => toggleAssignee(user.id)}
          >
            <UserAvatar user={user} size="small" />
          </button>
        ))}
        <button
          type="button"
          className={
            quick.assigneeIds.includes(UNASSIGNED)
              ? "board-avatar-toggle is-active"
              : "board-avatar-toggle"
          }
          aria-pressed={quick.assigneeIds.includes(UNASSIGNED)}
          aria-label="담당자 미지정"
          title="미지정"
          onClick={() => toggleAssignee(UNASSIGNED)}
        >
          <span className="assignee-stat-unassigned" aria-hidden>
            —
          </span>
        </button>
      </div>
      <Select
        label="타입"
        className="visually-hidden-label board-filter-select"
        value={quick.type ?? ALL}
        options={[
          // 라벨을 시각적으로 숨겼으므로 기본 선택지가 무슨 필터인지 알려준다
          { value: ALL, label: "모든 타입" },
          ...issueTypes.map((t) => ({ value: t.id, label: t.name })),
        ]}
        onValueChange={(v) => onChange({ ...quick, type: v === ALL ? null : v })}
      />
      <Select
        label="라벨"
        className="visually-hidden-label board-filter-select"
        value={quick.label ?? ALL}
        options={[
          { value: ALL, label: "모든 라벨" },
          ...labelOptions.map((l) => ({ value: l, label: l })),
        ]}
        onValueChange={(v) => onChange({ ...quick, label: v === ALL ? null : v })}
      />
      {hasActive ? (
        <Button variant="ghost" size="small" onClick={() => onChange(EMPTY_QUICK_FILTER)}>
          필터 초기화
        </Button>
      ) : null}
    </div>
  );
}
