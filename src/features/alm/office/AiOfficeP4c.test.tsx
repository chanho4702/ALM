import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { ApiError } from "../store/mapping";
import { OfficeStreamError } from "../store/officeStream";
import type { OfficeStreamHandlers } from "../store/types";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";
import { OFFICE_POLL_LIVE_MS, OFFICE_POLL_MS, useOfficeData } from "./useOfficeData";

/**
 * P4c(AGP-56·57) — 실행 상세 단건 API(지시문·오류 가림, 구 백엔드 폴백), 사무실 갱신 방식 표지(실시간/폴링)와
 * 스트림 상태에 따른 폴링 주기. 목업 테스트는 기본으로 스트림이 없다(= 폴링) — `__setMockOfficeStream(true)`로 켠다.
 */

function renderApp(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const BASE = "/projects/p1/ai-office";

async function detailLoaded(runId: string) {
  await screen.findByRole("heading", { name: `실행 #${runId}`, level: 2 });
  return screen.findByLabelText("실행 요약");
}

beforeAll(async () => {
  await Promise.all([import("./AiOfficePage"), import("./AgentRunDetailPage")]);
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("실행 상세 — 단건 API(P4c)", () => {
  it("관리자는 오류 로그 전문과 지시문을 본다(없으면 '없음')", async () => {
    const detail = vi.spyOn(store, "fetchAgentRun");
    renderApp(`${BASE}/runs/9004`);
    await detailLoaded("9004");
    expect(detail).toHaveBeenCalledWith("9004");
    const diag = await screen.findByRole("region", { name: "지시·오류" });
    expect(within(diag).getByText(/테스트 3건 실패/)).toBeInTheDocument();
    expect(within(diag).getAllByText("없음").length).toBeGreaterThanOrEqual(1);
    expect(within(diag).queryByText("(관리자만 볼 수 있음)")).not.toBeInTheDocument();
  });

  it("관리자가 아니면 서버가 가린 지시문·오류를 '(관리자만 볼 수 있음)'으로 — 본문은 어디에도 없다", async () => {
    store.__setAgentMockScenario({ canManage: false });
    renderApp(`${BASE}/runs/9004`);
    await detailLoaded("9004");
    const diag = await screen.findByRole("region", { name: "지시·오류" });
    expect(within(diag).getAllByText("(관리자만 볼 수 있음)")).toHaveLength(2);
    expect(screen.queryByText(/테스트 3건 실패/)).not.toBeInTheDocument();
  });

  it("사람이 요청한 run의 지시문이 보인다", async () => {
    const run = await store.createAgentRun({ issueKey: "ALM-7", personaSlug: "ops-bot", instruction: "스크린샷까지 붙여 주세요" });
    renderApp(`${BASE}/runs/${run.id}`);
    await detailLoaded(run.id);
    expect(await screen.findByText("스크린샷까지 붙여 주세요")).toBeInTheDocument();
  });

  it("구 백엔드(단건 경로 404)면 목록에서 찾아 요약·계보를 그리고, 지시·오류 구획은 없다", async () => {
    vi.spyOn(store, "fetchAgentRun").mockRejectedValue(new ApiError(404, "찾을 수 없습니다."));
    renderApp(`${BASE}/runs/9004`);
    const summary = await detailLoaded("9004");
    expect(within(summary).getByRole("link", { name: "ALM-5" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "ALM-5 실행 타임라인" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "지시·오류" })).not.toBeInTheDocument();
  });

  it("단건 조회가 404/405 외로 실패하면 오류 상태로 드러낸다(목록으로 삼키지 않는다)", async () => {
    vi.spyOn(store, "fetchAgentRun").mockRejectedValue(new ApiError(503, "서비스를 사용할 수 없습니다"));
    renderApp(`${BASE}/runs/9004`);
    expect(await screen.findByText("실행 정보를 불러오지 못했습니다")).toBeInTheDocument();
  });
});

describe("사무실 갱신 방식 표지(P4c)", () => {
  it("스트림이 없으면 '폴링'", async () => {
    renderApp(BASE);
    const summary = await screen.findByLabelText("AI 팀 요약");
    expect(within(summary).getByText("폴링")).toBeInTheDocument();
    expect(within(summary).getByText("폴링").closest("[title]")).toHaveAttribute("title", "폴링 — 10초마다 새로 고칩니다");
  });

  it("스트림이 붙으면 '실시간', 변경 신호가 오면 곧바로 사무실을 다시 조회한다", async () => {
    store.__setMockOfficeStream(true);
    const office = vi.spyOn(store, "fetchOffice");
    renderApp(BASE);
    const summary = await screen.findByLabelText("AI 팀 요약");
    expect(await within(summary).findByText("실시간")).toBeInTheDocument();
    const before = office.mock.calls.length;
    await act(async () => {
      await store.cancelRun("9001");
    });
    await waitFor(() => expect(office.mock.calls.length).toBeGreaterThan(before));
  });
});

describe("폴링 주기 — 스트림 건강하면 60초, 끊기면 10초", () => {
  it("열리면 다음 폴링이 60초로 늦춰지고, 신호는 즉시 조회, 끊기면 10초로 돌아온다", async () => {
    vi.useFakeTimers();
    const conns: { h: OfficeStreamHandlers; fail: (e: unknown) => void }[] = [];
    vi.spyOn(store, "streamOffice").mockImplementation(
      (_p, h) =>
        new Promise<void>((_resolve, reject) => {
          h.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
          conns.push({ h, fail: reject });
        }),
    );
    const office = vi.spyOn(store, "fetchOffice");
    const { result, unmount } = renderHook(() => useOfficeData("p1", null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(office).toHaveBeenCalledTimes(1);

    /** 서버 heartbeat(15초)를 흉내 내며 시간을 보낸다 — 45초 무응답 판정에 걸리지 않게 */
    const withHeartbeat = async (ms: number) => {
      for (let left = ms; left > 0; left -= 5_000) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(Math.min(5_000, left));
          conns[0].h.onActivity();
        });
      }
    };

    act(() => conns[0].h.onOpen());
    expect(result.current.streamMode).toBe("live");
    await withHeartbeat(OFFICE_POLL_MS);
    expect(office).toHaveBeenCalledTimes(1);
    await withHeartbeat(OFFICE_POLL_LIVE_MS - OFFICE_POLL_MS);
    expect(office).toHaveBeenCalledTimes(2);
    expect(conns).toHaveLength(1);

    // 신호 → 즉시 조회
    await act(async () => {
      conns[0].h.onEvent({ reason: "run", projectId: null, at: null });
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(office).toHaveBeenCalledTimes(3);

    await act(async () => {
      conns[0].fail(new OfficeStreamError("network", 502));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.streamMode).toBe("polling");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFICE_POLL_MS);
    });
    // 10초 폴링 1회(+ 재연결 시도는 열리지 않았으니 재조회 없음)
    expect(office).toHaveBeenCalledTimes(4);
    unmount();
  });

  it("조회가 진행 중일 때 온 신호는 버리지 않고 끝난 뒤 한 번 더 조회한다", async () => {
    vi.useFakeTimers();
    let open: OfficeStreamHandlers | null = null;
    vi.spyOn(store, "streamOffice").mockImplementation(
      (_p, h) =>
        new Promise<void>(() => {
          open = h;
        }),
    );
    let release: (() => void) | null = null;
    const original = store.fetchOffice;
    const office = vi.spyOn(store, "fetchOffice").mockImplementation(async (projectId) => {
      const value = await original(projectId);
      if (office.mock.calls.length === 2) await new Promise<void>((r) => (release = r));
      return value;
    });
    renderHook(() => useOfficeData("p1", null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => open!.onOpen());
    // 두 번째 조회를 붙잡아 두고, 그 사이 신호를 두 번 보낸다(스로틀 창 밖)
    await act(async () => {
      open!.onEvent({ reason: "run", projectId: null, at: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(office).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
      open!.onEvent({ reason: "gate", projectId: null, at: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(office).toHaveBeenCalledTimes(2);
    await act(async () => {
      release!();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(office).toHaveBeenCalledTimes(3);
  });
});
