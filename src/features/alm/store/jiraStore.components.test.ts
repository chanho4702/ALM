import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createComponent,
  createIssue,
  deleteComponent,
  getIssueByKey,
  listComponents,
  listIssues,
  updateComponent,
  updateIssue,
  updateProject,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("컴포넌트 (지라 Components)", () => {
  it("프로젝트별로 만들고 이슈에 여러 개 붙이며 목록을 거른다", async () => {
    const api = await createComponent("p1", { name: "API", description: "백엔드" });
    const ui = await createComponent("p1", { name: "UI" });
    await expect(createComponent("p1", { name: "API" })).rejects.toThrow("컴포넌트 이름이 중복됩니다: API");
    expect((await listComponents("p1")).map((c) => c.name)).toEqual(["API", "UI"]);

    const issue = await createIssue({ projectId: "p1", title: "API 이슈", componentIds: [api.id, api.id] });
    expect(issue.componentIds).toEqual([api.id]);
    expect((await listIssues("p1", { componentId: api.id })).map((i) => i.id)).toEqual([issue.id]);
    expect((await listComponents("p1"))[0].issueCount).toBe(1);

    const moved = await updateIssue(issue.id, { componentIds: [ui.id] });
    expect(moved.componentIds).toEqual([ui.id]);
    await expect(updateIssue(issue.id, { componentIds: ["nope"] })).rejects.toThrow("컴포넌트를 찾을 수 없습니다");

    await deleteComponent(ui.id);
    expect((await getIssueByKey(issue.key))?.componentIds).toEqual([]);
  });

  it("컴포넌트 기본 담당자가 프로젝트 규칙보다 우선한다", async () => {
    await updateProject("p1", { defaultAssignee: "lead" }); // 프로젝트 리더 u1
    const api = await createComponent("p1", { name: "API", leadId: "u2", defaultAssignee: "lead" });
    const none = await createComponent("p1", { name: "기타", defaultAssignee: "unassigned" });
    expect((await createIssue({ projectId: "p1", title: "a", componentIds: [api.id] })).assigneeId).toBe("u2");
    expect((await createIssue({ projectId: "p1", title: "b", componentIds: [none.id, api.id] })).assigneeId).toBeNull();
    expect((await createIssue({ projectId: "p1", title: "c" })).assigneeId).toBe("u1");
    await expect(updateComponent(api.id, { defaultAssignee: "boss" as never })).rejects.toThrow(
      "기본 담당자는 project/lead/unassigned 중 하나입니다",
    );
    const renamed = await updateComponent(api.id, { name: "API v2", leadId: null });
    expect(renamed).toMatchObject({ name: "API v2", leadId: null });
  });
});
