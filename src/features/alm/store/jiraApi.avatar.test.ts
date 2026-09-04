import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  __resetForTest,
  getMyPreferences,
  listUsers,
  removeMyAvatar,
  uploadMyAvatar,
} from "./jiraApi";

/**
 * 서버 계약(alm-backend V20, 2026-09-05 확정):
 * - `PUT /api/alm/me/avatar` multipart `file` → 200 `{userId, avatarUrl, updatedAt}`
 * - `DELETE /api/alm/me/avatar` → 204
 * - `GET /api/alm/users/{id}/avatar` → 바이트, 없으면 404 `{"error":"아바타가 없습니다"}`
 * - `GET /api/alm/users/avatars` → `[{userId, avatarUrl, updatedAt}]` (userId는 JSON 숫자,
 *   updatedAt은 ISO-8601). **avatarUrl은 서버가 만든다 — 프론트가 조립하지 않는다.**
 *
 * 바이트는 Bearer 토큰이 필요해 `<img src>`로 직접 못 연다 → 어댑터가 받아 object URL을 만든다.
 */

const MEMBERS = [
  { id: 1, displayName: "김찬호", status: "ACTIVE" },
  { id: 2, displayName: "이서연", status: "ACTIVE" },
];

const AVATAR_PATH_2 = "/api/alm/users/2/avatar?v=1757000000000";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bytes(): Response {
  return new Response(new Blob(["png"]), { status: 200 });
}

function fetchSpy(handler: (path: string, init?: RequestInit) => Response) {
  return vi
    .spyOn(client, "sharedApiFetch")
    .mockImplementation((path: string, init?: RequestInit) => Promise.resolve(handler(path, init)));
}

let objectUrlSeq = 0;
let revoked: string[] = [];
beforeEach(() => {
  __resetForTest(); // 아바타 경로·object URL 캐시는 모듈 전역이다
  objectUrlSeq = 0;
  revoked = [];
  // jsdom에는 없다 — 어댑터가 만드는 표시용 URL을 추적할 수 있게 스텁
  URL.createObjectURL = vi.fn(() => `blob:avatar-${++objectUrlSeq}`);
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
});
afterEach(() => vi.restoreAllMocks());

