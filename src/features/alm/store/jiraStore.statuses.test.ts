import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createStatusCategory,
  createStatusDef,
  deleteStatusCategory,
  deleteStatusDef,
  listIssues,
  listProjectStatuses,
  listSchemes,
  listStatusCategories,
  listStatusDefs,
  statusDefUsage,
  updateIssue,
  updateScheme,
  updateStatusCategory,
  updateStatusDef,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("상태 카테고리 (전역)", () => {
  it("기본 3개는 의미(kind)·색을 갖고 삭제할 수 없으며, 의미는 바꿀 수 없다", async () => {
    const categories = await listStatusCategories();
    expect(categories.map((c) => [c.id, c.kind, c.color])).toEqual([
      ["todo", "new", "neutral"],
      ["inprogress", "active", "info"],
      ["done", "complete", "success"],
    ]);
    await expect(deleteStatusCategory("done")).rejects.toThrow("기본 카테고리는 삭제할 수 없습니다");
    await expect(updateStatusCategory("done", { kind: "active" })).rejects.toThrow(
      "기본 카테고리의 의미는 바꿀 수 없습니다",
    );
    // 이름·색은 바꿀 수 있다
    await updateStatusCategory("done", { name: "끝", color: "warning" });
    expect((await listStatusCategories()).find((c) => c.id === "done")).toMatchObject({
      name: "끝",
      color: "warning",
    });
  });

  it("카테고리를 추가하면 뒤에 붙고, 상태가 쓰는 동안은 지울 수 없다", async () => {
    const review = await createStatusCategory({ name: "검토", kind: "active", color: "warning" });
    expect(review.builtIn).toBe(false);
    expect((await listStatusCategories()).map((c) => c.id)).toEqual([
      "todo",
      "inprogress",
      "done",
      review.id,
    ]);
    await expect(createStatusCategory({ name: "검토", kind: "new", color: "info" })).rejects.toThrow(
      "카테고리 이름이 중복됩니다: 검토",
    );

    const status = await createStatusDef({ name: "코드 리뷰", categoryId: review.id });
    await expect(deleteStatusCategory(review.id)).rejects.toThrow("이 카테고리를 쓰는 상태가 있습니다");
    await deleteStatusDef(status.id);
    await deleteStatusCategory(review.id);
    expect((await listStatusCategories()).some((c) => c.id === review.id)).toBe(false);
  });
});

describe("전역 상태 레지스트리", () => {
  it("시드의 세 상태가 레지스트리에 있고, 워크플로 사용 수를 센다", async () => {
    const defs = await listStatusDefs();
    expect(defs.map((d) => d.id)).toEqual(["todo", "inprogress", "done"]);
    expect(await statusDefUsage()).toEqual({ todo: 1, inprogress: 1, done: 1 });
  });

  it("워크플로에 넣은 상태는 이름·카테고리를 레지스트리에서 읽고, 이름을 바꾸면 프로젝트에 반영된다", async () => {
    const review = await createStatusDef({ name: "리뷰", categoryId: "inprogress" });
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        statuses: [
          ...scheme.body.statuses,
          { id: review.id, name: review.name, category: "inprogress", order: 4 },
        ],
      },
    });

    let statuses = await listProjectStatuses("p1");
    expect(statuses.find((s) => s.id === review.id)).toMatchObject({
      name: "리뷰",
      category: "inprogress",
      kind: "active",
      color: "info",
    });

    await updateStatusDef(review.id, { name: "코드 리뷰" });
    statuses = await listProjectStatuses("p1");
    expect(statuses.find((s) => s.id === review.id)?.name).toBe("코드 리뷰");
    expect((await listSchemes())[0].body.statuses.find((s) => s.id === review.id)?.name).toBe(
      "코드 리뷰",
    );
  });

  it("워크플로가 쓰는 상태는 지울 수 없고, 이름은 레지스트리 전체에서 유일해야 한다", async () => {
    await expect(deleteStatusDef("todo")).rejects.toThrow("워크플로에서 쓰는 상태는 삭제할 수 없습니다");
    await expect(createStatusDef({ name: "완료", categoryId: "done" })).rejects.toThrow(
      "상태 이름이 중복됩니다: 완료",
    );
    await expect(createStatusDef({ name: "보관", categoryId: "없음" })).rejects.toThrow(
      "카테고리를 찾을 수 없습니다",
    );
  });

  it("워크플로 본문의 이름·카테고리는 레지스트리로 관통 저장된다 (기존 편집 경로 호환)", async () => {
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        statuses: scheme.body.statuses.map((s) =>
          s.id === "inprogress" ? { ...s, name: "작업 중" } : s,
        ),
      },
    });
    expect((await listStatusDefs()).find((d) => d.id === "inprogress")?.name).toBe("작업 중");
  });
});

