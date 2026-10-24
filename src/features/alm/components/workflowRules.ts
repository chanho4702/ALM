/**
 * 워크플로 규칙(C1~C5) 화면 공용 — 문구 표와 저장 전 정리. 순수 모듈(스토어·DOM 없음).
 */
import type {
  IssueResolution,
  ServerResolution,
  SettingsBody,
  TransitionCondition,
  TransitionPostFunction,
  TransitionScreenField,
  TransitionValidatorField,
  WorkflowTransition,
} from "../store/types";
import { ISSUE_FIELD_NAMES, TRANSITION_SCREEN_FIELDS, TRANSITION_VALIDATOR_FIELDS } from "../store/types";

/** 조건 이름 — 전환 목록·편집기·요약 배지 */
export const CONDITION_LABELS: Record<string, string> = {
  assignee: "담당자만",
  "role:ADMIN": "프로젝트 관리자만",
  "role:EDIT": "편집 권한이 있는 사람만",
  subtasksDone: "하위 이슈가 모두 완료일 때",
};

export function conditionKey(condition: TransitionCondition): string {
  return condition.type === "role" ? `role:${condition.role ?? "EDIT"}` : condition.type;
}

export function conditionFromKey(key: string): TransitionCondition {
  if (key.startsWith("role:")) return { type: "role", role: key.slice(5) === "ADMIN" ? "ADMIN" : "EDIT" };
  return { type: key as TransitionCondition["type"], role: null };
}

/** 조건 선택지(편집기 체크 목록 순서) */
export const CONDITION_KEYS = ["assignee", "role:ADMIN", "role:EDIT", "subtasksDone"] as const;

export const SCREEN_FIELD_LABELS: Record<TransitionScreenField, string> = {
  resolution: "해결",
  comment: "코멘트",
  assignee: "담당자",
  fixVersion: "수정 버전",
  dueDate: "마감일",
};

export const VALIDATOR_FIELD_LABELS: Record<TransitionValidatorField, string> = Object.fromEntries(
  TRANSITION_VALIDATOR_FIELDS.map((id) => [id, (ISSUE_FIELD_NAMES as Record<string, string>)[id] ?? id]),
) as Record<TransitionValidatorField, string>;

export const POST_FUNCTION_LABELS: Record<TransitionPostFunction["type"], string> = {
  assignToActor: "담당자를 실행한 사람으로",
  clearAssignee: "담당자 비우기",
  setResolution: "해결 기본값 지정",
};

export const SCREEN_FIELD_IDS = TRANSITION_SCREEN_FIELDS;
export const VALIDATOR_FIELD_IDS = TRANSITION_VALIDATOR_FIELDS;

const TO_SERVER: Record<IssueResolution, ServerResolution> = {
  done: "DONE",
  wont_do: "WONT_DO",
  duplicate: "DUPLICATE",
  cannot_reproduce: "CANNOT_REPRODUCE",
};

/** 화면 해결 값 → 설정 본문(서버 어휘) */
export const resolutionToServer = (value: IssueResolution): ServerResolution => TO_SERVER[value];

/** 설정 본문(서버 어휘) → 화면 해결 값 */
export function resolutionFromServer(value: ServerResolution | null | undefined): IssueResolution | null {
  const found = (Object.keys(TO_SERVER) as IssueResolution[]).find((key) => TO_SERVER[key] === value);
  return found ?? null;
}

/** 전환에 규칙이 하나라도 붙었나 — 목록의 "규칙 n개" 표시 */
export function ruleCount(transition: WorkflowTransition): number {
  return (
    (transition.conditions?.length ?? 0) +
    (transition.validators?.length ?? 0) +
    (transition.screenFields?.length ?? 0) +
    (transition.postFunctions?.length ?? 0)
  );
}

function pruneTransitionList(list: WorkflowTransition[], valid: Set<string>): WorkflowTransition[] {
  return list.flatMap((transition) => {
    if (!valid.has(transition.to)) return [];
    const from = transition.from.filter((id) => valid.has(id));
    if (transition.from.length > 0 && from.length === 0) return [];
    return [{ ...transition, from }];
  });
}

/**
 * 저장 전 정리 — 빠진 상태를 가리키는 전이·타입 워크플로 상태·배치를 덜어낸다. **조건·검증·화면·후처리는 보존**한다.
 * 서버는 깨진 참조를 400으로 거부하므로(2026-10-24 저장 검증) 상태를 지운 편집기는 이걸 거쳐 보낸다.
 */
export function pruneWorkflowRefs(body: SettingsBody): SettingsBody {
  const valid = new Set(body.statuses.map((status) => status.id));
  const workflowsByType = Object.fromEntries(
    Object.entries(body.workflowsByType ?? {}).map(([typeId, flow]) => {
      const subset = (flow.statuses ?? []).filter((id) => valid.has(id));
      const scoped = subset.length === 0 ? valid : new Set(subset);
      return [
        typeId,
        { statuses: subset, transitions: flow.transitions == null ? null : pruneTransitionList(flow.transitions, scoped) },
      ];
    }),
  );
  const layout = body.layout
    ? Object.fromEntries(Object.entries(body.layout).filter(([id]) => valid.has(id) || id === "__any__"))
    : body.layout;
  return {
    ...body,
    ...(body.transitions ? { transitions: pruneTransitionList(body.transitions, valid) } : {}),
    ...(body.layout ? { layout } : {}),
    workflowsByType,
  };
}
