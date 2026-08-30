import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createIssue,
  createIssueType,
  deleteIssueType,
  getIssueByKey,
  issueTypeUsage,
  listIssueTypes,
  listSchemes,
  setIssueParent,
  updateIssue,
  updateIssueType,
  updateScheme,
} from "./jiraStore";

const PROJECT = "p1";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("이슈 타입 레지스트리 (전역)", () => {
  it("기본 5종은 계층(level)·아이콘·색을 갖고 지울 수 없다", async () => {
    const types = await listIssueTypes();
    expect(types.map((t) => [t.id, t.level])).toEqual([
      ["task", "standard"],
      ["story", "standard"],
      ["bug", "standard"],
      ["epic", "epic"],
      ["subtask", "subtask"],
    ]);
    expect(types.find((t) => t.id === "bug")).toMatchObject({ icon: "bug", color: "danger" });
    await expect(deleteIssueType("bug")).rejects.toThrow("기본 이슈 타입은 삭제할 수 없습니다");
    await expect(updateIssueType("epic", { level: "standard" })).rejects.toThrow(
      "기본 이슈 타입의 계층은 바꿀 수 없습니다",
    );
  });

  it("타입을 추가해 스킴에서 켜면 이슈를 만들 수 있고, 이름을 바꾸면 이력 문구에도 반영된다", async () => {
    const improvement = await createIssueType({
      name: "개선",
      level: "standard",
      icon: "lightbulb",
      color: "warning",
    });
    expect(improvement.builtIn).toBe(false);
    await expect(
      createIssueType({ name: "개선", level: "standard", icon: "star", color: "info" }),
    ).rejects.toThrow("이슈 타입 이름이 중복됩니다: 개선");

    // 스킴에 아직 없다 → 생성 거부
    await expect(
      createIssue({ projectId: PROJECT, title: "느린 목록", type: improvement.id }),
    ).rejects.toThrow("이 프로젝트에서 사용할 수 없는 타입입니다: 개선");

    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: { ...scheme.body, enabledTypes: [...scheme.body.enabledTypes, improvement.id] },
    });
    const issue = await createIssue({ projectId: PROJECT, title: "느린 목록", type: improvement.id });
    expect(issue.type).toBe(improvement.id);
    expect((await issueTypeUsage())[improvement.id]).toBe(1);

    await updateIssueType(improvement.id, { name: "개선 요청" });
    expect((await listIssueTypes()).find((t) => t.id === improvement.id)?.name).toBe("개선 요청");
    // 쓰는 이슈가 있으면 지울 수 없다
    await expect(deleteIssueType(improvement.id)).rejects.toThrow("이 타입을 쓰는 이슈가 있습니다");
  });

  it("계층 규칙은 타입 id가 아니라 level에서 나온다 — 사용자 상위 타입 아래에 일반 이슈를 둘 수 있다", async () => {
    const initiative = await createIssueType({
      name: "이니셔티브",
      level: "epic",
      icon: "rocket",
      color: "success",
    });
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: { ...scheme.body, enabledTypes: [...scheme.body.enabledTypes, initiative.id] },
    });
    const parent = await createIssue({ projectId: PROJECT, title: "큰 그림", type: initiative.id });
    const child = (await getIssueByKey("ALM-1"))!; // 일반 이슈
    const updated = await setIssueParent(child.id, parent.id);
    expect(updated.parentId).toBe(parent.id);
    // 상위 타입은 부모를 가질 수 없다
    await expect(setIssueParent(parent.id, child.id)).rejects.toThrow(
      "에픽은 부모를 가질 수 없습니다",
    );
    // 사용자 하위 타입은 자식을 가질 수 없다
    const check = await createIssueType({ name: "체크", level: "subtask", icon: "list-tree", color: "neutral" });
    await updateScheme(scheme.id, {
      body: { ...scheme.body, enabledTypes: [...scheme.body.enabledTypes, initiative.id, check.id] },
    });
    const sub = await createIssue({ projectId: PROJECT, title: "체크 항목", type: check.id, parentId: child.id });
    expect(sub.parentId).toBe(child.id);
    await expect(setIssueParent(child.id, sub.id)).rejects.toThrow("일반 이슈의 부모는 에픽이어야 합니다");
    await expect(updateIssue(child.id, { type: check.id })).rejects.toThrow("하위 이슈가 있어 타입을 변경할 수 없습니다");
  });

  it("타입을 지우면 스킴의 활성 목록에서도 빠진다", async () => {
    const temp = await createIssueType({ name: "임시", level: "standard", icon: "star", color: "info" });
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: { ...scheme.body, enabledTypes: [...scheme.body.enabledTypes, temp.id] },
    });
    await deleteIssueType(temp.id);
    expect((await listSchemes())[0].body.enabledTypes).not.toContain(temp.id);
    expect((await listIssueTypes()).some((t) => t.id === temp.id)).toBe(false);
  });
});
