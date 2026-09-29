import { useEffect, useState } from "react";
import { fetchRunDirectives } from "../store/jiraStore";

/** 전달 확인 주기 — 워커는 도구를 자주 부르니 짧게, 그래도 사무실 폴링(10초)보다 조금 빠르게 */
export const DIRECTIVE_DELIVERY_POLL_MS = 3000;

export interface TrackedDirective {
  runId: string;
  directiveId: string;
}

/** undelivered = run이 끝났는데 아직 전달 전 — 서버는 RUNNING일 때만 전달하므로 더는 바뀌지 않는다 */
export type DirectiveDelivery = "pending" | "delivered" | "undelivered";

/**
 * 방금 보낸 실행 중 지시의 전달 상태(P4b AGP-67) — "전달 대기 → 전달됨". 전달되면 멈추고, 목록 API가 없어지면(null)
 * 대기로 둔 채 멈춘다. 조회 실패는 다음 주기에 다시 본다(일시 장애로 상태를 틀리게 바꾸지 않는다).
 */
export function useDirectiveDelivery(target: TrackedDirective | null, runActive: boolean): DirectiveDelivery | null {
  const [state, setState] = useState<DirectiveDelivery | null>(null);
  const runId = target?.runId ?? null;
  const directiveId = target?.directiveId ?? null;

  useEffect(() => {
    if (!runId || !directiveId) {
      setState(null);
      return;
    }
    setState((prev) => (prev === "delivered" ? prev : "pending"));
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      try {
        const list = await fetchRunDirectives(runId);
        if (!alive) return;
        if (list === null) return;
        if (list.find((d) => d.id === directiveId)?.deliveredAt) {
          setState("delivered");
          return;
        }
        // run이 끝났으면 마지막으로 한 번 확인한 뒤 멈춘다 — 끝난 run의 지시는 전달되지 않는다
        if (!runActive) {
          setState("undelivered");
          return;
        }
      } catch {
        // 다음 주기에 다시 본다
      }
      if (alive) timer = setTimeout(() => void check(), DIRECTIVE_DELIVERY_POLL_MS);
    };
    timer = setTimeout(() => void check(), runActive ? DIRECTIVE_DELIVERY_POLL_MS : 0);
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [runId, directiveId, runActive]);

  return state;
}
