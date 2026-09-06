import { CheckCircle2, CircleSlash, Copy, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IssueResolution } from "../store/types";
import { RESOLUTION_LABELS } from "./labels";

/**
 * 해결(Resolution) 아이콘 — 상태·타입·우선순위와 달리 레지스트리가 없는 고정 4종이라
 * 여기서 직접 lucide 아이콘과 색을 정한다. 색 클래스는 `.status-glyph.is-*`를 재사용한다
 * (같은 "카테고리 색을 선 색으로만" 언어 — app.css에 새 규칙을 만들지 않는다).
 *
 * **색만으로 구분하지 않는다** — 모양이 넷 다 다르고, 호출부는 항상 이름을 옆에 그린다.
 * 이름이 없는 자리를 위해 `aria-label`/`title`에 "해결: 중복"을 넣는다.
 */
const RESOLUTION_ICONS: Record<IssueResolution, LucideIcon> = {
  done: CheckCircle2,
  wont_do: CircleSlash,
  duplicate: Copy,
  cannot_reproduce: HelpCircle,
};

/** 해결별 색 — 완료됨만 초록, 하지 않음은 회색, 중복은 파랑, 재현 불가는 주황 */
const RESOLUTION_TONE: Record<IssueResolution, string> = {
  done: "success",
  wont_do: "neutral",
  duplicate: "info",
  cannot_reproduce: "warning",
};

export interface ResolutionGlyphProps {
  resolution: IssueResolution;
  /** 14(밀집한 목록·메타) 또는 16(상세). 기본 14 */
  size?: 14 | 16;
  /**
   * `auto`(기본) — 아이콘이 이름을 갖는다(`aria-label`).
   * `icon` — 호출부가 이름을 따로 그리는 자리. 낭독 중복을 막으려고 `aria-hidden`으로 둔다.
   */
  variant?: "auto" | "icon";
}

export function ResolutionGlyph({ resolution, size = 14, variant = "auto" }: ResolutionGlyphProps) {
  const Icon = RESOLUTION_ICONS[resolution];
  if (!Icon) return null;
  const name = RESOLUTION_LABELS[resolution] ?? resolution;
  const labelProps =
    variant === "icon"
      ? { "aria-hidden": true as const, title: name }
      : { role: "img", "aria-label": `해결: ${name}`, title: `해결: ${name}` };
  return (
    <span
      className={`status-glyph is-${RESOLUTION_TONE[resolution]}`}
      data-testid={`resolution-glyph-${resolution}`}
      {...labelProps}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
