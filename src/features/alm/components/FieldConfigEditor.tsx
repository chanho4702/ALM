import { Switch } from "@chanho/react";
import type { IssueFieldConfig } from "../store/types";
import {
  FIELD_IDS,
  FIELD_LABELS,
  NEVER_REQUIRED_REASON,
  REQUIRED_NOT_ENFORCED_AT_CREATE,
  resolveFields,
} from "./fieldConfig";

export interface FieldConfigEditorProps {
  /** 현재 구성 — 빠진 필드는 기본값(표시·비필수)으로 채워 13행을 항상 그린다 */
  value: IssueFieldConfig[];
  onChange: (next: IssueFieldConfig[]) => void;
  /** 스킴을 쓰는 프로젝트처럼 편집할 수 없을 때 */
  readOnly?: boolean;
  /** 한 화면에 여러 편집기가 있을 때 접근성 이름을 구분한다(스킴 이름 등) */
  labelPrefix?: string;
}

/**
 * 이슈 필드 구성 표 — 전역 스킴 카드와 프로젝트 커스텀이 같은 컴포넌트를 쓴다.
 * 초안만 다루는 controlled 컴포넌트로, 저장은 부모가 한다(StatusEditor와 같은 계약).
 */
export function FieldConfigEditor({ value, onChange, readOnly, labelPrefix }: FieldConfigEditorProps) {
  const byId = resolveFields({ fields: value });
  const rows = FIELD_IDS.map((id) => byId[id]);
  const name = (field: string, suffix: string) =>
    labelPrefix ? `${labelPrefix} ${field} ${suffix}` : `${field} ${suffix}`;

  const patch = (id: string, next: Partial<IssueFieldConfig>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...next } : { ...row })));
  };

  return (
    <table className="field-config-table" aria-label={labelPrefix ? `${labelPrefix} 필드 구성` : "필드 구성"}>
      <thead>
        <tr>
          <th scope="col">필드</th>
          <th scope="col">표시</th>
          <th scope="col">필수</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const label = FIELD_LABELS[row.id];
          const neverRequiredReason = NEVER_REQUIRED_REASON[row.id];
          const neverRequired = Boolean(neverRequiredReason);
          // 만든 뒤에 붙는 값은 필수로 켜도 만들기를 막지 않는다 — 관리자가 오해하지 않게 적는다
          const hint = neverRequiredReason
            ?? (REQUIRED_NOT_ENFORCED_AT_CREATE.includes(row.id)
              ? "만들기에서는 막지 않음 (만든 뒤 추가)"
              : null);
          return (
            <tr key={row.id}>
              <th scope="row">
                {label}
                {hint ? <span className="field-config-hint">{hint}</span> : null}
              </th>
              {/* 읽기 전용은 글자로 말한다 — 비활성 Switch는 켜져 있어도 꺼진 것처럼 보인다(DS 함정) */}
              <td>
                {readOnly ? (
                  <span className="field-config-state">{row.visible ? "표시" : "숨김"}</span>
                ) : (
                  <Switch
                    className="visually-hidden-label"
                    label={name(label, "표시")}
                    checked={row.visible}
                    onCheckedChange={(next) =>
                      // 숨긴 필드는 필수일 수 없다 — 표시를 끄면 필수도 함께 내린다
                      patch(row.id, { visible: next, required: next ? row.required : false })
                    }
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span className="field-config-state">{row.required ? "필수" : "선택"}</span>
                ) : (
                  <Switch
                    className="visually-hidden-label"
                    label={name(label, "필수")}
                    checked={row.required}
                    disabled={neverRequired || !row.visible}
                    onCheckedChange={(next) => patch(row.id, { required: next })}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
