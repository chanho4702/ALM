// localStorage 목업 스토어 — 자동화 규칙(V36·V37 대역): 규칙 CRUD·실행 이력·동기 실행 엔진
//
// 서버는 커밋 뒤 별도 스레드 풀에서 돈다. 목업은 같은 호출 안에서 바로 돌린다(테스트가 결과를 곧장 본다).
// 규칙·문구·안전장치(규칙이 만든 변경은 allowRuleTrigger 규칙만 깨움·깊이 3·같은 연쇄의 같은 (규칙, 이슈) 한 번·
// 분당 30회 넘으면 RATE_LIMITED + 자동 비활성·연속 5회 실패 자동 비활성·액션 묶음 원자성)는 서버와 같다.
// 예약(SCHEDULED) 트리거는 목업에 스케줄러가 없어 저장·표시만 하고 돌지 않는다.
import type {
  AutomationAction,
  AutomationRule,
  AutomationRuleInput,
  AutomationRun,
  AutomationTrigger,
  AutomationTriggerType,
  Issue,
  JiraData,
} from "../types";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_RECIPIENTS,
  AUTOMATION_SETTABLE_FIELDS,
  AUTOMATION_TRIGGER_TYPES,
  AUTOMATION_WATCH_FIELDS,
} from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { ApiError } from "../mapping";
import { parseAndCheck } from "../aql/validate";
import { evaluateAql } from "../aql/evaluate";
import { AqlError } from "../aql/types";
import { clone, load, nextId, persist, replaceDataForRollback } from "./db";
import { assertCanAdmin } from "./members";
import { aqlContext } from "./aql";
import { notificationRecipients } from "./rules";
// 순환 import — 쓰는 곳이 전부 함수 안이라 ESM 순환이어도 안전하다
import * as issues from "./issues";
import * as flags from "./planning";
import * as collab from "./collab";
import * as workflow from "./workflow";

const MAX_RULES = 100;
const MAX_DEPTH = 3;
const RATE_PER_MINUTE = 30;
const MAX_FAILURES = 5;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ── 검증(서버 AutomationSpec·AutomationRuleService와 같은 문구) ──

function validStatus(data: JiraData, projectId: string): (id: string) => boolean {
  const entry = data.projectSettings.find((e) => e.projectId === projectId);
  const body = entry?.custom ?? data.schemes.find((s) => s.id === entry?.schemeId)?.body;
  const ids = new Set((body?.statuses ?? []).map((s) => s.id));
  return (id) => ids.has(id);
}

