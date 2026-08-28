import type { ChangeField, Issue, IssueChange, IssuePriority, IssueType, Project, Sprint } from "./types";

export interface ProjectDto {
  id: number;
  key: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type IssueTypeDto = "TASK" | "STORY" | "BUG" | "EPIC" | "SUBTASK";
export type IssuePriorityDto = "HIGH" | "MEDIUM" | "LOW";

export interface IssueDto {
  id: number;
  key: string;
  projectId: number;
  title: string;
  description: string | null;
  type: IssueTypeDto;
  status: string;
  priority: IssuePriorityDto;
  assigneeId: number | null;
  reporterId: number;
  parentId?: number | null;
  sprintId?: number | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  labels?: string[] | null;
  order?: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function toBackendId(id: string): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`잘못된 백엔드 id: ${id}`);
  }
  return value;
}

export function mapProject(dto: ProjectDto): Project {
  return {
    id: String(dto.id),
    key: dto.key,
    name: dto.name,
    description: dto.description ?? "",
    createdAt: dto.createdAt,
  };
}

const ISSUE_TYPES_FROM_API: Record<IssueTypeDto, IssueType> = {
  TASK: "task",
  STORY: "story",
  BUG: "bug",
  EPIC: "epic",
  SUBTASK: "subtask",
};

const ISSUE_TYPES_TO_API: Record<IssueType, IssueTypeDto> = {
  task: "TASK",
  story: "STORY",
  bug: "BUG",
  epic: "EPIC",
  subtask: "SUBTASK",
};

const PRIORITIES_FROM_API: Record<IssuePriorityDto, IssuePriority> = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

const PRIORITIES_TO_API: Record<IssuePriority, IssuePriorityDto> = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export function toApiIssueType(type: IssueType): IssueTypeDto {
  return ISSUE_TYPES_TO_API[type];
}

export interface SprintDto {
  id: number;
  projectId: number;
  name: string;
  state: "PLANNED" | "ACTIVE" | "DONE";
  goal?: string | null;
  /** "YYYY-MM-DD" — 서버 LocalDate */
  plannedStart?: string | null;
  plannedEnd?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const SPRINT_STATES_FROM_API: Record<SprintDto["state"], Sprint["state"]> = {
  PLANNED: "planned",
  ACTIVE: "active",
  DONE: "done",
};

export function mapSprint(dto: SprintDto): Sprint {
  const sprint: Sprint = {
    id: String(dto.id),
    projectId: String(dto.projectId),
    name: dto.name,
    state: SPRINT_STATES_FROM_API[dto.state],
  };
  if (dto.goal) sprint.goal = dto.goal;
  if (dto.plannedStart) sprint.plannedStart = dto.plannedStart;
  if (dto.plannedEnd) sprint.plannedEnd = dto.plannedEnd;
  if (dto.startedAt) sprint.startedAt = dto.startedAt;
  if (dto.completedAt) sprint.completedAt = dto.completedAt;
  return sprint;
}

export interface IssueChangeDto {
  id: number;
  issueId: number;
  projectId: number;
  sprintId?: number | null;
  field: "STATUS" | "SPRINT";
  fromValue?: string | null;
  toValue?: string | null;
  actorId: number;
  changedAt: string;
}

const CHANGE_FIELDS_FROM_API: Record<IssueChangeDto["field"], ChangeField> = {
  STATUS: "status",
  SPRINT: "sprint",
};

/** 서버 이력 → 화면 모델. id는 문자열로, 시각 필드 이름은 `at`으로 맞춘다 */
export function mapIssueChange(dto: IssueChangeDto): IssueChange {
  return {
    id: String(dto.id),
    issueId: String(dto.issueId),
    projectId: String(dto.projectId),
    sprintId: dto.sprintId == null ? null : String(dto.sprintId),
    field: CHANGE_FIELDS_FROM_API[dto.field],
    fromValue: dto.fromValue ?? null,
    toValue: dto.toValue ?? null,
    actorId: String(dto.actorId),
    at: dto.changedAt,
  };
}

export function toApiChangeField(field: ChangeField): IssueChangeDto["field"] {
  return field === "status" ? "STATUS" : "SPRINT";
}

export function toApiIssuePriority(priority: IssuePriority): IssuePriorityDto {
  return PRIORITIES_TO_API[priority];
}

/**
 * V2 이전 응답에 확장 필드가 없으면 화면 계약을 깨지 않도록 기본값으로 채운다.
 */
export function mapIssue(dto: IssueDto, order = 1): Issue {
  const type = ISSUE_TYPES_FROM_API[dto.type];
  const priority = PRIORITIES_FROM_API[dto.priority];
  if (!type) throw new Error(`지원하지 않는 이슈 타입입니다: ${dto.type}`);
  if (!priority) throw new Error(`지원하지 않는 우선순위입니다: ${dto.priority}`);
  return {
    id: String(dto.id),
    key: dto.key,
    projectId: String(dto.projectId),
    title: dto.title,
    description: dto.description ?? "",
    type,
    status: dto.status,
    priority,
    assigneeId: dto.assigneeId === null ? null : String(dto.assigneeId),
    reporterId: String(dto.reporterId),
    sprintId: dto.sprintId == null ? null : String(dto.sprintId),
    parentId: dto.parentId == null ? null : String(dto.parentId),
    dueDate: dto.dueDate ?? null,
    estimateHours: dto.estimateHours ?? null,
    labels: dto.labels ? [...dto.labels] : [],
    order: dto.order ?? order,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function extractApiError(status: number, body: unknown): string {
  const error = body as { error?: unknown; message?: unknown } | null;
  if (typeof error?.error === "string" && error.error) return error.error;
  if (typeof error?.message === "string" && error.message) return error.message;
  if (status === 409) return "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.";
  if (status === 403) return "권한이 없습니다.";
  if (status === 404) return "찾을 수 없습니다.";
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인하세요.";
  return `요청 실패(${status})`;
}
