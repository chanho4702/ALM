import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createIssue,
  listSchemes,
  resolveSettings,
  setProjectCustom,
  updateProjectCustomSettings,
  updateScheme,
} from "./jiraStore";
import { ISSUE_FIELD_IDS } from "./types";
import type { IssueFieldConfig, SettingsBody } from "./types";

const PROJECT = "p1";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 기본 구성에서 한 필드만 바꾼 구성 */
function fieldsWith(id: string, patch: Partial<IssueFieldConfig>): IssueFieldConfig[] {
  return ISSUE_FIELD_IDS.map((fieldId) =>
    fieldId === id
      ? { id: fieldId, visible: true, required: false, ...patch }
      : { id: fieldId, visible: true, required: false },
  );
}

async function saveSchemeFields(fields: IssueFieldConfig[]): Promise<void> {
  const [scheme] = await listSchemes();
  await updateScheme(scheme.id, { body: { ...scheme.body, fields } });
}

describe("필드 구성 — 기본값", () => {
  it("스킴·프로젝트 해석 결과에 13종이 전부 표시·비필수로 실린다", async () => {
    const [scheme] = await listSchemes();
    expect(scheme.body.fields?.map((f) => f.id)).toEqual([...ISSUE_FIELD_IDS]);

    const resolved = await resolveSettings(PROJECT);
    expect(resolved.body.fields).toHaveLength(13);
    expect(resolved.body.fields?.every((f) => f.visible && !f.required)).toBe(true);
  });

  it("fields가 없는 구버전 본문도 읽을 때 기본값으로 채워진다", async () => {
    const [scheme] = await listSchemes();
    const legacy = { ...scheme.body } as SettingsBody;
    delete legacy.fields;
    await updateScheme(scheme.id, { body: legacy });

    const resolved = await resolveSettings(PROJECT);
    expect(resolved.body.fields?.map((f) => f.id)).toEqual([...ISSUE_FIELD_IDS]);
  });
});

describe("필드 구성 — 검증", () => {
  it("모르는 id는 거부한다", async () => {
    await expect(
      saveSchemeFields([{ id: "reporter" as IssueFieldConfig["id"], visible: true, required: false }]),
    ).rejects.toThrow("없는 필드입니다: reporter");
  });

  it("숨긴 필드를 필수로 지정할 수 없다", async () => {
    await expect(saveSchemeFields(fieldsWith("assignee", { visible: false, required: true }))).rejects.toThrow(
      "숨긴 필드는 필수로 지정할 수 없습니다: 담당자",
    );
  });

  it("해결·상위 항목은 필수로 지정할 수 없다", async () => {
    await expect(saveSchemeFields(fieldsWith("resolution", { required: true }))).rejects.toThrow(
      "해결은 완료 상태에서만 입력하므로 필수로 지정할 수 없습니다",
    );
    await expect(saveSchemeFields(fieldsWith("parent", { required: true }))).rejects.toThrow(
      "상위 항목은 최상위 이슈가 있어야 하므로 필수로 지정할 수 없습니다",
    );
  });

  it("빈 id는 이름이 사라지는 문구 대신 따로 말한다", async () => {
    await expect(
      saveSchemeFields([{ id: "" as IssueFieldConfig["id"], visible: true, required: false }]),
    ).rejects.toThrow("필드 id가 비어 있습니다");
    await expect(
      saveSchemeFields([{ visible: true, required: false } as IssueFieldConfig]),
    ).rejects.toThrow("필드 id가 비어 있습니다");
  });

  it("같은 필드를 두 번 넣을 수 없다", async () => {
    await expect(
      saveSchemeFields([
        { id: "assignee", visible: true, required: false },
        { id: "assignee", visible: false, required: false },
      ]),
    ).rejects.toThrow("같은 필드를 두 번 넣을 수 없습니다: 담당자");
  });
});

