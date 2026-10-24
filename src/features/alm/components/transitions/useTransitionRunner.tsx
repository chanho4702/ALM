import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Issue, IssueTransitionOption, WorkflowStatus } from "../../store/types";
import { transitionIssue } from "../../store/jiraStore";
import { TransitionScreenModal } from "./TransitionScreenModal";
import type { TransitionScreenValues } from "./TransitionScreenModal";

/** 전환 결과 — 저장됨 / 사용자가 화면에서 취소함 / 서버가 거부함(이유) */
export type TransitionOutcome =
  | { kind: "done"; issue: Issue }
  | { kind: "cancelled" }
  | { kind: "failed"; error: unknown };

interface PendingScreen {
  issue: Issue;
  option: IssueTransitionOption;
  resolve: (outcome: TransitionOutcome) => void;
}

/**
 * 전환 실행 공용 훅 — 상세 상태 버튼·보드 드래그·(이후) 우클릭 메뉴가 같은 흐름을 쓴다.
 *
 * - 전환 화면이 없으면 바로 `transitionIssue`를 부른다. 그 전환은 편집 폼 값(담당자·버전·마감일)을 바꾸지 않으므로
 *   `expectedVersion`을 싣지 않는다(보드 이동과 같은 규칙 — 남이 제목을 고쳤다고 전환이 409가 되지 않게).
 * - 전환 화면이 있으면 창을 띄우고 확인을 기다린다. 창은 그 칸을 바꾸므로 화면이 본 버전을 싣는다(409면 창 안에 문구).
 *   서버가 거부하면 창은 닫지 않고 이유를 보여 준다. 취소는 `cancelled`.
 */
export function useTransitionRunner(statuses: WorkflowStatus[]): {
  run: (issue: Issue, option: IssueTransitionOption) => Promise<TransitionOutcome>;
  element: ReactNode;
} {
  const [pending, setPending] = useState<PendingScreen | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingScreen | null>(null);
  pendingRef.current = pending;

  const run = useCallback(async (issue: Issue, option: IssueTransitionOption): Promise<TransitionOutcome> => {
    if (!option.hasScreen) {
      try {
        return { kind: "done", issue: await transitionIssue(issue.id, { transitionId: option.id }) };
      } catch (failure) {
        return { kind: "failed", error: failure };
      }
    }
    // 이미 열린 창이 있으면 그것을 취소로 끝낸다(겹쳐 뜨지 않게)
    pendingRef.current?.resolve({ kind: "cancelled" });
    setError(null);
    return new Promise<TransitionOutcome>((resolve) => setPending({ issue, option, resolve }));
  }, []);

  const close = (outcome: TransitionOutcome) => {
    pending?.resolve(outcome);
    setPending(null);
    setError(null);
    setBusy(false);
  };

  const submit = async ({ fields, comment }: TransitionScreenValues) => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await transitionIssue(pending.issue.id, {
        transitionId: pending.option.id,
        expectedVersion: pending.issue.version,
        fields,
        comment,
      });
      close({ kind: "done", issue: saved });
    } catch (failure) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const element = pending ? (
    <TransitionScreenModal
      key={`${pending.issue.id}:${pending.option.id}`}
      issue={pending.issue}
      option={pending.option}
      statuses={statuses}
      busy={busy}
      error={error}
      onSubmit={(values) => void submit(values)}
      onCancel={() => close({ kind: "cancelled" })}
    />
  ) : null;

  return { run, element };
}
