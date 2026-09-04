import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@chanho/react";

export interface FilterOption {
  value: string;
  label: string;
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

/**
 * 지라 이슈 검색의 필터 드롭다운 모방 — 체크박스 멀티 선택, 열린 채로 여러 개 토글.
 * 트리거는 선택 요약("상태: 진행 중 외 1")을 보여준다.
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
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·Escape로 닫기 (Radix 메뉴는 항목 선택마다 닫혀 멀티 선택에 못 쓴다)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // "전체"는 선택으로 세지 않는다 — 트리거가 필터 이름만 보이도록
  const active = clearValue === undefined ? selected : selected.filter((v) => v !== clearValue);
  const first = options.find((o) => o.value === active[0]);
  const summary =
    active.length === 0 || !first
      ? null
      : active.length === 1
        ? first.label
        : `${first.label} 외 ${active.length - 1}`;

  const choose = (value: string) => {
    onToggle(value);
    if (!multiple) setOpen(false);
  };

  return (
    <div className="filter-dropdown" ref={rootRef}>
      <button
        type="button"
        className={active.length > 0 ? "filter-dropdown-trigger is-active" : "filter-dropdown-trigger"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {summary ? `${label}: ${summary}` : label}
        <span className="filter-dropdown-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="filter-dropdown-panel"
          role={multiple ? "group" : "radiogroup"}
          aria-label={`${label} 필터`}
        >
          {options.map((option) =>
            multiple ? (
              <Checkbox
                key={option.value}
                label={option.label}
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
                {option.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
