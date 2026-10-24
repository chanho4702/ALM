import { useState } from "react";
import { Badge, Banner, Checkbox, Radio, RadioGroup, Select, Switch } from "@chanho/react";
import type { IssueTypeDef, TypeWorkflow, WorkflowLayout, WorkflowStatus, WorkflowTransition } from "../store/types";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { KIND_LABELS, STATUS_KINDS } from "./labels";
import "./workflow-rules.css";

type TransitionMode = "inherit" | "all" | "custom";

export interface TypeWorkflowEditorProps {
  /** 프로젝트(스킴) 워크플로 상태(order 순) — 하위 집합의 원천 */
  statuses: WorkflowStatus[];
  /** 프로젝트 전환 — "프로젝트 전환 따름"일 때 보여 준다 */
  transitions: WorkflowTransition[];
  /** 활성 이슈 타입(레지스트리 순) */
  types: IssueTypeDef[];
  value: Record<string, TypeWorkflow>;
  onChange?: (next: Record<string, TypeWorkflow>) => void;
  readOnly?: boolean;
}

/**
 * 이슈 타입별 워크플로(C5) — 지라 워크플로 스킴의 "이슈 타입 → 워크플로" 배정. 상태 정의는 프로젝트 목록 하나뿐이고,
 * 타입은 그 **부분집합**과 그 위의 전환만 고른다(보드 열·완료 판정·리포트는 프로젝트 목록을 그대로 본다).
 * 키가 없는 타입은 프로젝트 기본 워크플로를 따른다(폴백) — 스위치 하나로 덮어쓰기를 켜고 끈다.
 */
export function TypeWorkflowEditor({ statuses, transitions, types, value, onChange, readOnly = false }: TypeWorkflowEditorProps) {
  const [typeId, setTypeId] = useState<string>(types[0]?.id ?? "task");
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  const override = value[typeId];
  const typeLabel = types.find((t) => t.id === typeId)?.name ?? typeId;
  const set = (next: TypeWorkflow | null) => {
    if (!onChange) return;
    const copy = { ...value };
    if (next === null) delete copy[typeId];
    else copy[typeId] = next;
    onChange(copy);
  };

  const subset = override ? (override.statuses.length > 0 ? override.statuses : sorted.map((s) => s.id)) : sorted.map((s) => s.id);
  const subsetStatuses = sorted.filter((s) => subset.includes(s.id));
  const missingKinds = STATUS_KINDS.filter((kind) => !subsetStatuses.some((s) => s.kind === kind));
  const mode: TransitionMode = !override || override.transitions === null ? "inherit" : override.transitions.length === 0 ? "all" : "custom";

  /** 프로젝트 전환 중 이 상태들 사이의 것 — "프로젝트 전환 따름"의 실제 결과(서버 workflowFor와 같은 규칙) */
  const inherited = transitions.flatMap((t) => {
    if (!subset.includes(t.to)) return [];
    if (t.from.length === 0) return [t];
    const from = t.from.filter((id) => subset.includes(id));
    return from.length > 0 ? [{ ...t, from }] : [];
  });

  const overridden = types.filter((t) => value[t.id]);

  return (
    <section className="type-workflow" aria-label="이슈 타입별 워크플로">
      <div className="type-workflow-head">
        <h3 className="type-workflow-title">이슈 타입별 워크플로</h3>
        <Select
          label="이슈 타입"
          value={typeId}
          options={types.map((t) => ({
            value: t.id,
            label: value[t.id] ? `${t.name} (따로 정함)` : t.name,
            icon: <IssueTypeGlyph type={t.id} types={types} variant="icon" />,
          }))}
          onValueChange={setTypeId}
        />
        {readOnly ? (
          <span className="type-workflow-note">{override ? "따로 정한 워크플로" : "기본 워크플로 따름"}</span>
        ) : (
          <Switch
            label="기본 워크플로 따름"
            checked={!override}
            onCheckedChange={(follow) => set(follow ? null : { statuses: sorted.map((s) => s.id), transitions: null })}
          />
        )}
      </div>
      {overridden.length > 0 ? (
        <ul className="type-workflow-overrides" aria-label="따로 정한 타입">
          {overridden.map((t) => (
            <li key={t.id}>
              <ValueWithIcon icon={<IssueTypeGlyph type={t.id} types={types} variant="icon" />}>
                <Badge appearance="brand">{t.name}</Badge>
              </ValueWithIcon>
            </li>
          ))}
        </ul>
      ) : null}
      {!override ? (
        <p className="type-workflow-note">
          {`${typeLabel}은(는) 프로젝트 기본 워크플로(상태 ${sorted.length}개·전이 ${transitions.length || "제한 없음"})를 따릅니다. 따로 정하려면 스위치를 끄세요.`}
        </p>
      ) : (
        <>
          <fieldset className="transition-rules-group">
            <legend>{`${typeLabel}이(가) 쓰는 상태 — 의미(할 일/진행 중/완료)마다 하나 이상`}</legend>
            <div className="type-workflow-statuses">
              {sorted.map((s) => (
                <Checkbox
                  key={s.id}
                  label={
                    <ValueWithIcon icon={<StatusGlyph status={s.id} statuses={sorted} variant="icon" />}>{s.name}</ValueWithIcon>
                  }
                  checked={subset.includes(s.id)}
                  disabled={readOnly}
                  onCheckedChange={() =>
                    set({
                      ...override,
                      statuses: subset.includes(s.id) ? subset.filter((id) => id !== s.id) : sorted.map((x) => x.id).filter((id) => id === s.id || subset.includes(id)),
                    })
                  }
                />
              ))}
            </div>
            {missingKinds.length > 0 ? (
              <Banner variant="warning">
                {`${missingKinds.map((k) => KIND_LABELS[k]).join(", ")} 의미의 상태가 없습니다 — 저장할 수 없습니다.`}
              </Banner>
            ) : null}
          </fieldset>
          <fieldset className="transition-rules-group">
            <legend>전이</legend>
            <RadioGroup
              value={mode}
              onValueChange={(next) =>
                set({
                  ...override,
                  transitions: next === "inherit" ? null : next === "all" ? [] : inherited.map((t) => ({ ...t, id: `${t.id}-${typeId}` })),
                })
              }
              aria-label="전이 정하는 방법"
              className="transition-rules-radios transition-rules-radios"
              disabled={readOnly}
            >
              <Radio value="inherit" label="프로젝트 전이 중 이 상태들 사이의 것" />
              <Radio value="all" label="모든 이동 허용" />
              <Radio value="custom" label="따로 정하기" />
            </RadioGroup>
            {mode === "custom" ? (
              <WorkflowCanvas
                statuses={subsetStatuses}
                transitions={override.transitions ?? []}
                layout={{} as WorkflowLayout}
                readOnly={readOnly}
                onChange={(next) => set({ ...override, transitions: next })}
              />
            ) : (
              <p className="type-workflow-note">
                {mode === "all"
                  ? "이 타입은 고른 상태 사이를 자유롭게 오갑니다."
                  : inherited.length === 0
                    ? "프로젝트 전이가 없어 고른 상태 사이를 자유롭게 오갑니다."
                    : `프로젝트 전이 ${inherited.length}개를 그대로 씁니다(고른 상태 밖으로 나가는 것은 빠진다).`}
              </p>
            )}
          </fieldset>
        </>
      )}
    </section>
  );
}
