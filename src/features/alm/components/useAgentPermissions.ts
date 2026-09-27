import { useEffect, useState } from "react";
import type { AgentPermissions } from "../store/types";
import { fetchAgentPermissions } from "../store/jiraStore";

// 프로젝트별로 세션당 한 번만 조회한다(useAiTeamActive와 같은 캐시 정책) — 버튼 노출 힌트라 폴링하지 않는다.
const cached = new Map<string, AgentPermissions>();
const pending = new Map<string, Promise<AgentPermissions>>();

const DENIED: AgentPermissions = { canManage: false, isGlobalAdmin: false };

function loadAgentPermissions(projectId: string): Promise<AgentPermissions> {
  const hit = cached.get(projectId);
  if (hit) return Promise.resolve(hit);
  let inflight = pending.get(projectId);
  if (!inflight) {
    inflight = fetchAgentPermissions(projectId)
      .catch(() => DENIED)
      .then((permissions) => {
        cached.set(projectId, permissions);
        pending.delete(projectId);
        return permissions;
      });
    pending.set(projectId, inflight);
  }
  return inflight;
}

export interface AgentPermissionsState extends AgentPermissions {
  /** 판정 전에는 false — 그동안 관리 버튼은 닫혀 있다 */
  loaded: boolean;
}

/**
 * 현재 프로젝트에서 AI 팀을 관리할 수 있는가(D-P3f-6) — 전역 관리자 또는 그 프로젝트 ADMIN.
 * 사무실의 회의 소집·실행 취소/재개·게이트 결정과 설정 "AI 팀" 편집이 이것으로 열린다. 화면 숨김은 편의이고
 * 실제 판정은 서버가 다시 한다(403·503 → 토스트).
 */
export function useAgentPermissions(projectId: string): AgentPermissionsState {
  const [state, setState] = useState<AgentPermissionsState>(() => {
    const hit = cached.get(projectId);
    return hit ? { ...hit, loaded: true } : { ...DENIED, loaded: false };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = cached.get(projectId);
    setState(hit ? { ...hit, loaded: true } : { ...DENIED, loaded: false });
    void loadAgentPermissions(projectId).then((permissions) => {
      if (!cancelled) setState({ ...permissions, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return state;
}

/** 테스트 전용 — `__resetAiTeamActiveForTest`가 함께 부른다 */
export function __resetAgentPermissionsForTest(): void {
  cached.clear();
  pending.clear();
}
