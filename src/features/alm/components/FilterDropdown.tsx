import { useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Checkbox, Popover } from "@chanho/react";
import { onPopoverListKeyDown } from "./popoverListKeys";
import { ValueWithIcon } from "./ValueWithIcon";

export interface FilterOption {
  value: string;
  label: string;
  /**
   * 값 왼쪽에 세울 글리프(`IssueTypeGlyph`/`StatusGlyph`/`PriorityGlyph`). 라벨 텍스트는 그대로
   * 남으므로 색·모양만으로 구분되지 않는다 — 넘기는 글리프는 `variant="icon"`으로 숨겨
   * 같은 이름이 두 번 읽히지 않게 한다.
   *
   * 단일·멀티 선택 두 모드 모두에서 그려진다 — `Checkbox.label`이 노드를 받는다(react 0.11.0).
   */
  icon?: ReactNode;
}

export interface FilterDropdownProps {
  /** 트리거에 표시되는 필터 이름 — "상태", "담당자" */
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /**
   * false면 단일 선택(라디오) — 스토어 필터 계약이 단일 값인 화면(이슈 목록)용.
   * 고르면 패널이 닫힌다. @default true
   */
  multiple?: boolean;
  /**
   * 단일 모드에서 "전체"에 해당하는 값. `selected`가 이 값이면 트리거는
   * 필터 이름만 보여주고 활성 표시를 하지 않는다(라디오는 켜진 채로 남는다).
   */
  clearValue?: string;
}

/** 옵션이 이보다 많으면 패널 맨 위에 검색 입력을 둔다(지라 필터: 담당자·라벨처럼 긴 목록) */
const SEARCH_THRESHOLD = 8;

/**
 * 지라 이슈 검색의 필터 드롭다운 모방 — 체크박스 멀티 선택, 열린 채로 여러 개 토글.
 * 트리거는 선택 요약("상태: 진행 중 외 1")을 보여준다.
 * 패널은 DS `Popover`(react 0.14.0) — 바깥 클릭·Esc·포커스 이동/복귀·가장자리 뒤집기를 맡는다. 포털이라 패널은
 * 필터 줄 밖(document.body)에 그려진다. 목록 안 ↑↓는 `onPopoverListKeyDown`.
 * 단일 선택(라디오)이 있어 DS `MultiSelect`(체크 목록 전용)로는 바꾸지 않았다.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  multiple = true,
  clearValue,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // "전체"는 선택으로 세지 않는다 — 트리거가 필터 이름만 보이도록
  const active = clearValue === undefined ? selected : selected.filter((v) => v !== clearValue);
  const first = options.find((o) => o.value === active[0]);
  const summary =
    active.length === 0 || !first
      ? null
      : active.length === 1
        ? first.label
        : `${first.label} 외 ${active.length - 1}`;

  const searchable = options.length > SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const visibleOptions = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  const choose = (value: string) => {
    onToggle(value);
    if (!multiple) setOpen(false); // 포커스는 Popover가 트리거로 돌려준다
  };

  const trigger = (
      <button
        type="button"
        className={active.length > 0 ? "filter-dropdown-trigger is-active" : "filter-dropdown-trigger"}
      >
        {summary ? (
          <>
            {/* 콜론 뒤 공백은 접근 이름의 일부다 — 지우면 "담당자:김찬호"가 되어
                이름으로 트리거를 찾는 검색 화면 테스트가 깨진다. 눈에 보이는 간격은
                flex gap이 주지만, 낭독되는 이름은 이 텍스트 노드가 갖는다. */}
            {`${label}: `}
            {/* 고른 값이 하나일 때만 글리프를 세운다 — "외 N"에는 대표 아이콘이 없다 */}
            {active.length === 1 ? first?.icon : null}
            <span className="filter-dropdown-summary">{summary}</span>
          </>
        ) : (
          label
        )}
        <ChevronDown className="filter-dropdown-caret" size={16} aria-hidden />
      </button>
  );

  return (
    <div className="filter-dropdown">
      <Popover
        trigger={trigger}
        open={open}
        onOpenChange={(next) => {
          if (next) setQuery("");
          setOpen(next);
        }}
        label={label}
        className="filter-dropdown-panel"
        matchTriggerWidth
        padding="none"
      >
        <div
          className="filter-dropdown-list"
          role={multiple ? "group" : "radiogroup"}
          aria-label={`${label} 필터`}
          onKeyDown={onPopoverListKeyDown}
        >
          {searchable ? (
            <input
              type="search"
              className="filter-dropdown-search"
              placeholder={`${label} 찾기`}
              aria-label={`${label} 찾기`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}
          {visibleOptions.length === 0 ? (
            <p className="filter-dropdown-empty">일치하는 항목이 없습니다</p>
          ) : null}
          {visibleOptions.map((option) =>
            multiple ? (
              <Checkbox
                key={option.value}
                className="filter-dropdown-check"
                // 노드 라벨(react 0.11.0) — 아이콘은 장식, 접근 이름은 라벨 텍스트가 갖는다
                label={
                  option.icon ? (
                    <ValueWithIcon icon={option.icon}>{option.label}</ValueWithIcon>
                  ) : (
                    option.label
                  )
                }
                checked={selected.includes(option.value)}
                onCheckedChange={() => choose(option.value)}
              />
            ) : (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected.includes(option.value)}
                className={
                  selected.includes(option.value)
                    ? "filter-dropdown-option is-selected"
                    : "filter-dropdown-option"
                }
                onClick={() => choose(option.value)}
              >
                {option.icon ? (
                  <ValueWithIcon icon={option.icon}>{option.label}</ValueWithIcon>
                ) : (
                  <span>{option.label}</span>
                )}
                {/* 선택 표시는 색만이 아니라 체크 모양으로도(지라 드롭다운) */}
                {selected.includes(option.value) ? (
                  <Check className="filter-dropdown-check-mark" size={16} aria-hidden />
                ) : null}
              </button>
            ),
          )}
        </div>
      </Popover>
    </div>
  );
}
