import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button, Spinner } from "@chanho/react";
import { Ban } from "lucide-react";
import type { ReactNode } from "react";
import type { OrgProfile } from "../store/types";
import { getMyOrgProfile } from "../store/jiraStore";
import { useAuth } from "../../../auth/AuthGate";

interface OrgProfileValue {
  /** `/api/org/me` 응답. 게이트 밖(기존 테스트가 페이지를 직접 렌더)에서는 null이다 */
  profile: OrgProfile | null;
  /** 전역 관리자인가 — 관리자 메뉴·관리 화면 진입의 유일한 판정 기준 */
  isGlobalAdmin: boolean;
}

const OrgProfileContext = createContext<OrgProfileValue>({ profile: null, isGlobalAdmin: false });

/**
 * 전역 역할·계정 상태를 읽는다. 프로바이더가 없으면(게이트를 거치지 않은 렌더) 관리자가 아니다 —
 * "모르면 닫는다"가 안전한 기본값이다.
 */
export function useOrgProfile(): OrgProfileValue {
  return useContext(OrgProfileContext);
}

/**
 * 승인 대기 화면은 공용 패키지의 것을 쓴다(위키와 같은 문구). 그 패키지에는 관리 화면 다섯 개가
 * 함께 들어 있으므로 **정적으로 가져오지 않는다** — 거의 모든 로그인은 ACTIVE라 첫 화면에
 * 60KB를 얹을 이유가 없다.
 */
const PendingApprovalGate = lazy(() =>
  import("@chanho/org-admin").then((module) => ({ default: module.PendingApprovalGate })),
);

/** 로그아웃 — 승인 대기·정지 화면에서 유일하게 할 수 있는 일 */
function LogoutAction() {
  const { logout } = useAuth();
  return (
    <Button variant="secondary" onClick={() => void logout()}>
      로그아웃
    </Button>
  );
}

function BlockedScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="org-gate" role="alert">
      <Ban size={40} aria-hidden />
      <h1 className="org-gate-title">{title}</h1>
      <p className="org-gate-body">{body}</p>
      <div className="org-gate-actions">
        <LogoutAction />
      </div>
    </div>
  );
}

/**
 * 계정 상태 게이트 — `AuthGate`(로그인) 뒤, 앱 셸보다 바깥이다.
 *
 * 로그인은 됐지만 조직에서 아직 승인받지 못했거나(PENDING) 정지·비활성된 계정은 org-service가
 * `/api/org/me` 외의 모든 호출을 403으로 막는다(설계 §3.2·§10). 셸을 그대로 그리면 화면마다
 * 오류가 뜨므로 여기서 한 번 막는다.
 *
 * `/api/org/me`는 **여기서 한 번만** 읽고 그 값을 아래로 내려준다. 승인 대기 화면은
 * `@chanho/org-admin`의 것을 그대로 쓰되(위키와 같은 문구), 이미 읽은 프로필을 돌려주는 어댑터를
 * 넘겨 같은 요청을 두 번 보내지 않는다. 정지·비활성 안내는 패키지에 없어 여기서 그린다.
 */
export function OrgAccountGate({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProfile(await getMyOrgProfile());
    } catch (e) {
      // 삼키면 정지된 계정이 정상으로 보인다 — 상태를 모르면 앱을 열지 않는다(fail-closed).
      setProfile(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<OrgProfileValue>(
    () => ({ profile, isGlobalAdmin: profile?.globalRoles.includes("ADMIN") === true }),
    [profile],
  );

  // 이미 읽은 프로필을 그대로 돌려주는 `OrgApiFetch` — 패키지 화면을 재사용하되 왕복은 없다
  const cachedMeApi = useCallback(
    async () =>
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    [profile],
  );

  if (error !== null) {
    return (
      <div className="org-gate" role="alert">
        <h1 className="org-gate-title">계정 상태를 확인하지 못했습니다</h1>
        <p className="org-gate-body">{error}</p>
        <div className="org-gate-actions">
          <Button variant="secondary" onClick={() => void load()}>
            다시 시도
          </Button>
          <LogoutAction />
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="계정 상태 확인 중" />
      </div>
    );
  }

  if (profile.status === "PENDING") {
    return (
      <Suspense
        fallback={
          <div className="app-loading">
            <Spinner size="large" label="계정 상태 확인 중" />
          </div>
        }
      >
        <PendingApprovalGate api={cachedMeApi} actions={<LogoutAction />}>
          {null}
        </PendingApprovalGate>
      </Suspense>
    );
  }

  if (profile.status === "SUSPENDED") {
    return (
      <BlockedScreen
        title="정지된 계정입니다"
        body="관리자가 이 계정을 일시 정지했습니다. 다시 쓰려면 관리자에게 해제를 요청하세요."
      />
    );
  }

  if (profile.status === "DEACTIVATED") {
    return (
      <BlockedScreen
        title="비활성된 계정입니다"
        body="이 계정은 비활성 처리됐습니다. 다시 들어오려면 관리자에게 재초대를 요청하세요."
      />
    );
  }

  return <OrgProfileContext.Provider value={value}>{children}</OrgProfileContext.Provider>;
}
