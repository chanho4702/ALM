import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Banner,
  Button,
  Dropdown,
  Modal,
  MultiSelect,
  Select,
  Switch,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Bell,
  CalendarClock,
  CirclePlus,
  Filter,
  Flag,
  MessageSquare,
  PencilLine,
  Plus,
  Tag,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import type {
  AutomationAction,
  AutomationActionType,
  AutomationRecipient,
  AutomationRule,
  AutomationRuleInput,
  AutomationSettableField,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationWatchField,
  PriorityDef,
  User,
  WorkflowStatus,
} from "../store/types";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_RECIPIENTS,
  AUTOMATION_SETTABLE_FIELDS,
  AUTOMATION_TRIGGER_TYPES,
  AUTOMATION_WATCH_FIELDS,
} from "../store/types";
import { createAutomationRule, getAutomationRule, updateAutomationRule, validateAql } from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { StatusGlyph } from "./StatusGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { UserAvatar } from "./UserAvatar";
import { priorityName } from "./labels";
import {
  ACTION_LABELS,
  ASSIGN_MODES,
  ASSIGN_MODE_LABELS,
  CRON_PRESETS,
  MAX_ACTIONS,
  NOTIFY_MESSAGE_MAX,
  RECIPIENT_LABELS,
  RULE_NAME_MAX,
  SETTABLE_FIELD_LABELS,
  TRIGGER_DESCRIPTIONS,
  TRIGGER_LABELS,
  WATCH_FIELD_LABELS,
  blankAction,
  blankTrigger,
  cronPreset,
  moveItem,
  ruleToInput,
} from "./automationLabels";
import "./automation.css";

const CUSTOM_CRON = "__custom__";
const PICK = "__pick__";
const AQL_DEBOUNCE_MS = 300;

export const TRIGGER_ICONS: Record<AutomationTriggerType, ReactNode> = {
  ISSUE_CREATED: <CirclePlus size={14} aria-hidden />,
  ISSUE_TRANSITIONED: <ArrowRightLeft size={14} aria-hidden />,
  FIELD_CHANGED: <PencilLine size={14} aria-hidden />,
  SCHEDULED: <CalendarClock size={14} aria-hidden />,
};

export const ACTION_ICONS: Record<AutomationActionType, ReactNode> = {
  SET_FIELD: <PencilLine size={14} aria-hidden />,
  ASSIGN: <UserRound size={14} aria-hidden />,
  COMMENT: <MessageSquare size={14} aria-hidden />,
  TRANSITION: <ArrowRightLeft size={14} aria-hidden />,
  LABELS: <Tag size={14} aria-hidden />,
  NOTIFY: <Bell size={14} aria-hidden />,
};

interface DraftAction {
  key: number;
  action: AutomationAction;
}

export interface AutomationRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** 고치기 — 없으면 만들기 */
  rule?: AutomationRule | null;
  /** 만들기 초안(복제) — 없으면 빈 규칙 */
  initial?: AutomationRuleInput | null;
  statuses: WorkflowStatus[];
  users: User[];
  priorities: PriorityDef[];
  labels: string[];
  onSaved: (rule: AutomationRule) => void;
}

const EMPTY_RULE: AutomationRuleInput = {
  name: "",
  description: "",
  enabled: true,
  trigger: { type: "ISSUE_TRANSITIONED", fromStatuses: [], toStatuses: [] },
  condition: "",
  actions: [],
  allowRuleTrigger: false,
};

/**
 * 자동화 규칙 편집기(만들기·고치기) — 지라 Automation처럼 "트리거 → 조건 → 액션" 세 블록.
 * 저장 실패는 초안을 유지한 채 모달 안 배너 + 토스트로 알린다. 409는 최신 내용을 다시 불러올 수 있다.
 */
export function AutomationRuleEditor(props: AutomationRuleEditorProps) {
  const { open, onOpenChange, rule } = props;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? "자동화 규칙 고치기" : "자동화 규칙 만들기"}
      className="automation-editor-modal"
    >
      {open ? <EditorBody {...props} /> : null}
    </Modal>
  );
}

