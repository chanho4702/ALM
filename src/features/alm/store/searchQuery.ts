import type { IssuePriority, IssueStatus, IssueType, Project, User } from "./types";

/**
 * ALM 스마트 검색의 쿼리 모델 — 추후 jira-service GraphQL 쿼리 인자로 1:1 매핑된다.
 * 배열 필드는 빈 배열 = 전체(필터 없음), 다중 값 = OR, 필드 간 = AND.
 */
export interface IssueQuery {
  text: string;
  projectIds: string[];
  /** 카테고리 매치 (할일/진행중/완료) — 커스텀 상태도 카테고리로 걸린다 */
  statuses: IssueStatus[];
  /** 상태 이름 매치 → 워크플로 상태 id 목록 (커스텀 상태 이름 검색) */
  statusIds: string[];
  priorities: IssuePriority[];
  types: IssueType[];
  assigneeIds: string[]; // "unassigned" 센티널 = 미지정
  labels: string[];
  sort: "updated" | "created" | "due" | "priority";
}

export const EMPTY_QUERY: IssueQuery = {
  text: "",
  projectIds: [],
  statuses: [],
  statusIds: [],
  priorities: [],
  types: [],
  assigneeIds: [],
  labels: [],
  sort: "updated",
};

export interface QueryContext {
  users: User[];
  projects: Project[];
  /** 전체 워크플로 상태(스킴+커스텀 합집합) — 상태 이름 검색용. 없으면 카테고리만 매치 */
  statuses?: { id: string; name: string }[];
}

// 한국어 라벨 ↔ 값 매핑 (스마트 구문의 어휘)
const STATUS_BY_LABEL: Record<string, IssueStatus> = {
  할일: "todo",
  "할 일": "todo",
  진행중: "inprogress",
  "진행 중": "inprogress",
  완료: "done",
};
const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "할일",
  inprogress: "진행중",
  done: "완료",
};

const PRIORITY_BY_LABEL: Record<string, IssuePriority> = {
  높음: "high",
  보통: "medium",
  낮음: "low",
};
const PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const TYPE_BY_LABEL: Record<string, IssueType> = {
  작업: "task",
  스토리: "story",
  버그: "bug",
  에픽: "epic",
  하위작업: "subtask",
  "하위 작업": "subtask",
};
const TYPE_LABELS: Record<IssueType, string> = {
  task: "작업",
  story: "스토리",
  bug: "버그",
  epic: "에픽",
  subtask: "하위작업",
};

const SORT_BY_LABEL: Record<string, IssueQuery["sort"]> = {
  수정: "updated",
  생성: "created",
  마감: "due",
  우선순위: "priority",
};
const SORT_LABELS: Record<IssueQuery["sort"], string> = {
  updated: "수정",
  created: "생성",
  due: "마감",
  priority: "우선순위",
};

/** 토큰 접두어 — `상태:진행중` 형식 */
const TOKEN_PREFIXES = ["상태", "우선순위", "타입", "담당", "라벨", "프로젝트", "정렬"] as const;

const push = <T,>(list: T[], value: T) => {
  if (!list.includes(value)) list.push(value);
};

/**
 * 스마트 문자열 → IssueQuery.
 * 인식할 수 없는 토큰 값은 버리지 않고 텍스트 검색어로 취급한다 (입력을 잃지 않는다).
 */
export function parseSmartQuery(input: string, ctx: QueryContext): IssueQuery {
  const query: IssueQuery = {
    ...EMPTY_QUERY,
    projectIds: [],
    statuses: [],
    statusIds: [],
    priorities: [],
    types: [],
    assigneeIds: [],
    labels: [],
  };
  const textParts: string[] = [];

  for (const raw of input.split(/\s+/)) {
    if (!raw) continue;
    const colon = raw.indexOf(":");
    const prefix = colon > 0 ? raw.slice(0, colon) : null;
    const value = colon > 0 ? raw.slice(colon + 1) : raw;

    if (!prefix || !(TOKEN_PREFIXES as readonly string[]).includes(prefix) || !value) {
      textParts.push(raw);
      continue;
    }
    switch (prefix) {
      case "상태": {
        const status = STATUS_BY_LABEL[value];
        if (status) {
          push(query.statuses, status);
          break;
        }
        // 커스텀 상태 이름 매치 (예: 상태:리뷰) — 같은 이름의 상태 id 전부
        // 토큰은 공백을 못 담으므로 "코드 리뷰" → 상태:코드리뷰 형태도 받는다
        const named =
          ctx.statuses?.filter(
            (s) => s.name === value || s.name.replace(/\s+/g, "") === value,
          ) ?? [];
        if (named.length > 0) {
          for (const s of named) push(query.statusIds, s.id);
        } else {
          textParts.push(raw);
        }
        break;
      }
      case "우선순위": {
        const priority = PRIORITY_BY_LABEL[value];
        if (priority) push(query.priorities, priority);
        else textParts.push(raw);
        break;
      }
      case "타입": {
        const type = TYPE_BY_LABEL[value];
        if (type) push(query.types, type);
        else textParts.push(raw);
        break;
      }
      case "담당": {
        if (value === "미지정") {
          push(query.assigneeIds, "unassigned");
          break;
        }
        const user = ctx.users.find((u) => u.name === value);
        if (user) push(query.assigneeIds, user.id);
        else textParts.push(raw);
        break;
      }
      case "라벨":
        push(query.labels, value);
        break;
      case "프로젝트": {
        const project = ctx.projects.find(
          (p) => p.key === value.toUpperCase() || p.name === value,
        );
        if (project) push(query.projectIds, project.id);
        else textParts.push(raw);
        break;
      }
      case "정렬": {
        const sort = SORT_BY_LABEL[value];
        if (sort) query.sort = sort;
        else textParts.push(raw);
        break;
      }
    }
  }
  query.text = textParts.join(" ");
  return query;
}

/** IssueQuery → 스마트 문자열 (parseSmartQuery와 라운드트립) */
export function serializeQuery(query: IssueQuery, ctx: QueryContext): string {
  const parts: string[] = [];
  for (const id of query.projectIds) {
    const project = ctx.projects.find((p) => p.id === id);
    if (project) parts.push(`프로젝트:${project.key}`);
  }
  for (const status of query.statuses) parts.push(`상태:${STATUS_LABELS[status]}`);
  for (const id of query.statusIds) {
    const named = ctx.statuses?.find((s) => s.id === id);
    if (named) parts.push(`상태:${named.name.replace(/\s+/g, "")}`); // 토큰은 공백 불가 — 파서가 공백 제거 이름도 매치
  }
  for (const priority of query.priorities) parts.push(`우선순위:${PRIORITY_LABELS[priority]}`);
  for (const type of query.types) parts.push(`타입:${TYPE_LABELS[type]}`);
  for (const id of query.assigneeIds) {
    if (id === "unassigned") {
      parts.push("담당:미지정");
      continue;
    }
    const user = ctx.users.find((u) => u.id === id);
    if (user) parts.push(`담당:${user.name}`);
  }
  for (const label of query.labels) parts.push(`라벨:${label}`);
  if (query.sort !== "updated") parts.push(`정렬:${SORT_LABELS[query.sort]}`);
  if (query.text.trim()) parts.push(query.text.trim());
  return parts.join(" ");
}

/** 조건 칩 표시용 — 파싱된 쿼리를 [토큰 문자열] 목록으로 (text 제외) */
export function queryTokens(query: IssueQuery, ctx: QueryContext): string[] {
  const withoutText = { ...query, text: "" };
  return serializeQuery(withoutText, ctx).split(" ").filter(Boolean);
}