describe("상태 아이콘 (서버 V20 계약과 같은 규칙)", () => {
  it("레지스트리는 저장 원본을, 워크플로 본문은 해석된 아이콘을 준다", async () => {
    // 기본 3종 시드는 서버 V20와 같은 키다
    const defs = await listStatusDefs();
    expect(defs.map((d) => [d.id, d.icon])).toEqual([
      ["todo", "circle"],
      ["inprogress", "loader-circle"],
      ["done", "circle-check"],
    ]);

    // 아이콘을 안 주고 만들면 저장 원본은 빈 문자열 — 편집기가 "미지정"을 보여야 한다
    const review = await createStatusDef({ name: "코드 리뷰", categoryId: "inprogress" });
    expect(review.icon).toBe("");
    expect((await listStatusDefs()).find((d) => d.id === review.id)!.icon).toBe("");

    // 반면 워크플로 본문의 icon은 해석된 값 — 미지정이면 kind 기본으로 채워져 빈 문자열이 없다
    const scheme = (await listSchemes())[0];
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        statuses: [
          ...scheme.body.statuses,
          { id: review.id, name: "코드 리뷰", category: "inprogress", order: 4 },
        ],
      },
    });
    const statuses = await listProjectStatuses("p1");
    expect(statuses.find((s) => s.id === review.id)!.icon).toBe("refresh-cw"); // active 기본
    expect(statuses.find((s) => s.id === "done")!.icon).toBe("circle-check");
    expect(statuses.every((s) => (s.icon ?? "") !== "")).toBe(true);
  });

  it("빈 문자열로 되돌리면 미지정으로 저장되고 본문은 다시 kind 기본으로 해석된다", async () => {
    await updateStatusDef("done", { icon: "archive" });
    expect((await listStatusDefs()).find((d) => d.id === "done")!.icon).toBe("archive");
    expect((await listProjectStatuses("p1")).find((s) => s.id === "done")!.icon).toBe("archive");

    await updateStatusDef("done", { icon: "" });
    expect((await listStatusDefs()).find((d) => d.id === "done")!.icon).toBe("");
    expect((await listProjectStatuses("p1")).find((s) => s.id === "done")!.icon).toBe("circle-check");
  });
});

describe("완료 판정은 카테고리 의미에서 나온다", () => {
  it("사용자 카테고리(의미=완료)의 상태로 옮기면 해결이 채워지고, 다시 나오면 비워진다", async () => {
    const closed = await createStatusCategory({ name: "종료", kind: "complete", color: "neutral" });
    const archived = await createStatusDef({ name: "보관", categoryId: closed.id });
    const [scheme] = await listSchemes();
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        statuses: [
          ...scheme.body.statuses,
          { id: archived.id, name: "보관", category: closed.id, order: 4 },
        ],
      },
    });

    // 아직 완료되지 않은 이슈 하나 — 시드의 완료 이슈는 이미 해결이 채워져 있다
    const issue = (await listIssues("p1")).find((i) => i.status === "todo")!;
    expect(issue.resolution).toBeNull();
    const moved = await updateIssue(issue.id, { status: archived.id });
    expect(moved.resolution).toBe("done");
    const reopened = await updateIssue(issue.id, { status: "todo" });
    expect(reopened.resolution).toBeNull();
  });

  it("의미(할 일/진행 중/완료)마다 상태가 최소 1개 있어야 저장된다", async () => {
    const [scheme] = await listSchemes();
    await expect(
      updateScheme(scheme.id, {
        body: { ...scheme.body, statuses: scheme.body.statuses.filter((s) => s.id !== "done") },
      }),
    ).rejects.toThrow("카테고리(할 일/진행 중/완료)마다 상태가 최소 1개 필요합니다");
  });
});

describe("워크플로 캔버스 배치", () => {
  it("노드 위치는 본문과 함께 저장되고, 빠진 상태의 위치는 정리된다", async () => {
    const [scheme] = await listSchemes();
    const review = await createStatusDef({ name: "리뷰", categoryId: "inprogress" });
    await updateScheme(scheme.id, {
      body: {
        ...scheme.body,
        statuses: [
          ...scheme.body.statuses,
          { id: review.id, name: "리뷰", category: "inprogress", order: 4 },
        ],
        layout: { todo: { x: 10, y: 20 }, [review.id]: { x: 300, y: 40 }, ghost: { x: 1, y: 1 } },
      },
    });
    let body = (await listSchemes())[0].body;
    expect(body.layout).toEqual({ todo: { x: 10, y: 20 }, [review.id]: { x: 300, y: 40 } });

    await updateScheme(scheme.id, {
      body: { ...body, statuses: body.statuses.filter((s) => s.id !== review.id) },
    });
    body = (await listSchemes())[0].body;
    expect(body.layout).toEqual({ todo: { x: 10, y: 20 } });
  });
});
