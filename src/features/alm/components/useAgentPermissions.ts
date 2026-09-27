import { useEffect, useState } from "react";
import type { AgentPermissions } from "../store/types";
import { fetchAgentPermissions } from "../store/jiraStore";

// 프로젝트별 캐시 — 버튼 노출 힌트라 폴링하지 않는다. 허용(canManage=true)은 세션 동안 유지하지만 거부는 60초만 둔다:
// 조회 API는 org 판정 불가도 200 canManage=false로 접으므로 진짜 거부와 순간 장애를 구분할 수 없고, 장애 한 번에
// 세션 내내 관리 버튼이 닫히면 안 된다(서버도 판정 실패를 캐시하지 않는다).
const DENY_TTL_MS = 60_000;
const cached = new Map<string, { value: AgentPermissions; at: number }>();
const pending = new Map<string, Promise<AgentPermissions>>();

function cachedValue(projectId: string): AgentPermissions | null {
  const hit = cached.get(projectId);
  if (!hit) return null;
  if (!hit.value.canManage && Date.now() - hit.at > DENY_TTL_MS) {
    cached.delete(projectId);
    return null;
  }
  return hit.value;
}

const DENIED: AgentPermissions = { canManage: false, isGlobalAdmin: false };

function loadAgentPermissions(projectId: string): Promise<AgentPermissions> {
  const hit = cachedValue(projectId);
  if (hit) return Promise.resolve(hit);
  let inflight = pending.get(projectId);
  if (!inflight) {
    inflight = fetchAgentPermissions(projectId)
      .then((permissions) => {
        cached.set(projectId, { value: permissions, at: Date.now() });
        return permissions;
      })
      .catch(() => DENIED)
      .finally(() => pending.delete(projectId));
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
    const hit = cachedValue(projectId);
    return hit ? { ...hit, loaded: true } : { ...DENIED, loaded: false };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = cachedValue(projectId);
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
