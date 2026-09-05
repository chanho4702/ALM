import { useState } from "react";
import { Switch, Tabs } from "@chanho/react";
import type { IssueFieldConfig, IssueTypeDef } from "../store/types";
import {
  FIELD_IDS,
  FIELD_LABELS,
  NEVER_REQUIRED_REASON,
  REQUIRED_NOT_ENFORCED_AT_CREATE,
  isFieldOverride,
  normalizeFields,
  resolveFields,
} from "./fieldConfig";

/** 기본 구성 탭의 값 — 이슈 타입 id와 섞이지 않게 밑줄 두 개를 쓴다 */
const BASE_TAB = "__base__";

export interface FieldConfigEditorProps {
  /** 기본 구성(모든 타입) — 빠진 필드는 기본값(표시·비필수)으로 채워 13행을 항상 그린다 */
  value: IssueFieldConfig[];
  onChange: (next: IssueFieldConfig[]) => void;
  /** 이슈 타입별 덮어쓰기 초안 — 키가 없는 타입은 기본 구성을 따른다 */
  byType?: Record<string, IssueFieldConfig[]>;
  onByTypeChange?: (next: Record<string, IssueFieldConfig[]>) => void;
  /** 탭으로 그릴 이슈 타입(표시 순서대로) — 비면 기본 구성 표만 그린다 */
  types?: IssueTypeDef[];
  /** 스킴을 쓰는 프로젝트처럼 편집할 수 없을 때 */
  readOnly?: boolean;
  /** 한 화면에 여러 편집기가 있을 때 접근성 이름을 구분한다(스킴 이름 등) */
  labelPrefix?: string;
}

interface FieldTableProps {
  value: IssueFieldConfig[];
  onChange: (next: IssueFieldConfig[]) => void;
  readOnly?: boolean;
  /** 접근성 이름 앞에 붙는 말 — 스킴 이름 + (타입 탭이면) 타입 이름 */
  prefix: string;
}

/** 필드 13행 표 — 기본 구성 탭과 타입 탭이 같은 표를 쓴다 */
function FieldTable({ value, onChange, readOnly, prefix }: FieldTableProps) {
  const byId = resolveFields({ fields: value });
  const rows = FIELD_IDS.map((id) => byId[id]);
  const name = (field: string, suffix: string) =>
    prefix ? `${prefix} ${field} ${suffix}` : `${field} ${suffix}`;

  const patch = (id: string, next: Partial<IssueFieldConfig>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...next } : { ...row })));
  };

  return (
    <table className="field-config-table" aria-label={prefix ? `${prefix} 필드 구성` : "필드 구성"}>
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

/**
 * 이슈 필드 구성 편집기 — 전역 스킴 카드와 프로젝트 커스텀이 같은 컴포넌트를 쓴다.
 * `types`를 주면 지라의 필드 구성 스킴처럼 **기본 구성 + 이슈 타입별 덮어쓰기** 탭이 된다.
 * 초안만 다루는 controlled 컴포넌트로, 저장은 부모가 한다(StatusEditor와 같은 계약).
 */
export function FieldConfigEditor({
  value,
  onChange,
  byType,
  onByTypeChange,
  types,
  readOnly,
  labelPrefix,
}: FieldConfigEditorProps) {
  const [tab, setTab] = useState(BASE_TAB);
  const tabTypes = types ?? [];
  const overrides = byType ?? {};
  const prefixFor = (typeName?: string) =>
    [labelPrefix, typeName].filter(Boolean).join(" ");

  if (tabTypes.length === 0) {
    return <FieldTable value={value} onChange={onChange} readOnly={readOnly} prefix={prefixFor()} />;
  }

  /** 타입 탭 — 덮어쓰기가 없으면 기본 구성을 읽기 전용으로 보여 준다 */
  const typeTab = (type: IssueTypeDef) => {
    // 빈 목록은 덮어쓰기가 아니다 — 서버도 빈 목록 키를 "기본 따름"으로 버린다
    const override = isFieldOverride(overrides[type.id]) ? overrides[type.id] : undefined;
    const following = !override;
    const prefix = prefixFor(type.name);
    const setFollow = (follow: boolean) => {
      if (!onByTypeChange) return;
      const next = { ...overrides };
      // 따름 → 덮어쓰기: 지금 기본 구성을 복사해 편집을 시작한다(지라와 같은 흐름)
      if (follow) delete next[type.id];
      else next[type.id] = normalizeFields({ fields: value });
      onByTypeChange(next);
    };
    return (
      <div className="field-config-type">
        {readOnly ? (
          <p className="field-config-follow-state">
            {following ? "기본 구성 따름" : "이 타입만 덮어씀"}
          </p>
        ) : (
          // 보이는 글자가 곧 라벨이라 글자를 눌러도 토글된다. 접근성 이름에만 스킴·타입을 붙여
          // 카드가 여럿일 때 구분한다(보이는 글자가 접근 이름에 그대로 들어 있다 — WCAG 2.5.3)
          <div className="field-config-follow">
            <Switch
              label="기본 구성 따름"
              aria-label={`${prefix} 기본 구성 따름`}
              checked={following}
              onCheckedChange={setFollow}
            />
          </div>
        )}
        <p className="admin-scheme-note">
          {following
            ? "기본 구성을 그대로 씁니다. 이 타입만 다르게 하려면 위 스위치를 끄세요."
            : "이 타입으로 이슈를 만들 때는 아래 구성이 기본 구성을 대신합니다."}
        </p>
        <FieldTable
          value={override ?? value}
          onChange={(next) => onByTypeChange?.({ ...overrides, [type.id]: next })}
          readOnly={readOnly || following}
          prefix={prefix}
        />
      </div>
    );
  };

  return (
    <div className="field-config-editor">
      <Tabs
        label={prefixFor() ? `${prefixFor()} 필드 구성 탭` : "필드 구성 탭"}
        className="field-config-tabs"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: BASE_TAB,
            label: "기본",
            content: (
              <FieldTable
                value={value}
                onChange={onChange}
                readOnly={readOnly}
                prefix={prefixFor()}
              />
            ),
          },
          ...tabTypes.map((type) => ({
            value: type.id,
            // 덮어쓴 타입은 말로 구분한다 — 기호(●)는 접근성 이름에 섞이고 읽히는 방식도 제각각이다
            label: isFieldOverride(overrides[type.id]) ? `${type.name} (덮어씀)` : type.name,
            content: typeTab(type),
          })),
        ]}
      />
      <p className="field-config-legend">
        "(덮어씀)" 표시가 붙은 이슈 타입은 기본 구성 대신 자기 구성을 씁니다.
      </p>
    </div>
  );
}
