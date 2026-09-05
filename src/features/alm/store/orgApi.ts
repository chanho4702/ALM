// `@chanho/org-admin`이 요구하는 인증 fetch 어댑터.
//
// 패키지는 `/api/org/...` **상대 경로**만 넘기고, 토큰·게이트웨이 경로·오류 정책은 호스트 몫이다.
// ALM은 AuthGate와 같은 메모리 access token을 쓰는 `sharedApiFetch`를 그대로 넘긴다.
//
// 목업 모드에는 org-service가 없다. 그렇다고 진짜 fetch를 흘려보내면 개발 서버가 index.html을
// 200으로 돌려줘 "JSON이 아닌 200"이라는 최악의 실패가 된다 — 그래서 여기서 막고, 계정 상태만
// 목업 프로필로 답한다(승인 대기 게이트가 목업에서도 돌아야 한다). 관리 화면 자체는 REST 전용이며
// 목업에서는 `OrgAdminPage`가 안내 문구를 대신 그린다.
import { getMyOrgProfile, USE_REST } from "./jiraStore";
import { sharedApiFetch } from "./apiClient";

/** 패키지 계약: `(path, init) => Promise<Response>` — 실패는 던지지 않고 `res.ok === false`로 준다 */
export type OrgApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 목업 모드 어댑터 — `/api/org/me`만 답하고 나머지는 패키지 오류 계약(`{"error"}`)으로 거절한다 */
const mockOrgFetch: OrgApiFetch = async (path) => {
  if (path.split("?")[0] === "/api/org/me") {
    return jsonResponse(await getMyOrgProfile());
  }
  return jsonResponse(
    { error: "목업 모드에서는 조직 관리 API를 쓸 수 없습니다. 백엔드에 연결한 뒤 다시 시도하세요." },
    501,
  );
};

export const orgApiFetch: OrgApiFetch = USE_REST ? sharedApiFetch : mockOrgFetch;
