import { beforeEach, describe, expect, it } from "vitest";
import { AqlError } from "./aql/types";
import {
  __resetForTest,
  createSavedFilter,
  deleteSavedFilter,
  listSavedFilters,
  updateSavedFilter,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/**
 * 파사드 4함수의 목업 절반 — 저장 위치는 종전과 같은 `alm.jira.ui.v1`이라
 * 이미 필터를 저장해 둔 사용자가 이 배치로 필터를 잃지 않는다.
 */
describe("저장 필터 파사드 (목업)", () => {
  it("만들기·나열·수정·삭제가 이름 순 목록으로 이어진다", async () => {
    const bugs = await createSavedFilter({ name: "내 버그", query: "타입:버그" });
    await createSavedFilter({ name: "마감 임박", query: "due < -1d", kind: "aql" });

    expect((await listSavedFilters()).map((f) => f.name)).toEqual(["내 버그", "마감 임박"]);
    expect((await listSavedFilters()).find((f) => f.name === "마감 임박")?.kind).toBe("aql");

    const renamed = await updateSavedFilter(bugs.id, { name: "버그 모음", query: "타입:버그 담당:나" });
    expect(renamed).toMatchObject({ name: "버그 모음", query: "타입:버그 담당:나", kind: "smart" });

    await deleteSavedFilter(bugs.id);
    expect((await listSavedFilters()).map((f) => f.name)).toEqual(["마감 임박"]);
  });

  it("이름 정렬은 숫자 → 영문 → 한글, 대소문자는 동률이고 id로 가른다", async () => {
    // 서버 Java Collator(ko, PRIMARY) 실측 순서. 저장 순서와 일부러 반대로 넣는다
    await createSavedFilter({ name: "가나다", query: "a" });
    const lower = await createSavedFilter({ name: "apple", query: "b" });
    const upper = await createSavedFilter({ name: "Apple", query: "c" });
    await createSavedFilter({ name: "2026 계획", query: "d" });

    const names = (await listSavedFilters()).map((f) => f.name);
    expect(names[0]).toBe("2026 계획");
    expect(names[3]).toBe("가나다");
    // apple/Apple은 1차 강도에서 동률이라 붙어 서고, 그 둘 사이 순서는 id ASC가 정한다
    expect([...names.slice(1, 3)].sort()).toEqual(["Apple", "apple"]);
    expect(names[1]).toBe(lower.id.localeCompare(upper.id) < 0 ? "apple" : "Apple");
  });

  it("kind=aql은 저장 전에 문법을 본다 — 자리를 짚는 AqlError로 던진다", async () => {
    // 서버도 `AqlParser`+`AqlValidation`으로 같은 자리에서 400을 낸다
    await expect(
      createSavedFilter({ name: "잘못된 AQL", query: "statuss = done", kind: "aql" }),
    ).rejects.toThrow("필드를 모릅니다: statuss");

    const failure = await createSavedFilter({
      name: "밑줄 자리",
      query: "priority ~ high",
      kind: "aql",
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AqlError);
    expect((failure as AqlError).position).toBe(9);

    // 스마트 질의는 문법 검사를 타지 않는다 — 못 알아듣는 토큰도 검색어로 보존되는 문법이다
    await expect(
      createSavedFilter({ name: "스마트", query: "statuss = done" }),
    ).resolves.toMatchObject({ kind: "smart" });
  });

  it("kind를 안 주면 스마트다 — 옛 저장분과 같은 취급", async () => {
    const created = await createSavedFilter({ name: "기본", query: "상태:진행중" });
    expect(created.kind).toBe("smart");
  });

  it("이름 중복·빈 질의·없는 id는 서버와 같은 문구로 거절한다", async () => {
    const first = await createSavedFilter({ name: "같은 이름", query: "a" });

    await expect(createSavedFilter({ name: "같은 이름", query: "b" })).rejects.toThrow(
      "같은 이름의 필터가 있습니다",
    );
    await expect(createSavedFilter({ name: "빈 질의", query: "   " })).rejects.toThrow(
      "필터 질의를 입력하세요",
    );
    await expect(createSavedFilter({ name: "x".repeat(61), query: "a" })).rejects.toThrow(
      "필터 이름은 60자 이하여야 합니다",
    );
    await expect(
      createSavedFilter({ name: "긴 질의", query: "a".repeat(4001) }),
    ).rejects.toThrow("필터 질의는 4000자 이하여야 합니다");
    await expect(updateSavedFilter("없는-id", { query: "a" })).rejects.toThrow(
      "필터를 찾을 수 없습니다",
    );

    // 서버는 없는 id(남의 것 포함)에 404다 — 목업이 조용히 성공하면 화면이 거짓말을 한다
    await expect(deleteSavedFilter("없는-id")).rejects.toThrow(
      "저장 필터를 찾을 수 없습니다: 없는-id",
    );

    // 거절된 뒤에도 원본은 그대로다
    expect((await listSavedFilters()).map((f) => f.id)).toEqual([first.id]);
  });
});
