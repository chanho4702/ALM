// 자동화 규칙(V36·V37) 표기 — 트리거·액션·필드·결과의 한국어 라벨과 요약 문장. 순수 함수만 둔다.
import type {
  AutomationAction,
  AutomationActionType,
  AutomationOutcome,
  AutomationRecipient,
  AutomationRule,
  AutomationRuleInput,
  AutomationSettableField,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationWatchField,
} from "../store/types";

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  ISSUE_CREATED: "이슈 생성됨",
  ISSUE_TRANSITIONED: "상태 전환됨",
  FIELD_CHANGED: "필드 값 변경됨",
  SCHEDULED: "예약 실행",
};

export const TRIGGER_DESCRIPTIONS: Record<AutomationTriggerType, string> = {
  ISSUE_CREATED: "이 프로젝트에 이슈가 만들어지면 실행합니다.",
  ISSUE_TRANSITIONED: "이슈의 상태가 바뀌면 실행합니다. 출발·도착 상태를 비우면 아무 상태나 맞습니다.",
  FIELD_CHANGED: "고른 필드 중 하나라도 값이 바뀌면 실행합니다.",
  SCHEDULED: "정해진 시각(서울 기준)에 조건(AQL)에 맞는 이슈를 찾아 실행합니다. 회차당 100건까지입니다.",
};

export const WATCH_FIELD_LABELS: Record<AutomationWatchField, string> = {
  title: "요약",
  description: "설명",
  type: "이슈 타입",
  status: "상태",
  priority: "우선순위",
  assignee: "담당자",
  parent: "상위 항목",
  sprint: "스프린트",
  dueDate: "마감일",
  estimate: "예상 시간",
  resolution: "해결",
  fixVersion: "수정 버전",
  labels: "라벨",
  components: "컴포넌트",
  startDate: "시작일",
  storyPoints: "스토리 포인트",
  flagged: "플래그",
  triage: "분류",
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  SET_FIELD: "필드 값 설정",
  ASSIGN: "담당자 지정",
  COMMENT: "코멘트 남기기",
  TRANSITION: "상태 전환",
  LABELS: "라벨 더하기·빼기",
  NOTIFY: "알림 보내기",
};

export const SETTABLE_FIELD_LABELS: Record<AutomationSettableField, string> = {
  priority: "우선순위",
  dueDate: "마감일",
  startDate: "시작일",
  storyPoints: "스토리 포인트",
  flagged: "플래그",
};

export type AssignMode = NonNullable<AutomationAction["assignee"]>;
export const ASSIGN_MODES: AssignMode[] = ["reporter", "unassigned", "user"];
export const ASSIGN_MODE_LABELS: Record<AssignMode, string> = {
  reporter: "보고자에게",
  unassigned: "담당자 비우기",
  user: "특정 사용자에게",
};

export const RECIPIENT_LABELS: Record<AutomationRecipient, string> = {
  assignee: "담당자",
  reporter: "보고자",
  watchers: "지켜보는 사람",
};

export const OUTCOME_LABELS: Record<AutomationOutcome, string> = {
  SUCCESS: "성공",
  FAILED: "실패",
  LOOP_BLOCKED: "루프 차단",
  RATE_LIMITED: "실행 상한 초과",
};

export const OUTCOME_APPEARANCE: Record<AutomationOutcome, "success" | "danger" | "warning"> = {
  SUCCESS: "success",
  FAILED: "danger",
  LOOP_BLOCKED: "warning",
  RATE_LIMITED: "warning",
};

export interface CronPreset {
  cron: string;
  label: string;
}

/** 예약 트리거 프리셋 — 서울 시각 */
export const CRON_PRESETS: CronPreset[] = [
  { cron: "0 9 * * *", label: "매일 오전 9시" },
  { cron: "0 9 * * MON-FRI", label: "평일 오전 9시" },
  { cron: "0 9 * * MON", label: "매주 월요일 오전 9시" },
];

export const MAX_ACTIONS = 10;
export const NOTIFY_MESSAGE_MAX = 200;
export const RULE_NAME_MAX = 80;

/** 화면이 id → 이름을 풀 때 쓰는 조회기. 못 찾으면 id 그대로 */
export interface AutomationNameLookup {
  statusName: (id: string) => string;
  userName: (id: string) => string;
  priorityName: (id: string) => string;
}

const normalizeCron = (cron: string) => cron.trim().replace(/\s+/g, " ");

export function cronPreset(cron: string | null | undefined): CronPreset | undefined {
  const value = normalizeCron(cron ?? "");
  return CRON_PRESETS.find((p) => p.cron === value);
}

export function cronSummary(cron: string | null | undefined): string {
  const value = normalizeCron(cron ?? "");
  if (!value) return "시각 미정";
  return cronPreset(value)?.label ?? `cron ${value}`;
}

