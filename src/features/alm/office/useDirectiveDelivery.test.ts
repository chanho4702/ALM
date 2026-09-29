import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as store from "../store/jiraStore";
import { useDirectiveDelivery } from "./useDirectiveDelivery";

afterEach(() => {
  vi.restoreAllMocks();
});

const target = { runId: "9001", directiveId: "5" };
const row = (deliveredAt: string | null) => [{ id: "5", runId: "9001", text: "x", createdAt: "2026-09-29T01:00:00Z", deliveredAt }];

describe("useDirectiveDelivery — 전달 대기 → 전달됨 / 전달 안 됨(run 종료)", () => {
  it("실행 중이면 대기로 시작해 전달되면 '전달됨'", async () => {
    vi.spyOn(store, "fetchRunDirectives").mockResolvedValue(row("2026-09-29T01:00:05Z"));
    const { result } = renderHook(() => useDirectiveDelivery(target, true));
    expect(result.current).toBe("pending");
    await waitFor(() => expect(result.current).toBe("delivered"), { timeout: 5000 });
  });

  it("run이 끝났는데 아직 전달 전이면 한 번 확인 뒤 '전달 안 됨'으로 굳고 더 묻지 않는다", async () => {
    const spy = vi.spyOn(store, "fetchRunDirectives").mockResolvedValue(row(null));
    const { result, rerender } = renderHook(({ active }) => useDirectiveDelivery(target, active), { initialProps: { active: true } });
    rerender({ active: false });
    await waitFor(() => expect(result.current).toBe("undelivered"));
    const calls = spy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(spy.mock.calls.length).toBe(calls);
  });

  it("끝나기 전에 전달됐으면 '전달됨' 그대로", async () => {
    vi.spyOn(store, "fetchRunDirectives").mockResolvedValue(row("2026-09-29T01:00:05Z"));
    const { result } = renderHook(() => useDirectiveDelivery(target, false));
    await waitFor(() => expect(result.current).toBe("delivered"));
  });
});
