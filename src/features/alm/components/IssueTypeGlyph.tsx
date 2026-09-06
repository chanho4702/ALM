import type { IssueTypeDef } from "../store/types";
import { typeAppearance, typeIcon, typeName } from "./labels";
import { DEFAULT_TYPE_ICON, TYPE_ICONS } from "./typeIcons";
import { useIssueTypes } from "./useIssueTypes";

/**
 * 지라의 이슈 타입 아이콘 대응 — 레지스트리의 아이콘·색을 색 사각형 위에 그린다.
 * `types`를 주면 그것을 쓰고, 없으면 레지스트리를 읽는다(로드 전엔 기본 5종 폴백).
 */
export interface IssueTypeGlyphProps {
  type: string;
  types?: IssueTypeDef[];
  /**
   * `auto`(기본) — 아이콘이 타입 이름을 갖는다(`aria-label`). 이름이 옆에 없는 자리용.
   * `icon` — 호출부가 이름을 바로 옆에 그리는 자리. 같은 말이 두 번 읽히지 않게 숨긴다.
   */
  variant?: "auto" | "icon";
}

export function IssueTypeGlyph({ type, types, variant = "auto" }: IssueTypeGlyphProps) {
  const loaded = useIssueTypes();
  const list = types ?? loaded;
  const name = typeName(list, type);
  const Icon = TYPE_ICONS[typeIcon(list, type)] ?? TYPE_ICONS[DEFAULT_TYPE_ICON];
  const labelProps =
    variant === "icon"
      ? { "aria-hidden": true as const, title: name }
      : { role: "img", "aria-label": name, title: name };
  return (
    <span
      className={`issue-type-glyph is-${typeAppearance(list, type)}`}
      data-testid={`type-glyph-${type}`}
      {...labelProps}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden />
    </span>
  );
}
