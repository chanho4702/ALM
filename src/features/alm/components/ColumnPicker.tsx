import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import { Button, Checkbox } from "@chanho/react";

export interface ColumnPickerOption {
  key: string;
  label: string;
  /** 숨길 수 없는 열(키·제목) — 체크된 채 잠긴다 */
  locked?: boolean;
}

export interface ColumnPickerProps {
  columns: ColumnPickerOption[];
  hidden: string[];
  onHiddenChange: (hidden: string[]) => void;
  /** "기본값으로" — 처음 열 구성으로 */
  onReset: () => void;
}

/**
 * 지라 목록 보기의 "열" 선택 — 체크박스로 열을 켜고 끈다. 순서·너비는 표 머리글(드래그·Alt+화살표)이 맡는다.
 * 패널은 FilterDropdown과 같은 팝오버다(DS에 팝오버가 없고, Radix 메뉴는 토글마다 닫혀 여러 개를 못 고른다).
 */
export function ColumnPicker({ columns, hidden, onHiddenChange, onReset }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const hiddenCount = columns.filter((c) => !c.locked && hidden.includes(c.key)).length;

  const toggle = (key: string, visible: boolean) =>
    onHiddenChange(visible ? hidden.filter((k) => k !== key) : [...hidden.filter((k) => k !== key), key]);

  return (
    <div className="filter-dropdown column-picker" ref={rootRef}>
      <button
        type="button"
        className={hiddenCount > 0 ? "filter-dropdown-trigger is-active" : "filter-dropdown-trigger"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Columns3 size={14} aria-hidden />
        {hiddenCount > 0 ? `열 (${hiddenCount}개 숨김)` : "열"}
        <span className="filter-dropdown-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="filter-dropdown-panel column-picker-panel" role="group" aria-label="표시할 열">
          {columns.map((column) => (
            <Checkbox
              key={column.key}
              label={column.locked ? `${column.label} (항상 표시)` : column.label}
              checked={column.locked ? true : !hidden.includes(column.key)}
              disabled={column.locked}
              onCheckedChange={(checked) => toggle(column.key, checked === true)}
            />
          ))}
          <div className="column-picker-footer">
            <Button size="small" variant="ghost" onClick={onReset}>
              기본값으로
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
