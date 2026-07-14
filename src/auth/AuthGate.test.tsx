import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, AuthClient } from "./types";
import { AuthGate, useAuth } from "./AuthGate";

const ALICE: AppUser = { email: "alice@demo.com", name: "Alice Kim" };

/** 테스트용 최소 AuthClient — 각 케이스가 tryRefresh/fetchMe만 바꿔 끼운다 */
function stubClient(overrides: Partial<AuthClient>): AuthClient {
  return {
    getAccessToken: () => null,
    setAccessToken: () => {},
    loginUrl: () => "/oauth2/authorization/keycloak",
    googleLoginUrl: () => "/oauth2/authorization/keycloak?kc_idp_hint=google",
    apiFetch: async () => new Response(null),
    tryRefresh: async () => false,
    fetchMe: async () => ALICE,
    logout: async () => {},
    ...overrides,
  };
}

function UserProbe() {
  const { user } = useAuth();
  return <div data-testid="auth-user">{user ? user.name : "(none)"}</div>;
}

describe("AuthGate", () => {
  it("미인증이면 returnTo 쿠키를 심고 로그인 URL로 리다이렉트한다", async () => {
    const redirect = vi.fn();
    render(
      <AuthGate enabled client={stubClient({ tryRefresh: async () => false })} redirect={redirect}>
        <div>비밀 콘텐츠</div>
      </AuthGate>,
    );

    await waitFor(() =>
      expect(redirect).toHaveBeenCalledWith("/oauth2/authorization/keycloak"),
    );
    expect(document.cookie).toContain("post_login_redirect=");
    expect(screen.queryByText("비밀 콘텐츠")).not.toBeInTheDocument();
  });

  it("인증되면 children을 렌더하고 useAuth로 사용자를 제공한다", async () => {
    render(
      <AuthGate enabled client={stubClient({ tryRefresh: async () => true })}>
        <UserProbe />
      </AuthGate>,
    );

    expect(await screen.findByText("Alice Kim")).toBeInTheDocument();
  });

  it("인증 성공 후 refresh를 반복 호출하지 않는다 (effect 재실행 루프 회귀 가드)", async () => {
    const tryRefresh = vi.fn(async () => true);
    render(
      <AuthGate enabled client={stubClient({ tryRefresh })}>
        <UserProbe />
      </AuthGate>,
    );

    expect(await screen.findByText("Alice Kim")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0)); // 후속 effect 재실행 여지를 흘려보냄
    expect(tryRefresh).toHaveBeenCalledTimes(1);
  });

  it("enabled=false(dev/test)면 인증 없이 즉시 children을 렌더한다", () => {
    const redirect = vi.fn();
    render(
      <AuthGate enabled={false} client={stubClient({})} redirect={redirect}>
        <UserProbe />
      </AuthGate>,
    );

    expect(screen.getByTestId("auth-user")).toHaveTextContent("(none)");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("Provider 밖에서 useAuth는 throw 대신 user=null을 반환한다", () => {
    render(<UserProbe />);
    expect(screen.getByTestId("auth-user")).toHaveTextContent("(none)");
  });
});
