// localStorage 목업 스토어 — users (jiraMock.ts에서 분할, 동작 불변)
import type { User, OrgProfile } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { load, clone, withAvatar } from "./db";

export async function listUsers(query?: { q?: string }): Promise<User[]> {
  const data = load();
  // 서버(`GET /api/org/members?q=`)는 이름·이메일 부분일치다. 목업 사용자에는 이메일이 없어
  // 이름만 본다 — 대소문자 구분 없이, 공백만 넣으면 필터가 없는 것과 같다.
  const needle = query?.q?.trim().toLowerCase() ?? "";
  const rows = needle
    ? data.users.filter((u) => u.name.toLowerCase().includes(needle))
    : data.users;
  return clone(rows.map((u) => withAvatar(data, u)));
}

/**
 * 목업은 **항상 활성 전역 관리자**다 — 목업 개발자는 승인 대기 화면에 갇히면 안 되고
 * 관리자 메뉴도 전부 봐야 한다. 상태별 화면 검증은 유닛 테스트가 프로필을 주입해서 한다.
 */
export async function getMyOrgProfile(): Promise<OrgProfile> {
  const data = load();
  const me = data.users.find((u) => u.id === CURRENT_USER_ID);
  return {
    id: CURRENT_USER_ID,
    displayName: me?.name ?? "현재 사용자",
    email: null,
    status: "ACTIVE",
    kind: "HUMAN",
    globalRoles: ["ADMIN"],
    teams: [],
    joinedVia: "LEGACY",
  };
}

export async function getCurrentUser(): Promise<User> {
  const data = load();
  const user = data.users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(withAvatar(data, user));
}
