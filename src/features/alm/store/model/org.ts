// ALM 도메인 모델 타입 — org (types.ts에서 분할, 동작 불변)

/**
 * org-service `GET /api/org/me` — 계정 상태와 전역 역할의 **단일 진실 소스**.
 *
 * ALM은 예전에 관리자 여부를 `/api/org/me/permissions`의 `GLOBAL/ADMIN` grant로 따로 판정했다.
 * 그러면 위키·ALM이 같은 사람을 다르게 볼 수 있어, 판정을 이 한 응답으로 모았다
 * (설계 §3.3). 목업은 항상 ACTIVE·ADMIN을 돌려준다 — 목업 개발자는 모든 화면을 봐야 한다.
 */
export interface OrgProfile {
  id: string;
  displayName: string;
  email: string | null;
  status: OrgMemberStatus;
  kind: "HUMAN" | "AGENT";
  /** `"ADMIN"`이 있으면 전역 관리자. 문자열 배열 그대로 둔다(서버가 역할을 늘릴 수 있다) */
  globalRoles: string[];
  teams: { id: string; name: string; role: "LEAD" | "MEMBER" }[];
  joinedVia: string | null;
}

export type OrgMemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
