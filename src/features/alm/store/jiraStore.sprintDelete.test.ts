import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { deleteSprint as restDeleteSprint } from "./jiraApi";
import {
  __resetForTest,
  createIssue,
  createSprint,
  deleteSprint,
  listIssues,
  listSprints,
  updateProjectMemberRole,
} from "./jiraStore";
import { __versionForTest, updateIssue } from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("예정 스프린트 삭제 (F-10, 목업)", () => {
  it("이슈 3개가 든 예정 스프린트를 지우면 스프린트가 사라지고 이슈는 원래 순서로 백로그 맨 위에 남는다", async () => {
    const sprint = await createSprint("p1");
    const titles = ["첫째", "둘째", "셋째"];
    for (const title of titles) {
      const issue = await createIssue({ projectId: "p1", title, sprintId: sprint.id });
      expect(issue.sprintId).toBe(sprint.id);
    }
    const backlogBefore = (await listIssues("p1")).filter((i) => i.sprintId === null).map((i) => i.title);

    await deleteSprint(sprint.id);

    expect((await listSprints("p1")).some((s) => s.id === sprint.id)).toBe(false);
    const backlog = (await listIssues("p1")).filter((i) => i.sprintId === null).sort((a, b) => a.order - b.order);
    expect(backlog.map((i) => i.title)).toEqual([...titles, ...backlogBefore]);
  });

  it("진행 중 스프린트는 409 문구로 거부한다", async () => {
    const active = (await listSprints("p1")).find((s) => s.state === "active")!;
    await expect(deleteSprint(active.id)).rejects.toMatchObject({ status: 409, message: "예정 스프린트만 삭제할 수 있습니다" });
    expect((await listSprints("p1")).some((s) => s.id === active.id)).toBe(true);
  });

  it("프로젝트 관리자가 아니면 지울 수 없다", async () => {
    const sprint = await createSprint("p1");
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "editor");
    await expect(deleteSprint(sprint.id)).rejects.toThrow();
    expect((await listSprints("p1")).some((s) => s.id === sprint.id)).toBe(true);
  });

  it("목업 이슈 버전 헬퍼와 함께 써도 이슈 저장이 깨지지 않는다(삭제 뒤 백로그 이슈 편집)", async () => {
    const sprint = await createSprint("p1");
    const issue = await createIssue({ projectId: "p1", title: "옮겨질 이슈", sprintId: sprint.id });
    await deleteSprint(sprint.id);
    const updated = await updateIssue(issue.id, { title: "옮겨진 이슈" }, __versionForTest("issue", issue.id));
    expect(updated).toMatchObject({ title: "옮겨진 이슈", sprintId: null });
  });
});

describe("예정 스프린트 삭제 (F-10, REST)", () => {
  it("DELETE /api/alm/sprints/{id} — 409·403은 서버 문구 그대로", async () => {
    const spy = vi
      .spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "예정 스프린트만 삭제할 수 있습니다" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );
    await restDeleteSprint("5");
    expect(spy.mock.calls[0][0]).toBe("/api/alm/sprints/5");
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
    await expect(restDeleteSprint("6")).rejects.toThrow("예정 스프린트만 삭제할 수 있습니다");
  });
});
