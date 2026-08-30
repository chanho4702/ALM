import { useEffect, useState } from "react";
import type { PriorityDef } from "../store/types";
import { PRIORITIES_CHANGED_EVENT, listPriorities } from "../store/jiraStore";

/** 같은 틱에 여러 소비처가 동시에 요청해도 스토어 호출은 한 번만 */
let pending: Promise<PriorityDef[]> | null = null;
const fetchPriorities = () => {
  if (!pending) {
    pending = listPriorities().finally(() => {
      pending = null;
    });
  }
  return pending;
};

/**
 * 전역 우선순위 레지스트리 — Select·Lozenge가 이름·색·순서를 여기서 읽는다.
 * 로드 전에는 빈 배열이라 소비처는 기본 5종 폴백(labels.ts `priorityName`)으로 그린다.
 */
export function usePriorities(): PriorityDef[] {
  const [priorities, setPriorities] = useState<PriorityDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchPriorities().then((list) => {
        if (!cancelled) setPriorities(list);
      });
    load();
    window.addEventListener(PRIORITIES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PRIORITIES_CHANGED_EVENT, load);
    };
  }, []);

  return priorities;
}
