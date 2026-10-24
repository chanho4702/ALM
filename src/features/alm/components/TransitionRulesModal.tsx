import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Checkbox, Modal, MultiSelect, Radio, RadioGroup, Select, TextField } from "@chanho/react";
import type {
  IssueResolution,
  TransitionCondition,
  TransitionPostFunction,
  TransitionScreenField,
  TransitionValidatorField,
  WorkflowStatus,
  WorkflowTransition,
} from "../store/types";
import { RESOLUTIONS, RESOLUTION_LABELS, statusKind } from "./labels";
import { ResolutionGlyph } from "./ResolutionGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";
import {
  CONDITION_KEYS,
  CONDITION_LABELS,
  SCREEN_FIELD_IDS,
  SCREEN_FIELD_LABELS,
  VALIDATOR_FIELD_IDS,
  VALIDATOR_FIELD_LABELS,
  conditionFromKey,
  conditionKey,
  resolutionFromServer,
  resolutionToServer,
} from "./workflowRules";
import "./workflow-rules.css";

type AssigneeAction = "none" | "assignToActor" | "clearAssignee";

export interface TransitionRulesModalProps {
  transition: WorkflowTransition;
  statuses: WorkflowStatus[];
  onSave: (transition: WorkflowTransition) => void;
  onCancel: () => void;
}

/**
 * 전환 규칙 편집(C1~C3) — 지라 워크플로 편집기의 전환 속성 패널: 이름·조건·검증·전환 화면·후처리.
 * 저장은 부모 초안에 반영할 뿐이고, 서버 저장은 워크플로 편집기의 "저장"이 한다. 모르는 칸은 건드리지 않는다
 * (`...transition` 스프레드 — 앞으로 생길 규칙도 왕복한다).
 */
