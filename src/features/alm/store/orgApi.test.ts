import { describe, expect, it } from "vitest";
import { orgApiFetch } from "./orgApi";

/**
 * 테스트(vitest)는 목업 모드다 — `orgApiFetch`는 목업 어댑터를 고른다.
 * 여기서 검증하는 것은 "패키지가 이 어댑터로 무엇을 받는가"이지 네트워크가 아니다.
 */
describe("@chanho/org-admin 인증 fetch 어댑터 (목업 모드)", () => {
  it("/api/org/me는 목업 프로필로 답한다 — 승인 대기 게이트가 목업에서도 돌아야 한다", async () => {
    const response = await orgApiFetch("/api/org/me");
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { status: string; globalRoles: string[] };
    expect(body.status).toBe("ACTIVE");
    expect(body.globalRoles).toContain("ADMIN");
  });

  it("나머지 org API는 패키지 오류 계약({error})으로 거절한다 — 개발 서버 index.html을 삼키지 않는다", async () => {
    const response = await orgApiFetch("/api/org/members/page?page=0");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(501);
    expect(((await response.json()) as { error: string }).error).toContain("목업 모드");
  });
});
