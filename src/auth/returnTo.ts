// 로그인 리다이렉트 왕복(SPA → auth-server → Keycloak → auth-server) 동안
// "돌아올 경로"를 나르는 일회용 쿠키. auth-server LoginSuccessHandler 가 읽고
// 검증(상대경로만) 후 삭제한다. SAML RelayState / NextAuth callbackUrl 과 같은 패턴.
// 값은 인코딩하지 않는다 — 서버가 raw 값을 그대로 검증하며, 라우트 경로에는
// 쿠키 금지 문자(세미콜론·쉼표·공백)가 없다.
export const RETURN_TO_COOKIE = "post_login_redirect";

export function rememberReturnTo(path: string): void {
  document.cookie = `${RETURN_TO_COOKIE}=${path}; path=/; max-age=300; SameSite=Lax`;
}
