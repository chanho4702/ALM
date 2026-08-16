import type { Issue, IssuePriority, IssueType, Project } from "./types";

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

export function toApiIssuePriority(priority: IssuePriority): IssuePriorityDto {
  return PRIORITIES_TO_API[priority];
}

/**
 * 현재 alm-backend가 아직 저장하지 않는 필드는 화면 계약을 깨지 않도록 기본값으로 채운다.
 * 이 기본값 때문에 jiraStore 런타임 전환은 서버 필드 확장 전까지 활성화하지 않는다.
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
    sprintId: null,
    parentId: null,
    dueDate: null,
    estimateHours: null,
    labels: [],
    order,
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
