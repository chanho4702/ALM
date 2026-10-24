import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, Checkbox, Popover, Radio, RadioGroup, Select, Switch, TextField } from "@chanho/react";
import { VIEW_GROUPS, VIEW_ORDERS, VIEW_PROPERTIES } from "../../store/types";
import type { ViewGroupBy, ViewLayout, ViewOrderBy, ViewProperty } from "../../store/types";
import { validateAql } from "../../store/jiraStore";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";
import { GROUP_LABELS, ORDER_LABELS } from "./viewGrouping";
import { DEFAULT_VIEW_STATE, isDefaultViewState } from "./useViewDisplay";
import type { ViewState } from "./useViewDisplay";
import "./views.css";

/** 표시 속성 한국어 이름 — 목록 행·카드가 그리는 순서와 같다 */
export const PROPERTY_LABELS: Record<ViewProperty, string> = {
  key: "키",
  type: "타입",
  status: "상태",
  priority: "우선순위",
  assignee: "담당자",
  reporter: "보고자",
  labels: "라벨",
  components: "컴포넌트",
  sprint: "스프린트",
  fixVersion: "수정 버전",
  due: "마감일",
  startDate: "시작일",
  storyPoints: "스토리 포인트",
  estimate: "예상 시간",
  flagged: "플래그",
  parent: "상위 이슈",
  created: "생성일",
  updated: "수정일",
};

export interface ViewOptionsPanelProps {
  state: ViewState;
  onChange: (next: ViewState) => void;
  disabled?: boolean;
}

/**
 * Linear식 표시 옵션(Display options) 팝오버 — "표시" 버튼 또는 Shift+V.
 * 바꾸는 즉시 내 화면에 적용된다(저장된 보기를 열었으면 그 작업본, 아니면 내 표시 옵션).
 */
export function ViewOptionsPanel({ state, onChange, disabled }: ViewOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const { layout, display, filter } = state;

  // 입력란·팝업·모달에 포커스가 있으면 무시하는 화면 단축키 규칙을 그대로 탄다(Shift+V = "V")
  useKeyboardShortcuts({ V: () => !disabled && setOpen(true) });

  const patchDisplay = (patch: Partial<ViewState["display"]>) => {
    const next = { ...display, ...patch };
    // 하위 그룹은 그룹과 달라야 하고 그룹이 없으면 없다(서버 normalize와 같은 규칙)
    if (next.groupBy === "none" || next.subGroupBy === next.groupBy) next.subGroupBy = "none";
    onChange({ ...state, display: next });
  };

  const toggleProperty = (property: ViewProperty, checked: boolean) => {
    const set = new Set(display.properties);
    if (checked) set.add(property);
    else set.delete(property);
    // 순서는 어휘 순서로 고정 — 체크 순서에 따라 열 순서가 흔들리지 않게
    patchDisplay({ properties: VIEW_PROPERTIES.filter((p) => set.has(p)) });
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="표시 옵션"
      className="view-options"
      trigger={
        <Button
          variant="secondary"
          iconBefore={<SlidersHorizontal size={16} aria-hidden />}
          disabled={disabled}
          aria-keyshortcuts="Shift+V"
          title="표시 옵션 (Shift+V)"
        >
          표시
        </Button>
      }
    >
      <div className="view-options-body">
        <RadioGroup
          value={layout}
          onValueChange={(value) => onChange({ ...state, layout: value as ViewLayout })}
          aria-label="레이아웃"
          className="view-options-layout view-options-layout"
        >
          <Radio value="list" label="목록" />
          <Radio value="board" label="보드" />
        </RadioGroup>
        <div className="view-options-grid">
          <Select
            label="그룹"
            value={display.groupBy}
            onValueChange={(value) => patchDisplay({ groupBy: value as ViewGroupBy })}
            options={VIEW_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))}
          />
          {display.groupBy !== "none" && layout === "list" ? (
            <Select
              label="하위 그룹"
              value={display.subGroupBy}
              onValueChange={(value) => patchDisplay({ subGroupBy: value as ViewGroupBy })}
              options={VIEW_GROUPS.filter((g) => g !== display.groupBy).map((g) => ({ value: g, label: GROUP_LABELS[g] }))}
            />
          ) : null}
          <Select
            label="정렬"
            value={display.orderBy}
            onValueChange={(value) => patchDisplay({ orderBy: value as ViewOrderBy })}
            options={VIEW_ORDERS.map((o) => ({ value: o, label: ORDER_LABELS[o] }))}
          />
          <Select
            label="정렬 방향"
            value={display.orderDirection}
            onValueChange={(value) => patchDisplay({ orderDirection: value === "desc" ? "desc" : "asc" })}
            options={[
              { value: "asc", label: "오름차순" },
              { value: "desc", label: "내림차순" },
            ]}
          />
        </div>
        <div className="view-options-switches">
          <Switch
            label="하위 이슈 표시"
            checked={display.showSubIssues}
            onCheckedChange={(checked) => patchDisplay({ showSubIssues: checked })}
          />
          <Switch
            label="빈 그룹 표시"
            checked={display.showEmptyGroups}
            disabled={display.groupBy === "none"}
            onCheckedChange={(checked) => patchDisplay({ showEmptyGroups: checked })}
          />
        </div>
        <fieldset className="view-options-properties">
          <legend>표시 속성</legend>
          {VIEW_PROPERTIES.map((property) => (
            <Checkbox
              key={property}
              label={PROPERTY_LABELS[property]}
              checked={display.properties.includes(property)}
              onCheckedChange={(checked) => toggleProperty(property, checked === true)}
            />
          ))}
        </fieldset>
        <ViewFilterField
          filter={filter}
          onChange={(nextFilter) => onChange({ ...state, filter: nextFilter })}
        />
        <div className="view-options-footer">
          <Button
            variant="ghost"
            size="small"
            disabled={isDefaultViewState(state)}
            onClick={() => onChange(DEFAULT_VIEW_STATE)}
          >
            기본값으로
          </Button>
        </div>
      </div>
    </Popover>
  );
}

