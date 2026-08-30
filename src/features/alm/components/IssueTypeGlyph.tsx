import type { IssueTypeDef } from "../store/types";
import { typeAppearance, typeIcon, typeName } from "./labels";
import { DEFAULT_TYPE_ICON, TYPE_ICONS } from "./typeIcons";
import { useIssueTypes } from "./useIssueTypes";

/**
 * 지라의 이슈 타입 아이콘 대응 — 레지스트리의 아이콘·색을 색 사각형 위에 그린다.
 * `types`를 주면 그것을 쓰고, 없으면 레지스트리를 읽는다(로드 전엔 기본 5종 폴백).
 */
export function IssueTypeGlyph({ type, types }: { type: string; types?: IssueTypeDef[] }) {
  const loaded = useIssueTypes();
  const list = types ?? loaded;
  const name = typeName(list, type);
  const Icon = TYPE_ICONS[typeIcon(list, type)] ?? TYPE_ICONS[DEFAULT_TYPE_ICON];
  return (
    <span
      className={`issue-type-glyph is-${typeAppearance(list, type)}`}
      role="img"
      aria-label={name}
      title={name}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden />
    </span>
  );
}
