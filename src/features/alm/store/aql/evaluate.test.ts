import { describe, expect, it } from "vitest";
import type { Issue } from "../types";
import { evaluateAql, type AqlEvalContext } from "./evaluate";
import { parseAql } from "./parser";

/**
 * KST 정오로 고정한다 — 실행기가 날짜 경계를 Asia/Seoul로 계산하므로(서버와 같다)
 * 기대값이 테스트를 돌리는 기계의 시간대에 휘둘리면 안 된다. 03:00 UTC = 12:00 KST.
 */
const at = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 3)).toISOString();

const NOW = new Date(Date.UTC(2026, 8, 6, 3)); // 2026-09-06 정오 (KST)

const base = {
  projectId: "p1",
  description: "",
  type: "task",
  status: "todo",
  priority: "medium",
  assigneeId: null as string | null,
  reporterId: "u1",
  sprintId: null as string | null,
  parentId: null as string | null,
  dueDate: null as string | null,
  estimateHours: null as number | null,
  resolution: null as Issue["resolution"],
  fixVersionId: null as string | null,
  labels: [] as string[],
  componentIds: [] as string[],
  order: 1,
  createdAt: at(2026, 8, 1),
  updatedAt: at(2026, 9, 1),
};

/** 20건 — AND/OR/NOT/IN/~/날짜/EMPTY/ORDER를 한 벌로 확인할 수 있게 값을 흩뿌렸다 */
const ISSUES: Issue[] = [
  { ...base, id: "i1", key: "ALM-1", title: "프로젝트 스캐폴드", status: "done", resolution: "done", priority: "high", assigneeId: "u1", sprintId: "s1", labels: ["infra"], updatedAt: at(2026, 9, 5) },
  { ...base, id: "i2", key: "ALM-2", title: "칸반 보드 UI", description: "<p>결제 화면과 함께 본다</p>", status: "inprogress", priority: "high", assigneeId: "u2", sprintId: "s1", labels: ["frontend", "design"], dueDate: "2026-09-08", type: "story", estimateHours: 8, updatedAt: at(2026, 9, 4) },
  { ...base, id: "i3", key: "ALM-3", title: "이슈 상세 모달", status: "inprogress", priority: "medium", assigneeId: "u1", sprintId: "s1", labels: ["frontend"], parentId: "i5", updatedAt: at(2026, 9, 3) },
  { ...base, id: "i4", key: "ALM-4", title: "백로그 화면", status: "review", priority: "medium", assigneeId: "u3", sprintId: "s1", dueDate: "2026-09-20", updatedAt: at(2026, 9, 2) },
  { ...base, id: "i5", key: "ALM-5", title: "결제 에픽", type: "epic", status: "todo", priority: "highest", assigneeId: null, labels: ["backend"], updatedAt: at(2026, 9, 1) },
  { ...base, id: "i6", key: "ALM-6", title: "코멘트 기능", status: "todo", priority: "low", assigneeId: "u2", labels: ["backend"], estimateHours: 3, updatedAt: at(2026, 8, 30) },
  { ...base, id: "i7", key: "ALM-7", title: "활동 로그", status: "todo", priority: "lowest", assigneeId: null, updatedAt: at(2026, 8, 29) },
  { ...base, id: "i8", key: "ALM-8", title: "다크 테마 점검", type: "bug", status: "todo", priority: "low", labels: ["design"], updatedAt: at(2026, 8, 28) },
  { ...base, id: "i9", key: "ALM-9", title: "로그인 버그", type: "bug", status: "inprogress", priority: "highest", assigneeId: "u1", sprintId: "s1", dueDate: "2026-09-07", updatedAt: at(2026, 8, 27) },
  { ...base, id: "i10", key: "ALM-10", title: "검색 성능", status: "done", resolution: "wont_do", priority: "medium", assigneeId: "u3", componentIds: ["c1"], updatedAt: at(2026, 8, 26) },
  { ...base, id: "i11", key: "ALM-11", title: "결제 연동", status: "todo", priority: "high", assigneeId: "u2", sprintId: "s2", fixVersionId: "v1", createdAt: at(2026, 9, 2), updatedAt: at(2026, 8, 25) },
  { ...base, id: "i12", key: "ALM-12", title: "알림 센터", status: "todo", priority: "medium", assigneeId: "u1", estimateHours: 12, updatedAt: at(2026, 8, 24) },
  { ...base, id: "i13", key: "ALM-13", title: "보관된 옛 작업", status: "done", resolution: "done", priority: "low", archivedAt: at(2026, 8, 20), updatedAt: at(2026, 8, 20) },
  { ...base, id: "i14", key: "ALM-14", title: "CSV 내보내기", type: "subtask", status: "todo", priority: "low", parentId: "i3", updatedAt: at(2026, 8, 19) },
  { ...base, id: "i15", key: "WIKI-1", title: "위키 트리", projectId: "p2", status: "inprogress", priority: "high", assigneeId: "u1", labels: ["frontend"], updatedAt: at(2026, 8, 18) },
  { ...base, id: "i16", key: "WIKI-2", title: "위키 첨부", projectId: "p2", status: "todo", priority: "medium", assigneeId: "u3", updatedAt: at(2026, 8, 17) },
  { ...base, id: "i17", key: "WIKI-3", title: "위키 검색", projectId: "p2", type: "story", status: "review", priority: "high", labels: ["backend", "api v2"], updatedAt: at(2026, 8, 16) },
  { ...base, id: "i18", key: "WIKI-4", title: "권한 모델", projectId: "p2", status: "done", resolution: "done", priority: "highest", assigneeId: "u2", updatedAt: at(2026, 8, 15) },
  { ...base, id: "i19", key: "WIKI-5", title: "결제 문서", projectId: "p2", status: "todo", priority: "lowest", dueDate: "2026-09-30", updatedAt: at(2026, 8, 14) },
  { ...base, id: "i20", key: "WIKI-6", title: "다국어", projectId: "p2", type: "bug", status: "todo", priority: "low", assigneeId: "u1", labels: ["design"], updatedAt: at(2026, 8, 13) },
];