/**
 * 보기 필터(AQL) — 입력하는 동안 `validateAql`로 검사하고 맞을 때만 적용한다(틀린 질의로 목록을 비우지 않는다).
 * 스마트 검색 필터가 걸린 보기는 그 질의를 보여 주고, AQL을 입력하면 AQL 필터로 바뀐다.
 */
function ViewFilterField({
  filter,
  onChange,
}: {
  filter: ViewState["filter"];
  onChange: (next: ViewState["filter"]) => void;
}) {
  const applied = filter?.kind === "aql" ? filter.query : "";
  const [text, setText] = useState(applied);
  const [error, setError] = useState<string | undefined>(undefined);
  // onChange는 렌더마다 새 함수다 — 검사는 입력이 바뀔 때만 돌리고 적용은 최신 콜백으로 한다
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  // 바깥에서 필터가 바뀌면(보기 전환·기본값으로) 입력을 맞춘다
  useEffect(() => {
    setText(applied);
    setError(undefined);
  }, [applied]);

  useEffect(() => {
    const query = text.trim();
    if (query === applied.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!query) {
        setError(undefined);
        latest.current(null);
        return;
      }
      void validateAql(query).then(
        (result) => {
          if (cancelled) return;
          if (result.ok) {
            setError(undefined);
            latest.current({ kind: "aql", query });
          } else {
            setError(result.error ?? "AQL 문법 오류");
          }
        },
        (failure: unknown) => {
          if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, applied]);

  return (
    <div className="view-options-filter">
      <TextField
        label="필터 (AQL)"
        placeholder="예: flagged = true AND assignee = currentUser()"
        value={text}
        onChange={(event) => setText(event.target.value)}
        error={error}
        description={filter?.kind === "smart" ? `스마트 검색 필터 적용 중: ${filter.query}` : "비우면 프로젝트 전체"}
      />
    </div>
  );
}
