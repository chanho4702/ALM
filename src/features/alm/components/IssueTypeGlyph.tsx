import type { IssueType } from "../store/types";
import { TYPE_GLYPHS, TYPE_LABELS } from "./labels";

/** 지라의 이슈 타입 아이콘 대응 — 색 사각형 + 한 글자 글리프 */
export function IssueTypeGlyph({ type }: { type: IssueType }) {
  return (
    <span
      className={`issue-type-glyph type-${type}`}
      role="img"
      aria-label={TYPE_LABELS[type]}
      title={TYPE_LABELS[type]}
    >
      {TYPE_GLYPHS[type]}
    </span>
  );
}
