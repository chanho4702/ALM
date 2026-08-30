import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addIssueLink,
  createLinkType,
  deleteLinkType,
  linkTypeUsage,
  listIssueLinks,
  listLinkTypes,
  moveLinkType,
  updateLinkType,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("링크 타입 레지스트리 (지라 업무 항목 연결)", () => {
  it("기본 5종이 순서대로 있고 지울 수 없다", async () => {
    const list = await listLinkTypes();
    expect(list.map((t) => t.id)).toEqual(["blocks", "relates", "duplicates", "causes", "clones"]);
    expect(list.find((t) => t.id === "relates")).toMatchObject({ outward: "관련됨", inward: "관련됨" });
    await expect(deleteLinkType("blocks")).rejects.toThrow("기본 링크 타입은 삭제할 수 없습니다");
  });

  it("대칭 타입은 역방향도 중복이고 방향 없이 보인다, 비대칭은 역방향이 별개다", async () => {
    // 시드: i3 -blocks-> i2. i2와 i4를 관련(대칭)으로
    await addIssueLink({ sourceId: "i2", targetId: "i4", type: "relates" });
    await expect(addIssueLink({ sourceId: "i4", targetId: "i2", type: "relates" })).rejects.toThrow("이미 연결돼 있습니다");
    await addIssueLink({ sourceId: "i2", targetId: "i4", type: "duplicates" });
    await addIssueLink({ sourceId: "i4", targetId: "i2", type: "duplicates" });
    const views = await listIssueLinks("i4");
    expect(views.find((v) => v.link.type === "relates")?.direction).toBe("outward");
    expect(views.filter((v) => v.link.type === "duplicates").map((v) => v.direction).sort()).toEqual(["inward", "outward"]);
    await expect(addIssueLink({ sourceId: "i2", targetId: "i4", type: "nope" })).rejects.toThrow("없는 링크 타입입니다: nope");
  });

  it("커스텀 타입을 만들고, 쓰이면 대칭 여부를 못 바꾸고 지우지 못한다", async () => {
    const dep = await createLinkType({ name: "의존", outward: "의존함", inward: "의존됨" });
    expect(dep.order).toBe(6);
    await expect(createLinkType({ name: "의존", outward: "a", inward: "b" })).rejects.toThrow("링크 타입 이름이 중복됩니다: 의존");
    await moveLinkType(dep.id, -1);
    expect((await listLinkTypes()).map((t) => t.id)[4]).toBe(dep.id);
    await addIssueLink({ sourceId: "i2", targetId: "i4", type: dep.id });
    expect((await linkTypeUsage())[dep.id]).toBe(1);
    await expect(updateLinkType(dep.id, { outward: "의존", inward: "의존" })).rejects.toThrow(
      "이 타입을 쓰는 링크가 있어 방향성(대칭 여부)을 바꿀 수 없습니다",
    );
    expect((await updateLinkType(dep.id, { name: "선행" })).name).toBe("선행");
    await expect(deleteLinkType(dep.id)).rejects.toThrow("이 타입을 쓰는 링크가 있습니다");
  });
});
