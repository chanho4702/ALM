import { describe, expect, it } from "vitest";
import { completeAql } from "./complete";
import { baseFieldInfos, functionInfos, keywordList, type AqlFieldsInfo } from "./fields";

const VALUES: Record<string, { id: string; name: string }[]> = {
  status: [
    { id: "todo", name: "할 일" },
    { id: "inprogress", name: "진행 중" },
  ],
  labels: [
    { id: "frontend", name: "frontend" },
    { id: "backend", name: "backend" },
  ],
  assignee: [
    { id: "u1", name: "김찬호" },
    { id: "u2", name: "이서연" },
  ],
};

const INFO: AqlFieldsInfo = {
  fields: baseFieldInfos().map((field) =>
    VALUES[field.name] ? { ...field, values: VALUES[field.name] } : field,
  ),
  functions: functionInfos(),
  keywords: keywordList(),
};

/** 커서는 항상 문자열 끝 — 실제 편집도 대부분 끝에서 일어난다 */
const at = (input: string) => completeAql(input, input.length, INFO);
const labels = (input: string) => at(input).suggestions.map((s) => s.label);

describe("AQL 자동완성 — 문맥", () => {
  it("빈 입력에서는 필드와 NOT", () => {
    const result = labels("");
    expect(result).toContain("status");
    expect(result).toContain("assignee");
    expect(result).toContain("NOT");
  });

  it("필드 접두어는 이름과 한국어 별칭 둘 다로 걸린다", () => {
    expect(labels("sta")).toEqual(["status", "statusCategory"]);
    expect(labels("담당")).toEqual(["assignee"]);
    expect(labels("상")).toEqual(["status", "statusCategory", "parent"]);
  });

  it("치환 구간은 지금 치고 있는 단어다", () => {
    expect(at("project = ALM AND sta")).toMatchObject({ from: 18, needsSpace: false });
  });

  it("필드 뒤에는 그 필드가 받는 연산자만", () => {
    const ops = labels("status ");
    expect(ops).toContain("=");
    expect(ops).toContain("IN");
    expect(ops).not.toContain("~"); // status는 텍스트 필드가 아니다
    expect(ops).not.toContain("IS EMPTY"); // 상태는 항상 값이 있다
    expect(labels("summary ")).toContain("~");
    expect(labels("assignee ")).toContain("IS EMPTY");
  });

  it("연산자 뒤에는 값 후보", () => {
    expect(labels("status = ")).toEqual(["할 일", "진행 중"]);
    expect(labels("status = 진")).toEqual(["진행 중"]);
  });

  it("공백 없이 이어 치면 앞에 공백을 넣는다", () => {
    expect(at("status =")).toMatchObject({ needsSpace: true, from: 8 });
    expect(at("status = ")).toMatchObject({ needsSpace: false, from: 9 });
  });

  it("사용자 필드에는 currentUser(), 날짜 필드에는 날짜 함수·상대 날짜", () => {
    expect(labels("assignee = ")).toEqual(["김찬호", "이서연", "currentUser()"]);
    const dates = labels("created >= ");
    expect(dates).toContain("startOfMonth(±n)"); // 후보는 시그니처로 보여 준다
    expect(dates).toContain("-7d");
    expect(dates).not.toContain("currentUser()");
  });

  it("IN 목록 안에서는 쉼표 뒤에도 값 후보", () => {
    expect(labels("labels IN (")).toEqual(["frontend", "backend"]);
    expect(labels("labels IN (frontend, ")).toEqual(["frontend", "backend"]);
    // 아직 "IN"을 치는 중이면 연산자 후보, 다 치고 공백을 넣으면 여는 괄호
    expect(labels("labels IN")).toEqual(["IN"]);
    expect(labels("labels IN ")).toEqual(["("]);
  });

  it("IS 뒤에는 EMPTY, 필드 뒤 NOT은 IN", () => {
    expect(labels("assignee IS ")).toEqual(["EMPTY", "NOT EMPTY"]);
    expect(labels("assignee IS NOT ")).toEqual(["EMPTY"]);
    expect(labels("labels NOT ")).toEqual(["IN"]);
  });

  it("값 뒤에는 접속사와 ORDER BY", () => {
    expect(labels("status = todo ")).toEqual(["AND", "OR", "ORDER BY"]);
    expect(labels("assignee IS EMPTY ")).toEqual(["AND", "OR", "ORDER BY"]);
  });

  it("접속사·여는 괄호 뒤에는 다시 필드", () => {
    expect(labels("status = todo AND ")).toContain("priority");
    expect(labels("status = todo AND (")).toContain("priority");
  });

  it("ORDER BY 뒤에는 정렬 가능한 필드만, 그 뒤에는 방향", () => {
    const sortable = labels("status = todo ORDER BY ");
    expect(sortable).toContain("due");
    expect(sortable).not.toContain("labels");
    expect(labels("status = todo ORDER BY due ")).toEqual(["ASC", "DESC"]);
    expect(labels("ORDER BY due DESC, ")).toContain("priority");
  });

  it("공백이 든 값은 따옴표로 넣는다", () => {
    const insert = at("status = ").suggestions.find((s) => s.label === "할 일")?.insert;
    expect(insert).toBe('"할 일"');
  });
});
