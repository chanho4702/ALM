// alm-backend REST 어댑터 — 자동화 규칙(V36·V37). 관리·이력 조회는 프로젝트 ADMIN만(서버가 강제)
import type {
  AutomationAction,
  AutomationOutcome,
  AutomationRule,
  AutomationRuleInput,
  AutomationRun,
  AutomationTrigger,
  AutomationTriggerType,
} from "../types";
import { toBackendId } from "../mapping";
import { json, jsonBody, postJson, searchParams, sharedApiFetch, sharedGet } from "./http";

interface ActionDto extends Omit<AutomationAction, "userId" | "userIds"> {
  userId?: number | null;
  userIds?: number[] | null;
}

interface RuleDto {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  enabled: boolean;
  disabledReason: string | null;
  trigger: AutomationTrigger;
  condition: string | null;
  actions: ActionDto[] | null;
  allowRuleTrigger: boolean;
  actorId: number;
  createdBy: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  consecutiveFailures: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface RunDto {
  id: number;
  ruleId: number;
  projectId: number;
  issueId: number | null;
  issueKey: string | null;
  triggerType: AutomationTriggerType;
  outcome: AutomationOutcome;
  depth: number;
  actionsRun: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** 사용자 id만 경계에서 바꾼다 — 나머지는 서버 어휘 그대로(닫힌 어휘라 매핑할 게 없다) */
function mapAction(dto: ActionDto): AutomationAction {
  return {
    ...dto,
    userId: dto.userId == null ? null : String(dto.userId),
    userIds: (dto.userIds ?? []).map(String),
  };
}

function toActionDto(action: AutomationAction): ActionDto {
  const { userId, userIds, ...rest } = action;
  return {
    ...rest,
    userId: userId ? toBackendId(userId) : null,
    userIds: (userIds ?? []).map(toBackendId),
  };
}

function mapRule(dto: RuleDto): AutomationRule {
  return {
    id: String(dto.id),
    projectId: String(dto.projectId),
    name: dto.name,
    description: dto.description ?? "",
    enabled: Boolean(dto.enabled),
    disabledReason: dto.disabledReason ?? null,
    trigger: {
      type: dto.trigger?.type,
      fromStatuses: dto.trigger?.fromStatuses ?? [],
      toStatuses: dto.trigger?.toStatuses ?? [],
      fields: dto.trigger?.fields ?? [],
      cron: dto.trigger?.cron ?? null,
    },
    condition: dto.condition ?? "",
    actions: (dto.actions ?? []).map(mapAction),
    allowRuleTrigger: Boolean(dto.allowRuleTrigger),
    actorId: String(dto.actorId),
    createdBy: String(dto.createdBy),
    nextRunAt: dto.nextRunAt ?? null,
    lastRunAt: dto.lastRunAt ?? null,
    consecutiveFailures: dto.consecutiveFailures ?? 0,
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function mapRun(dto: RunDto): AutomationRun {
  return {
    id: String(dto.id),
    ruleId: String(dto.ruleId),
    projectId: String(dto.projectId),
    issueId: dto.issueId == null ? null : String(dto.issueId),
    issueKey: dto.issueKey ?? null,
    triggerType: dto.triggerType,
    outcome: dto.outcome,
    depth: dto.depth ?? 1,
    actionsRun: dto.actionsRun ?? 0,
    message: dto.message ?? null,
    startedAt: dto.startedAt,
    finishedAt: dto.finishedAt ?? null,
  };
}

function ruleBody(input: AutomationRuleInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? "",
    enabled: input.enabled ?? true,
    trigger: input.trigger,
    condition: input.condition?.trim() ? input.condition.trim() : null,
    actions: input.actions.map(toActionDto),
    allowRuleTrigger: input.allowRuleTrigger ?? false,
  };
}

export async function listAutomationRules(projectId: string): Promise<AutomationRule[]> {
  return (await sharedGet<RuleDto[]>(`/api/alm/projects/${toBackendId(projectId)}/automation/rules`)).map(mapRule);
}

export async function getAutomationRule(ruleId: string): Promise<AutomationRule> {
  return mapRule(await json<RuleDto>(await sharedApiFetch(`/api/alm/automation/rules/${toBackendId(ruleId)}`)));
}

export async function createAutomationRule(projectId: string, input: AutomationRuleInput): Promise<AutomationRule> {
  return mapRule(
    await json<RuleDto>(
      await sharedApiFetch(`/api/alm/projects/${toBackendId(projectId)}/automation/rules`, postJson(ruleBody(input))),
    ),
  );
}

/** 통째로 고치기 — `expectedVersion`이 어긋나면 409 */
export async function updateAutomationRule(
  ruleId: string,
  input: AutomationRuleInput,
  expectedVersion: number,
): Promise<AutomationRule> {
  return mapRule(
    await json<RuleDto>(
      await sharedApiFetch(
        `/api/alm/automation/rules/${toBackendId(ruleId)}`,
        jsonBody({ ...ruleBody(input), expectedVersion }),
      ),
    ),
  );
}

export async function deleteAutomationRule(ruleId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/alm/automation/rules/${toBackendId(ruleId)}`, { method: "DELETE" }));
}

export async function listAutomationRuleRuns(ruleId: string, limit = 50): Promise<AutomationRun[]> {
  const query = searchParams({ limit: String(limit) });
  return (await sharedGet<RunDto[]>(`/api/alm/automation/rules/${toBackendId(ruleId)}/runs?${query}`)).map(mapRun);
}

export async function listProjectAutomationRuns(projectId: string, limit = 50): Promise<AutomationRun[]> {
  const query = searchParams({ limit: String(limit) });
  return (await sharedGet<RunDto[]>(`/api/alm/projects/${toBackendId(projectId)}/automation/runs?${query}`)).map(mapRun);
}