function statuses(list: string[] | null | undefined, ok: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const id of list ?? []) {
    if (!ok(id)) throw new Error(`이 프로젝트에 없는 상태입니다: ${id}`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** 5필드(분 시 일 월 요일) 또는 6필드 cron — 분 칸이 5분보다 촘촘하면 거부 */
function normalizeCron(cron: string | null | undefined): string {
  const value = (cron ?? "").trim().replace(/\s+/g, " ");
  if (!value) throw new Error("예약 트리거에는 cron이 필요합니다");
  const parts = value.split(" ");
  if (parts.length !== 5 && parts.length !== 6) throw new Error(`cron 형식이 올바르지 않습니다: ${value}`);
  const minute = parts.length === 6 ? parts[1] : parts[0];
  if (minute === "*" || /^\*\/[1-4]$/.test(minute) || /^\d+(,\d+){12,}$/.test(minute) || /^\d+-\d+$/.test(minute)) {
    throw new Error("예약은 5분보다 자주 돌 수 없습니다");
  }
  if (parts.length === 6 && parts[0].includes("*")) throw new Error("예약은 5분보다 자주 돌 수 없습니다");
  return value;
}

function validTrigger(trigger: AutomationTrigger | null | undefined, ok: (id: string) => boolean): AutomationTrigger {
  if (!trigger?.type) throw new Error("트리거를 고르세요");
  const type = String(trigger.type).trim().toUpperCase() as AutomationTriggerType;
  if (!AUTOMATION_TRIGGER_TYPES.includes(type)) throw new Error(`모르는 트리거입니다: ${trigger.type}`);
  switch (type) {
    case "ISSUE_TRANSITIONED":
      return { type, fromStatuses: statuses(trigger.fromStatuses, ok), toStatuses: statuses(trigger.toStatuses, ok), fields: null, cron: null };
    case "FIELD_CHANGED": {
      const fields = trigger.fields ?? [];
      if (fields.length === 0) throw new Error("지켜볼 필드를 하나 이상 고르세요");
      for (const field of fields) {
        if (!(AUTOMATION_WATCH_FIELDS as readonly string[]).includes(field)) {
          throw new Error(`지켜볼 수 없는 필드입니다: ${field}`);
        }
      }
      return { type, fromStatuses: null, toStatuses: null, fields: [...new Set(fields)], cron: null };
    }
    case "SCHEDULED":
      return { type, fromStatuses: null, toStatuses: null, fields: null, cron: normalizeCron(trigger.cron) };
    default:
      return { type, fromStatuses: null, toStatuses: null, fields: null, cron: null };
  }
}

function emptyAction(type: AutomationAction["type"]): AutomationAction {
  return {
    type,
    field: null,
    value: null,
    assignee: null,
    userId: null,
    body: null,
    toStatus: null,
    add: [],
    remove: [],
    recipients: [],
    userIds: [],
    message: null,
  };
}

function validAction(data: JiraData, action: AutomationAction | null | undefined, ok: (id: string) => boolean): AutomationAction {
  if (!action?.type) throw new Error("액션 종류를 고르세요");
  const type = String(action.type).trim().toUpperCase() as AutomationAction["type"];
  if (!AUTOMATION_ACTION_TYPES.includes(type)) throw new Error(`모르는 액션입니다: ${action.type}`);
  const out = emptyAction(type);
  switch (type) {
    case "SET_FIELD": {
      const field = (action.field ?? "").trim();
      if (!(AUTOMATION_SETTABLE_FIELDS as readonly string[]).includes(field)) {
        throw new Error(`바꿀 수 없는 필드입니다: ${action.field}`);
      }
      out.field = field as AutomationAction["field"];
      const value = action.value ?? null;
      if (field === "priority") {
        if (value === null || !data.priorities.some((p) => p.id === String(value).toLowerCase())) {
          throw new Error(`없는 우선순위입니다: ${value}`);
        }
        out.value = String(value).toLowerCase();
      } else if (field === "flagged") {
        if (typeof value !== "boolean") throw new Error("플래그 값은 true 또는 false여야 합니다");
        out.value = value;
      } else if (field === "storyPoints") {
        if (value !== null && !(typeof value === "number" && value >= 0 && value <= 9999)) {
          throw new Error("스토리 포인트는 0 이상 9999 이하여야 합니다");
        }
        out.value = value;
      } else {
        if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
          throw new Error(`날짜 형식이 올바르지 않습니다: ${value}`);
        }
        out.value = value;
      }
      return out;
    }
    case "ASSIGN": {
      const assignee = action.assignee ?? "";
      if (!["reporter", "unassigned", "user"].includes(assignee)) throw new Error("담당자 지정 방법을 고르세요");
      out.assignee = assignee as AutomationAction["assignee"];
      if (assignee === "user") {
        if (!action.userId || !data.users.some((u) => u.id === action.userId)) throw new Error("담당자로 지정할 사용자를 고르세요");
        out.userId = action.userId;
      }
      return out;
    }
    case "COMMENT": {
      const body = (action.body ?? "").trim();
      if (!body) throw new Error("코멘트 내용을 입력하세요");
      if (body.length > 5000) throw new Error("코멘트는 5000자 이하여야 합니다");
      out.body = body;
      return out;
    }
    case "TRANSITION": {
      const to = (action.toStatus ?? "").trim();
      if (!to) throw new Error("옮길 상태를 고르세요");
      if (!ok(to)) throw new Error(`이 프로젝트에 없는 상태입니다: ${to}`);
      out.toStatus = to;
      return out;
    }
    case "LABELS": {
      const add = [...new Set((action.add ?? []).map((l) => l.trim()).filter(Boolean))];
      const remove = [...new Set((action.remove ?? []).map((l) => l.trim()).filter(Boolean))];
      if (add.length === 0 && remove.length === 0) throw new Error("더하거나 뺄 라벨을 넣으세요");
      out.add = add;
      out.remove = remove;
      return out;
    }
    case "NOTIFY": {
      const recipients = [...new Set(action.recipients ?? [])];
      for (const r of recipients) {
        if (!(AUTOMATION_RECIPIENTS as readonly string[]).includes(r)) throw new Error(`모르는 알림 대상입니다: ${r}`);
      }
      const userIds = [...new Set(action.userIds ?? [])];
      if (recipients.length === 0 && userIds.length === 0) throw new Error("알릴 사람을 하나 이상 고르세요");
      const message = (action.message ?? "").trim();
      if (!message) throw new Error("알림 문장을 입력하세요");
      if (message.length > 200) throw new Error("알림 문장은 200자 이하여야 합니다");
      out.recipients = recipients;
      out.userIds = userIds;
      out.message = message;
      return out;
    }
  }
  return out;
}

function validRule(data: JiraData, projectId: string, input: AutomationRuleInput) {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("규칙 이름을 입력하세요");
  if (name.length > 80) throw new Error("규칙 이름은 80자 이하여야 합니다");
  const description = (input.description ?? "").trim();
  if (description.length > 500) throw new Error("설명은 500자 이하여야 합니다");
  const ok = validStatus(data, projectId);
  const trigger = validTrigger(input.trigger, ok);
  const condition = (input.condition ?? "").trim();
  if (trigger.type === "SCHEDULED" && !condition) throw new Error("예약 트리거에는 조건(AQL)이 필요합니다");
  if (condition) parseAndCheck(condition); // 문법 오류는 AqlError(400 + position)
  const actions = input.actions ?? [];
  if (actions.length === 0) throw new Error("액션을 하나 이상 넣으세요");
  if (actions.length > 10) throw new Error("액션은 10개까지 넣을 수 있습니다");
  return {
    name,
    description,
    enabled: input.enabled ?? true,
    trigger,
    condition,
    actions: actions.map((a) => validAction(data, a, ok)),
    allowRuleTrigger: input.allowRuleTrigger ?? false,
  };
}

function requireRule(data: JiraData, ruleId: string): AutomationRule {
  const rule = data.automationRules.find((r) => r.id === ruleId);
  if (!rule) throw new ApiError(404, "자동화 규칙을 찾을 수 없습니다");
  return rule;
}

// ── 공개 CRUD ────────────────────────────────────────────────

export async function listAutomationRules(projectId: string): Promise<AutomationRule[]> {
  const data = load();
  assertCanAdmin(data, projectId);
  return clone(data.automationRules.filter((r) => r.projectId === projectId));
}

export async function getAutomationRule(ruleId: string): Promise<AutomationRule> {
  const data = load();
  const rule = requireRule(data, ruleId);
  assertCanAdmin(data, rule.projectId);
  return clone(rule);
}

export async function createAutomationRule(projectId: string, input: AutomationRuleInput): Promise<AutomationRule> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, projectId);
  if (data.automationRules.filter((r) => r.projectId === projectId).length >= MAX_RULES) {
    throw new Error(`자동화 규칙은 프로젝트당 ${MAX_RULES}개까지 만들 수 있습니다`);
  }
  const body = validRule(data, projectId, input);
  const now = new Date().toISOString();
  const rule: AutomationRule = {
    id: nextId(),
    projectId,
    ...body,
    disabledReason: null,
    actorId: CURRENT_USER_ID,
    createdBy: CURRENT_USER_ID,
    nextRunAt: null,
    lastRunAt: null,
    consecutiveFailures: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  data.automationRules.push(rule);
  persist();
  return clone(rule);
}

