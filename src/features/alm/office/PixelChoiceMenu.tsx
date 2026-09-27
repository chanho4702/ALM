import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "@chanho/react";
import { Lock } from "lucide-react";
import { PixelSprite } from "./PixelSprite";
import { spritePaths } from "./pixel";

export interface ChoiceItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** 흐린 항목 — 포커스는 받고, 골라도 흐름 대신 이유 대사(§5.1·§5.7) */
  disabledReason?: string | null;
}

export interface PixelChoiceMenuHandle {
  focus: () => void;
}

/**
 * 선택지 메뉴(§5.1) — 대화창과 같은 픽셀 상자, `role="menu"`. ↑↓(끝에서 순환)·Home/End·Enter/Space·숫자 1~6 바로 선택,
 * 마우스 hover가 현재 항목을 옮긴다. 흐린 항목은 aria-disabled + 자물쇠 + DS Tooltip(이유), 이유는 aria-describedby로도.
 */
export const PixelChoiceMenu = forwardRef<
  PixelChoiceMenuHandle,
  { label: string; items: ChoiceItem[]; initialId?: string | null; onChoose: (item: ChoiceItem) => void }
>(function PixelChoiceMenu({ label, items, initialId, onChoose }, ref) {
  const start = Math.max(0, items.findIndex((i) => i.id === initialId));
  const [active, setActive] = useState(start);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const reasonBase = useId();

  useImperativeHandle(ref, () => ({ focus: () => refs.current[active]?.focus() }), [active]);

  useEffect(() => {
    setActive(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join("|")]);

  const move = (next: number) => {
    const n = (next + items.length) % items.length;
    setActive(n);
    refs.current[n]?.focus();
  };

  return (
    <div
      className="office-choice-menu office-pixel-box"
      role="menu"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(active + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(active - 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          move(0);
        } else if (e.key === "End") {
          e.preventDefault();
          move(items.length - 1);
        } else if (/^[1-6]$/.test(e.key) && Number(e.key) <= items.length) {
          e.preventDefault();
          onChoose(items[Number(e.key) - 1]);
        }
      }}
    >
      {items.map((item, i) => {
        const reasonId = item.disabledReason ? `${reasonBase}-${i}` : undefined;
        const button = (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            className={i === active ? "office-choice is-active" : "office-choice"}
            tabIndex={i === active ? 0 : -1}
            aria-disabled={item.disabledReason ? true : undefined}
            aria-describedby={reasonId}
            data-choice={item.id}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => onChoose(item)}
          >
            <span className="office-choice-cursor" aria-hidden="true">
              {i === active ? (
                <svg viewBox="0 0 5 7" shapeRendering="crispEdges" focusable="false">
                  <PixelSprite paths={spritePaths("CHOICE_CURSOR", "mb")} />
                </svg>
              ) : null}
            </span>
            {item.icon ? <span className="office-choice-icon" aria-hidden="true">{item.icon}</span> : null}
            <span className="office-choice-label">{item.label}</span>
            {item.disabledReason ? (
              <>
                <Lock size={12} aria-hidden className="office-choice-lock" />
                <span id={reasonId} className="ai-office-sr">
                  {item.disabledReason}
                </span>
              </>
            ) : null}
          </button>
        );
        return item.disabledReason ? (
          <Tooltip key={item.id} content={item.disabledReason} side="left">
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
});
