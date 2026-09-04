import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { createIssue, resolveSettings, updateProjectCustomSettings, updateScheme } from "./jiraApi";
import type { IssueFieldConfig, SettingsBody } from "./types";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

const FIELDS: IssueFieldConfig[] = [
  { id: "assignee", visible: true, required: true },
  { id: "dueDate", visible: false, required: false },
];

const BODY: SettingsBody = {
  statuses: [{ id: "todo", name: "할 일", category: "todo", order: 1 }],
  enabledTypes: ["task", "subtask"],
  enabledPriorities: ["medium"],
  defaultPriority: "medium",
  fields: FIELDS,
};

afterEach(() => vi.restoreAllMocks());

describe("jiraApi 필드 구성 계약", () => {
  it("스킴 저장 요청 body에 fields가 그대로 실린다", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValue(response(200, { id: "s1", name: "기본 스킴", isDefault: true, body: BODY }));

    const saved = await updateScheme("s1", { body: BODY });

    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.body.fields).toEqual(FIELDS);
    expect(saved.body.fields).toEqual(FIELDS);
  });

  it("프로젝트 커스텀 저장도 fields를 보낸다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(response(204));

    await updateProjectCustomSettings("7", BODY);

    const [path, init] = spy.mock.calls[0];
    expect(path).toContain("/settings/custom-body");
    expect(JSON.parse(String((init as RequestInit).body)).fields).toEqual(FIELDS);
  });

  it("이슈 생성 요청은 details.fixVersionId를 보낸다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      response(201, {
        id: 9, key: "ALM-9", projectId: 7, title: "t", description: "", type: "task", status: "todo",
        priority: "medium", assigneeId: null, reporterId: 1, parentId: null, dueDate: null,
        estimateHours: null, labels: [], order: 1, version: 1,
        createdAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z",
      }),
    );

    await createIssue({ projectId: "7", title: "수정 버전 포함", fixVersionId: "3" });

    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.details.fixVersionId).toBe(3);
  });

  it("예상 시간도 그대로 보낸다 — 예전처럼 null로 고정하지 않는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      response(201, {
        id: 11, key: "ALM-11", projectId: 7, title: "t", description: "", type: "task", status: "todo",
        priority: "medium", assigneeId: null, reporterId: 1, parentId: null, dueDate: null,
        estimateHours: 2.5, labels: [], order: 1, version: 1,
        createdAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z",
      }),
    );

    await createIssue({ projectId: "7", title: "예상 시간 포함", estimateHours: 2.5 });

    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.details.estimateHours).toBe(2.5);
  });

  it("수정 버전을 고르지 않으면 null로 보낸다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      response(201, {
        id: 10, key: "ALM-10", projectId: 7, title: "t", description: "", type: "task", status: "todo",
        priority: "medium", assigneeId: null, reporterId: 1, parentId: null, dueDate: null,
        estimateHours: null, labels: [], order: 1, version: 1,
        createdAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z",
      }),
    );

    await createIssue({ projectId: "7", title: "버전 없음" });

    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.details.fixVersionId).toBeNull();
  });

  it("\"없음\" 센티널이 0으로 새지 않는다 — 빈 값은 보내기 전에 막힌다", async () => {
    // 서버 fixVersionId에 @Positive가 걸려 있어 0이 나가면 400이 된다.
    // Select는 빈 문자열 value를 못 쓰지만, 혹시 새어 나와도 요청 전에 막히는지 고정한다.
    const spy = vi.spyOn(client, "sharedApiFetch");
    await expect(
      createIssue({ projectId: "7", title: "빈 버전", fixVersionId: "" }),
    ).rejects.toThrow("잘못된 백엔드 id");
    await expect(
      createIssue({ projectId: "7", title: "0 버전", fixVersionId: "0" }),
    ).rejects.toThrow("잘못된 백엔드 id");
    expect(spy).not.toHaveBeenCalled();
  });

  it("프로젝트 설정 응답의 fields를 그대로 읽는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      response(200, {
        body: BODY,
        source: "custom",
        scheme: { id: "s1", name: "기본 스킴", isDefault: true, body: BODY },
      }),
    );

    const resolved = await resolveSettings("7");
    expect(resolved.body.fields).toEqual(FIELDS);
  });
});
