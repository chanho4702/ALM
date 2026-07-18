import { describe, expect, it } from "vitest";
import { EMPTY_QUERY, parseSmartQuery, serializeQuery } from "./searchQuery";
import type { QueryContext } from "./searchQuery";

const ctx: QueryContext = {
  users: [
    { id: "u1", name: "김찬호" },
    { id: "u2", name: "이서연" },
  ],
  projects: [
    { id: "p1", key: "ALM", name: "ALM 플랫폼", description: "", createdAt: "" },
    { id: "p2", key: "PAY", name: "결제", description: "", createdAt: "" },
  ],
};

describe("parseSmartQuery", () => {
  it("한국어 토큰을 파싱하고 나머지는 텍스트로 남긴다", () => {
    const query = parseSmartQuery("상태:진행중 담당:김찬호 타입:버그 로그인 오류", ctx);
    expect(query.statuses).toEqual(["inprogress"]);
    expect(query.assigneeIds).toEqual(["u1"]);
    expect(query.types).toEqual(["bug"]);
    expect(query.text).toBe("로그인 오류");
  });

  it("같은 토큰 반복은 OR로 누적되고 중복은 제거된다", () => {
    const query = parseSmartQuery("상태:할일 상태:완료 상태:할일 라벨:backend 라벨:api", ctx);
    expect(query.statuses).toEqual(["todo", "done"]);
    expect(query.labels).toEqual(["backend", "api"]);
  });

  it("담당:미지정 센티널·프로젝트 키(소문자 허용)·정렬을 인식한다", () => {
    const query = parseSmartQuery("담당:미지정 프로젝트:pay 정렬:마감", ctx);
    expect(query.assigneeIds).toEqual(["unassigned"]);
    expect(query.projectIds).toEqual(["p2"]);
    expect(query.sort).toBe("due");
  });

  it("인식할 수 없는 토큰 값은 텍스트로 취급한다 (입력 손실 없음)", () => {
    const query = parseSmartQuery("상태:몰라 담당:없는사람 진짜검색어", ctx);
    expect(query.statuses).toEqual([]);
    expect(query.text).toBe("상태:몰라 담당:없는사람 진짜검색어");
  });

  it("상태:커스텀이름은 statusIds로 매치된다 — 공백 제거 이름도 허용 (설계 v3 ④)", () => {
    const withStatuses: QueryContext = {
      ...ctx,
      statuses: [
        { id: "review", name: "리뷰" },
        { id: "code-review", name: "코드 리뷰" },
      ],
    };
    expect(parseSmartQuery("상태:리뷰", withStatuses).statusIds).toEqual(["review"]);
    // 이름의 공백은 토큰에 담을 수 없다 → 공백 제거 형태로 매치
    expect(parseSmartQuery("상태:코드리뷰", withStatuses).statusIds).toEqual(["code-review"]);
    // 카테고리 라벨은 여전히 카테고리 매치가 우선
    expect(parseSmartQuery("상태:진행중", withStatuses).statuses).toEqual(["inprogress"]);
    // ctx에 상태가 없으면 텍스트로 남는다
    expect(parseSmartQuery("상태:리뷰", ctx).text).toBe("상태:리뷰");
  });
});

describe("serializeQuery 라운드트립", () => {
  it("직렬화한 문자열을 다시 파싱하면 같은 쿼리가 된다", () => {
    const original = parseSmartQuery(
      "프로젝트:ALM 상태:진행중 우선순위:높음 타입:스토리 담당:이서연 라벨:frontend 정렬:마감 보드",
      ctx,
    );
    const roundTripped = parseSmartQuery(serializeQuery(original, ctx), ctx);
    expect(roundTripped).toEqual(original);
  });

  it("기본 정렬(수정)은 직렬화에서 생략된다", () => {
    expect(serializeQuery({ ...EMPTY_QUERY, text: "abc" }, ctx)).toBe("abc");
  });

  it("statusIds는 공백 제거 이름 토큰으로 왕복한다", () => {
    const withStatuses: QueryContext = {
      ...ctx,
      statuses: [{ id: "code-review", name: "코드 리뷰" }],
    };
    const original = parseSmartQuery("상태:코드리뷰 검색어", withStatuses);
    expect(serializeQuery(original, withStatuses)).toBe("상태:코드리뷰 검색어");
    expect(parseSmartQuery(serializeQuery(original, withStatuses), withStatuses)).toEqual(original);
  });
});
