import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createIssue,
  createPriority,
  createProject,
  deletePriority,
  listPriorities,
  movePriority,
  priorityUsage,
  resolveSettings,
  setProjectCustom,
  updateIssue,
  updatePriority,
  updateProjectCustomSettings,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("우선순위 레지스트리 (지라 5단계 + 커스텀)", () => {
  it("기본 5단계가 높음→낮음 순서로 있고 지울 수 없다", async () => {
    const list = await listPriorities();
    expect(list.map((p) => p.id)).toEqual(["highest", "high", "medium", "low", "lowest"]);
    expect(list.every((p) => p.builtIn)).toBe(true);
    await expect(deletePriority("high")).rejects.toThrow("기본 우선순위는 삭제할 수 없습니다");
  });

  it("커스텀 우선순위를 만들고 순서를 옮기고 이름을 바꾼다", async () => {
    const urgent = await createPriority({ name: "긴급", icon: "flag", color: "danger" });
    expect(urgent.order).toBe(6);
    expect(urgent.builtIn).toBe(false);
    await expect(createPriority({ name: "긴급", icon: "flag", color: "danger" })).rejects.toThrow(
      "우선순위 이름이 중복됩니다: 긴급",
    );
    await movePriority(urgent.id, -1);
    expect((await listPriorities()).map((p) => p.id)).toEqual(["highest", "high", "medium", "low", urgent.id, "lowest"]);
    const renamed = await updatePriority(urgent.id, { name: "장애", color: "warning" });
    expect(renamed).toMatchObject({ name: "장애", color: "warning" });
    expect((await priorityUsage())[urgent.id]).toBe(0);
    await deletePriority(urgent.id);
    expect(await listPriorities()).toHaveLength(5);
  });

  it("쓰이는 우선순위는 지울 수 없다", async () => {
    const urgent = await createPriority({ name: "긴급", icon: "flag", color: "danger" });
    await setProjectCustom("p1", true);
    const resolved = await resolveSettings("p1");
    await updateProjectCustomSettings("p1", {
      ...resolved.body,
      enabledPriorities: [...resolved.body.enabledPriorities, urgent.id],
    });
    await createIssue({ projectId: "p1", title: "긴급 건", priority: urgent.id });
    expect((await priorityUsage())[urgent.id]).toBe(1);
    await expect(deletePriority(urgent.id)).rejects.toThrow("이 우선순위를 쓰는 이슈가 있습니다");
  });
});

describe("프로젝트 우선순위 구성", () => {
  it("우선순위 없이 만든 이슈는 프로젝트 기본값이고, 비활성 우선순위는 거부한다", async () => {
    const project = await createProject({ key: "PR", name: "우선" });
    const plain = await createIssue({ projectId: project.id, title: "기본" });
    expect(plain.priority).toBe("medium");
    expect((await resolveSettings(project.id)).body.enabledPriorities).toEqual([
      "highest", "high", "medium", "low", "lowest",
    ]);

    await setProjectCustom(project.id, true);
    const resolved = await resolveSettings(project.id);
    await updateProjectCustomSettings(project.id, {
      ...resolved.body,
      enabledPriorities: ["high", "low"],
      defaultPriority: "low",
    });
    const next = await createIssue({ projectId: project.id, title: "기본 낮음" });
    expect(next.priority).toBe("low");
    await expect(createIssue({ projectId: project.id, title: "보통?", priority: "medium" })).rejects.toThrow(
      "이 프로젝트에서 사용할 수 없는 우선순위입니다: 보통",
    );
    await expect(updateIssue(next.id, { priority: "urgent" })).rejects.toThrow("없는 우선순위입니다: urgent");
    await expect(
      updateProjectCustomSettings(project.id, { ...resolved.body, enabledPriorities: ["high"], defaultPriority: "low" }),
    ).rejects.toThrow("기본 우선순위는 활성화된 우선순위 중에서 골라야 합니다");
    await expect(
      updateProjectCustomSettings(project.id, { ...resolved.body, enabledPriorities: [], defaultPriority: "low" }),
    ).rejects.toThrow("우선순위는 최소 1개 활성화해야 합니다");
  });

  it("구버전 데이터(대문자·필드 없음)는 소문자 id와 기본 구성으로 승격된다", async () => {
    const raw = JSON.parse(localStorage.getItem("alm.jira.v1") ?? "null");
    expect(raw).toBeNull(); // 시드는 저장 전 — 첫 저장을 유도
    await createProject({ key: "OLD", name: "구버전" });
    const stored = JSON.parse(localStorage.getItem("alm.jira.v1")!);
    stored.issues[0].priority = "HIGH";
    delete stored.priorities;
    for (const scheme of stored.schemes) {
      delete scheme.body.enabledPriorities;
      delete scheme.body.defaultPriority;
    }
    localStorage.setItem("alm.jira.v1", JSON.stringify(stored));
    __resetForTest();
    expect((await listPriorities()).map((p) => p.id)).toEqual(["highest", "high", "medium", "low", "lowest"]);
    const resolved = await resolveSettings("p1");
    expect(resolved.body.defaultPriority).toBe("medium");
    expect(resolved.body.enabledPriorities).toHaveLength(5);
  });
});
