import { useEffect, useState } from "react";
import type { Issue, IssueTransitionOption } from "../store/types";
import { listIssueTransitions } from "../store/jiraStore";
import { reasonText, settleWithConcurrency } from "../store/concurrency";

/**
 * 팔레트·우클릭 "상태 변경" 하위 메뉴의 선택지 — **워크플로 엔진의 가용 전환만**(FE2 이월).
 *
 * - 단건: 서버 `GET /issues/{id}/transitions` 그대로 — 갈 수 있는 상태는 고를 수 있고, 조건 때문에 못 가는 상태는
 *   흐리게 이유와 함께 보인다(상세 상태 버튼과 같은 규칙: 숨기지 않는다).
 * - 다건: 대상 전부가 갈 수 있는(이미 그 상태인 이슈는 빼고) 상태만 고를 수 있다. 일부만 갈 수 있는 상태는 흐리게
 *   "N개 이슈는 갈 수 없습니다 — ALM-3: 이유"로 보인다. 어느 이슈의 전환 목록에도 없는 상태는 뺀다.
 */
export interface StatusOptionState {
  available: boolean;
  /** 못 고르는 이유 — available=false일 때 */
  reason: string | null;
}

export type StatusAvailability =
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "ready"; byStatus: Map<string, StatusOptionState> };

export function combineAvailability(
  targets: Pick<Issue, "key" | "status">[],
  optionsPerTarget: IssueTransitionOption[][],
): Map<string, StatusOptionState> {
  const byStatus = new Map<string, StatusOptionState>();
  if (targets.length === 1) {
    for (const option of optionsPerTarget[0] ?? []) {
      const seen = byStatus.get(option.to);
      // 같은 상태로 가는 전환이 여럿이면 하나라도 가능하면 가능
      if (seen?.available) continue;
      byStatus.set(option.to, {
        available: option.available,
        reason: option.available ? null : (option.unavailableReason ?? "지금은 할 수 없는 전환입니다"),
      });
    }
    return byStatus;
  }
  const statuses = new Set(optionsPerTarget.flatMap((options) => options.map((o) => o.to)));
  for (const status of statuses) {
    const blocked: string[] = [];
    let reachable = 0;
    targets.forEach((target, index) => {
      if (target.status === status) return;
      const options = (optionsPerTarget[index] ?? []).filter((o) => o.to === status);
      const ok = options.find((o) => o.available);
      if (ok) reachable += 1;
      else blocked.push(`${target.key}: ${options[0]?.unavailableReason ?? "갈 수 있는 전환이 없습니다"}`);
    });
    // 후보는 누군가의 전환 목록에 있는 상태뿐이다 — 아무 목록에도 없는 상태는 처음부터 나오지 않는다
    byStatus.set(status, {
      available: blocked.length === 0 && reachable > 0,
      reason: blocked.length === 0 ? (reachable > 0 ? null : "이미 모두 이 상태입니다") : `${blocked.length}개 이슈는 갈 수 없습니다 — ${blocked.join(" · ")}`,
    });
  }
  return byStatus;
}

export async function loadStatusAvailability(targets: Issue[]): Promise<Map<string, StatusOptionState>> {
  const results = await settleWithConcurrency(targets, (issue) => listIssueTransitions(issue.id));
  const failure = results.find((r) => r.status === "rejected");
  if (failure && failure.status === "rejected") throw new Error(reasonText(failure.reason));
  return combineAvailability(
    targets,
    results.map((r) => (r.status === "fulfilled" ? r.value.transitions : [])),
  );
}

/** 대상이 바뀔 때마다(이슈·상태·버전) 다시 읽는다. 대상이 없거나 꺼져 있으면 undefined — 호출자는 옛 방식으로 둔다 */
export function useStatusAvailability(targets: Issue[], enabled: boolean): StatusAvailability | undefined {
  const signature = enabled ? targets.map((t) => `${t.id}:${t.status}:${t.version}`).join("|") : "";
  const [state, setState] = useState<{ signature: string; value: StatusAvailability } | null>(null);
  useEffect(() => {
    if (!signature) return;
    let cancelled = false;
    setState({ signature, value: { state: "loading" } });
    loadStatusAvailability(targets).then(
      (byStatus) => {
        if (!cancelled) setState({ signature, value: { state: "ready", byStatus } });
      },
      (error: unknown) => {
        if (!cancelled) setState({ signature, value: { state: "error", error: reasonText(error) } });
      },
    );
    return () => {
      cancelled = true;
    };
    // 대상은 서명으로 비교한다(배열은 렌더마다 새로 온다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  if (!signature) return undefined;
  return state?.signature === signature ? state.value : { state: "loading" };
}
