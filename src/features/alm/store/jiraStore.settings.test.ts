import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  assignScheme,
  countSchemeProjects,
  createIssue,
  createProject,
  createScheme,
  deleteScheme,
  getIssueByKey,
  listSchemes,
  resolveSettings,
  setDefaultScheme,
  setProjectCustom,
  updateIssue,
  updateProjectCustomSettings,
  updateScheme,
} from "./jiraStore";
import type { SettingsBody } from "./types";

const PROJECT = "p1";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 검증 통과하는 최소 커스텀 본문 — 진행 중 상태 이름을 바꾸고 버그/에픽 비활성 */
function customBody(): SettingsBody {
  return {
    statuses: [
      { id: "todo", name: "대기", category: "todo", order: 1 },
      { id: "inprogress", name: "작업 중", category: "inprogress", order: 2 },
      { id: "done", name: "끝", category: "done", order: 3 },
    ],
    enabledTypes: ["task", "story", "subtask"],
  };
}

describe("스킴 기본", () => {
  it("시드: 디폴트 스킴 1개, 프로젝트는 스킴을 상속(resolveSettings source=scheme)", async () => {
    const schemes = await listSchemes();
    expect(schemes).toHaveLength(1);
    expect(schemes[0]).toMatchObject({ name: "기본 스킴", isDefault: true });

    const resolved = await resolveSettings(PROJECT);
    expect(resolved.source).toBe("scheme");
    expect(resolved.body.statuses.map((s) => s.id)).toEqual(["todo", "inprogress", "done"]);
    expect(resolved.body.enabledTypes).toContain("subtask");
    expect(await countSchemeProjects(schemes[0].id)).toBe(1);
  });

  it("새 프로젝트는 디폴트 스킴에 자동 배정된다", async () => {
    const project = await createProject({ key: "PAY", name: "결제" });
    const resolved = await resolveSettings(project.id);
    expect(resolved.scheme.isDefault).toBe(true);
  });

  it("스킴 생성(디폴트 복사)·이름 중복 거부·디폴트 지정", async () => {
    const scheme = await createScheme("개발팀 스킴");
    expect(scheme.isDefault).toBe(false);
    expect(scheme.body.statuses).toHaveLength(3);
    await expect(createScheme("개발팀 스킴")).rejects.toThrow("이미 존재하는 스킴 이름입니다");

    await setDefaultScheme(scheme.id);
    const schemes = await listSchemes();
    expect(schemes.filter((s) => s.isDefault)).toHaveLength(1);
    expect(schemes.find((s) => s.id === scheme.id)?.isDefault).toBe(true);
  });

  it("배정된 스킴·디폴트 스킴은 삭제할 수 없다", async () => {
    const [defaultScheme] = await listSchemes();
    await expect(deleteScheme(defaultScheme.id)).rejects.toThrow(
      "디폴트 스킴은 삭제할 수 없습니다",
    );
    const scheme = await createScheme("임시");
    await assignScheme(PROJECT, scheme.id);
    await expect(deleteScheme(scheme.id)).rejects.toThrow(
      "배정된 프로젝트가 있는 스킴은 삭제할 수 없습니다",
    );
  });
});

describe("스킴 본문 검증", () => {
  it("카테고리 누락·이름 중복·subtask 비활성·전 타입 비활성은 거부", async () => {
    const [scheme] = await listSchemes();
    const base = customBody();
    await expect(
      updateScheme(scheme.id, {
        body: { ...base, statuses: base.statuses.filter((s) => s.category !== "done") },
      }),
    ).rejects.toThrow("카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다");
    await expect(
      updateScheme(scheme.id, {
        body: {
          ...base,
          statuses: base.statuses.map((s) => ({ ...s, name: "같음" })),
        },
      }),
    ).rejects.toThrow("상태 이름이 중복됩니다");
    await expect(
      updateScheme(scheme.id, { body: { ...base, enabledTypes: ["task"] } }),
    ).rejects.toThrow("하위 작업 타입은 비활성화할 수 없습니다");
    await expect(
      updateScheme(scheme.id, { body: { ...base, enabledTypes: ["subtask"] } }),
    ).rejects.toThrow("이슈 타입은 최소 1개 활성화해야 합니다");
  });
});

