import { useEffect, useState } from "react";
import { getTriageSettings } from "../store/jiraStore";

/** 트리아지 설정이 바뀌었을 때(켜기·끄기·대기열 처리) — 뷰 탭·사이드바·인박스가 다시 읽는다 */
export const TRIAGE_CHANGED_EVENT = "alm:triage-changed";

export function notifyTriageChanged(projectId: string): void {
  window.dispatchEvent(new CustomEvent(TRIAGE_CHANGED_EVENT, { detail: { projectId } }));
}

/**
 * 프로젝트가 트리아지를 켰나(V35) — 뷰 탭 "트리아지"를 보일지 정한다. 조회 실패(구 서버 404 등)는 꺼진 것으로 본다
 * (탭이 없을 뿐 다른 화면은 그대로다). 프로젝트가 바뀌거나 `TRIAGE_CHANGED_EVENT`가 오면 다시 읽는다.
 */
export function useTriageEnabled(projectId: string | undefined): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!projectId) {
      setEnabled(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      void getTriageSettings(projectId)
        .then((settings) => {
          if (!cancelled) setEnabled(settings.enabled);
        })
        .catch(() => {
          if (!cancelled) setEnabled(false);
        });
    load();
    window.addEventListener(TRIAGE_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TRIAGE_CHANGED_EVENT, load);
    };
  }, [projectId]);
  return enabled;
}