function EditorBody({
  onOpenChange,
  projectId,
  rule: initialRule,
  initial,
  statuses,
  users,
  priorities,
  labels,
  onSaved,
}: AutomationRuleEditorProps) {
  const toast = useToast();
  const [rule, setRule] = useState<AutomationRule | null>(initialRule ?? null);
  const seed = initialRule ? ruleToInput(initialRule) : (initial ?? EMPTY_RULE);
  const nextKey = useRef(0);
  const keyed = (actions: AutomationAction[]): DraftAction[] =>
    actions.map((action) => ({ key: nextKey.current++, action }));

  const [name, setName] = useState(seed.name);
  const [description, setDescription] = useState(seed.description ?? "");
  const [enabled, setEnabled] = useState(seed.enabled ?? true);
  const [trigger, setTrigger] = useState<AutomationTrigger>(seed.trigger);
  const [condition, setCondition] = useState(seed.condition ?? "");
  const [actions, setActions] = useState<DraftAction[]>(() => keyed(seed.actions));
  const [allowRuleTrigger, setAllowRuleTrigger] = useState(seed.allowRuleTrigger ?? false);
  const [customCron, setCustomCron] = useState(() => trigger.type === "SCHEDULED" && !cronPreset(trigger.cron));
  const [aqlError, setAqlError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  // 조건 실시간 검증 — 300ms 디바운스(검색 화면 AQL 에디터와 같은 간격)
  useEffect(() => {
    const text = condition.trim();
    if (!text) {
      setAqlError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void validateAql(text).then((result) => {
        if (!cancelled) setAqlError(result.ok ? null : (result.error ?? "조건(AQL)이 올바르지 않습니다"));
      });
    }, AQL_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [condition]);

  const statusOptions = useMemo(
    () =>
      statuses.map((s) => ({
        value: s.id,
        label: s.name,
        icon: <StatusGlyph status={s.id} statuses={statuses} variant="icon" />,
      })),
    [statuses],
  );
  const userOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.name, icon: <UserAvatar user={u} size="small" aria-hidden /> })),
    [users],
  );
  const priorityOptions = useMemo(
    () =>
      priorities.map((p) => ({
        value: p.id,
        label: priorityName(priorities, p.id),
        icon: <PriorityGlyph defs={priorities} priority={p.id} size={14} variant="icon" />,
      })),
    [priorities],
  );
  const actorName = rule ? (users.find((u) => u.id === rule.actorId)?.name ?? rule.actorId) : null;

  const updateAction = (key: number, patch: Partial<AutomationAction>) =>
    setActions((prev) => prev.map((d) => (d.key === key ? { ...d, action: { ...d.action, ...patch } } : d)));

  const addAction = (type: AutomationActionType) => {
    if (actions.length >= MAX_ACTIONS) return;
    const action = blankAction(type);
    if (type === "TRANSITION") action.toStatus = statuses[0]?.id ?? null;
    setActions((prev) => [...prev, { key: nextKey.current++, action }]);
  };

  const reloadLatest = async () => {
    if (!rule) return;
    try {
      const latest = await getAutomationRule(rule.id);
      const input = ruleToInput(latest);
      setRule(latest);
      setName(input.name);
      setDescription(input.description ?? "");
      setEnabled(input.enabled ?? true);
      setTrigger(input.trigger);
      setCondition(input.condition ?? "");
      setActions(keyed(input.actions));
      setAllowRuleTrigger(input.allowRuleTrigger ?? false);
      setCustomCron(input.trigger.type === "SCHEDULED" && !cronPreset(input.trigger.cron));
      setConflict(false);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: AutomationRuleInput = {
      name,
      description,
      enabled,
      trigger,
      condition,
      actions: actions.map((d) => d.action),
      allowRuleTrigger,
    };
    setSaving(true);
    setSaveError(null);
    try {
      const saved = rule
        ? await updateAutomationRule(rule.id, input, rule.version)
        : await createAutomationRule(projectId, input);
      toast({ title: rule ? "규칙을 저장했습니다" : "규칙을 만들었습니다", appearance: "success" });
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (errorStatus(error) === 409) setConflict(true);
      else setSaveError(message);
      toast({ title: "규칙 저장 실패", description: message, appearance: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const scheduled = trigger.type === "SCHEDULED";

  return (
    <form className="automation-editor" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {rule?.disabledReason ? (
        <Banner variant="warning">
          자동으로 꺼진 규칙입니다 — {rule.disabledReason}. 원인을 고친 뒤 켜고 저장하면 사유가 지워집니다.
        </Banner>
      ) : null}
      {conflict ? (
        <Banner variant="danger" action={{ label: "최신 내용 불러오기", onClick: () => void reloadLatest() }}>
          다른 사용자가 먼저 이 규칙을 수정했습니다. 최신 내용을 불러오면 지금 고친 내용은 사라집니다.
        </Banner>
      ) : null}
      {saveError ? <Banner variant="danger">{saveError}</Banner> : null}

      <div className="automation-editor-meta">
        <TextField
          label="규칙 이름 *"
          value={name}
          maxLength={RULE_NAME_MAX}
          placeholder="예: 완료되면 플래그 내리기"
          onChange={(e) => setName(e.target.value)}
        />
        <TextArea
          label="설명"
          value={description}
          rows={2}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <section className="automation-block" aria-labelledby="automation-block-trigger">
        <h3 id="automation-block-trigger" className="automation-block-title">
          <Zap size={16} aria-hidden /> 트리거 — 언제
        </h3>
        <div className="automation-block-row">
          <Select
            label="트리거"
            value={trigger.type}
            options={AUTOMATION_TRIGGER_TYPES.map((t) => ({ value: t, label: TRIGGER_LABELS[t], icon: TRIGGER_ICONS[t] }))}
            onValueChange={(v) => {
              const type = v as AutomationTriggerType;
              setTrigger(blankTrigger(type));
              setCustomCron(false);
            }}
          />
        </div>
        <p className="settings-help">{TRIGGER_DESCRIPTIONS[trigger.type]}</p>
        {trigger.type === "ISSUE_TRANSITIONED" ? (
          <div className="automation-block-row">
            <MultiSelect
              label="출발 상태"
              placeholder="아무 상태"
              options={statusOptions}
              value={trigger.fromStatuses ?? []}
              onValueChange={(fromStatuses) => setTrigger({ ...trigger, fromStatuses })}
            />
            <MultiSelect
              label="도착 상태"
              placeholder="아무 상태"
              options={statusOptions}
              value={trigger.toStatuses ?? []}
              onValueChange={(toStatuses) => setTrigger({ ...trigger, toStatuses })}
            />
          </div>
        ) : null}
        {trigger.type === "FIELD_CHANGED" ? (
          <div className="automation-block-row">
            <MultiSelect
              label="지켜볼 필드"
              placeholder="필드를 고르세요"
              maxChips={4}
              options={AUTOMATION_WATCH_FIELDS.map((f) => ({ value: f, label: WATCH_FIELD_LABELS[f] }))}
              value={trigger.fields ?? []}
              onValueChange={(fields) => setTrigger({ ...trigger, fields: fields as AutomationWatchField[] })}
            />
          </div>
        ) : null}
        {scheduled ? (
          <div className="automation-block-row">
            <Select
              label="예약 주기"
              value={customCron ? CUSTOM_CRON : (cronPreset(trigger.cron)?.cron ?? CUSTOM_CRON)}
              options={[
                ...CRON_PRESETS.map((p) => ({ value: p.cron, label: p.label })),
                { value: CUSTOM_CRON, label: "직접 입력 (cron)" },
              ]}
              onValueChange={(v) => {
                if (v === CUSTOM_CRON) {
                  setCustomCron(true);
                } else {
                  setCustomCron(false);
                  setTrigger({ ...trigger, cron: v });
                }
              }}
            />
            {customCron ? (
              <TextField
                label="cron 식"
                value={trigger.cron ?? ""}
                placeholder="분 시 일 월 요일 (예: 30 8 * * MON-FRI)"
                description="서울 시각 기준입니다. 5분보다 자주 돌 수 없습니다."
                onChange={(e) => setTrigger({ ...trigger, cron: e.target.value })}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="automation-block" aria-labelledby="automation-block-condition">
        <h3 id="automation-block-condition" className="automation-block-title">
          <Filter size={16} aria-hidden /> 조건 — 어떤 이슈에
        </h3>
        <TextArea
          label={scheduled ? "조건 (AQL) *" : "조건 (AQL)"}
          className="automation-aql"
          value={condition}
          rows={2}
          placeholder="예: flagged = true AND priority >= high"
          description={
            scheduled
              ? "예약 트리거는 조건으로 대상 이슈를 찾습니다 — 비울 수 없습니다."
              : "비우면 모든 이슈에 실행합니다. 실행 주체가 볼 수 있는 이슈에만 맞습니다."
          }
          error={aqlError ?? undefined}
          onChange={(e) => setCondition(e.target.value)}
        />
      </section>

      <section className="automation-block" aria-labelledby="automation-block-actions">
        <h3 id="automation-block-actions" className="automation-block-title">
          <Flag size={16} aria-hidden /> 액션 — 무엇을 ({actions.length}/{MAX_ACTIONS})
        </h3>
        {actions.length === 0 ? (
          <p className="settings-empty">액션이 없습니다. 아래에서 하나 이상 추가하세요.</p>
        ) : (
          <ol className="automation-action-list" aria-label="액션 목록">
            {actions.map((draft, index) => (
              <li key={draft.key} className="automation-action">
                <div className="automation-action-head">
                  <span className="automation-action-index">
                    {ACTION_ICONS[draft.action.type]} {index + 1}. {ACTION_LABELS[draft.action.type]}
                  </span>
                  <div className="automation-action-tools">
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      iconOnly
                      aria-label={`액션 ${index + 1} 위로`}
                      disabled={index === 0}
                      onClick={() => setActions((prev) => moveItem(prev, index, index - 1))}
                    >
                      <ArrowUp size={16} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      iconOnly
                      aria-label={`액션 ${index + 1} 아래로`}
                      disabled={index === actions.length - 1}
                      onClick={() => setActions((prev) => moveItem(prev, index, index + 1))}
                    >
                      <ArrowDown size={16} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      iconOnly
                      aria-label={`액션 ${index + 1} 삭제`}
                      onClick={() => setActions((prev) => prev.filter((d) => d.key !== draft.key))}
                    >
                      <Trash2 size={16} aria-hidden />
                    </Button>
                  </div>
                </div>
                <ActionFields
                  index={index + 1}
                  action={draft.action}
                  onChange={(patch) => updateAction(draft.key, patch)}
                  statusOptions={statusOptions}
                  userOptions={userOptions}
                  priorityOptions={priorityOptions}
                  labels={labels}
                />
              </li>
            ))}
          </ol>
        )}
        <Dropdown
          trigger={
            <Button type="button" variant="secondary" iconBefore={<Plus size={16} aria-hidden />} disabled={actions.length >= MAX_ACTIONS}>
              액션 추가
            </Button>
          }
          items={AUTOMATION_ACTION_TYPES.map((type) => ({
            label: ACTION_LABELS[type],
            icon: ACTION_ICONS[type],
            onSelect: () => addAction(type),
          }))}
        />
      </section>

      <section className="automation-block" aria-labelledby="automation-block-options">
        <h3 id="automation-block-options" className="automation-block-title">
          실행 설정
        </h3>
        <Switch label="규칙 사용" checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
        <Switch
          label="규칙이 만든 변경에도 반응"
          checked={allowRuleTrigger}
          onCheckedChange={(v) => setAllowRuleTrigger(v === true)}
        />
        <p className="settings-help">
          기본은 꺼짐입니다. 다른 규칙이 바꾼 이슈에는 반응하지 않아 규칙끼리 서로 깨우는 루프를 막습니다. 켜더라도 연쇄는
          3단계까지이고, 같은 연쇄에서 같은 이슈에는 한 번만 실행됩니다.
        </p>
        <p className="settings-help">
          {rule
            ? `실행 주체: ${actorName} (마지막으로 저장한 사람). 저장하면 실행 주체가 나로 바뀌고, 액션은 그 사람 권한으로 실행됩니다.`
            : "실행 주체: 나 (마지막으로 저장한 사람). 액션은 실행 주체의 권한으로 실행됩니다."}
        </p>
      </section>

      <div className="automation-editor-footer">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button type="submit" loading={saving}>
          {rule ? "저장" : "만들기"}
        </Button>
      </div>
    </form>
  );
}

interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
}

function ActionFields({
  index,
  action,
  onChange,
  statusOptions,
  userOptions,
  priorityOptions,
  labels,
}: {
  index: number;
  action: AutomationAction;
  onChange: (patch: Partial<AutomationAction>) => void;
  statusOptions: Option[];
  userOptions: Option[];
  priorityOptions: Option[];
  labels: string[];
}) {
  const prefix = `액션 ${index}`;
  switch (action.type) {
    case "SET_FIELD":
      return (
        <div className="automation-block-row">
          <Select
            label={`${prefix} 필드`}
            value={action.field ?? PICK}
            options={AUTOMATION_SETTABLE_FIELDS.map((f) => ({ value: f, label: SETTABLE_FIELD_LABELS[f] }))}
            onValueChange={(v) => {
              const field = v as AutomationSettableField;
              const value = field === "flagged" ? true : field === "priority" ? (priorityOptions[0]?.value ?? null) : null;
              onChange({ field, value });
            }}
          />
          <SetFieldValue prefix={prefix} action={action} onChange={onChange} priorityOptions={priorityOptions} />
        </div>
      );
    case "ASSIGN":
      return (
        <div className="automation-block-row">
          <Select
            label={`${prefix} 지정 방법`}
            value={action.assignee ?? PICK}
            options={ASSIGN_MODES.map((m) => ({ value: m, label: ASSIGN_MODE_LABELS[m] }))}
            onValueChange={(v) => onChange({ assignee: v as AutomationAction["assignee"], userId: null })}
          />
          {action.assignee === "user" ? (
            <Select
              label={`${prefix} 사용자`}
              searchable={userOptions.length > 8}
              value={action.userId ?? PICK}
              placeholder="사용자를 고르세요"
              options={action.userId ? userOptions : [{ value: PICK, label: "사용자를 고르세요", disabled: true }, ...userOptions]}
              onValueChange={(userId) => onChange({ userId: userId === PICK ? null : userId })}
            />
          ) : null}
        </div>
      );
    case "COMMENT":
      return (
        <TextArea
          label={`${prefix} 코멘트 내용`}
          value={action.body ?? ""}
          rows={3}
          maxLength={5000}
          onChange={(e) => onChange({ body: e.target.value })}
        />
      );
    case "TRANSITION":
      return (
        <div className="automation-block-row">
          <Select
            label={`${prefix} 옮길 상태`}
            value={action.toStatus ?? PICK}
            options={action.toStatus ? statusOptions : [{ value: PICK, label: "상태를 고르세요", disabled: true }, ...statusOptions]}
            onValueChange={(toStatus) => onChange({ toStatus })}
          />
          <p className="settings-help">워크플로 전환 규칙(조건·검증·후처리)을 그대로 탑니다. 갈 수 없으면 실패로 남습니다.</p>
        </div>
      );
    case "LABELS":
      return <LabelsFields prefix={prefix} action={action} onChange={onChange} labels={labels} />;
    case "NOTIFY": {
      const message = action.message ?? "";
      return (
        <div className="automation-block-stack">
          <div className="automation-block-row">
            <MultiSelect
              label={`${prefix} 받는 역할`}
              placeholder="역할 없음"
              searchable={false}
              options={AUTOMATION_RECIPIENTS.map((r) => ({ value: r, label: RECIPIENT_LABELS[r] }))}
              value={action.recipients ?? []}
              onValueChange={(recipients) => onChange({ recipients: recipients as AutomationRecipient[] })}
            />
            <MultiSelect
              label={`${prefix} 받는 사람`}
              placeholder="사람 없음"
              options={userOptions}
              value={action.userIds ?? []}
              onValueChange={(userIds) => onChange({ userIds })}
            />
          </div>
          <TextArea
            label={`${prefix} 알림 문장`}
            value={message}
            rows={2}
            maxLength={NOTIFY_MESSAGE_MAX}
            description={`${message.length}/${NOTIFY_MESSAGE_MAX}자 · 인앱 알림으로 보냅니다(메일 없음).`}
            onChange={(e) => onChange({ message: e.target.value })}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

function SetFieldValue({
  prefix,
  action,
  onChange,
  priorityOptions,
}: {
  prefix: string;
  action: AutomationAction;
  onChange: (patch: Partial<AutomationAction>) => void;
  priorityOptions: Option[];
}) {
  const label = `${prefix} 값`;
  switch (action.field) {
    case "priority":
      return (
        <Select
          label={label}
          value={typeof action.value === "string" && action.value ? action.value : PICK}
          options={
            typeof action.value === "string" && action.value
              ? priorityOptions
              : [{ value: PICK, label: "우선순위를 고르세요", disabled: true }, ...priorityOptions]
          }
          onValueChange={(value) => onChange({ value })}
        />
      );
    case "flagged":
      return (
        <Select
          label={label}
          value={action.value === false ? "false" : "true"}
          options={[
            { value: "true", label: "플래그 켜기" },
            { value: "false", label: "플래그 끄기" },
          ]}
          onValueChange={(v) => onChange({ value: v === "true" })}
        />
      );
    case "dueDate":
    case "startDate":
      return (
        <TextField
          label={label}
          type="date"
          value={typeof action.value === "string" ? action.value : ""}
          description="비우면 값을 지웁니다."
          onChange={(e) => onChange({ value: e.target.value || null })}
        />
      );
    case "storyPoints":
      return (
        <TextField
          label={label}
          type="number"
          min={0}
          max={9999}
          value={typeof action.value === "number" ? String(action.value) : ""}
          description="비우면 값을 지웁니다."
          onChange={(e) => {
            const raw = e.target.value.trim();
            const parsed = Number(raw);
            onChange({ value: raw === "" || Number.isNaN(parsed) ? null : parsed });
          }}
        />
      );
    default:
      return null;
  }
}

function LabelsFields({
  prefix,
  action,
  onChange,
  labels,
}: {
  prefix: string;
  action: AutomationAction;
  onChange: (patch: Partial<AutomationAction>) => void;
  labels: string[];
}) {
  const [fresh, setFresh] = useState("");
  const add = action.add ?? [];
  const remove = action.remove ?? [];
  // 새 라벨(아직 어느 이슈에도 없는 것)도 더할 수 있도록 고른 값을 옵션에 합친다
  const options = (extra: string[]) => [...new Set([...labels, ...extra])].map((l) => ({ value: l, label: l }));
  const addFresh = () => {
    const label = fresh.trim();
    if (!label) return;
    if (!add.includes(label)) onChange({ add: [...add, label] });
    setFresh("");
  };
  return (
    <div className="automation-block-stack">
      <div className="automation-block-row">
        <MultiSelect
          label={`${prefix} 더할 라벨`}
          placeholder="없음"
          options={options(add)}
          value={add}
          onValueChange={(next) => onChange({ add: next })}
        />
        <MultiSelect
          label={`${prefix} 뺄 라벨`}
          placeholder="없음"
          options={options(remove)}
          value={remove}
          onValueChange={(next) => onChange({ remove: next })}
        />
      </div>
      <div className="automation-block-row automation-label-new">
        <TextField
          label={`${prefix} 새 라벨`}
          value={fresh}
          placeholder="목록에 없는 라벨"
          onChange={(e) => setFresh(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFresh();
            }
          }}
        />
        <Button type="button" variant="secondary" disabled={!fresh.trim()} onClick={addFresh}>
          더할 라벨에 넣기
        </Button>
      </div>
    </div>
  );
}
