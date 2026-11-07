import { describe, expect, it } from "vitest";
import css from "./app.css?raw";

describe("제품 화면 반응형 CSS", () => {
  it("모바일 보드는 한 열을 화면 폭에 맞추고 열 단위로 스냅한다", () => {
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?--alm-board-column-width:\s*min\(26rem, calc\(100cqw - var\(--chanho-space-400\)\)\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.board-columns\s*\{[^}]*scroll-padding-inline:\s*var\(--alm-content-gutter\);[^}]*scroll-snap-type:\s*x mandatory;/,
    );
  });
});