/** 통째로 고치기 — 켜서 저장하면 자동 비활성 사유·연속 실패를 지운다. 실행 주체는 저장한 사람으로 바뀐다 */
export async function updateAutomationRule(
  ruleId: string,
  input: AutomationRuleInput,
  expectedVersion: number,
): Promise<AutomationRule> {
  const data = load();
  const rule = requireRule(data, ruleId);
  assertCanAdmin(data, rule.projectId);
  if (rule.version !== expectedVersion) {
    throw new ApiError(409, "다른 사용자가 먼저 이 규칙을 수정했습니다");
  }
  const body = validRule(data, rule.projectId, input);
  Object.assign(rule, body);
  if (rule.enabled) {
    rule.disabledReason = null;
    rule.consecutiveFailures = 0;
  }
  rule.actorId = CURRENT_USER_ID;
  rule.version += 1;
  rule.updatedAt = new Date().toISOString();
  persist();
  return clone(rule);
}

/** 지우기 — 실행 이력도 함께 */
export async function deleteAutomationRule(ruleId: string): Promise<void> {
  const data = load();
  const rule = requireRule(data, ruleId);
  assertCanAdmin(data, rule.projectId);
  data.automationRules = data.automationRules.filter((r) => r.id !== ruleId);
  data.automationRuns = data.automationRuns.filter((r) => r.ruleId !== ruleId);
  persist();
}

