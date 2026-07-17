import { useCallback } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { IssueDetailModal } from "./IssueDetailModal";

export interface UseIssueModalResult {
  /** 현재 열린 이슈 키 (?issue= 값). 없으면 null */
  issueKey: string | null;
  openIssue: (key: string) => void;
  closeIssue: () => void;
  /** 페이지 JSX 마지막에 그대로 렌더할 모달 (issueKey 없으면 null) */
  issueModal: ReactNode;
}

/**
 * `?issue=ALM-1` 쿼리 기반 이슈 상세 모달 배선 — 보드/백로그/이슈 목록 공용 (스펙 §4).
 * @param onIssueChanged 모달에서 저장 성공 시 페이지 데이터 재조회 콜백
 */
export function useIssueModal(onIssueChanged: () => void | Promise<void>): UseIssueModalResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const issueKey = searchParams.get("issue");

  const openIssue = useCallback(
    (key: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("issue", key);
        return next;
      });
    },
    [setSearchParams],
  );

  const closeIssue = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("issue");
      return next;
    });
  }, [setSearchParams]);

  const issueModal = issueKey ? (
    <IssueDetailModal
      key={issueKey} // 키가 바뀌면 모달 내부 상태 초기화
      issueKey={issueKey}
      onClose={closeIssue}
      onIssueChanged={onIssueChanged}
    />
  ) : null;

  return { issueKey, openIssue, closeIssue, issueModal };
}
