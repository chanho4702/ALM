import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Spinner } from "@chanho/react";
import type { AppUser, AuthClient } from "./types";
import { rememberReturnTo } from "./returnTo";
import { sharedAuthClient } from "../features/alm/store/apiClient";

interface AuthContextValue {
  user: AppUser | null;
  logout: () => Promise<void>;
}

// 기본값 제공: 게이트 밖(기존 테스트가 App을 직접 렌더)에서도 useAuth가 throw하지 않는다.
// myFront(Provider 필수·throw)와 의도적으로 다른 계약 — 이 앱은 게이트가 옵션이기 때문.
const AuthContext = createContext<AuthContextValue>({ user: null, logout: async () => {} });

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export interface AuthGateProps {
  children: React.ReactNode;
  client?: AuthClient;
  /** 전체 페이지 이동. 테스트에서 스파이로 주입한다. */
  redirect?: (url: string) => void;
  /** dev/vitest 에서는 게이트 비활성 — 인증 검증은 nginx 프로덕션 경로로만. */
  enabled?: boolean;
}

/**
 * 로그인 게이트: 마운트 시 RT 쿠키로 silent refresh 를 시도하고,
 * 실패하면 returnTo 쿠키를 심은 뒤 Keycloak 로그인으로 보낸다(SSO 세션이
 * 살아 있으면 무프롬프트 왕복). 성공하면 /api/me 사용자와 함께 children 렌더.
 */
// 모듈 레벨 상수 — 렌더마다 새 함수가 되면 아래 effect 의존성이 계속 바뀌어
// 로그인 성공 후 refresh/me 무한 재호출 루프가 된다 (Task 3 리뷰에서 실증).
const defaultRedirect = (url: string) => window.location.assign(url);

export function AuthGate({
  children,
  client = sharedAuthClient,
  redirect = defaultRedirect,
  enabled = import.meta.env.PROD,
}: AuthGateProps) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<"checking" | "authed">(enabled ? "checking" : "authed");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      if (await client.tryRefresh()) {
        const me = await client.fetchMe();
        if (!active) return;
        setUser(me);
        setStatus("authed");
      } else {
        if (!active) return;
        rememberReturnTo(window.location.pathname + window.location.search);
        redirect(client.loginUrl());
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, client, redirect]);

  const logout = useCallback(async () => {
    await client.logout();
    redirect("/"); // 포털로 — 백채널이 KC 세션까지 끊어 재진입 시 로그인 폼
  }, [client, redirect]);

  const value = useMemo<AuthContextValue>(() => ({ user, logout }), [user, logout]);

  if (status === "checking") {
    return (
      <div className="app-loading">
        <Spinner size="large" label="로그인 확인 중" />
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