const CTX: AqlEvalContext = {
  currentUserId: "u1",
  users: [
    { id: "u1", name: "김찬호" },
    { id: "u2", name: "이서연" },
    { id: "u3", name: "박준영" },
  ],
  projects: [
    { id: "p1", key: "ALM", name: "ALM 플랫폼" },
    { id: "p2", key: "WIKI", name: "위키 제품" },
  ],
  statuses: [
    { id: "todo", name: "할 일", categoryId: "todo" },
    { id: "inprogress", name: "진행 중", categoryId: "inprogress" },
    { id: "review", name: "코드 리뷰", categoryId: "inprogress" },
    { id: "done", name: "완료", categoryId: "done" },
  ],
  categories: [
    { id: "todo", name: "할 일", kind: "new", order: 1 },
    { id: "inprogress", name: "진행 중", kind: "active", order: 2 },
    { id: "done", name: "완료", kind: "complete", order: 3 },
  ],
  types: [
    { id: "task", name: "작업" },
    { id: "story", name: "스토리" },
    { id: "bug", name: "버그" },
    { id: "epic", name: "에픽" },
    { id: "subtask", name: "하위 작업" },
  ],
  priorities: [
    { id: "highest", name: "최상", order: 1 },
    { id: "high", name: "높음", order: 2 },
    { id: "medium", name: "보통", order: 3 },
    { id: "low", name: "낮음", order: 4 },
    { id: "lowest", name: "최하", order: 5 },
  ],
  sprints: [
    { id: "s1", name: "Sprint 1", state: "active" },
    { id: "s2", name: "Sprint 2", state: "planned" },
  ],
  versions: [{ id: "v1", name: "1.0" }],
  components: [{ id: "c1", name: "프론트엔드" }],
  now: NOW,
};

const keys = (aql: string) => evaluateAql(parseAql(aql), ISSUES, { ...CTX }).map((i) => i.key);

