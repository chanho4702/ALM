import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, createIssue, listIssues } from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("목업 createIssue 멱등 키(N10) — 프로덕션과 같은 의미론", () => {
  it("같은 키로 두 번 만들면 같은 이슈를 돌려주고 하나만 남는다", async () => {
    const first = await createIssue({ projectId: "p1", title: "멱등", idempotencyKey: "k-1" });
    const again = await createIssue({ projectId: "p1", title: "멱등", idempotencyKey: "k-1" });
    expect(again.id).toBe(first.id);
    expect(again.key).toBe(first.key);
    expect((await listIssues("p1")).filter((i) => i.title === "멱등")).toHaveLength(1);
  });

  it("다른 키·키 없음은 각각 새로 만든다", async () => {
    await createIssue({ projectId: "p1", title: "각각", idempotencyKey: "k-1" });
    await createIssue({ projectId: "p1", title: "각각", idempotencyKey: "k-2" });
    await createIssue({ projectId: "p1", title: "각각" });
    expect((await listIssues("p1")).filter((i) => i.title === "각각")).toHaveLength(3);
  });

  it("실패한 시도는 키를 기억하지 않는다 — 같은 키로 다시 만들 수 있다", async () => {
    await expect(createIssue({ projectId: "p1", title: "  ", idempotencyKey: "k-3" })).rejects.toThrow();
    const ok = await createIssue({ projectId: "p1", title: "다시", idempotencyKey: "k-3" });
    expect(ok.title).toBe("다시");
  });
});
