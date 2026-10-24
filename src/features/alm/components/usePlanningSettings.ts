import { useEffect, useState } from "react";
import type { PlanningSettings } from "../store/types";
import { getPlanningSettings } from "../store/jiraStore";

/** 계획 설정이 바뀌면(프로젝트 설정 › 계획) — 열려 있는 입력·모달이 다시 읽는다 */
export const PLANNING_SETTINGS_CHANGED_EVENT = "alm:planning-settings-changed";

export function notifyPlanningSettingsChanged(projectId: string): void {
  window.dispatchEvent(new CustomEvent(PLANNING_SETTINGS_CHANGED_EVENT, { detail: { projectId } }));
}

/**
 * 프로젝트 계획 설정(척도·사이클) — 못 읽으면 null(입력은 수직선, 완료 모달은 백로그 기본값으로 둔다).
 * 척도는 저장 때 서버가 다시 검사하므로 화면이 기본값으로 떨어져도 잘못 저장되지 않는다.
 */
export function usePlanningSettings(projectId: string | undefined): PlanningSettings | null {
  const [settings, setSettings] = useState<PlanningSettings | null>(null);
  useEffect(() => {
    if (!projectId) {
      setSettings(null);
      return;
    }
    let cancelled = false;
    const load = () =>
      void getPlanningSettings(projectId).then(
        (next) => {
          if (!cancelled) setSettings(next);
        },
        () => {
          if (!cancelled) setSettings(null);
        },
      );
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string }>).detail;
      if (!detail || detail.projectId === projectId) load();
    };
    load();
    window.addEventListener(PLANNING_SETTINGS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(PLANNING_SETTINGS_CHANGED_EVENT, onChanged);
    };
  }, [projectId]);
  return settings;
}