const latestFirst = (a: AutomationRun, b: AutomationRun) => b.startedAt.localeCompare(a.startedAt);

export async function listAutomationRuleRuns(ruleId: string, limit = 50): Promise<AutomationRun[]> {
  const data = load();
  const rule = requireRule(data, ruleId);
  assertCanAdmin(data, rule.projectId);
  const cap = Math.min(200, Math.max(1, limit));
  return clone(data.automationRuns.filter((r) => r.ruleId === ruleId).sort(latestFirst).slice(0, cap));
}

export async function listProjectAutomationRuns(projectId: string, limit = 50): Promise<AutomationRun[]> {
  const data = load();
  assertCanAdmin(data, projectId);
  const cap = Math.min(200, Math.max(1, limit));
  return clone(data.automationRuns.filter((r) => r.projectId === projectId).sort(latestFirst).slice(0, cap));
}

// ── 실행 엔진 ────────────────────────────────────────────────

/** 트리거·조건이 보는 이슈 값 — 변경 전 스냅숏 */
export type AutomationSnapshot = Pick<
  Issue,
  | "title" | "description" | "type" | "status" | "priority" | "assigneeId" | "parentId" | "sprintId" | "dueDate"
  | "estimateHours" | "resolution" | "fixVersionId" | "labels" | "componentIds" | "startDate" | "storyPoints"
  | "flagged" | "triageState"
>;

export function snapshotForAutomation(issue: Issue): AutomationSnapshot {
  return {
    title: issue.title,
    description: issue.description,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assigneeId,
    parentId: issue.parentId,
    sprintId: issue.sprintId,
    dueDate: issue.dueDate,
    estimateHours: issue.estimateHours,
    resolution: issue.resolution,
    fixVersionId: issue.fixVersionId,
    labels: [...issue.labels],
    componentIds: [...(issue.componentIds ?? [])],
    startDate: issue.startDate ?? null,
    storyPoints: issue.storyPoints ?? null,
    flagged: Boolean(issue.flagged),
    triageState: issue.triageState ?? null,
  };
}

const FIELD_OF: Record<string, (s: AutomationSnapshot) => unknown> = {
  title: (s) => s.title,
  description: (s) => s.description,
  type: (s) => s.type,
  status: (s) => s.status,
  priority: (s) => s.priority,
  assignee: (s) => s.assigneeId,
  parent: (s) => s.parentId,
  sprint: (s) => s.sprintId,
  dueDate: (s) => s.dueDate,
  estimate: (s) => s.estimateHours,
  resolution: (s) => s.resolution,
  fixVersion: (s) => s.fixVersionId,
  labels: (s) => s.labels.join("\u0000"),
  components: (s) => (s.componentIds ?? []).join("\u0000"),
  startDate: (s) => s.startDate,
  storyPoints: (s) => s.storyPoints,
  flagged: (s) => s.flagged,
  triage: (s) => s.triageState !== null,
};

function changedFields(before: AutomationSnapshot, after: AutomationSnapshot): string[] {
  return Object.keys(FIELD_OF).filter((field) => FIELD_OF[field](before) !== FIELD_OF[field](after));
}

/** 같은 연쇄의 상태 — 깊이와 이미 돈 (규칙, 이슈) */
let chainDepth = 0;
let chainSeen: Set<string> | null = null;

function triggerMatches(trigger: AutomationTrigger, created: boolean, changed: string[], before: AutomationSnapshot | null, after: AutomationSnapshot, kind: IssueEventKind): boolean {
  // 커밋 연결은 필드 변경이 아니다 — COMMIT_LINKED만 깨운다(서버 AutomationListener와 같다)
  if (kind === "commit_linked") return trigger.type === "COMMIT_LINKED";
  switch (trigger.type) {
    case "ISSUE_CREATED":
      return created;
    case "ISSUE_TRANSITIONED": {
      if (created || !before || before.status === after.status) return false;
      const from = trigger.fromStatuses ?? [];
      const to = trigger.toStatuses ?? [];
      return (from.length === 0 || from.includes(before.status)) && (to.length === 0 || to.includes(after.status));
    }
    case "FIELD_CHANGED":
      return !created && (trigger.fields ?? []).some((f) => changed.includes(f));
    default:
      return false; // SCHEDULED는 목업에서 돌지 않는다
  }
}

