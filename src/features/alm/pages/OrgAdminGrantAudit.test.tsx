import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { OrgAdminApp } from "@chanho/org-admin";
import { ORG_ADMIN_BASE } from "../components/SettingsSideNav";

/**
 * @chanho/org-admin 0.3.0 — ALM 마운트 경로(`/settings/org/*`)에 권한 이력(grant-audit)이 전역 관리자 메뉴로 붙는다.
 * 목업 모드의 ALM 페이지는 REST 전용 안내를 그리므로, 여기서는 ALM과 같은 basePath로 패키지를 직접 마운트해 확인한다.
 */
const emptyApi = async (path: string) =>
  new Response(JSON.stringify(path.includes("audit") ? { items: [], page: 0, size: 50, total: 0, hasNext: false } : []), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function mountAt(path: string, globalRoles: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={`${ORG_ADMIN_BASE}/*`}
          element={<OrgAdminApp basePath={ORG_ADMIN_BASE} api={emptyApi} currentUser={{ id: "u1", globalRoles }} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("조직 관리 0.3.0 — 권한 이력", () => {
  it("전역 관리자에게 '권한 이력' 메뉴가 /settings/org/grant-audit로 보인다", async () => {
    mountAt(`${ORG_ADMIN_BASE}/grant-audit`, ["ADMIN"]);
    const link = await screen.findByRole("link", { name: /권한 이력/ });
    expect(link).toHaveAttribute("href", `${ORG_ADMIN_BASE}/grant-audit`);
  });

  it("전역 관리자가 아니면 메뉴에 없다", async () => {
    mountAt(`${ORG_ADMIN_BASE}/users`, []);
    await screen.findByRole("link", { name: /사용자/ });
    expect(screen.queryByRole("link", { name: /권한 이력/ })).not.toBeInTheDocument();
  });
});
