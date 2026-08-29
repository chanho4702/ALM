import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  getIssueByKey,
  listActivity,
  moveIssue,
  updateIssue,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("해결(Resolution)", () => {
  it("완료 카테고리로 옮기면 해결이 '완료됨'으로 채워진다 (지라 기본값)", async () => {
    const issue = await getIssueByKey("ALM-5"); // 할 일

    const moved = await updateIssue(issue!.id, { status: "done" });

    expect(moved.resolution).toBe("done");
  });

  it("완료에서 벗어나면 해결이 비워진다 (다시 열기)", async () => {
    const issue = await getIssueByKey("ALM-1"); // 시드 완료 이슈
    expect(issue!.resolution).toBe("done");

    const reopened = await updateIssue(issue!.id, { status: "inprogress" });

    expect(reopened.resolution).toBeNull();
  });

  it("완료된 이슈의 해결을 다른 값으로 바꿀 수 있고 활동로그에 남는다", async () => {
    const issue = await getIssueByKey("ALM-1");

    const updated = await updateIssue(issue!.id, { resolution: "wont_do" });

    expect(updated.resolution).toBe("wont_do");
    const activity = await listActivity(issue!.id);
    expect(activity.at(-1)).toMatchObject({ type: "resolution", detail: "완료됨 → 하지 않음" });
  });

  it("완료가 아닌 이슈에는 해결을 설정할 수 없다", async () => {
    const issue = await getIssueByKey("ALM-5");

    await expect(updateIssue(issue!.id, { resolution: "duplicate" })).rejects.toThrow(
      "완료된 이슈에만 해결을 설정할 수 있습니다",
    );
  });

  it("상태와 해결을 한 번에 바꾸면 명시한 해결이 기본값보다 우선한다", async () => {
    const issue = await getIssueByKey("ALM-5");

    const moved = await updateIssue(issue!.id, { status: "done", resolution: "duplicate" });

    expect(moved.resolution).toBe("duplicate");
  });

  it("보드 드래그로 완료 컬럼에 놓아도 같은 규칙이 적용된다", async () => {
    const issue = await getIssueByKey("ALM-2"); // 진행 중

    const moved = await moveIssue(issue!.id, { status: "done" });
    expect(moved.resolution).toBe("done");

    const back = await moveIssue(issue!.id, { status: "todo" });
    expect(back.resolution).toBeNull();
  });
});
