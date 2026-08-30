import type { Issue, IssuePriority, IssueTypeDef, User, WorkflowStatus } from "./types";

/** CSV 변환에 필요한 이름표 — 화면이 이미 들고 있는 목록을 그대로 넘긴다 */
export interface CsvContext {
  statuses: WorkflowStatus[];
  users: User[];
  types: IssueTypeDef[];
}

// ── RFC 4180 파서/직렬화 ──────────────────────────────────

/** 따옴표·콤마·줄바꿈이 든 셀을 읽는다. BOM과 빈 줄은 버린다 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const escapeCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

// ── 이슈 → CSV ────────────────────────────────────────────

export const CSV_HEADERS = [
  "키",
  "제목",
  "타입",
  "상태",
  "우선순위",
  "담당자",
  "보고자",
  "라벨",
  "마감일",
  "예상 시간",
  "생성일",
  "수정일",
  "설명",
] as const;

const PRIORITY_KO: Record<IssuePriority, string> = { high: "높음", medium: "보통", low: "낮음" };

/** 사람이 읽는 이름(상태·담당자·타입)으로 내보낸다 — 다시 읽을 때도 같은 이름을 알아듣는다 */
export function issuesToCsv(issues: Issue[], ctx: CsvContext): string {
  const statusName = (id: string) => ctx.statuses.find((s) => s.id === id)?.name ?? id;
  const userName = (id: string | null) =>
    id === null ? "" : (ctx.users.find((u) => u.id === id)?.name ?? id);
  const typeName = (id: string) => ctx.types.find((t) => t.id === id)?.name ?? id;
  const rows = issues.map((issue) => [
    issue.key,
    issue.title,
    typeName(issue.type),
    statusName(issue.status),
    PRIORITY_KO[issue.priority],
    userName(issue.assigneeId),
    userName(issue.reporterId),
    issue.labels.join(";"),
    issue.dueDate ?? "",
    issue.estimateHours === null ? "" : String(issue.estimateHours),
    issue.createdAt.slice(0, 10),
    issue.updatedAt.slice(0, 10),
    issue.description,
  ]);
  return "﻿" + toCsv([[...CSV_HEADERS], ...rows]);
}

// ── CSV → 이슈 입력 ──────────────────────────────────────

export interface CsvIssueInput {
  /** 있으면 그 키를 보존한다(이관) — 프로젝트 키와 맞아야 한다 */
  key?: string;
  title: string;
  description: string;
  type?: string;
  status?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  labels: string[];
  dueDate: string | null;
  estimateHours: number | null;
}

export interface CsvRowError {
  /** 1부터 세는 줄 번호(헤더 = 1) */
  row: number;
  reason: string;
}

/** 우리 헤더와 지라 내보내기(영문) 헤더를 같은 열로 본다 */
const HEADER_ALIASES: Record<string, string[]> = {
  key: ["키", "issue key", "key"],
  title: ["제목", "summary", "title"],
  type: ["타입", "issue type", "type"],
  status: ["상태", "status"],
  priority: ["우선순위", "priority"],
  assignee: ["담당자", "assignee"],
  labels: ["라벨", "labels"],
  dueDate: ["마감일", "due date", "duedate", "due"],
  estimate: ["예상 시간", "original estimate", "estimate", "estimate hours"],
  description: ["설명", "description"],
};

const JIRA_TYPES: Record<string, string> = {
  task: "task",
  story: "story",
  bug: "bug",
  epic: "epic",
  "sub-task": "subtask",
  subtask: "subtask",
};
const JIRA_STATUSES: Record<string, string> = {
  "to do": "todo",
  open: "todo",
  backlog: "todo",
  "in progress": "inprogress",
  done: "done",
  closed: "done",
  resolved: "done",
};
const PRIORITIES: Record<string, IssuePriority> = {
  높음: "high",
  high: "high",
  highest: "high",
  보통: "medium",
  medium: "medium",
  낮음: "low",
  low: "low",
  lowest: "low",
};

const norm = (value: string) => value.trim().toLowerCase();

export function csvToIssueInputs(
  rows: string[][],
  ctx: CsvContext,
): { inputs: CsvIssueInput[]; errors: CsvRowError[] } {
  if (rows.length === 0) return { inputs: [], errors: [{ row: 1, reason: "빈 파일입니다" }] };
  const header = rows[0].map(norm);
  const column = (field: keyof typeof HEADER_ALIASES) =>
    header.findIndex((h) => HEADER_ALIASES[field].includes(h));
  const col = Object.fromEntries(
    Object.keys(HEADER_ALIASES).map((field) => [field, column(field as keyof typeof HEADER_ALIASES)]),
  ) as Record<keyof typeof HEADER_ALIASES, number>;
  if (col.title < 0) return { inputs: [], errors: [{ row: 1, reason: "제목(Summary) 열이 없습니다" }] };

  const inputs: CsvIssueInput[] = [];
  const errors: CsvRowError[] = [];
  const cell = (row: string[], index: number) => (index < 0 ? "" : (row[index] ?? "").trim());

  rows.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    const fail = (reason: string) => errors.push({ row: rowNo, reason });
    const title = cell(row, col.title);
    if (!title) return fail("제목이 비어 있습니다");

    const input: CsvIssueInput = {
      title,
      description: cell(row, col.description),
      labels: cell(row, col.labels)
        .split(/[;,]/)
        .map((l) => l.trim())
        .filter(Boolean),
      dueDate: null,
      estimateHours: null,
    };
    const key = cell(row, col.key);
    if (key) input.key = key.toUpperCase();

    const typeText = cell(row, col.type);
    if (typeText) {
      const found =
        ctx.types.find((t) => t.name === typeText || t.id === typeText)?.id ??
        JIRA_TYPES[norm(typeText)];
      if (!found) return fail(`모르는 타입입니다: ${typeText}`);
      input.type = found;
    }
    const statusText = cell(row, col.status);
    if (statusText) {
      const found =
        ctx.statuses.find((s) => s.name === statusText || s.id === statusText)?.id ??
        JIRA_STATUSES[norm(statusText)];
      if (!found) return fail(`모르는 상태입니다: ${statusText}`);
      input.status = found;
    }
    const priorityText = cell(row, col.priority);
    if (priorityText) {
      const found = PRIORITIES[norm(priorityText)];
      if (!found) return fail(`모르는 우선순위입니다: ${priorityText}`);
      input.priority = found;
    }
    const assigneeText = cell(row, col.assignee);
    if (col.assignee >= 0) {
      if (!assigneeText) input.assigneeId = null;
      else {
        const found = ctx.users.find(
          (u) => u.name === assigneeText || u.id === assigneeText,
        );
        if (!found) return fail(`모르는 담당자입니다: ${assigneeText}`);
        input.assigneeId = found.id;
      }
    }
    const dueText = cell(row, col.dueDate);
    if (dueText) {
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dueText) ? dueText : new Date(dueText);
      if (typeof parsed === "string") input.dueDate = parsed;
      else if (Number.isNaN(parsed.getTime())) return fail(`마감일을 읽을 수 없습니다: ${dueText}`);
      else input.dueDate = parsed.toISOString().slice(0, 10);
    }
    const estimateText = cell(row, col.estimate);
    if (estimateText) {
      const hours = Number(estimateText);
      if (!Number.isFinite(hours) || hours <= 0) return fail(`예상 시간을 읽을 수 없습니다: ${estimateText}`);
      input.estimateHours = hours;
    }
    inputs.push(input);
  });
  return { inputs, errors };
}
