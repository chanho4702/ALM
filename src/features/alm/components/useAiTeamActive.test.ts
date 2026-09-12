import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as store from "../store/jiraStore";
import { __resetAiTeamActiveForTest, useAiTeamActive } from "./useAiTeamActive";

afterEach(() => {
  vi.restoreAllMocks();
  __resetAiTeamActiveForTest();
});

describe("useAiTeamActive — agent-service 페르소나 기반 AI 팀 기능 활성 판정", () => {
  it("페르소나가 하나 이상이면 활성이다", async () => {
    vi.spyOn(store, "fetchAgentPersonas").mockResolvedValue([{ id: "p1", name: "가이드" }]);
    const { result } = renderHook(() => useAiTeamActive());
    expect(result.current).toBe(false); // 조회 전 기본값은 비활성
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("빈 배열이면 비활성이다", async () => {
    vi.spyOn(store, "fetchAgentPersonas").mockResolvedValue([]);
    const { result } = renderHook(() => useAiTeamActive());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("조회가 실패해도(agent-service 없음) 비활성으로 접힌다 — 콘솔 오류로 새지 않는다", async () => {
    vi.spyOn(store, "fetchAgentPersonas").mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useAiTeamActive());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("세션당 한 번만 조회한다 — 같은 마운트/재마운트에서 스토어 호출은 1번", async () => {
    const spy = vi.spyOn(store, "fetchAgentPersonas").mockResolvedValue([{ id: "p1", name: "가이드" }]);
    const first = renderHook(() => useAiTeamActive());
    await waitFor(() => expect(first.result.current).toBe(true));
    const second = renderHook(() => useAiTeamActive());
    await waitFor(() => expect(second.result.current).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
