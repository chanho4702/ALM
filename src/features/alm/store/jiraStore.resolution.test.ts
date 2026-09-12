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

  it("해결 시각은 해결이 생길 때 찍히고 풀리면 지워진다 (AQL resolved의 원천)", async () => {
    const open = await getIssueByKey("ALM-5"); // 할 일 — 아직 해결 없음
    expect(open!.resolvedAt).toBeNull();

    const done = await updateIssue(open!.id, { status: "done" });
    expect(done.resolution).toBe("done");
    expect(done.resolvedAt).not.toBeNull();
    const firstResolvedAt = done.resolvedAt!;

    // 해결 값만 바꾸는 것은 "다시 해결"이 아니다 — 처음 해결한 시각을 지킨다
    const changed = await updateIssue(open!.id, { resolution: "duplicate" });
    expect(changed.resolvedAt).toBe(firstResolvedAt);

    const reopened = await updateIssue(open!.id, { status: "inprogress" });
    expect(reopened.resolution).toBeNull();
    expect(reopened.resolvedAt).toBeNull();

    const again = await updateIssue(open!.id, { status: "done" });
    expect(again.resolvedAt).not.toBeNull();
  });

  it("해결 시각 도입 전 데이터는 마지막 수정 시각으로 백필된다", async () => {
    // 시드는 resolvedAt 없이 들어오고 normalize가 채운다 (서버 V23 백필과 같은 규칙)
    const seeded = await getIssueByKey("ALM-1");
    expect(seeded!.resolution).toBe("done");
    expect(seeded!.resolvedAt).toBe(seeded!.updatedAt);
  });

  it("보드 드래그로 완료 컬럼에 놓아도 같은 규칙이 적용된다", async () => {
    const issue = await getIssueByKey("ALM-2"); // 진행 중

    const moved = await moveIssue(issue!.id, { status: "done" });
    expect(moved.resolution).toBe("done");

    const back = await moveIssue(issue!.id, { status: "todo" });
    expect(back.resolution).toBeNull();
  });
});
