import { describe, expect, it } from "vitest";
import type { Issue } from "../store/types";
import { activatesFocusedControl, isCommandPaletteKey, shortcutKeyName } from "./keyboardShortcuts";
import { issueKeyFromTarget, selectionRange } from "./useIssueInteractions";
import { describeTargets, patchIssueLocally } from "./useIssueActions";
import { fieldChoices, newLabelChoice } from "./issueCommands";

const issue = (over: Partial<Issue>): Issue => ({
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
  resolvedAt: null,
  startDate: null,
  storyPoints: null,
  flagged: false,
  triageState: null,
  fixVersionId: null,
  labels: [],
  order: 1,
  version: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...over,
});

const options = { statuses: [], users: [], priorities: [], labels: ["frontend", "design"] };

describe("다중 선택 범위 (Shift+클릭)", () => {
  const order = ["a", "b", "c", "d"];
  it("기준점부터 고른 이슈까지 양끝 포함, 방향과 무관하게 보이는 순서로", () => {
    expect(selectionRange(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(selectionRange(order, "d", "a")).toEqual(["a", "b", "c", "d"]);
  });
  it("기준점이 없거나 사라졌으면 고른 것 하나", () => {
    expect(selectionRange(order, null, "c")).toEqual(["c"]);
    expect(selectionRange(order, "zz", "c")).toEqual(["c"]);
    expect(selectionRange(order, "a", "zz")).toEqual([]);
  });
});

describe("이벤트 대상 → 이슈 키", () => {
  it("이슈 요소의 data-issue-key, 표 행이면 행 안의 키 칸", () => {
    document.body.innerHTML = `
      <div data-issue-key="ALM-3"><span id="inner">x</span></div>
      <table><tbody><tr><td><span data-issue-key="ALM-9">ALM-9</span></td><td id="cell">제목</td></tr></tbody></table>
      <p id="outside">밖</p>`;
    expect(issueKeyFromTarget(document.getElementById("inner"))).toBe("ALM-3");
    expect(issueKeyFromTarget(document.getElementById("cell"))).toBe("ALM-9");
    expect(issueKeyFromTarget(document.getElementById("outside"))).toBeNull();
    expect(issueKeyFromTarget(null)).toBeNull();
  });
});

describe("낙관적 반영 (patchIssueLocally)", () => {
  it("일괄 패치의 필드만 바꾸고 라벨은 더하고 뺀다(중복 없이)", () => {
    const before = issue({ labels: ["frontend"], assigneeId: "u1" });
    const after = patchIssueLocally(before, { status: "done", addLabels: ["frontend", "qa"], removeLabels: ["x"] });
    expect(after).toMatchObject({ status: "done", assigneeId: "u1", labels: ["frontend", "qa"] });
    expect(patchIssueLocally(after, { assigneeId: null, removeLabels: ["frontend"] })).toMatchObject({
      assigneeId: null,
      labels: ["qa"],
    });
    expect(before.labels).toEqual(["frontend"]); // 원본 불변
  });
  it("대상 묘사 — 하나면 키, 여럿이면 개수", () => {
    expect(describeTargets([issue({})])).toBe("ALM-1");
    expect(describeTargets([issue({}), issue({ id: "i2", key: "ALM-2" })])).toBe("2개 이슈");
  });
});

describe("필드 선택지", () => {
  it("라벨은 전부 가진 경우에만 체크되고, 그때 고르면 뺀다(아니면 붙인다)", () => {
    const both = [issue({ labels: ["frontend"] }), issue({ id: "i2", labels: ["frontend", "design"] })];
    const [frontend, design] = fieldChoices("labels", both, options);
    expect(frontend).toMatchObject({ checked: true, patch: { removeLabels: ["frontend"] } });
    expect(design).toMatchObject({ checked: false, patch: { addLabels: ["design"] } });
  });
  it("담당자 첫 선택지는 미지정, 우선순위는 레지스트리가 비면 기본 5단계", () => {
    expect(fieldChoices("assignee", [issue({})], options)[0]).toMatchObject({ label: "미지정", checked: true, patch: { assigneeId: null } });
    expect(fieldChoices("priority", [issue({})], options).map((c) => c.label)).toEqual(["최상", "높음", "보통", "낮음", "최하"]);
  });
  it("새 라벨 — 기존 라벨·공백·쉼표·빈 값이면 만들지 않는다", () => {
    expect(newLabelChoice("urgent", options)?.patch).toEqual({ addLabels: ["urgent"] });
    expect(newLabelChoice("frontend", options)).toBeNull();
    expect(newLabelChoice("a b", options)).toBeNull();
    expect(newLabelChoice("a,b", options)).toBeNull();
    expect(newLabelChoice("  ", options)).toBeNull();
  });
});

describe("키 판정", () => {
  const key = (init: KeyboardEventInit, target?: Element) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, ...init });
    if (target) Object.defineProperty(event, "target", { value: target });
    return event;
  };
  it("공백은 바인딩 문법에서 Space", () => {
    expect(shortcutKeyName({ key: " " })).toBe("Space");
    expect(shortcutKeyName({ key: "x" })).toBe("x");
  });
  it("⌘K·Ctrl+K — 입력란에서도 열리지만 리치 에디터·IME·Shift 조합은 아니다", () => {
    document.body.innerHTML = `<input id="field" /><div contenteditable="true" id="editor"></div>`;
    expect(isCommandPaletteKey(key({ key: "k", ctrlKey: true }))).toBe(true);
    expect(isCommandPaletteKey(key({ key: "K", metaKey: true }))).toBe(true);
    expect(isCommandPaletteKey(key({ key: "k", ctrlKey: true }, document.getElementById("field")!))).toBe(true);
    expect(isCommandPaletteKey(key({ key: "k", ctrlKey: true }, document.getElementById("editor")!))).toBe(false);
    expect(isCommandPaletteKey(key({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isCommandPaletteKey(key({ key: "k", ctrlKey: true, isComposing: true }))).toBe(false);
    expect(isCommandPaletteKey(key({ key: "k" }))).toBe(false);
  });
  it("Space·Enter는 포커스된 버튼의 몫 — 이슈 요소(카드·백로그 행)만 단축키로 넘긴다", () => {
    document.body.innerHTML = `
      <button id="plain">열</button>
      <div role="button" tabindex="0" data-issue-key="ALM-1" id="row"></div>
      <div data-issue-key="ALM-2"><button class="issue-card" id="card"></button></div>`;
    const at = (id: string, k = " ") => activatesFocusedControl({ key: k, target: document.getElementById(id) });
    expect(at("plain")).toBe(true);
    expect(at("plain", "Enter")).toBe(true);
    expect(at("plain", "x")).toBe(false);
    expect(at("row")).toBe(false);
    expect(at("card")).toBe(false);
    expect(activatesFocusedControl({ key: " ", target: document.body })).toBe(false);
  });
});
