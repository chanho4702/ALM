import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  createIssue,
  listNotifications,
  listWatchers,
  unwatchIssue,
  updateIssue,
  watchIssue,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("워처", () => {
  it("보고자·담당자는 자동 워처이고, 관심 등록/해제가 멱등으로 된다", async () => {
    const issue = await createIssue({ projectId: "p1", title: "관심 대상", assigneeId: "u2" });
    let view = await listWatchers(issue.id);
    expect(view.watching).toBe(true); // 현재 사용자(u1)가 보고자
    expect(view.watchers.map((w) => w.userId).sort()).toEqual(["u1", "u2"]);

    view = await unwatchIssue(issue.id);
    expect(view.watching).toBe(false);
    expect(view.watchers.map((w) => w.userId)).toEqual(["u2"]);
    view = await watchIssue(issue.id);
    await watchIssue(issue.id);
    expect(view.watching).toBe(true);
    expect((await listWatchers(issue.id)).watchers).toHaveLength(2);
  });

  it("상태 변경·코멘트 알림은 워처 ∪ 담당자 − 행위자에게 간다", async () => {
    const issue = await createIssue({ projectId: "p1", title: "알림 대상", assigneeId: "u2" });
    // u3은 관심만 등록한 사람 — 현재 사용자는 u1이라 스토어에 직접 워처를 넣는 대신 배정 뒤 해제로 만든다
    await updateIssue(issue.id, { assigneeId: "u3" });
    await updateIssue(issue.id, { assigneeId: "u2" });
    const before = {
      u2: (await listNotifications("u2")).length,
      u3: (await listNotifications("u3")).length,
      u1: (await listNotifications("u1")).length,
    };

    await updateIssue(issue.id, { status: "inprogress" });
    const u2 = await listNotifications("u2");
    const u3 = await listNotifications("u3");
    expect(u2.length).toBe(before.u2 + 1);
    expect(u2.some((n) => n.message.includes("진행 중(으)로 옮겼습니다"))).toBe(true);
    expect(u3.length).toBe(before.u3 + 1); // 워처(전 담당자)도 받는다
    expect((await listNotifications("u1")).length).toBe(before.u1); // 행위자 본인은 제외

    await addComment(issue.id, "확인했습니다");
    expect((await listNotifications("u3")).length).toBe(before.u3 + 2);
    expect((await listNotifications("u3")).some((n) => n.message.includes("코멘트를 남겼습니다"))).toBe(true);
  });
});
