import { describe, expect, it } from "vitest";
import type { Issue, IssueTypeDef, PriorityDef, Sprint, User, WorkflowStatus } from "../../store/types";
import { DEFAULT_VIEW_DISPLAY } from "../../store/types";
import type { ViewDisplay } from "../../store/types";
import { aqlWhere, buildViewAql, epicOf, filterSubIssues, groupIssues, sortIssues } from "./viewGrouping";
import type { GroupingContext } from "./viewGrouping";

let seq = 0;
function issue(patch: Partial<Issue>): Issue {
  seq += 1;
  return {
    id: `i${seq}`,
    key: `ALM-${seq}`,
    projectId: "p1",
    title: `이슈 ${seq}`,
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
    resolvedAt: null,
    fixVersionId: null,
    startDate: null,
    storyPoints: null,
    flagged: false,
    triageState: null,
    labels: [],
    componentIds: [],
    order: seq,
    version: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...patch,
  };
}

const statuses: WorkflowStatus[] = [
  { id: "done", name: "완료", category: "done", order: 0, kind: "complete" },
  { id: "todo", name: "할 일", category: "todo", order: 0, kind: "new" },
  { id: "inprogress", name: "진행 중", category: "inprogress", order: 0, kind: "active" },
];
const priorities: PriorityDef[] = [
  { id: "high", name: "높음", icon: "", color: "danger", description: "", order: 1, builtIn: true },
  { id: "medium", name: "보통", icon: "", color: "warning", description: "", order: 2, builtIn: true },
  { id: "low", name: "낮음", icon: "", color: "info", description: "", order: 3, builtIn: true },
];
const types: IssueTypeDef[] = [
  { id: "epic", name: "에픽", icon: "", color: "info", level: "epic", description: "", order: 0, builtIn: true },
  { id: "task", name: "작업", icon: "", color: "info", level: "standard", description: "", order: 1, builtIn: true },
  { id: "subtask", name: "하위 작업", icon: "", color: "info", level: "subtask", description: "", order: 2, builtIn: true },
];
const users: User[] = [
  { id: "u2", name: "박준영" } as User,
  { id: "u1", name: "김찬호" } as User,
];
const sprints: Sprint[] = [
  { id: "s-done", projectId: "p1", name: "Sprint 1", state: "done" } as Sprint,
  { id: "s-plan", projectId: "p1", name: "Sprint 3", state: "planned" } as Sprint,
  { id: "s-act", projectId: "p1", name: "Sprint 2", state: "active" } as Sprint,
];

function ctxFor(all: Issue[], extra: Partial<GroupingContext> = {}): GroupingContext {
  return {
    statuses,
    priorities,
    types,
    users,
    sprints,
    versions: [],
    components: [],
    labels: [],
    issuesById: new Map(all.map((i) => [i.id, i])),
    ...extra,
  };
}

const display = (patch: Partial<ViewDisplay>): ViewDisplay => ({ ...DEFAULT_VIEW_DISPLAY, ...patch });