describe("필드 구성 — 만들기 필수 검사", () => {
  it("담당자가 필수면 담당자 없이 만들 수 없고, 지정하면 만들어진다", async () => {
    await saveSchemeFields(fieldsWith("assignee", { required: true }));

    await expect(createIssue({ projectId: PROJECT, title: "담당자 없음" })).rejects.toThrow(
      "담당자는 필수입니다",
    );
    const issue = await createIssue({ projectId: PROJECT, title: "담당자 있음", assigneeId: "u1" });
    expect(issue.assigneeId).toBe("u1");
  });

  it("설명·라벨이 필수면 빈 값을 거부한다", async () => {
    await saveSchemeFields(fieldsWith("description", { required: true }));
    await expect(createIssue({ projectId: PROJECT, title: "설명 없음" })).rejects.toThrow(
      "설명은 필수입니다",
    );
    await expect(
      createIssue({ projectId: PROJECT, title: "빈 설명", description: "<p></p>" }),
    ).rejects.toThrow("설명은 필수입니다");

    await saveSchemeFields(fieldsWith("labels", { required: true }));
    await expect(
      createIssue({ projectId: PROJECT, title: "라벨 없음", labels: [] }),
    ).rejects.toThrow("라벨은 필수입니다");
    await expect(
      createIssue({ projectId: PROJECT, title: "라벨 있음", labels: ["api"] }),
    ).resolves.toMatchObject({ labels: ["api"] });
  });

  it("수정 버전을 필수로 두면 고르기 전에는 만들 수 없고, 다른 프로젝트·보관된 버전은 거부한다", async () => {
    const { createVersion, archiveVersion, createProject } = await import("./jiraStore");
    const version = await createVersion(PROJECT, { name: "1.0.0" });
    await saveSchemeFields(fieldsWith("fixVersion", { required: true }));

    await expect(createIssue({ projectId: PROJECT, title: "버전 없음" })).rejects.toThrow(
      "수정 버전은 필수입니다",
    );
    await expect(
      createIssue({ projectId: PROJECT, title: "버전 있음", fixVersionId: version.id }),
    ).resolves.toMatchObject({ fixVersionId: version.id });

    const other = await createProject({ key: "OPS", name: "운영" });
    const otherVersion = await createVersion(other.id, { name: "2.0.0" });
    await expect(
      createIssue({ projectId: PROJECT, title: "남의 버전", fixVersionId: otherVersion.id }),
    ).rejects.toThrow("다른 프로젝트의 버전입니다");

    await archiveVersion(version.id);
    await expect(
      createIssue({ projectId: PROJECT, title: "보관된 버전", fixVersionId: version.id }),
    ).rejects.toThrow("보관된 버전에는 이슈를 달 수 없습니다");
  });

  it("수정은 필수 검사를 하지 않는다 — 기존 이슈를 갑자기 막지 않는다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "먼저 만든 이슈" });
    await saveSchemeFields(fieldsWith("assignee", { required: true }));
    const { updateIssue } = await import("./jiraStore");
    await expect(updateIssue(issue.id, { title: "제목만 바꾼다" })).resolves.toMatchObject({
      title: "제목만 바꾼다",
    });
  });

  it("첨부·링크는 필수로 켤 수 있지만 만들기를 막지 않는다", async () => {
    await saveSchemeFields(
      ISSUE_FIELD_IDS.map((id) => ({
        id,
        visible: true,
        required: id === "attachments" || id === "links",
      })),
    );
    await expect(createIssue({ projectId: PROJECT, title: "첨부 없이도 만들어진다" })).resolves.toMatchObject(
      { title: "첨부 없이도 만들어진다" },
    );
  });

  it("담당자 필수는 명시 선택만 인정한다 — 프로젝트 기본 담당자로는 통과하지 않는다", async () => {
    const { updateProject } = await import("./jiraStore");
    await updateProject(PROJECT, { leadId: "u1", defaultAssignee: "lead" });
    await saveSchemeFields(fieldsWith("assignee", { required: true }));
    await expect(createIssue({ projectId: PROJECT, title: "기본 담당자만" })).rejects.toThrow(
      "담당자는 필수입니다",
    );
  });

  it("다른 구획(이슈 타입) 저장이 필드 구성을 지우지 않는다", async () => {
    await saveSchemeFields(fieldsWith("dueDate", { visible: false }));
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: { ...scheme.body, enabledTypes: ["task", "subtask"] },
    });
    const resolved = await resolveSettings(PROJECT);
    expect(resolved.body.fields).toHaveLength(13);
    expect(resolved.body.fields?.find((f) => f.id === "dueDate")?.visible).toBe(false);
  });

  it("프로젝트 커스텀은 스킴과 다르게 동작한다", async () => {
    await saveSchemeFields(fieldsWith("dueDate", { required: true }));
    await expect(createIssue({ projectId: PROJECT, title: "마감일 없음" })).rejects.toThrow(
      "마감일은 필수입니다",
    );

    await setProjectCustom(PROJECT, true);
    const resolved = await resolveSettings(PROJECT);
    await updateProjectCustomSettings(PROJECT, {
      ...resolved.body,
      fields: fieldsWith("dueDate", { required: false }),
    });
    await expect(createIssue({ projectId: PROJECT, title: "마감일 없이 통과" })).resolves.toMatchObject(
      { title: "마감일 없이 통과" },
    );
  });
});

