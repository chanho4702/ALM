import { describe, expect, it } from "vitest";
import { csvToIssueInputs, issuesToCsv, parseCsv } from "./csv";
import type { Issue, IssueTypeDef, User, WorkflowStatus } from "./types";

const statuses: WorkflowStatus[] = [
  { id: "todo", name: "할 일", category: "todo", order: 1, kind: "new", color: "neutral" },
  { id: "done", name: "완료", category: "done", order: 3, kind: "complete", color: "success" },
];
const users: User[] = [
  { id: "u1", name: "김찬호", email: "a@b.c" } as User,
  { id: "u2", name: "박준영", email: "d@e.f" } as User,
];
const types: IssueTypeDef[] = [
  { id: "task", name: "작업", icon: "check-square", color: "info", level: "standard", description: "", order: 1, builtIn: true },
  { id: "bug", name: "버그", icon: "bug", color: "danger", level: "standard", description: "", order: 2, builtIn: true },
];
const ctx = { statuses, users, types };

const issue = (over: Partial<Issue>): Issue =>
  ({
    id: "i1",
    key: "ALM-1",
    projectId: "p1",
    title: "제목",
    description: "",
    type: "task",
    status: "todo",
    priority: "medium",
    assigneeId: null,
    reporterId: "u1",
    sprintId: null,
    parentId: null,
    dueDate: null,
    estimateHours: null,
    resolution: null,
    fixVersionId: null,
    labels: [],
    order: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...over,
  }) as Issue;

describe("CSV 파서", () => {
  it("따옴표·콤마·줄바꿈이 든 셀을 RFC 4180대로 읽는다", () => {
    const rows = parseCsv('a,b,c\r\n"x, y","he said ""hi""","multi\nline"\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "multi\nline"],
    ]);
  });

  it("BOM과 빈 줄은 무시한다", () => {
    expect(parseCsv("﻿키,제목\n\nALM-1,안녕\n")).toEqual([["키", "제목"], ["ALM-1", "안녕"]]);
  });
});

describe("이슈 → CSV", () => {
  it("사람이 읽는 이름(상태·담당자·타입)으로 내보내고 왕복이 된다", () => {
    const csv = issuesToCsv(
      [
        issue({ assigneeId: "u2", labels: ["backend", "api"], dueDate: "2026-09-01", description: "한 줄, 콤마" }),
        issue({ id: "i2", key: "ALM-2", type: "bug", status: "done", priority: "high", estimateHours: 4 }),
      ],
      ctx,
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([
      "키", "제목", "타입", "상태", "우선순위", "담당자", "보고자", "라벨", "마감일", "예상 시간", "생성일", "수정일", "설명",
    ]);
    expect(rows[1]).toEqual([
      "ALM-1", "제목", "작업", "할 일", "보통", "박준영", "김찬호", "backend;api", "2026-09-01", "", "2026-08-01", "2026-08-02", "한 줄, 콤마",
    ]);
    expect(rows[2][2]).toBe("버그");
    expect(rows[2][4]).toBe("높음");
    expect(rows[2][9]).toBe("4");

    const { inputs, errors } = csvToIssueInputs(rows, ctx);
    expect(errors).toEqual([]);
    expect(inputs[0]).toMatchObject({
      key: "ALM-1",
      title: "제목",
      type: "task",
      status: "todo",
      priority: "medium",
      assigneeId: "u2",
      labels: ["backend", "api"],
      dueDate: "2026-09-01",
      description: "한 줄, 콤마",
    });
    expect(inputs[1]).toMatchObject({ type: "bug", status: "done", priority: "high", estimateHours: 4 });
  });
});

describe("CSV → 이슈 입력 (지라 내보내기 헤더 호환)", () => {
  it("영문 지라 헤더를 알아듣고, 모르는 상태·담당자는 행 오류로 남긴다", () => {
    const rows = parseCsv(
      [
        "Issue key,Summary,Issue Type,Status,Priority,Assignee,Labels,Due date,Description",
        "PAY-3,결제 실패,Bug,Done,High,박준영,ops,2026-10-01,설명",
        "PAY-4,모르는 상태,Task,Unknown,Medium,,,,",
        "PAY-5,모르는 담당자,Task,To Do,Low,홍길동,,,",
        ",제목 없는 행은 키가 없어도 된다,Task,To Do,Low,,,,",
      ].join("\n"),
    );
    const { inputs, errors } = csvToIssueInputs(rows, ctx);
    expect(inputs.map((i) => i.title)).toEqual(["결제 실패", "제목 없는 행은 키가 없어도 된다"]);
    expect(inputs[0]).toMatchObject({ key: "PAY-3", type: "bug", status: "done", priority: "high", assigneeId: "u2" });
    expect(inputs[1].key).toBeUndefined();
    expect(errors).toEqual([
      { row: 3, reason: "모르는 상태입니다: Unknown" },
      { row: 4, reason: "모르는 담당자입니다: 홍길동" },
    ]);
  });

  it("제목 열이 없으면 전체를 거부한다", () => {
    const { inputs, errors } = csvToIssueInputs(parseCsv("키,상태\nALM-1,할 일"), ctx);
    expect(inputs).toEqual([]);
    expect(errors).toEqual([{ row: 1, reason: "제목(Summary) 열이 없습니다" }]);
  });
});
