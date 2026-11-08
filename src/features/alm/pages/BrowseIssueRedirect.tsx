import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { EmptyState } from "@chanho/react";
import type { Issue } from "../store/types";
import { getIssueByKey } from "../store/jiraStore";
import { PageSkeleton } from "../components/Skeletons";

/**
 * 키만으로 여는 정규 주소 `/browse/:key`(지라 `/browse/KEY` 선례) — 위키 스마트 링크·링크 복사가 이 주소를 낸다.
 * 키로 이슈를 찾아 그 프로젝트 이슈 목록의 상세 모달 주소로 **교체** 이동한다(뒤로 가기가 이 화면에 갇히지 않게).
 * 없는 키·권한 없음(403)·조회 실패는 한 문구로 안내한다 — 존재 여부를 구분해 드러내지 않는다.
 */
export function BrowseIssueRedirect() {
  const { key: rawKey = "" } = useParams();
  const key = rawKey.trim().toUpperCase();
  const navigate = useNavigate();
  // undefined = 조회 중, null = 못 찾음/볼 수 없음/실패
  const [result, setResult] = useState<{ key: string; issue: Issue | null } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setResult({ key, issue: null });
      return;
    }
    getIssueByKey(key).then(
      (issue) => {
        if (!cancelled) setResult({ key, issue });
      },
      () => {
        if (!cancelled) setResult({ key, issue: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (result === undefined || result.key !== key) {
    return <PageSkeleton label="이슈 불러오는 중" />;
  }
  if (result.issue) {
    return (
      <Navigate
        to={`/projects/${result.issue.projectId}/issues?issue=${encodeURIComponent(result.issue.key)}`}
        replace
      />
    );
  }
  return (
    <div role="alert">
      <EmptyState
        title="이슈를 찾을 수 없거나 볼 권한이 없습니다"
        description={key ? `${key} — 키가 맞는지, 그 프로젝트를 볼 수 있는지 확인하세요.` : undefined}
        primaryAction={{ label: "프로젝트 목록으로", onClick: () => navigate("/projects") }}
      />
    </div>
  );
}