/** 스킴 본문에 타입별 덮어쓰기를 저장한다 */
async function saveSchemeFieldsByType(
  byType: Record<string, IssueFieldConfig[]>,
): Promise<void> {
  const [scheme] = await listSchemes();
  await updateScheme(scheme.id, { body: { ...scheme.body, fieldsByType: byType } });
}

describe("필드 구성 — 이슈 타입별 구성", () => {
  it("덮어쓰기가 있는 타입만 키로 남고, 각 목록은 13종으로 채워진다", async () => {
    await saveSchemeFieldsByType({ bug: fieldsWith("dueDate", { visible: false }) });

    const resolved = await resolveSettings(PROJECT);
    expect(Object.keys(resolved.body.fieldsByType ?? {})).toEqual(["bug"]);
    expect(resolved.body.fieldsByType?.bug).toHaveLength(13);
    expect(resolved.body.fieldsByType?.bug.find((f) => f.id === "dueDate")?.visible).toBe(false);
    // 기본 구성은 그대로다 — 덮어쓰기는 그 타입에만 산다
    expect(resolved.body.fields?.find((f) => f.id === "dueDate")?.visible).toBe(true);
  });

  it("덮어쓰기에 없는 필드는 기본 구성을 따른다", async () => {
    await saveSchemeFields(fieldsWith("labels", { visible: false }));
    // 마감일 하나만 담은 부분 덮어쓰기 — 나머지는 기본 구성 그대로여야 한다
    await saveSchemeFieldsByType({ bug: [{ id: "dueDate", visible: false, required: false }] });

    const resolved = await resolveSettings(PROJECT);
    const bug = resolved.body.fieldsByType?.bug ?? [];
    expect(bug.find((f) => f.id === "dueDate")?.visible).toBe(false);
    expect(bug.find((f) => f.id === "labels")?.visible).toBe(false); // 기본 구성에서 물려받음
    expect(bug.find((f) => f.id === "assignee")?.visible).toBe(true);
  });

  it("없는 이슈 타입을 키로 쓰면 거부한다", async () => {
    await expect(saveSchemeFieldsByType({ ghost: fieldsWith("dueDate", { visible: false }) })).rejects.toThrow(
      "없는 이슈 타입입니다: ghost",
    );
  });

  it("타입별 목록도 기본 구성과 같은 규칙을 탄다", async () => {
    await expect(
      saveSchemeFieldsByType({ bug: fieldsWith("assignee", { visible: false, required: true }) }),
    ).rejects.toThrow("숨긴 필드는 필수로 지정할 수 없습니다: 담당자");
    await expect(
      saveSchemeFieldsByType({ subtask: fieldsWith("parent", { required: true }) }),
    ).rejects.toThrow("상위 항목은 최상위 이슈가 있어야 하므로 필수로 지정할 수 없습니다");
    await expect(
      saveSchemeFieldsByType({ bug: [{ id: "reporter" as IssueFieldConfig["id"], visible: true, required: false }] }),
    ).rejects.toThrow("없는 필드입니다: reporter");
  });

  it("만들기 필수 검사는 요청의 타입으로 해석한다", async () => {
    await saveSchemeFieldsByType({ bug: fieldsWith("dueDate", { required: true }) });

    await expect(
      createIssue({ projectId: PROJECT, title: "버그, 마감일 없음", type: "bug" }),
    ).rejects.toThrow("마감일은 필수입니다");
    // 덮어쓰기가 없는 타입은 기본 구성(비필수)을 따른다
    await expect(
      createIssue({ projectId: PROJECT, title: "작업은 통과", type: "task" }),
    ).resolves.toMatchObject({ type: "task" });
    await expect(
      createIssue({ projectId: PROJECT, title: "버그, 마감일 있음", type: "bug", dueDate: "2026-09-30" }),
    ).resolves.toMatchObject({ dueDate: "2026-09-30" });
  });

  it("타입별 덮어쓰기가 기본 구성의 필수를 풀 수도 있다", async () => {
    await saveSchemeFields(fieldsWith("assignee", { required: true }));
    await saveSchemeFieldsByType({ bug: fieldsWith("assignee", { required: false }) });

    await expect(createIssue({ projectId: PROJECT, title: "작업", type: "task" })).rejects.toThrow(
      "담당자는 필수입니다",
    );
    await expect(
      createIssue({ projectId: PROJECT, title: "버그", type: "bug" }),
    ).resolves.toMatchObject({ type: "bug" });
  });

  it("이슈 타입을 지우면 그 타입의 덮어쓰기도 사라진다", async () => {
    const { createIssueType, deleteIssueType, listSchemes: schemes } = await import("./jiraStore");
    const custom = await createIssueType({ name: "결함", level: "standard", icon: "bug", color: "danger" });
    const [scheme] = await schemes();
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        enabledTypes: [...scheme.body.enabledTypes, custom.id],
        fieldsByType: { [custom.id]: fieldsWith("dueDate", { visible: false }) },
      },
    });
    expect((await resolveSettings(PROJECT)).body.fieldsByType?.[custom.id]).toHaveLength(13);

    await deleteIssueType(custom.id);

    const resolved = await resolveSettings(PROJECT);
    expect(resolved.body.fieldsByType?.[custom.id]).toBeUndefined();
    // 덮어쓰기가 하나도 없어도 맵 자체는 실린다(서버 응답 shape과 같게 — 키 생략 아님)
    expect(resolved.body.fieldsByType).toEqual({});
  });

  it("프로젝트 커스텀도 타입별 덮어쓰기를 갖는다", async () => {
    await setProjectCustom(PROJECT, true);
    const resolved = await resolveSettings(PROJECT);
    await updateProjectCustomSettings(PROJECT, {
      ...resolved.body,
      fieldsByType: { story: fieldsWith("estimate", { required: true }) },
    });

    await expect(
      createIssue({ projectId: PROJECT, title: "스토리", type: "story" }),
    ).rejects.toThrow("예상 시간은 필수입니다");
    await expect(
      createIssue({ projectId: PROJECT, title: "작업", type: "task" }),
    ).resolves.toMatchObject({ type: "task" });
  });

  it("덮어쓰기가 없어도 fieldsByType는 빈 맵으로 실린다", async () => {
    const [scheme] = await listSchemes();
    expect(scheme.body.fieldsByType).toEqual({});
    expect((await resolveSettings(PROJECT)).body.fieldsByType).toEqual({});
  });

  it("빈 목록은 오류가 아니라 '기본 구성 따름'이라 키째 사라진다", async () => {
    await saveSchemeFieldsByType({ bug: [] });

    const resolved = await resolveSettings(PROJECT);
    expect(resolved.body.fieldsByType).toEqual({});
    // 저장한 뒤에도 그 타입은 기본 구성으로 만들어진다
    await saveSchemeFields(fieldsWith("dueDate", { required: true }));
    await expect(
      createIssue({ projectId: PROJECT, title: "버그", type: "bug" }),
    ).rejects.toThrow("마감일은 필수입니다");
  });
});