describe("AQL 실행 — 필드·연산자", () => {
  it("빈 절은 보관을 뺀 전부를 updated DESC로", () => {
    const result = keys("");
    expect(result).toHaveLength(19); // 20건 - 보관 1건
    expect(result.slice(0, 3)).toEqual(["ALM-1", "ALM-2", "ALM-3"]);
    expect(result).not.toContain("ALM-13");
  });

  it("이름·키·별칭으로 해석한다", () => {
    expect(keys("project = ALM AND 상태 = 완료")).toEqual(["ALM-1", "ALM-10"]);
    expect(keys('프로젝트 = "위키 제품" AND 타입 = 버그')).toEqual(["WIKI-6"]);
  });

  it("currentUser()", () => {
    expect(keys("assignee = currentUser()")).toEqual(["ALM-1", "ALM-3", "ALM-9", "ALM-12", "WIKI-1", "WIKI-6"]);
  });

  it("AND · OR · 괄호", () => {
    expect(keys("type = bug AND priority = highest")).toEqual(["ALM-9"]);
    expect(keys("key = ALM-5 OR key = WIKI-4")).toEqual(["ALM-5", "WIKI-4"]);
    expect(keys("project = WIKI AND (type = bug OR type = story)")).toEqual(["WIKI-3", "WIKI-6"]);
  });

  it("NOT은 절 전체를 뒤집는다", () => {
    const withoutBugs = keys("project = ALM AND NOT type = bug");
    expect(withoutBugs).not.toContain("ALM-8");
    expect(withoutBugs).not.toContain("ALM-9");
    expect(withoutBugs).toContain("ALM-1");
  });

  it("IN · NOT IN", () => {
    expect(keys('labels IN (backend, "api v2")')).toEqual(["ALM-5", "ALM-6", "WIKI-3"]);
    // NOT IN은 JQL처럼 값이 있는 이슈만 본다 — 라벨이 없는 이슈는 빠진다
    expect(keys("labels NOT IN (backend)")).toEqual(["ALM-1", "ALM-2", "ALM-3", "ALM-8", "WIKI-1", "WIKI-6"]);
  });

  it("!=는 값이 있는 이슈만 본다 (JQL 규칙)", () => {
    const notMine = keys("assignee != currentUser()");
    expect(notMine).toContain("ALM-2");
    expect(notMine).not.toContain("ALM-1"); // 내 이슈
    expect(notMine).not.toContain("ALM-7"); // 미지정 — IS EMPTY로 물어야 한다
  });

  it("~는 요약+설명을, summary ~는 요약만 본다", () => {
    expect(keys("text ~ 결제")).toEqual(["ALM-2", "ALM-5", "ALM-11", "WIKI-5"]);
    expect(keys("summary ~ 결제")).toEqual(["ALM-5", "ALM-11", "WIKI-5"]);
    expect(keys("summary ~ 위키")).toEqual(["WIKI-1", "WIKI-2", "WIKI-3"]);
  });

  it("라벨은 대소문자를 가려 정확히 맞춘다 (지라와 같다 — 자유 문자열이라 접으면 뭉쳐 보인다)", () => {
    expect(keys("labels = frontend")).toEqual(["ALM-2", "ALM-3", "WIKI-1"]);
    expect(keys("labels = Frontend")).toEqual([]);
    expect(keys("labels IN (Backend, DESIGN)")).toEqual([]);
  });

  it("~의 % 와 _ 는 글자 그대로다 (LIKE 와일드카드가 아니다)", () => {
    expect(keys('text ~ "%"')).toEqual([]);
    expect(keys('summary ~ "____"')).toEqual([]);
    expect(keys("summary ~ 결제")).toHaveLength(3); // 같은 조건의 평범한 부분 일치는 걸린다
  });

  it("statusCategory는 kind·이름·id를 모두 받는다", () => {
    const active = keys("statusCategory = active");
    expect(active).toEqual(["ALM-2", "ALM-3", "ALM-4", "ALM-9", "WIKI-1", "WIKI-3"]);
    expect(keys('statusCategory = "진행 중"')).toEqual(active);
    expect(keys("statusCategory != complete")).toHaveLength(16);
  });

  it("IS EMPTY · IS NOT EMPTY", () => {
    expect(keys("sprint IS EMPTY AND project = ALM")).toEqual([
      "ALM-5", "ALM-6", "ALM-7", "ALM-8", "ALM-10", "ALM-12", "ALM-14",
    ]);
    expect(keys("resolution IS NOT EMPTY")).toEqual(["ALM-1", "ALM-10", "WIKI-4"]);
    expect(keys("assignee IS EMPTY AND project = WIKI")).toEqual(["WIKI-3", "WIKI-5"]);
  });

  it("우선순위 비교는 중요도 순 (>= high는 high 이상)", () => {
    expect(keys("priority >= high AND project = ALM")).toEqual([
      "ALM-1", "ALM-2", "ALM-5", "ALM-9", "ALM-11",
    ]);
    expect(keys("priority < medium AND project = WIKI")).toEqual(["WIKI-5", "WIKI-6"]);
  });

  it("숫자 비교", () => {
    expect(keys("estimate > 4")).toEqual(["ALM-2", "ALM-12"]);
    expect(keys("estimate IS EMPTY AND key ~ WIKI")).toHaveLength(6);
  });

  it("상위 항목은 이슈 키로 건다", () => {
    expect(keys("parent = ALM-3")).toEqual(["ALM-14"]);
    expect(keys("parent IS NOT EMPTY")).toEqual(["ALM-3", "ALM-14"]);
  });

  it("스프린트·버전·컴포넌트는 이름으로 건다", () => {
    expect(keys('sprint = "Sprint 1"')).toEqual(["ALM-1", "ALM-2", "ALM-3", "ALM-4", "ALM-9"]);
    expect(keys("sprint = openSprints()")).toEqual(["ALM-1", "ALM-2", "ALM-3", "ALM-4", "ALM-9"]);
    expect(keys("fixVersion = 1.0")).toEqual(["ALM-11"]);
    expect(keys("component = 프론트엔드")).toEqual(["ALM-10"]);
  });
});

