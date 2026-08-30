import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Spinner } from "@chanho/react";
import { getMyPreferences } from "../store/jiraStore";
import { listRecentProjectIds } from "../store/uiStore";

/**
 * 루트(`/`) 진입 — 개인 설정의 시작 화면으로 보낸다. 마지막 프로젝트가 없으면 홈.
 * 설정을 못 읽어도 홈으로는 간다(시작 화면 때문에 앱이 멈추면 안 된다).
 */
export function StartRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await getMyPreferences();
        if (prefs.startPage === "projects") return "/projects";
        if (prefs.startPage === "last-project") {
          const [recent] = await listRecentProjectIds();
          if (recent) return `/projects/${recent}/board`;
        }
        return "/home";
      } catch {
        return "/home";
      }
    })().then((path) => {
      if (!cancelled) setTarget(path);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="시작 화면 여는 중" />
      </div>
    );
  }
  return <Navigate to={target} replace />;
}
