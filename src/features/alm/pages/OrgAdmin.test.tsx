import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import type { OrgProfile } from "../store/types";
import * as store from "../store/jiraStore";
import { ORG_ADMIN_BASE } from "../components/SettingsSideNav";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** 목업 기본값은 전역 관리자다 — 비관리자 화면은 프로필을 갈아끼워 본다 */
function asMember() {
  const base: OrgProfile = {
    id: "u1",
    displayName: "김찬호",
    email: null,
    status: "ACTIVE",
    kind: "HUMAN",
    globalRoles: [],
    teams: [],
    joinedVia: "LEGACY",
  };
  vi.spyOn(store, "getMyOrgProfile").mockResolvedValue(base);
}

function settingsNav() {
  return screen.getByRole("navigation", { name: "설정 메뉴" });
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});

afterEach(() => vi.restoreAllMocks());

describe("조직 관리 마운트 (/settings/org)", () => {
  it("설정 사이드바의 '사용자·팀'으로 들어가면 사용자 화면으로 보낸다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/types");
    const nav = await screen.findByRole("navigation", { name: "설정 메뉴" });
    await user.click(within(nav).getByRole("button", { name: "사용자·팀" }));
    expect(await screen.findByTestId("location")).toHaveTextContent("/settings/org/users");
  });

  it("목업 모드에서는 관리 화면 대신 REST 전용 안내를 보인다 (메뉴 자체는 남는다)", async () => {
    renderAt("/settings/org/users");
    expect(
      await screen.findByRole("heading", { name: "REST 모드에서만 쓸 수 있습니다" }),
    ).toBeInTheDocument();
    expect(
      within(settingsNav()).getByRole("button", { name: "사용자·팀" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("⚙ 메뉴의 '사용자·팀'도 같은 곳으로 간다", async () => {
    const user = userEvent.setup();
    renderAt("/projects");
    await screen.findByRole("table", { name: "프로젝트 목록" });
    await user.click(screen.getByRole("button", { name: "설정" }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /사용자·팀/ }));
    expect(await screen.findByTestId("location")).toHaveTextContent("/settings/org/users");
  });

  it("전역 관리자가 아니면 관리자 항목이 사라지고, URL을 직접 쳐도 막힌다", async () => {
    const user = userEvent.setup();
    asMember();
    renderAt("/settings/personal");
    const nav = await screen.findByRole("navigation", { name: "설정 메뉴" });
    // 개인 설정 두 개만 남는다
    expect(within(nav).getByRole("button", { name: "일반 설정" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "사용자·팀" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "감사 로그" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "설정" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByText("ALM 관리자 설정")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    renderAt("/settings/system");
    expect(
      await screen.findAllByRole("heading", { name: "전역 관리자만 볼 수 있습니다" }),
    ).not.toHaveLength(0);
  });

  it("프로젝트 관리자는 초대 화면만 들어간다 (설계 §3.2 — 리소스 ADMIN도 초대 가능)", async () => {
    asMember(); // 전역 역할 없음. 목업 시드에서 u1은 ALM 플랫폼의 프로젝트 관리자다
    renderAt(`${ORG_ADMIN_BASE}/invitations`);
    // 권한은 통과하고 그다음 관문(목업에는 org 데이터가 없다)에서 멈춘다
    expect(
      await screen.findByRole("heading", { name: "REST 모드에서만 쓸 수 있습니다" }),
    ).toBeInTheDocument();
  });

  it("초대 말고 다른 조직 화면은 프로젝트 관리자에게도 닫혀 있다", async () => {
    asMember();
    renderAt(`${ORG_ADMIN_BASE}/users`);
    expect(
      await screen.findByRole("heading", { name: "전역 관리자만 볼 수 있습니다" }),
    ).toBeInTheDocument();
  });

  it("어느 프로젝트에서도 관리자가 아니면 초대 화면도 닫힌다", async () => {
    asMember();
    vi.spyOn(store, "hasAnyProjectAdmin").mockResolvedValue(false);
    renderAt(`${ORG_ADMIN_BASE}/invitations`);
    expect(
      await screen.findByRole("heading", { name: "초대할 권한이 없습니다" }),
    ).toBeInTheDocument();
  });
});