describe("AQL 실행 — 값 해석 실패는 빈 결과가 아니라 오류다", () => {
  const fails = (aql: string) => {
    try {
      keys(aql);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error(`오류가 나야 하는 입력인데 통과했다: ${aql}`);
  };

  it("모르는 이름은 그 자리를 짚는 400이다 (서버와 같은 문구)", () => {
    expect(fails("status = 없는상태")).toBe("상태를 모릅니다: 없는상태");
    expect(fails("assignee = 없는사람")).toBe("사용자를 찾을 수 없습니다: 없는사람");
    expect(fails("project = NOPE")).toBe("프로젝트를 찾을 수 없습니다: NOPE");
    expect(fails("priority = 아주높음")).toBe("우선순위를 모릅니다: 아주높음");
  });

  it("§6.8 날짜 형식이 아닌 값은 실행에서 걸린다", () => {
    expect(fails("due > yesterday")).toBe("날짜 형식이 아닙니다: yesterday");
    expect(fails("created >= 2026-13-99")).toBe("날짜 형식이 아닙니다: 2026-13-99");
  });

  it("이 필드에 쓸 수 없는 함수", () => {
    expect(fails("status = currentUser()")).toBe("이 필드에는 함수를 쓸 수 없습니다: currentUser()");
  });

  it("숫자로만 이루어진 이름도 원문으로 대조한다 (AST는 number, value는 문자열)", () => {
    expect(keys('fixVersion = "1.0"')).toEqual(["ALM-11"]);
    expect(keys("fixVersion = 1.0")).toEqual(["ALM-11"]);
  });
});

describe("AQL 실행 — 날짜", () => {
  it("절대 날짜 비교", () => {
    expect(keys("due <= 2026-09-08")).toEqual(["ALM-2", "ALM-9"]);
    expect(keys("due > 2026-09-08")).toEqual(["ALM-4", "WIKI-5"]);
  });

  it("상대 날짜", () => {
    // NOW = 2026-09-06, +3d = 2026-09-09
    expect(keys("due <= +3d")).toEqual(["ALM-2", "ALM-9"]);
    expect(keys("updated >= -7d")).toEqual(["ALM-1", "ALM-2", "ALM-3", "ALM-4", "ALM-5", "ALM-6"]);
  });

  it("날짜 함수", () => {
    expect(keys("created >= startOfMonth()")).toEqual(["ALM-11"]);
    expect(keys("created < startOfMonth()")).toHaveLength(18);
    expect(keys("updated >= startOfDay(-2)")).toEqual(["ALM-1", "ALM-2"]);
  });

  it("= 는 그 날 하루를 뜻한다", () => {
    expect(keys("due = 2026-09-08")).toEqual(["ALM-2"]);
  });

  it("due IS EMPTY", () => {
    expect(keys("due IS NOT EMPTY")).toEqual(["ALM-2", "ALM-4", "ALM-9", "WIKI-5"]);
  });
});

describe("AQL 실행 — 정렬과 보관", () => {
  it("ORDER BY 다중 키 · 미지정은 뒤로", () => {
    expect(keys("due IS NOT EMPTY ORDER BY due ASC")).toEqual(["ALM-9", "ALM-2", "ALM-4", "WIKI-5"]);
    const byDue = keys("project = ALM ORDER BY due ASC");
    expect(byDue.slice(0, 3)).toEqual(["ALM-9", "ALM-2", "ALM-4"]);
    // 마감일 없는 것들은 뒤로(PostgreSQL 기본 NULLS LAST), 그 안에서는 마무리 정렬인 id 순
    expect(byDue.at(-1)).toBe("ALM-14");
  });

  it("정렬 키는 레지스트리 순서(1=최상)라 ASC가 중요한 것부터다", () => {
    expect(keys("project = WIKI ORDER BY priority ASC").slice(0, 2)).toEqual(["WIKI-4", "WIKI-1"]);
    expect(keys("project = WIKI ORDER BY priority DESC").slice(0, 2)).toEqual(["WIKI-5", "WIKI-6"]);
  });

  it("보관 이슈는 기본 제외, archived = true로만 나온다", () => {
    expect(keys("archived = true")).toEqual(["ALM-13"]);
    expect(keys("project = ALM")).not.toContain("ALM-13");
  });

  it("§6 벡터 2를 그대로 실행한다 (동률은 id로 마무리)", () => {
    expect(
      keys("project = ALM AND (priority >= high OR due <= +3d) ORDER BY due ASC, priority DESC"),
      // 마감일 있는 둘이 앞, 나머지는 priority DESC(순서 값이 큰 = 덜 중요한 쪽이 먼저), 동률은 id
    ).toEqual(["ALM-9", "ALM-2", "ALM-1", "ALM-11", "ALM-5"]);
  });
});

describe("날짜 경계 — Asia/Seoul 고정 (UTC 러너에서 하루 밀리지 않게)", () => {
  // 2026-09-06 23:30 UTC = KST 09-07 08:30. 브라우저/러너 시간대로 계산하면 "오늘"이 09-06이 된다.
  const NEAR_MIDNIGHT: AqlEvalContext = { ...CTX, now: new Date("2026-09-06T23:30:00Z") };
  const keysAt = (aql: string) =>
    evaluateAql(parseAql(aql), ISSUES, NEAR_MIDNIGHT).map((issue) => issue.key);

  it("startOfDay()는 KST 기준 오늘(09-07)을 잡는다", () => {
    expect(keysAt("due = startOfDay()")).toEqual(["ALM-9"]);
  });

  it("startOfDay(-1)은 KST 어제(09-06) — 그날 마감은 없다", () => {
    expect(keysAt("due = startOfDay(-1)")).toEqual([]);
  });

  it("맨 날짜 비교도 KST 하루 구간이다 — due <= 2026-09-07", () => {
    expect(keysAt("due <= 2026-09-07 ORDER BY key ASC")).toEqual(["ALM-9"]);
  });
});
