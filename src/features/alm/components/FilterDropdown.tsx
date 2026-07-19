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
}

/**
 * 지라 이슈 검색의 필터 드롭다운 모방 — 체크박스 멀티 선택, 열린 채로 여러 개 토글.
 * 트리거는 선택 요약("상태: 진행 중 외 1")을 보여준다.
 */
export function FilterDropdown({ label, options, selected, onToggle }: FilterDropdownProps) {
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

  const first = options.find((o) => o.value === selected[0]);
  const summary =
    selected.length === 0 || !first
      ? null
      : selected.length === 1
        ? first.label
        : `${first.label} 외 ${selected.length - 1}`;

  return (
    <div className="filter-dropdown" ref={rootRef}>
      <button
        type="button"
        className={
          selected.length > 0 ? "filter-dropdown-trigger is-active" : "filter-dropdown-trigger"
        }
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
        <div className="filter-dropdown-panel" role="group" aria-label={`${label} 필터`}>
          {options.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              checked={selected.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
