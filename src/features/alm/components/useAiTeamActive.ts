import { useEffect, useState } from "react";
import { fetchAgentPersonas } from "../store/jiraStore";

// 세션당 한 번만 조회하고 결과를 캐시한다 — 폴링도, 마운트마다 재조회도 하지 않는다.
// null = 아직 모름(로드 전), boolean = 확정된 판정.
let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

function loadAiTeamActive(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = fetchAgentPersonas()
      .then((personas) => personas.length > 0)
      .catch(() => false) // agent-service가 없거나 오류면 조용히 비활성 — 콘솔 스팸 금지
      .then((active) => {
        cached = active;
        pending = null;
        return active;
      });
  }
  return pending;
}

/**
 * "AI 팀 가이드" 진입점의 활성 판정 — `/api/agent/personas`가 200 + 비어있지 않은 배열을
 * 돌려주면 true. agent-service가 없는 플랫폼(401/403/404/5xx/네트워크 오류)에서는 false로
 * 접혀 진입점 자체가 렌더되지 않는다(그레이스풀 디그레이드).
 */
export function useAiTeamActive(): boolean {
  const [active, setActive] = useState(cached ?? false);

  useEffect(() => {
    let cancelled = false;
    void loadAiTeamActive().then((value) => {
      if (!cancelled) setActive(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return active;
}

/** 테스트 전용 — 모듈 캐시를 리셋해 각 테스트가 독립적으로 조회하게 한다 */
export function __resetAiTeamActiveForTest(): void {
  cached = null;
  pending = null;
}
