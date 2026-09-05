import { FIELD_ICONS, withRequiredMark } from "./fieldConfig";
import type { FieldIconId } from "./fieldConfig";

export interface FieldLabelProps {
  /** 어떤 필드인가 — 아이콘을 고르는 키 */
  field: FieldIconId;
  /** 필수 표시 — 라벨 뒤에 `*`를 붙인다(DS 라벨 문자열과 같은 표기) */
  required?: boolean;
  /**
   * 접근성 트리에서 감출 것인가. 기본은 `true` — 이 라벨은 언제나 접근 이름을 따로 가진
   * 컨트롤(DS `label` 또는 그룹의 `aria-label`) 옆에 서므로, 그대로 두면 같은 말이 두 번 읽힌다.
   * `legend`처럼 이 라벨 자체가 이름을 만드는 자리에서만 `false`로 준다.
   */
  ariaHidden?: boolean;
  className?: string;
  /** 라벨 텍스트 — 한 텍스트 노드로 남긴다(`getByText("연결 이슈 *")` 같은 질의가 그대로 산다) */
  children: string;
}

/**
 * 아이콘 + 텍스트 필드 라벨 — 지라 이슈 상세의 속성 아이콘을 따른다.
 *
 * DS `Select`/`TextField`의 `label`은 문자열만 받으므로 아이콘을 넣을 수 없다. 그래서 컨트롤에는
 * `.visually-hidden-label`을 걸어 **접근 이름만** 남기고, 눈에 보이는 라벨은 이 컴포넌트가 그린다.
 * 접근 이름과 테스트 셀렉터(`getByRole("combobox", { name: "담당자" })`)는 그대로 유지된다.
 */
export function FieldLabel({
  field,
  required = false,
  ariaHidden = true,
  className,
  children,
}: FieldLabelProps) {
  const Icon = FIELD_ICONS[field];
  return (
    <span
      className={className ? `field-label ${className}` : "field-label"}
      aria-hidden={ariaHidden || undefined}
    >
      <Icon className="field-label-icon" size={16} aria-hidden="true" />
      <span className="field-label-text">{withRequiredMark(children, required)}</span>
    </span>
  );
}
