import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Card, PageHeader, Spinner } from "@chanho/react";
import { OrgAdminApp } from "@chanho/org-admin";
import type { Project } from "../store/types";
import { hasAnyProjectAdmin, USE_REST } from "../store/jiraStore";
import { orgApiFetch } from "../store/orgApi";
import { useOrgProfile } from "../components/OrgAccountGate";
import { ORG_ADMIN_BASE } from "../components/SettingsSideNav";

/**
 * 패키지는 리소스 링크를 `<a href>`로 그린다(라우터 밖 전체 이동). ALM은 `/alm` 아래에 살므로
 * 라우터 basename을 직접 붙여야 한다 — `to`가 아니라 href다.
 */
const APP_BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

const projectHref = (id: string) => `${APP_BASE}/projects/${id}/board`;

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="project-list-content settings-page">
      <PageHeader title="사용자·팀 관리" />
      <Card padding="lg" title={title}>
        <p className="dash-empty">{body}</p>
      </Card>
    </main>
  );
}

/**
 * 조직 관리(`/settings/org/*`) — 사용자·초대·팀·전역 역할·승인 대기.
 *
 * 화면은 플랫폼 공용 패키지 `@chanho/org-admin` 하나이고 위키도 같은 것을 마운트한다
 * (설계 §5). ALM이 주는 것은 인증 fetch·현재 사용자·프로젝트 이름 해석뿐이며, 이 리포에
 * 같은 화면을 복제하지 않는다.
 */
export function OrgAdminPage({ projects }: { projects: Project[] }) {
  const { profile, isGlobalAdmin } = useOrgProfile();
  const { pathname } = useLocation();
  // 초대 화면만은 전역 관리자가 아니어도 연다(설계 §3.2 — 리소스 ADMIN도 초대할 수 있다).
  // 그 사람이 실제로 어디든 관리자인지는 grant로 따로 묻는다. 전역 관리자면 물을 필요가 없다.
  const invitationsOnly = pathname.replace(/\/+$/, "") === `${ORG_ADMIN_BASE}/invitations`;
  const [canInvite, setCanInvite] = useState<boolean | null>(null);

  useEffect(() => {
    if (isGlobalAdmin || !invitationsOnly) {
      setCanInvite(null);
      return;
    }
    let alive = true;
    void hasAnyProjectAdmin().then(
      (value) => {
        if (alive) setCanInvite(value);
      },
      // 조회가 실패하면 열지 않는다 — 권한은 모를 때 닫는 쪽이 맞다(서버도 어차피 거절한다)
      () => {
        if (alive) setCanInvite(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [isGlobalAdmin, invitationsOnly]);

  const resolveResource = useCallback(
    async (scope: "GLOBAL" | "SPACE" | "PROJECT", id: string) => {
      if (scope !== "PROJECT") return { name: id };
      const project = projects.find((p) => p.id === id);
      // 휴지통·보관된 프로젝트는 목록에 없다 — 이름을 못 찾으면 id를 그대로 보인다
      return project ? { name: project.name, href: projectHref(project.id) } : { name: id };
    },
    [projects],
  );

  if (!profile) {
    return (
      <Notice
        title="전역 관리자만 볼 수 있습니다"
        body="사용자·초대·팀 관리는 전역 관리자 권한이 필요합니다. 접근이 필요하면 관리자에게 요청하세요."
      />
    );
  }

  if (!isGlobalAdmin) {
    // 초대 말고 다른 화면은 전역 관리자 전용이다. 패키지 내비게이션에는 다섯 탭이 다 보이므로
    // 눌러서 넘어온 경우에도 여기서 막힌다(서버 403을 화면에 흘리는 대신).
    if (!invitationsOnly) {
      return (
        <Notice
          title="전역 관리자만 볼 수 있습니다"
          body="사용자·팀·전역 역할·승인 대기는 전역 관리자 권한이 필요합니다. 프로젝트 관리자는 초대 화면만 쓸 수 있습니다."
        />
      );
    }
    if (canInvite === null) {
      return (
        <div className="board-loading">
          <Spinner size="large" label="권한 확인 중" />
        </div>
      );
    }
    if (!canInvite) {
      return (
        <Notice
          title="초대할 권한이 없습니다"
          body="사람을 초대하려면 전역 관리자이거나 어느 프로젝트의 관리자여야 합니다."
        />
      );
    }
  }

  // 권한을 통과한 뒤에야 "데이터가 있느냐"를 따진다 — 순서가 반대면 권한 없는 사람에게도
  // 관리 화면이 있는 것처럼 읽힌다.
  if (!USE_REST) {
    return (
      <Notice
        title="REST 모드에서만 쓸 수 있습니다"
        body="사용자·초대·팀 관리는 org-service가 가진 데이터라 목업 모드에는 없습니다. 백엔드에 연결한 개발 서버(VITE_ALM_DATA=rest)나 배포본에서 열어 주세요."
      />
    );
  }

  return (
    <OrgAdminApp
      basePath={ORG_ADMIN_BASE}
      api={orgApiFetch}
      currentUser={{ id: profile.id, globalRoles: profile.globalRoles }}
      resolveResource={resolveResource}
      links={{ project: projectHref }}
    />
  );
}