describe("jiraApi 프로필 사진", () => {
  it("서버가 준 avatarUrl 경로로 바이트를 받는다 — 프론트가 URL을 조립하지 않는다", async () => {
    const spy = fetchSpy((path) => {
      if (path === "/api/org/members") return json(200, MEMBERS);
      if (path === "/api/alm/users/avatars") {
        return json(200, [
          { userId: 2, avatarUrl: AVATAR_PATH_2, updatedAt: "2026-09-05T02:18:03.123456Z" },
        ]);
      }
      return bytes();
    });

    const users = await listUsers();
    expect(users.find((u) => u.id === "1")?.avatarUrl).toBeNull();
    expect(users.find((u) => u.id === "2")?.avatarUrl).toBe("blob:avatar-1");
    // 사진 없는 사용자에게는 바이트를 요청하지 않고, 요청 경로는 서버가 준 문자열 그대로다
    const byteCalls = spy.mock.calls.filter(([path]) => path.includes("/avatar?"));
    expect(byteCalls.map(([path]) => path)).toEqual([AVATAR_PATH_2]);
  });

  it("같은 버전은 다시 받지 않고, 사진이 바뀌면 이전 object URL을 revoke한다", async () => {
    let version = AVATAR_PATH_2;
    const spy = fetchSpy((path) => {
      if (path === "/api/org/members") return json(200, MEMBERS);
      if (path === "/api/alm/users/avatars") return json(200, [{ userId: 2, avatarUrl: version }]);
      return bytes();
    });

    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBe("blob:avatar-1");
    // 목록을 다시 불러도 같은 경로면 바이트를 재요청하지 않는다
    const before = spy.mock.calls.filter(([p]) => p.includes("/avatar?")).length;
    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBe("blob:avatar-1");
    expect(spy.mock.calls.filter(([p]) => p.includes("/avatar?")).length).toBe(before);

    // 사진 교체 → 경로가 바뀌고 이전 URL은 놓아준다
    version = "/api/alm/users/2/avatar?v=1757999999999";
    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBe("blob:avatar-2");
    expect(revoked).toEqual(["blob:avatar-1"]);
  });

  it("아바타 목록 조회가 실패해도 사용자 목록은 이니셜로 살아 있다", async () => {
    fetchSpy((path) =>
      path === "/api/org/members" ? json(200, MEMBERS) : json(503, { error: "저장소 장애" }),
    );
    const users = await listUsers();
    expect(users.map((u) => u.name)).toEqual(["김찬호", "이서연"]);
    expect(users.every((u) => u.avatarUrl === null)).toBe(true);
  });

  it("목록에 있던 사용자가 404면 조용히 이니셜로 떨어진다(삭제 경합)", async () => {
    fetchSpy((path) => {
      if (path === "/api/org/members") return json(200, MEMBERS);
      if (path === "/api/alm/users/avatars") return json(200, [{ userId: 2, avatarUrl: AVATAR_PATH_2 }]);
      return json(404, { error: "아바타가 없습니다" });
    });
    // 던지지 않는다 — 목록 전체가 실패하면 안 된다
    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBeNull();
  });

  it("업로드는 multipart PUT이고, 응답의 avatarUrl로 캐시를 채워 바이트를 다시 받지 않는다", async () => {
    const spy = fetchSpy((path) => {
      if (path === "/api/alm/me/avatar") {
        return json(200, {
          userId: 2,
          avatarUrl: AVATAR_PATH_2,
          updatedAt: "2026-09-05T02:18:03.123456Z",
        });
      }
      if (path === "/api/org/members") return json(200, MEMBERS);
      if (path === "/api/alm/users/avatars") return json(200, [{ userId: 2, avatarUrl: AVATAR_PATH_2 }]);
      return bytes();
    });

    const file = new File([new Uint8Array(8)], "me.png", { type: "image/png" });
    expect(await uploadMyAvatar(file)).toBe("blob:avatar-1");

    const [path, init] = spy.mock.calls[0];
    expect(path).toBe("/api/alm/me/avatar");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBeInstanceOf(FormData);
    const sent = (init?.body as FormData).get("file") as File;
    expect([sent.name, sent.type]).toEqual(["me.png", "image/png"]);
    // Content-Type은 브라우저가 boundary와 함께 붙인다
    expect(init?.headers).toBeUndefined();

    // 업로드 직후 목록을 불러도 방금 만든 미리보기를 재사용한다(바이트 요청 0건)
    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBe("blob:avatar-1");
    expect(spy.mock.calls.filter(([p]) => p.includes("/avatar?"))).toHaveLength(0);
  });

  it("서버 거부 문구를 그대로 올린다 — 매직 바이트 거부는 선검증을 통과해도 온다", async () => {
    const file = new File([new Uint8Array(8)], "me.png", { type: "image/png" });
    fetchSpy(() => json(400, { error: "아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다" }));
    await expect(uploadMyAvatar(file)).rejects.toThrow(
      "아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다",
    );
    fetchSpy(() => json(400, { error: "아바타는 2MB 이하 이미지여야 합니다" }));
    await expect(uploadMyAvatar(file)).rejects.toThrow("아바타는 2MB 이하 이미지여야 합니다");
  });

  it("이미지가 아니거나 비었으면 서버에 보내기 전에 막는다", async () => {
    const spy = fetchSpy(() => json(200, {}));
    await expect(
      uploadMyAvatar(new File([new Uint8Array(4)], "a.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다");
    await expect(
      uploadMyAvatar(new File([], "empty.png", { type: "image/png" })),
    ).rejects.toThrow("빈 파일은 올릴 수 없습니다");
    expect(spy).not.toHaveBeenCalled();
  });

  it("제거는 DELETE 204이고, 그 뒤 목록은 이니셜로 돌아가며 object URL을 놓아준다", async () => {
    let hasAvatar = true;
    const spy = fetchSpy((path) => {
      if (path === "/api/org/members") return json(200, MEMBERS);
      if (path === "/api/alm/users/avatars") {
        return json(200, hasAvatar ? [{ userId: 2, avatarUrl: AVATAR_PATH_2 }] : []);
      }
      if (path === "/api/alm/me/avatar") return new Response(null, { status: 204 });
      return bytes();
    });

    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBe("blob:avatar-1");
    hasAvatar = false;
    await removeMyAvatar();
    expect(spy).toHaveBeenCalledWith(
      "/api/alm/me/avatar",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect((await listUsers()).find((u) => u.id === "2")?.avatarUrl).toBeNull();
    expect(revoked).toEqual(["blob:avatar-1"]);
  });

  it("개인 설정의 avatarUrl은 항상 있고 값이 null일 수 있다 — 유무만 보고 표시 URL로 바꾼다", async () => {
    let stored: string | null = null;
    fetchSpy((path) => {
      if (path === "/api/alm/me/preferences") return json(200, { startPage: "home", avatarUrl: stored });
      if (path === "/api/alm/users/avatars") {
        return json(200, stored ? [{ userId: 1, avatarUrl: stored }] : []);
      }
      return bytes();
    });
    vi.spyOn(client.sharedAuthClient, "fetchMe").mockResolvedValue({
      sub: "1",
      name: "김찬호",
      email: "me@example.com",
    } as Awaited<ReturnType<typeof client.sharedAuthClient.fetchMe>>);

    expect((await getMyPreferences()).avatarUrl).toBeNull();

    stored = "/api/alm/users/1/avatar?v=1757000000000";
    __resetForTest();
    expect((await getMyPreferences()).avatarUrl).toBe("blob:avatar-1");
  });
});