function conditionMatches(data: JiraData, rule: AutomationRule, issue: Issue): boolean {
  if (!rule.condition.trim()) return true;
  try {
    const ast = parseAndCheck(rule.condition);
    return evaluateAql({ where: ast.where, orderBy: [] }, [issue], aqlContext(data)).length > 0;
  } catch (error) {
    if (error instanceof AqlError) return false;
    throw error;
  }
}

function record(
  rule: AutomationRule,
  issue: Issue,
  outcome: AutomationRun["outcome"],
  depth: number,
  actionsRun: number,
  message: string | null,
  startedAt: string,
): void {
  const data = load();
  const now = Date.now();
  data.automationRuns = data.automationRuns.filter((r) => now - Date.parse(r.startedAt) < RUN_RETENTION_MS);
  data.automationRuns.push({
    id: nextId(),
    ruleId: rule.id,
    projectId: rule.projectId,
    issueId: issue.id,
    issueKey: issue.key,
    triggerType: rule.trigger.type,
    outcome,
    depth,
    actionsRun,
    message,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
}

function liveRule(ruleId: string): AutomationRule | undefined {
  return load().automationRules.find((r) => r.id === ruleId);
}

/** 액션 하나 — 사람과 같은 스토어 경로를 탄다(권한·워크플로·검증·이력·알림) */
async function runAction(action: AutomationAction, issueId: string, rule: AutomationRule): Promise<void> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  switch (action.type) {
    case "SET_FIELD": {
      if (action.field === "flagged") {
        await flags.setIssueFlag(issueId, Boolean(action.value));
        return;
      }
      const patch: Parameters<typeof issues.updateIssue>[1] = {};
      if (action.field === "priority") patch.priority = String(action.value);
      if (action.field === "dueDate") patch.dueDate = (action.value as string | null) ?? null;
      if (action.field === "startDate") patch.startDate = (action.value as string | null) ?? null;
      if (action.field === "storyPoints") patch.storyPoints = (action.value as number | null) ?? null;
      await issues.updateIssue(issueId, patch, issue.version);
      return;
    }
    case "ASSIGN": {
      const assigneeId = action.assignee === "reporter" ? issue.reporterId : action.assignee === "user" ? (action.userId ?? null) : null;
      await issues.updateIssue(issueId, { assigneeId }, issue.version);
      return;
    }
    case "COMMENT": {
      const fresh = load();
      collab.addCommentInternal(fresh, fresh.issues.find((i) => i.id === issueId)!, action.body ?? "", rule.actorId);
      persist();
      return;
    }
    case "TRANSITION": {
      const options = await workflow.listIssueTransitions(issueId);
      const first = options.transitions.find((t) => t.to === action.toStatus && t.available);
      if (!first) {
        const blocked = options.transitions.find((t) => t.to === action.toStatus);
        if (blocked?.unavailableReason) throw new Error(blocked.unavailableReason);
        if (issue.status === action.toStatus) return;
        throw new Error(`갈 수 있는 전환이 없습니다: ${action.toStatus}`);
      }
      await workflow.transitionIssue(issueId, { transitionId: first.id });
      return;
    }
    case "LABELS": {
      const labels = issue.labels.filter((l) => !(action.remove ?? []).includes(l));
      for (const label of action.add ?? []) if (!labels.includes(label)) labels.push(label);
      await issues.updateIssue(issueId, { labels }, issue.version);
      return;
    }
    case "NOTIFY": {
      const fresh = load();
      const target = fresh.issues.find((i) => i.id === issueId)!;
      const recipients = new Set<string>(action.userIds ?? []);
      for (const r of action.recipients ?? []) {
        if (r === "assignee" && target.assigneeId) recipients.add(target.assigneeId);
        if (r === "reporter") recipients.add(target.reporterId);
        if (r === "watchers") for (const id of notificationRecipients(fresh, target, "")) recipients.add(id);
      }
      const at = new Date().toISOString();
      for (const userId of recipients) {
        fresh.notifications.push({
          id: nextId(),
          type: "automation",
          userId,
          issueId: target.id,
          issueKey: target.key,
          actorId: rule.actorId,
          message: action.message ?? "",
          at,
          read: false,
        });
      }
      persist();
      return;
    }
  }
}

/**
 * 이슈 변경 알림 — 사람이든 규칙이든 이슈를 바꾼 경로가 **저장 뒤** 부른다. `before`가 null이면 생성.
 * 규칙이 만든 변경(연쇄 깊이 > 0)은 `allowRuleTrigger` 규칙만 깨운다.
 */
type IssueEventKind = "change" | "commit_linked";

/** 커밋이 이슈에 새로 이어졌다(V41) — 자동화 COMMIT_LINKED */
export async function emitCommitLinked(issueId: string): Promise<void> {
  await emitIssueEvent(issueId, null, null, "commit_linked");
}

export async function emitIssueEvent(
  issueId: string,
  before: AutomationSnapshot | null,
  _transitionId: string | null = null,
  kind: IssueEventKind = "change",
): Promise<void> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) return;
  const rules = data.automationRules.filter((r) => r.projectId === issue.projectId && r.enabled);
  if (rules.length === 0) return;
  const after = snapshotForAutomation(issue);
  const created = before === null && kind === "change";
  const changed = before ? changedFields(before, after) : [];
  if (kind === "change" && !created && changed.length === 0) return;
  const outermost = chainSeen === null;
  if (outermost) chainSeen = new Set();
  try {
    for (const candidate of rules) {
      const rule = liveRule(candidate.id);
      if (!rule?.enabled) continue;
      if (chainDepth > 0 && !rule.allowRuleTrigger) continue;
      if (!triggerMatches(rule.trigger, created, changed, before, after, kind)) continue;
      const current = load().issues.find((i) => i.id === issueId);
      if (!current || !conditionMatches(load(), rule, current)) continue;
      const startedAt = new Date().toISOString();
      const depth = chainDepth + 1;
      const key = `${rule.id}:${issueId}`;
      if (depth > MAX_DEPTH || chainSeen!.has(key)) {
        record(rule, current, "LOOP_BLOCKED", depth, 0, depth > MAX_DEPTH ? `연쇄 깊이 ${MAX_DEPTH}단계를 넘었습니다` : "같은 연쇄에서 이미 실행한 규칙입니다", startedAt);
        persist();
        continue;
      }
      const minuteAgo = Date.now() - 60_000;
      const recent = load().automationRuns.filter((r) => r.ruleId === rule.id && Date.parse(r.startedAt) >= minuteAgo).length;
      if (recent >= RATE_PER_MINUTE) {
        rule.enabled = false;
        rule.disabledReason = `실행 상한(분당 ${RATE_PER_MINUTE}회)을 넘어 자동으로 껐습니다`;
        record(rule, current, "RATE_LIMITED", depth, 0, rule.disabledReason, startedAt);
        persist();
        continue;
      }
      chainSeen!.add(key);
      const snapshot = structuredClone(load());
      let actionsRun = 0;
      chainDepth += 1;
      try {
        for (const action of rule.actions) {
          await runAction(action, issueId, rule);
          actionsRun += 1;
        }
        chainDepth -= 1;
        const live = liveRule(rule.id);
        if (live) {
          live.consecutiveFailures = 0;
          live.lastRunAt = new Date().toISOString();
          record(live, current, "SUCCESS", depth, actionsRun, null, startedAt);
        }
        persist();
      } catch (error) {
        chainDepth -= 1;
        // 한 실행의 액션은 한 묶음 — 하나라도 실패하면 이 규칙이 만든 변경을 전부 되돌린다
        replaceDataForRollback(snapshot);
        const live = liveRule(rule.id);
        if (live) {
          live.consecutiveFailures += 1;
          live.lastRunAt = new Date().toISOString();
          if (live.consecutiveFailures >= MAX_FAILURES) {
            live.enabled = false;
            live.disabledReason = `연속 ${MAX_FAILURES}회 실패해 자동으로 껐습니다`;
          }
          record(live, current, "FAILED", depth, actionsRun, error instanceof Error ? error.message : String(error), startedAt);
        }
        persist();
      }
    }
  } finally {
    if (outermost) chainSeen = null;
  }
}

/** 테스트 전용 — 연쇄 상태 초기화 */
export function resetAutomationMockState(): void {
  chainDepth = 0;
  chainSeen = null;
}
