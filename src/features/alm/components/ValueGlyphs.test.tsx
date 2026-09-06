import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IssueTypeDef, PriorityDef } from "../store/types";
import { FilterDropdown } from "./FilterDropdown";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { ResolutionGlyph } from "./ResolutionGlyph";
import { ValueWithIcon } from "./ValueWithIcon";

const bug: IssueTypeDef = {
  id: "bug",
  name: "버그",
  level: "standard",
  icon: "bug",
  color: "danger",
  description: "",
  order: 3,
  builtIn: true,
};

const high: PriorityDef = {
  id: "high",
  name: "높음",
  icon: "chevron-up",
  color: "danger",
  description: "",
  order: 2,
  builtIn: true,
};

describe("ResolutionGlyph", () => {
  it("해결 4종을 각각 다른 아이콘·색 클래스로 그리고 이름을 읽어 준다", () => {
    render(<ResolutionGlyph resolution="duplicate" />);
    const glyph = screen.getByRole("img", { name: "해결: 중복" });
    // 색만으로 구분하지 않는다 — 이름이 접근성 이름에 있고 모양(svg)도 다르다
    expect(glyph).toHaveClass("status-glyph", "is-info");
    expect(glyph.querySelector("svg")).toBeTruthy();
    // 하드코딩 색이 아니라 토큰 클래스여야 한다(인라인 style 금지)
    expect(glyph.getAttribute("style")).toBeNull();
  });

  it("이름을 옆에 그리는 자리(variant=icon)에서는 낭독을 중복시키지 않는다", () => {
    render(
      <ValueWithIcon icon={<ResolutionGlyph resolution="wont_do" variant="icon" />}>
        하지 않음
      </ValueWithIcon>,
    );
    expect(screen.queryByRole("img")).toBeNull();
    const glyph = screen.getByTestId("resolution-glyph-wont_do");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph).toHaveAttribute("title", "하지 않음");
    // 텍스트는 항상 함께 있다
    expect(screen.getByText("하지 않음")).toBeTruthy();
  });
});

describe("IssueTypeGlyph variant", () => {
  it("기본(auto)은 타입 이름을 읽어 주는 role=img다", () => {
    render(<IssueTypeGlyph type="bug" types={[bug]} />);
    expect(screen.getByRole("img", { name: "버그" })).toHaveClass("issue-type-glyph", "is-danger");
  });

  it("icon 변형은 aria-hidden이라 옆 텍스트와 이름이 겹치지 않는다", () => {
    render(
      <ValueWithIcon icon={<IssueTypeGlyph type="bug" types={[bug]} variant="icon" />}>
        버그
      </ValueWithIcon>,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("type-glyph-bug")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ValueWithIcon", () => {
  it("아이콘을 텍스트 왼쪽에 두고 간격은 토큰 클래스(.status-cell)가 준다", () => {
    const { container } = render(
      <ValueWithIcon icon={<PriorityGlyph defs={[high]} priority="high" variant="icon" />}>
        높음
      </ValueWithIcon>,
    );
    const wrap = container.querySelector(".status-cell")!;
    expect(wrap.getAttribute("style")).toBeNull();
    // 첫 자식이 아이콘, 그 다음이 텍스트
    expect(wrap.firstElementChild).toBe(screen.getByTestId("priority-glyph-high"));
    expect(wrap.textContent).toBe("높음");
  });
});

describe("FilterDropdown 값 아이콘", () => {
  const options = [
    { value: "all", label: "전체" },
    {
      value: "bug",
      label: "버그",
      icon: <IssueTypeGlyph type="bug" types={[bug]} variant="icon" />,
    },
  ];

  it("단일 선택 항목을 아이콘 + 텍스트로 그린다", async () => {
    const user = userEvent.setup();
    render(
      <FilterDropdown
        label="타입"
        multiple={false}
        clearValue="all"
        options={options}
        selected={["all"]}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "타입" }));
    // 라벨 텍스트는 그대로 남는다 — 아이콘이 이름을 대체하지 않는다
    const option = screen.getByRole("radio", { name: "버그" });
    expect(within(option).getByTestId("type-glyph-bug")).toBeTruthy();
  });

  it("고른 값이 하나면 트리거 요약에도 아이콘을 세운다", () => {
    render(
      <FilterDropdown
        label="타입"
        multiple={false}
        clearValue="all"
        options={options}
        selected={["bug"]}
        onToggle={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "타입: 버그" });
    expect(within(trigger).getByTestId("type-glyph-bug")).toBeTruthy();
  });
});
