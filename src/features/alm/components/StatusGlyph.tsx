import type { WorkflowStatus } from "../store/types";
import { DEFAULT_STATUS_ICON, statusAppearance, statusIcon, statusName } from "./labels";
import { TYPE_ICONS } from "./typeIcons";

export interface StatusGlyphProps {
  /** 워크플로 상태 id (`Issue.status`) */
  status: string;
  /**
   * 해석된 상태 목록(`resolveSettings`/`statusMetaByProject` 결과). 없거나 못 찾으면
   * 기본 3상태로 폴백한다 — 화면이 로드 전에도 모양이 흔들리지 않는다.
   */
  statuses?: WorkflowStatus[];
  /** 14(표·행) 또는 16(머리글·상세). 기본 14 */
  size?: 14 | 16;
}

/**
 * 상태 아이콘 — 지라의 상태 카테고리 아이콘 대응. 모양은 레지스트리(`StatusDef.icon`),
 * 색은 카테고리 색(`statusAppearance`)에서 온다.
 *
 * **색만으로 구분하지 않는다** — 아이콘 모양이 다르고, 옆에 항상 상태 이름(Lozenge·머리글)이 있으며,
 * 이름이 없는 자리를 위해 `aria-label`/`title`에 "상태: 진행 중"을 넣는다.
 */
export function StatusGlyph({ status, statuses, size = 14 }: StatusGlyphProps) {
  const name = statusName(statuses, status);
  const Icon = TYPE_ICONS[statusIcon(statuses, status)] ?? TYPE_ICONS[DEFAULT_STATUS_ICON];
  return (
    <span
      className={`status-glyph is-${statusAppearance(statuses, status)}`}
      role="img"
      aria-label={`상태: ${name}`}
      title={`상태: ${name}`}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
