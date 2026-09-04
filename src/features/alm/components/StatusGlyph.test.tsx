import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WorkflowStatus } from "../store/types";
import { StatusGlyph } from "./StatusGlyph";
import { DEFAULT_STATUS_ICON, KIND_DEFAULT_STATUS_ICON, statusIcon } from "./labels";

const review: WorkflowStatus = {
  id: "st-review",
  name: "코드 리뷰",
  category: "inprogress",
  order: 2,
  kind: "active",
  color: "info",
  icon: "eye",
};

describe("statusIcon (아이콘 폴백 규칙)", () => {
  it("레지스트리 아이콘이 있으면 그것을 쓴다", () => {
    expect(statusIcon([review], "st-review")).toBe("eye");
  });

  it("빈 문자열이면 카테고리 의미(kind)의 기본 아이콘으로 폴백한다", () => {
    const blank: WorkflowStatus[] = [
      { ...review, icon: "" },
      { id: "st-hold", name: "보류", category: "todo", order: 1, kind: "new", color: "neutral", icon: "   " },
      { id: "st-ship", name: "배포됨", category: "done", order: 3, kind: "complete", color: "success" },
    ];
    expect(statusIcon(blank, "st-review")).toBe(KIND_DEFAULT_STATUS_ICON.active);
    expect(statusIcon(blank, "st-hold")).toBe(KIND_DEFAULT_STATUS_ICON.new);
    expect(statusIcon(blank, "st-ship")).toBe(KIND_DEFAULT_STATUS_ICON.complete);
  });

  it("목록이 없으면 기본 3상태로 폴백하고, 모르는 id는 '할 일' 취급이다", () => {
    expect(statusIcon(undefined, "done")).toBe(KIND_DEFAULT_STATUS_ICON.complete);
    expect(statusIcon(undefined, "inprogress")).toBe(KIND_DEFAULT_STATUS_ICON.active);
    expect(statusIcon(undefined, "st-unknown")).toBe(DEFAULT_STATUS_ICON);
  });
});

describe("StatusGlyph", () => {
  it("이름을 읽어 주는 role=img로 그리고 색은 카테고리 색 클래스로만 준다", () => {
    render(<StatusGlyph status="st-review" statuses={[review]} />);
    const glyph = screen.getByRole("img", { name: "상태: 코드 리뷰" });
    // 색만으로 구분하지 않는다 — 접근성 이름이 항상 상태 이름을 갖는다
    expect(glyph).toHaveClass("status-glyph", "is-info");
    // 하드코딩 색이 아니라 토큰 클래스여야 한다(인라인 style 금지)
    expect(glyph.getAttribute("style")).toBeNull();
    expect(glyph.querySelector("svg")).toBeTruthy();
  });

  it("아이콘 키가 맵에 없으면 기본 아이콘으로 떨어지되 이름은 유지한다", () => {
    render(<StatusGlyph status="st-review" statuses={[{ ...review, icon: "없는-키" }]} />);
    expect(screen.getByRole("img", { name: "상태: 코드 리뷰" }).querySelector("svg")).toBeTruthy();
  });
});
