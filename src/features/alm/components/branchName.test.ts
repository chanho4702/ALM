import { describe, expect, it } from "vitest";
import { BRANCH_SLUG_MAX, branchName, branchSlug, isCopyBranchKey } from "./branchName";

describe("git 브랜치 이름(README 슬러그 규칙)", () => {
  it("README 예시 그대로 — 음역 없음, 한글만이면 키만", () => {
    expect(branchName({ key: "ALM-12", title: "로그인 개선 (OAuth2)" })).toBe("alm-12-oauth2");
    expect(branchName({ key: "ALM-12", title: "검색 속도 개선" })).toBe("alm-12");
    expect(branchName({ key: "ALM-12", title: "Fix N+1 in board" })).toBe("alm-12-fix-n-1-in-board");
    expect(branchName({ key: "ALM-12", title: "Login bug" })).toBe("alm-12-login-bug");
  });

  it("연속 구분자는 하나로, 앞뒤 구분자는 지운다", () => {
    expect(branchSlug("  --Hello,,, World!!  ")).toBe("hello-world");
    expect(branchSlug("___")).toBe("");
  });

  it("40자를 넘으면 단어 경계(앞 -)에서 자른다", () => {
    const slug = branchSlug("Improve the performance of the issue search page considerably");
    expect(slug.length).toBeLessThanOrEqual(BRANCH_SLUG_MAX);
    expect(slug).toBe("improve-the-performance-of-the-issue");
    // 자른 자리 바로 뒤가 구분자 — 마지막 단어를 지우지 않는다
    expect(branchSlug(`${"a".repeat(40)} tail`)).toBe("a".repeat(40));
    // 단어 하나가 40자를 넘으면 그대로 자른다
    expect(branchSlug("x".repeat(50))).toBe("x".repeat(40));
  });

  it("접두가 있으면 접두/키-슬러그", () => {
    expect(branchName({ key: "WEB-3", title: "Dark mode" }, "chanho/")).toBe("chanho/web-3-dark-mode");
  });

  it("⌘/Ctrl+Shift+. 판정 — 배열과 무관하게 물리 키", () => {
    const base = { ctrlKey: false, metaKey: false, shiftKey: true, altKey: false, code: "Period", key: ">" };
    expect(isCopyBranchKey({ ...base, ctrlKey: true })).toBe(true);
    expect(isCopyBranchKey({ ...base, metaKey: true })).toBe(true);
    expect(isCopyBranchKey(base)).toBe(false);
    expect(isCopyBranchKey({ ...base, ctrlKey: true, shiftKey: false })).toBe(false);
  });
});
