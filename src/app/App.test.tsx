import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App 스모크", () => {
  it("디자인 시스템 Button과 함께 렌더링된다", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "ALM" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "시작" })).toBeInTheDocument();
  });
});