const anyOr = (ids: string[] | null | undefined, name: (id: string) => string) =>
  ids && ids.length > 0 ? ids.map(name).join(", ") : "아무 상태";

/** 트리거 한 줄 요약 — 목록 행·감사 로그가 쓴다 */
export function triggerSummary(trigger: AutomationTrigger, statusName: (id: string) => string): string {
  const label = TRIGGER_LABELS[trigger.type] ?? trigger.type;
  switch (trigger.type) {
    case "ISSUE_TRANSITIONED":
      return `${label}: ${anyOr(trigger.fromStatuses, statusName)} → ${anyOr(trigger.toStatuses, statusName)}`;
    case "FIELD_CHANGED": {
      const fields = (trigger.fields ?? []).map((f) => WATCH_FIELD_LABELS[f] ?? f);
      return fields.length > 0 ? `${label}: ${fields.join(", ")}` : label;
    }
    case "SCHEDULED":
      return `${label}: ${cronSummary(trigger.cron)}`;
    default:
      return label;
  }
}

function setFieldValue(action: AutomationAction, names: AutomationNameLookup): string {
  const value = action.value;
  if (action.field === "flagged") return value === true ? "켜기" : "끄기";
  if (value === null || value === undefined || value === "") return "비우기";
  if (action.field === "priority") return names.priorityName(String(value));
  return String(value);
}

/** 액션 한 줄 요약 */
export function actionSummary(action: AutomationAction, names: AutomationNameLookup): string {
  switch (action.type) {
    case "SET_FIELD": {
      const field = action.field ? (SETTABLE_FIELD_LABELS[action.field] ?? action.field) : "필드";
      return `${field} → ${setFieldValue(action, names)}`;
    }
    case "ASSIGN":
      if (action.assignee === "user") return `담당자 → ${action.userId ? names.userName(action.userId) : "사용자 미정"}`;
      if (action.assignee === "reporter") return "담당자 → 보고자";
      return "담당자 비우기";
    case "COMMENT":
      return `코멘트: ${clip(action.body ?? "", 40)}`;
    case "TRANSITION":
      return `상태 → ${action.toStatus ? names.statusName(action.toStatus) : "미정"}`;
    case "LABELS": {
      const parts: string[] = [];
      if (action.add?.length) parts.push(`+${action.add.join(", +")}`);
      if (action.remove?.length) parts.push(`-${action.remove.join(", -")}`);
      return `라벨 ${parts.join(" ") || "변경 없음"}`;
    }
    case "NOTIFY": {
      const who = [
        ...(action.recipients ?? []).map((r) => RECIPIENT_LABELS[r] ?? r),
        ...(action.userIds ?? []).map(names.userName),
      ];
      return `알림 → ${who.join(", ") || "받는 사람 없음"}`;
    }
    default:
      return ACTION_LABELS[action.type as AutomationActionType] ?? String(action.type);
  }
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** 새 액션의 빈 초안 — 종류마다 고르기 쉬운 기본값을 채운다 */
export function blankAction(type: AutomationActionType): AutomationAction {
  switch (type) {
    case "SET_FIELD":
      return { type, field: "flagged", value: true };
    case "ASSIGN":
      return { type, assignee: "reporter", userId: null };
    case "COMMENT":
      return { type, body: "" };
    case "TRANSITION":
      return { type, toStatus: null };
    case "LABELS":
      return { type, add: [], remove: [] };
    case "NOTIFY":
      return { type, recipients: ["assignee"], userIds: [], message: "" };
  }
}

/** 트리거 종류를 바꿀 때의 초안 — 다른 종류의 항목은 버린다 */
export function blankTrigger(type: AutomationTriggerType): AutomationTrigger {
  switch (type) {
    case "ISSUE_TRANSITIONED":
      return { type, fromStatuses: [], toStatuses: [] };
    case "FIELD_CHANGED":
      return { type, fields: [] };
    case "SCHEDULED":
      return { type, cron: CRON_PRESETS[0].cron };
    default:
      return { type };
  }
}

/** 저장된 규칙 → 고치기 입력(통째로 PUT) */
export function ruleToInput(rule: AutomationRule): AutomationRuleInput {
  return {
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    trigger: { ...rule.trigger },
    condition: rule.condition,
    actions: rule.actions.map((a) => ({ ...a })),
    allowRuleTrigger: rule.allowRuleTrigger,
  };
}

/** 복제본 — 지라처럼 꺼진 채로 만든다(원본과 함께 두 번 실행되지 않게) */
export function duplicateInput(rule: AutomationRule): AutomationRuleInput {
  const suffix = " (복사본)";
  const base = rule.name.length + suffix.length > RULE_NAME_MAX ? rule.name.slice(0, RULE_NAME_MAX - suffix.length) : rule.name;
  return { ...ruleToInput(rule), name: `${base}${suffix}`, enabled: false };
}

/** 액션 순서 바꾸기 — 범위를 벗어나면 그대로 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
