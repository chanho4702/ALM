import { describe, expect, it } from "vitest";
import { EMPTY_QUERY, parseSmartQuery, type IssueQuery } from "../searchQuery";
import { parseAql } from "./parser";
import { fromAql, toAql, type AqlTranslateContext } from "./toAql";
import { fromSmart } from "./fromSmart";

const CTX: AqlTranslateContext = {
  users: [
    { id: "u1", name: "김찬호" },
    { id: "u2", name: "이서연" },
  ],
  projects: [
    { id: "p1", key: "ALM", name: "ALM 플랫폼", description: "", category: "", leadId: null, defaultAssignee: "unassigned", icon: "", color: "", url: "", createdAt: "" },
  ],
  statuses: [
    { id: "todo", name: "할 일" },
    { id: "review", name: "코드 리뷰" },
  ],
  types: [
    { id: "bug", name: "버그" },
    { id: "task", name: "작업" },
  ],
  priorities: [
    { id: "high", name: "높음" },
    { id: "medium", name: "보통" },
  ],
  categories: [
    { id: "todo", name: "할 일", kind: "new" },
    { id: "inprogress", name: "진행 중", kind: "active" },
    { id: "done", name: "완료", kind: "complete" },
  ],
};

const query = (patch: Partial<IssueQuery>): IssueQuery => ({ ...EMPTY_QUERY, ...patch });

describe("toAql — 기본 모드 필터를 AQL로", () => {
  it("빈 필터는 정렬만 남는다", () => {
    expect(toAql(EMPTY_QUERY, CTX)).toBe("ORDER BY updated DESC");
  });

  it("단일 값은 =, 여러 값은 IN", () => {
    expect(toAql(query({ projectIds: ["p1"] }), CTX)).toBe("project = ALM ORDER BY updated DESC");
    expect(toAql(query({ labels: ["frontend", "api v2"] }), CTX)).toBe(
      'labels IN (frontend, "api v2") ORDER BY updated DESC',
    );
  });

  it("카테고리 필터는 statusCategory, 커스텀 상태는 status 이름", () => {
    expect(toAql(query({ statuses: ["inprogress"], statusIds: ["review"] }), CTX)).toBe(
      'statusCategory = active AND status = "코드 리뷰" ORDER BY updated DESC',
    );
  });

  it("미지정 담당자는 IS EMPTY, 섞이면 괄호로 묶는다", () => {
    expect(toAql(query({ assigneeIds: ["unassigned"] }), CTX)).toBe(
      "assignee IS EMPTY ORDER BY updated DESC",
    );
    expect(toAql(query({ assigneeIds: ["u1", "unassigned"] }), CTX)).toBe(
      "(assignee = 김찬호 OR assignee IS EMPTY) ORDER BY updated DESC",
    );
  });

  it("검색어는 text ~, 정렬은 기본 모드 의미를 유지한다", () => {
    expect(toAql(query({ text: "로그인 화면", sort: "due" }), CTX)).toBe(
      'text ~ "로그인 화면" ORDER BY due ASC',
    );
    // 정렬 키가 레지스트리 순서(1=최상)라 "중요한 것부터"는 ASC다
    expect(toAql(query({ sort: "priority" }), CTX)).toBe("ORDER BY priority ASC");
  });

  it("만들어낸 AQL은 항상 파싱된다", () => {
    const full = query({
      projectIds: ["p1"],
      statuses: ["done"],
      statusIds: ["review"],
      types: ["bug"],
      priorities: ["high"],
      assigneeIds: ["u1", "unassigned"],
      labels: ["frontend"],
      text: "결제",
      sort: "created",
    });
    expect(() => parseAql(toAql(full, CTX))).not.toThrow();
  });
});

describe("fromSmart — 기존 한국어 구문을 AQL로", () => {
  it("스마트 토큰이 그대로 옮겨간다", () => {
    expect(fromSmart("상태:진행중 담당:김찬호 로그인", CTX)).toBe(
      "statusCategory = active AND assignee = 김찬호 AND text ~ 로그인 ORDER BY updated DESC",
    );
  });

  it("알아듣지 못한 토큰은 검색어로 살아남는다", () => {
    expect(fromSmart("라벨:frontend 미확인:값", CTX)).toBe(
      'labels = frontend AND text ~ "미확인:값" ORDER BY updated DESC',
    );
  });
});

describe("fromAql — 단순 조건만 기본 모드로 되돌린다", () => {
  const back = (aql: string) => fromAql(parseAql(aql), CTX);

  it("AND + = / IN 은 되돌아온다", () => {
    expect(back("project = ALM AND type IN (bug, task) AND labels = frontend")).toEqual(
      query({ projectIds: ["p1"], types: ["bug", "task"], labels: ["frontend"] }),
    );
  });

  it("assignee IS EMPTY는 미지정 센티널로", () => {
    expect(back("assignee IS EMPTY")).toEqual(query({ assigneeIds: ["unassigned"] }));
  });

  it("statusCategory·status·text·ORDER BY", () => {
    expect(back('statusCategory = active AND status = "코드 리뷰" AND text ~ 결제 ORDER BY due ASC')).toEqual(
      query({ statuses: ["inprogress"], statusIds: ["review"], text: "결제", sort: "due" }),
    );
  });

  it("OR·NOT·비교·모르는 필드는 되돌리지 않는다 (null)", () => {
    expect(back("project = ALM OR type = bug")).toBeNull();
    expect(back("NOT type = bug")).toBeNull();
    expect(back("due <= +3d")).toBeNull();
    expect(back("assignee = currentUser()")).toBeNull();
    expect(back("sprint = 1")).toBeNull();
    expect(back("labels NOT IN (a)")).toBeNull();
    expect(back("ORDER BY key ASC")).toBeNull();
  });

  it("기본 모드 → AQL → 기본 모드 왕복", () => {
    const original = query({
      projectIds: ["p1"],
      statuses: ["done"],
      types: ["bug"],
      priorities: ["high"],
      assigneeIds: ["u1"],
      labels: ["frontend"],
      sort: "created",
    });
    expect(fromAql(parseAql(toAql(original, CTX)), CTX)).toEqual(original);
  });

  it("스마트 문자열도 AQL을 거쳐 같은 쿼리로 돌아온다", () => {
    const smart = "상태:진행중 담당:김찬호 라벨:frontend";
    expect(fromAql(parseAql(fromSmart(smart, CTX)), CTX)).toEqual(parseSmartQuery(smart, CTX));
  });
});
