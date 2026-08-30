import { useEffect, useState } from "react";
import type { IssueTypeDef } from "../store/types";
import { ISSUE_TYPES_CHANGED_EVENT, listIssueTypes } from "../store/jiraStore";

/** 같은 틱에 여러 글리프가 동시에 요청해도 스토어 호출은 한 번만 — 완료되면 비운다 */
let pending: Promise<IssueTypeDef[]> | null = null;
const fetchTypes = () => {
  if (!pending) {
    pending = listIssueTypes().finally(() => {
      pending = null;
    });
  }
  return pending;
};

/**
 * 전역 이슈 타입 레지스트리 — 글리프·타입 Select가 이름·아이콘·계층을 여기서 읽는다.
 * 로드 전에는 빈 배열이라 소비처는 기본 5종 폴백(labels.ts 헬퍼)으로 그린다.
 */
export function useIssueTypes(): IssueTypeDef[] {
  const [types, setTypes] = useState<IssueTypeDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchTypes().then((list) => {
        if (!cancelled) setTypes(list);
      });
    load();
    window.addEventListener(ISSUE_TYPES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ISSUE_TYPES_CHANGED_EVENT, load);
    };
  }, []);

  return types;
}