describe("타입 활성화가 이슈 생성/전환을 제약한다", () => {
  it("스킴에서 버그를 끄면 생성·전환이 거부되고, 기존 버그 이슈는 유지된다", async () => {
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, { body: customBody() }); // 버그/에픽 비활성

    await expect(
      createIssue({ projectId: PROJECT, title: "새 버그", type: "bug" }),
    ).rejects.toThrow("이 프로젝트에서 사용할 수 없는 타입입니다: 버그");

    const task = await getIssueByKey("ALM-1");
    await expect(updateIssue(task!.id, { type: "bug" })).rejects.toThrow(
      "이 프로젝트에서 사용할 수 없는 타입입니다: 버그",
    );

    // 기존 버그(ALM-8)는 그대로 조회된다
    expect((await getIssueByKey("ALM-8"))!.type).toBe("bug");
    // 하위 작업은 항상 허용
    const sub = await createIssue({
      projectId: PROJECT,
      title: "하위",
      type: "subtask",
      parentId: task!.id,
    });
    expect(sub.type).toBe("subtask");
  });

  it("task가 꺼져 있으면 기본 타입은 첫 활성 타입이 된다", async () => {
    const [scheme] = await listSchemes();
    const body = customBody();
    body.enabledTypes = ["story", "subtask"];
    await updateScheme(scheme.id, { body });
    const issue = await createIssue({ projectId: PROJECT, title: "기본 타입" });
    expect(issue.type).toBe("story");
  });
});

describe("프로젝트 커스텀 전환/복귀·스킴 재배정", () => {
  it("커스텀 전환은 현재 스킴 값을 복사하고, 이후 스킴 변경의 영향을 받지 않는다", async () => {
    await setProjectCustom(PROJECT, true);
    expect((await resolveSettings(PROJECT)).source).toBe("custom");

    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, { body: customBody() }); // 스킴 변경
    const resolved = await resolveSettings(PROJECT);
    expect(resolved.body.enabledTypes).toContain("bug"); // 커스텀은 복사 시점 값 유지
    expect(await countSchemeProjects(scheme.id)).toBe(0); // 공유 카운트에서 제외
  });

  it("커스텀 편집은 커스텀일 때만, 스킴 복귀 시 custom이 폐기된다", async () => {
    await expect(updateProjectCustomSettings(PROJECT, customBody())).rejects.toThrow(
      "커스텀 설정을 사용 중일 때만 편집할 수 있습니다",
    );
    await setProjectCustom(PROJECT, true);
    await updateProjectCustomSettings(PROJECT, customBody());
    expect((await resolveSettings(PROJECT)).body.statuses[1].name).toBe("작업 중");

    await setProjectCustom(PROJECT, false);
    const resolved = await resolveSettings(PROJECT);
    expect(resolved.source).toBe("scheme");
    expect(resolved.body.statuses[1].name).toBe("진행 중");
  });

  it("스킴 재배정: 커스텀 해제 + 새 스킴 상태에 없는 이슈는 같은 카테고리로 이관", async () => {
    const scheme = await createScheme("새 스킴");
    // 새 스킴의 진행 중 상태 id를 다르게 만들어 이관을 유발
    const body = customBody();
    body.statuses[1] = { id: "review", name: "리뷰", category: "inprogress", order: 2 };
    await updateScheme(scheme.id, { body });

    await assignScheme(PROJECT, scheme.id);
    const resolved = await resolveSettings(PROJECT);
    expect(resolved.scheme.name).toBe("새 스킴");
    // 진행 중이던 ALM-2는 같은 카테고리(inprogress)의 review로 이관
    expect((await getIssueByKey("ALM-2"))!.status).toBe("review");
    // todo/done 이슈는 id가 같아 무이동
    expect((await getIssueByKey("ALM-4"))!.status).toBe("todo");
  });
});
