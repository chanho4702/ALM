import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  getIssueByKey,
  listProjectStatuses,
  moveIssue,
  resolveSettings,
  setProjectCustom,
  updateIssue,
  updateProjectCustomSettings,
} from "./jiraStore";
import type { SettingsBody, WorkflowTransition } from "./types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function customBody(transitions: WorkflowTransition[]): Promise<SettingsBody> {
  const { body } = await resolveSettings("p1");
  return { ...body, transitions };
}

describe("워크플로 전이 규칙", () => {
  it("전이를 정의하지 않으면 모든 이동이 허용된다 (기존 프로젝트 호환)", async () => {
    const issue = await getIssueByKey("ALM-5"); // 할 일

    await expect(updateIssue(issue!.id, { status: "done" })).resolves.toMatchObject({
      status: "done",
    });
  });

  it("정의한 전이만 허용하고, 막을 때는 상태 이름으로 사유를 말한다", async () => {
    await setProjectCustom("p1", true);
    await updateProjectCustomSettings(
      "p1",
      await customBody([
        { id: "t1", name: "진행 시작", from: ["todo"], to: "inprogress" },
        { id: "t2", name: "완료", from: ["inprogress"], to: "done" },
      ]),
    );
    const issue = await getIssueByKey("ALM-5"); // 할 일

    await expect(updateIssue(issue!.id, { status: "done" })).rejects.toThrow(
      "할 일에서 완료로 옮길 수 없습니다",
    );
    await expect(updateIssue(issue!.id, { status: "inprogress" })).resolves.toMatchObject({
      status: "inprogress",
    });
  });

  it("from이 비면 모든 상태에서 허용한다 (지라의 all statuses)", async () => {
    await setProjectCustom("p1", true);
    await updateProjectCustomSettings(
      "p1",
      await customBody([{ id: "t1", name: "되돌리기", from: [], to: "todo" }]),
    );
    const issue = await getIssueByKey("ALM-2"); // 진행 중

    await expect(updateIssue(issue!.id, { status: "todo" })).resolves.toMatchObject({
      status: "todo",
    });
  });

  it("보드 드래그도 같은 규칙을 따른다", async () => {
    await setProjectCustom("p1", true);
    await updateProjectCustomSettings(
      "p1",
      await customBody([{ id: "t1", name: "진행 시작", from: ["todo"], to: "inprogress" }]),
    );
    const issue = await getIssueByKey("ALM-5");

    await expect(moveIssue(issue!.id, { status: "done" })).rejects.toThrow(
      "할 일에서 완료로 옮길 수 없습니다",
    );
    await expect(moveIssue(issue!.id, { status: "inprogress" })).resolves.toMatchObject({
      status: "inprogress",
    });
  });

  it("같은 상태로 저장하는 것은 전이가 아니다", async () => {
    await setProjectCustom("p1", true);
    await updateProjectCustomSettings(
      "p1",
      await customBody([{ id: "t1", name: "진행 시작", from: ["todo"], to: "inprogress" }]),
    );
    const issue = await getIssueByKey("ALM-5");

    await expect(updateIssue(issue!.id, { status: "todo", priority: "high" })).resolves.toMatchObject(
      { priority: "high" },
    );
  });

  it("상태를 지우면 그 상태를 쓰던 전이도 함께 사라진다", async () => {
    await setProjectCustom("p1", true);
    const { body } = await resolveSettings("p1");
    const withReview: SettingsBody = {
      ...body,
      statuses: [...body.statuses, { id: "review", name: "리뷰", category: "inprogress", order: 9 }],
      transitions: [
        { id: "t1", name: "리뷰 요청", from: ["inprogress"], to: "review" },
        { id: "t2", name: "완료", from: ["review"], to: "done" },
        { id: "t3", name: "진행 시작", from: ["todo"], to: "inprogress" },
      ],
    };
    await updateProjectCustomSettings("p1", withReview);

    // review 상태를 뺀다 — 그 상태를 쓰던 t1·t2는 남으면 안 된다
    await updateProjectCustomSettings("p1", { ...body, transitions: withReview.transitions });

    const { body: after } = await resolveSettings("p1");
    expect(after.transitions?.map((t) => t.id)).toEqual(["t3"]);
    expect(await listProjectStatuses("p1")).not.toContainEqual(
      expect.objectContaining({ id: "review" }),
    );
  });
});
