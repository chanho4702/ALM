import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OrgProfile } from "../store/types";
import * as store from "../store/jiraStore";
import { OrgAccountGate, useOrgProfile } from "./OrgAccountGate";

const ACTIVE: OrgProfile = {
  id: "7",
  displayName: "김찬호",
  email: "chanho@example.com",
  status: "ACTIVE",
  kind: "HUMAN",
  globalRoles: ["ADMIN"],
  teams: [],
  joinedVia: "LEGACY",
};

function profile(patch: Partial<OrgProfile>): OrgProfile {
  return { ...ACTIVE, ...patch };
}

function mockProfile(value: OrgProfile | Error) {
  return vi
    .spyOn(store, "getMyOrgProfile")
    .mockImplementation(() => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)));
}

/** 게이트가 내려준 판정을 그대로 찍는 프로브 — 화면들이 읽는 값과 같은 경로다 */
function Probe() {
  const { profile: me, isGlobalAdmin } = useOrgProfile();
  return <div data-testid="probe">{`${me?.displayName ?? "-"}/${isGlobalAdmin}`}</div>;
}

function renderGate() {
  return render(
    <OrgAccountGate>
      <Probe />
    </OrgAccountGate>,
  );
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});

afterEach(() => vi.restoreAllMocks());

describe("계정 상태 게이트 (/api/org/me)", () => {
  it("ACTIVE면 앱을 그리고 전역 역할을 아래로 내려준다", async () => {
    mockProfile(ACTIVE);
    renderGate();
    expect(await screen.findByTestId("probe")).toHaveTextContent("김찬호/true");
  });

  it("ADMIN이 없으면 전역 관리자가 아니다 — 판정은 globalRoles 하나로 한다", async () => {
    mockProfile(profile({ globalRoles: ["USER"] }));
    renderGate();
    expect(await screen.findByTestId("probe")).toHaveTextContent("김찬호/false");
  });

  it("PENDING이면 셸 대신 공용 패키지의 승인 대기 화면이 뜬다", async () => {
    mockProfile(profile({ status: "PENDING" }));
    renderGate();
    expect(await screen.findByRole("heading", { name: "승인 대기 중" })).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("SUSPENDED·DEACTIVATED는 각각 다른 안내를 보이고 앱을 열지 않는다", async () => {
    mockProfile(profile({ status: "SUSPENDED" }));
    const view = renderGate();
    expect(await screen.findByRole("heading", { name: "정지된 계정입니다" })).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    view.unmount();

    vi.restoreAllMocks();
    mockProfile(profile({ status: "DEACTIVATED" }));
    renderGate();
    expect(await screen.findByRole("heading", { name: "비활성된 계정입니다" })).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("조회가 실패하면 사유를 그대로 띄우고 앱을 열지 않는다 — 상태를 모르면 닫는다", async () => {
    const spy = mockProfile(new Error("권한 서비스에 연결할 수 없습니다"));
    renderGate();
    expect(await screen.findByText("권한 서비스에 연결할 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