describe("viewGrouping — 그룹", () => {
  it("담당자로 묶고 미지정은 맨 뒤, 건수·포인트 합을 단다", () => {
    const rows = [
      issue({ assigneeId: "u2", storyPoints: 3 }),
      issue({ assigneeId: null, storyPoints: 1 }),
      issue({ assigneeId: "u1", storyPoints: 2.5 }),
      issue({ assigneeId: "u2", storyPoints: null }),
    ];
    const groups = groupIssues(rows, display({ groupBy: "assignee" }), ctxFor(rows));
    expect(groups.map((g) => [g.label, g.count, g.storyPoints])).toEqual([
      ["김찬호", 1, 2.5],
      ["박준영", 2, 3],
      ["미지정", 1, 1],
    ]);
  });

  it("상태는 카테고리 순서(할 일 → 진행 중 → 완료), 빈 그룹 표시면 없는 상태도 나온다", () => {
    const rows = [issue({ status: "done" }), issue({ status: "todo" })];
    expect(groupIssues(rows, display({ groupBy: "status" }), ctxFor(rows)).map((g) => g.label)).toEqual(["할 일", "완료"]);
    const withEmpty = groupIssues(rows, display({ groupBy: "status", showEmptyGroups: true }), ctxFor(rows));
    expect(withEmpty.map((g) => [g.label, g.count])).toEqual([
      ["할 일", 1],
      ["진행 중", 0],
      ["완료", 1],
    ]);
  });

  it("라벨·컴포넌트는 값마다 한 번씩 나오고 값 없음 그룹이 따로 있다", () => {
    const rows = [issue({ labels: ["ui", "api"] }), issue({ labels: [] }), issue({ labels: ["api"] })];
    const groups = groupIssues(rows, display({ groupBy: "label" }), ctxFor(rows));
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ["api", 2],
      ["ui", 1],
      ["라벨 없음", 1],
    ]);
  });

  it("스프린트는 진행 중 → 예정 순, 백로그는 맨 뒤 — 빈 그룹에 완료 스프린트는 넣지 않는다", () => {
    const rows = [issue({ sprintId: null }), issue({ sprintId: "s-plan" })];
    const groups = groupIssues(rows, display({ groupBy: "sprint", showEmptyGroups: true }), ctxFor(rows));
    expect(groups.map((g) => g.label)).toEqual(["Sprint 2", "Sprint 3", "백로그"]);
  });

  it("에픽 — 하위 작업은 부모의 에픽을 따라가고, 에픽 자신은 에픽 없음", () => {
    const epic = issue({ type: "epic", title: "결제" });
    const story = issue({ parentId: epic.id });
    const sub = issue({ type: "subtask", parentId: story.id });
    const loose = issue({});
    const all = [epic, story, sub, loose];
    expect(epicOf(sub, ctxFor(all))?.id).toBe(epic.id);
    const groups = groupIssues(all, display({ groupBy: "epic" }), ctxFor(all));
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      [`${epic.key} 결제`, 2],
      ["에픽 없음", 2],
    ]);
  });

  it("하위 그룹은 값 있는 것만, 그룹과 같은 기준이면 무시한다", () => {
    const rows = [
      issue({ status: "todo", priority: "high" }),
      issue({ status: "todo", priority: "low" }),
      issue({ status: "done", priority: "high" }),
    ];
    const groups = groupIssues(rows, display({ groupBy: "status", subGroupBy: "priority", showEmptyGroups: true }), ctxFor(rows));
    expect(groups[0].subGroups?.map((g) => g.label)).toEqual(["높음", "낮음"]);
    expect(groups[1].subGroups).toEqual([]); // 진행 중(빈 그룹)
    expect(groups[2].subGroups?.map((g) => g.label)).toEqual(["높음"]);
    expect(groupIssues(rows, display({ groupBy: "status", subGroupBy: "status" }), ctxFor(rows))[0].subGroups).toBeUndefined();
  });

  it("그룹 없음이면 '전체' 하나", () => {
    const rows = [issue({}), issue({})];
    const groups = groupIssues(rows, display({}), ctxFor(rows));
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});

describe("viewGrouping — 정렬·하위 이슈", () => {
  it("마감일·포인트는 방향과 무관하게 빈 값이 맨 뒤", () => {
    const a = issue({ dueDate: "2026-11-02", storyPoints: 5 });
    const b = issue({ dueDate: null, storyPoints: null });
    const c = issue({ dueDate: "2026-11-01", storyPoints: 1 });
    const ctx = ctxFor([a, b, c]);
    expect(sortIssues([a, b, c], "due", "asc", ctx).map((i) => i.id)).toEqual([c.id, a.id, b.id]);
    expect(sortIssues([a, b, c], "due", "desc", ctx).map((i) => i.id)).toEqual([a.id, c.id, b.id]);
    expect(sortIssues([a, b, c], "storyPoints", "desc", ctx).map((i) => i.id)).toEqual([a.id, c.id, b.id]);
  });

  it("우선순위는 레지스트리 순, 키는 숫자 순(ALM-10이 ALM-9 뒤)", () => {
    const low = issue({ priority: "low" });
    const high = issue({ priority: "high" });
    expect(sortIssues([low, high], "priority", "asc", ctxFor([])).map((i) => i.priority)).toEqual(["high", "low"]);
    const nine = issue({ key: "ALM-9" });
    const ten = issue({ key: "ALM-10" });
    expect(sortIssues([ten, nine], "key", "asc", ctxFor([])).map((i) => i.key)).toEqual(["ALM-9", "ALM-10"]);
  });

  it("수동 정렬은 order, 상태 정렬은 카테고리 의미 순", () => {
    const first = issue({ order: 1, status: "done" });
    const second = issue({ order: 2, status: "todo" });
    expect(sortIssues([second, first], "manual", "asc", ctxFor([])).map((i) => i.id)).toEqual([first.id, second.id]);
    expect(sortIssues([first, second], "status", "asc", ctxFor([])).map((i) => i.status)).toEqual(["todo", "done"]);
  });

  it("하위 이슈 표시를 끄면 하위 작업 계층만 빠진다", () => {
    const rows = [issue({ type: "task" }), issue({ type: "subtask" }), issue({ type: "epic" })];
    expect(filterSubIssues(rows, false, types).map((i) => i.type)).toEqual(["task", "epic"]);
    expect(filterSubIssues(rows, true, types)).toHaveLength(3);
  });
});

describe("viewGrouping — 보기 질의", () => {
  it("프로젝트로 좁히고 ORDER BY는 떼어 낸다(따옴표 안은 그대로)", () => {
    expect(buildViewAql("ALM", null)).toBe("project = ALM");
    expect(buildViewAql("ALM", "flagged = true ORDER BY created DESC")).toBe("project = ALM AND (flagged = true)");
    expect(buildViewAql("ALM", "ORDER BY key")).toBe("project = ALM");
    expect(aqlWhere('summary ~ "order by me" order by key')).toBe('summary ~ "order by me"');
  });
});
