import { Lozenge } from "@chanho/react";
import type { PriorityDef } from "../store/types";
import { priorityAppearance, priorityName } from "./labels";
import { TYPE_ICONS } from "./typeIcons";

export interface PriorityGlyphProps {
  /** 우선순위 레지스트리(`usePriorities()`) — 없으면 Lozenge로 폴백한다 */
  defs: PriorityDef[] | undefined;
  /** 우선순위 id (`Issue.priority`) */
  priority: string;
  /** 14(밀집한 카드) 또는 16(표·행). 기본 16 */
  size?: 14 | 16;
  /**
   * `auto`(기본) — 아이콘을 못 그리면 이름이 보이는 Lozenge로 폴백한다(이름을 잃지 않는다).
   * `icon` — 호출부가 이름을 따로 그리는 자리. 못 그리면 아무것도 렌더하지 않는다(이름 중복 방지).
   */
  variant?: "auto" | "icon";
}

/**
 * 우선순위 아이콘 — 지라처럼 색 있는 화살표. 모양·색 모두 레지스트리(`PriorityDef`)에서 오고
 * 회색 단색으로 떨어지지 않는다. 이름은 `aria-label`/`title`이 갖는다.
 *
 * 레지스트리가 아직 로드되지 않았거나 커스텀 아이콘 키가 맵에 없으면 이름이 보이는 Lozenge로
 * 폴백한다 — 아이콘만 남기고 이름을 잃는 상태를 만들지 않는다.
 */
export function PriorityGlyph({ defs, priority, size = 16, variant = "auto" }: PriorityGlyphProps) {
  const def = defs?.find((d) => d.id === priority);
  const Icon = def ? TYPE_ICONS[def.icon] : undefined;
  const name = priorityName(defs, priority);
  if (!Icon) {
    if (variant === "icon") return null;
    return <Lozenge appearance={priorityAppearance(defs, priority)}>{name}</Lozenge>;
  }
  // 이름을 호출부가 그리는 자리에서는 낭독을 중복시키지 않는다 — 아이콘은 시각 보조만 한다
  const labelProps =
    variant === "icon"
      ? { "aria-hidden": true as const, title: name }
      : { role: "img", "aria-label": `우선순위: ${name}`, title: `우선순위: ${name}` };
  return (
    <span
      className={`issue-priority-mark is-${def!.color}`}
      data-testid={`priority-glyph-${priority}`}
      {...labelProps}
    >
      <Icon size={size} strokeWidth={2.5} aria-hidden />
    </span>
  );
}