export function TransitionRulesModal({ transition, statuses, onSave, onCancel }: TransitionRulesModalProps) {
  const toComplete = statusKind(statuses, transition.to) === "complete";
  const [name, setName] = useState(transition.name);
  const [conditions, setConditions] = useState<string[]>((transition.conditions ?? []).map(conditionKey));
  const [validators, setValidators] = useState<TransitionValidatorField[]>(transition.validators ?? []);
  const [screenFields, setScreenFields] = useState<TransitionScreenField[]>(transition.screenFields ?? []);
  const post = transition.postFunctions ?? [];
  const [assigneeAction, setAssigneeAction] = useState<AssigneeAction>(
    post.some((f) => f.type === "assignToActor") ? "assignToActor" : post.some((f) => f.type === "clearAssignee") ? "clearAssignee" : "none",
  );
  const initialResolution = resolutionFromServer(post.find((f) => f.type === "setResolution")?.value);
  const [setResolution, setSetResolution] = useState(initialResolution !== null);
  const [resolution, setResolutionValue] = useState<IssueResolution>(initialResolution ?? "done");

  const nameOf = (id: string) => statuses.find((s) => s.id === id)?.name ?? id;
  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 모달은 포털이지만 React 이벤트는 컴포넌트 트리로 거품이 오른다 — 바깥 편집 폼(워크플로 저장 등)의 제출로 번지지 않게
    event.stopPropagation();
    const postFunctions: TransitionPostFunction[] = [];
    if (assigneeAction !== "none") postFunctions.push({ type: assigneeAction, value: null });
    if (setResolution && toComplete) postFunctions.push({ type: "setResolution", value: resolutionToServer(resolution) });
    const nextConditions: TransitionCondition[] = CONDITION_KEYS.filter((key) => conditions.includes(key)).map(conditionFromKey);
    onSave({
      ...transition,
      name: name.trim(),
      conditions: nextConditions,
      // 검증·화면은 서버 어휘 순서로 정리해 보낸다(같은 값이면 저장 비교가 흔들리지 않게)
      validators: VALIDATOR_FIELD_IDS.filter((id) => validators.includes(id)),
      screenFields: SCREEN_FIELD_IDS.filter((id) => screenFields.includes(id) && (id !== "resolution" || toComplete)),
      postFunctions,
    });
  };

  const from =
    transition.from.length === 0 ? "모든 상태" : transition.from.map(nameOf).join(", ");

  return (
    <Modal
      trigger={<span hidden />}
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title="전환 규칙"
      description={`${from} → ${nameOf(transition.to)}`}
      className="transition-rules-modal"
    >
      <form className="transition-rules" onSubmit={handleSubmit} aria-label="전환 규칙 편집">
        <TextField
          label="전환 이름"
          placeholder={`비우면 대상 상태 이름(${nameOf(transition.to)})`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <fieldset className="transition-rules-group">
          <legend>조건 — 누가·언제 이 전환을 할 수 있나(모두 충족해야 한다)</legend>
          {CONDITION_KEYS.map((key) => (
            <Checkbox
              key={key}
              label={CONDITION_LABELS[key]}
              checked={conditions.includes(key)}
              onCheckedChange={() => setConditions((prev) => toggle(prev, key))}
            />
          ))}
          <p className="transition-rules-hint">조건이 안 맞으면 전환 목록에 흐리게 보이고 이유가 함께 나온다(지라와 같다).</p>
        </fieldset>

        <fieldset className="transition-rules-group">
          <legend>검증 — 전환 뒤 값이 있어야 하는 필드</legend>
          <MultiSelect
            label="필수 필드"
            placeholder="없음"
            options={VALIDATOR_FIELD_IDS.map((id) => ({ value: id, label: VALIDATOR_FIELD_LABELS[id] }))}
            value={validators}
            onValueChange={(values) => setValidators(values as TransitionValidatorField[])}
            maxChips={3}
          />
          <p className="transition-rules-hint">비어 있으면 "마감일은 필수입니다"처럼 거부된다. 전환 화면에 그 칸을 넣으면 그 자리에서 채울 수 있다.</p>
        </fieldset>

        <fieldset className="transition-rules-group">
          <legend>전환 화면 — 전환할 때 묻는 칸(비우면 창 없이 바로 전환)</legend>
          {SCREEN_FIELD_IDS.map((id) => {
            const lockedResolution = id === "resolution" && !toComplete;
            return (
              <Checkbox
                key={id}
                label={lockedResolution ? `${SCREEN_FIELD_LABELS[id]} (완료로 가는 전환만)` : SCREEN_FIELD_LABELS[id]}
                checked={screenFields.includes(id) && !lockedResolution}
                disabled={lockedResolution}
                onCheckedChange={() => setScreenFields((prev) => toggle(prev, id))}
              />
            );
          })}
        </fieldset>

        <fieldset className="transition-rules-group">
          <legend>후처리 — 전환 뒤 자동으로</legend>
          <RadioGroup
            value={assigneeAction}
            onValueChange={(value) => setAssigneeAction(value as AssigneeAction)}
            aria-label="담당자 후처리"
            className="transition-rules-radios transition-rules-radios"
          >
            <Radio value="none" label="담당자 그대로" />
            <Radio value="assignToActor" label="담당자를 실행한 사람으로" />
            <Radio value="clearAssignee" label="담당자 비우기" />
          </RadioGroup>
          {toComplete ? (
            <div className="transition-rules-resolution">
              <Checkbox label="해결 기본값 지정" checked={setResolution} onCheckedChange={(next) => setSetResolution(next === true)} />
              {setResolution ? (
                <Select
                  label="기본 해결"
                  value={resolution}
                  options={RESOLUTIONS.map((r) => ({
                    value: r,
                    label: RESOLUTION_LABELS[r],
                    icon: <ResolutionGlyph resolution={r} variant="icon" />,
                  }))}
                  onValueChange={(value) => setResolutionValue(value as IssueResolution)}
                />
              ) : null}
            </div>
          ) : null}
          <p className="transition-rules-hint">
            해결은 내장 규칙이다 — 완료로 들어가면 기본값(완료됨)이 붙고, 완료에서 나가면 비워진다.
          </p>
        </fieldset>

        <p className="transition-rules-target">
          <span>대상</span>
          <ValueWithIcon icon={<StatusGlyph status={transition.to} statuses={statuses} variant="icon" />}>
            {nameOf(transition.to)}
          </ValueWithIcon>
        </p>
        <div className="transition-rules-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit">적용</Button>
        </div>
      </form>
    </Modal>
  );
}
