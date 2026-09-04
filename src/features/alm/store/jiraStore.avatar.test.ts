import { beforeEach, describe, expect, it } from "vitest";
import { formatAvatarLimit } from "./jiraMock";
import {
  AVATAR_MAX_BYTES,
  __resetForTest,
  getCurrentUser,
  getMyPreferences,
  listProjectMembers,
  listUsers,
  removeMyAvatar,
  uploadMyAvatar,
} from "./jiraStore";

function pngFile(bytes = 32, type = "image/png", name = "me.png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("프로필 사진(아바타)", () => {
  it("기본값은 사진 없음 — 사용자·개인 설정 모두 avatarUrl이 비어 있다", async () => {
    expect((await getCurrentUser()).avatarUrl).toBeNull();
    expect((await listUsers()).every((u) => !u.avatarUrl)).toBe(true);
    expect((await getMyPreferences()).avatarUrl).toBeNull();
  });

  it("올리면 dataURL로 저장되고 현재 사용자·디렉터리·개인 설정에 함께 반영된다", async () => {
    const url = await uploadMyAvatar(pngFile());
    expect(url.startsWith("data:image/png;base64,")).toBe(true);

    const me = await getCurrentUser();
    expect(me.avatarUrl).toBe(url);
    expect((await getMyPreferences()).avatarUrl).toBe(url);

    const directory = await listUsers();
    expect(directory.find((u) => u.id === me.id)?.avatarUrl).toBe(url);
    // 다른 사람 것은 건드리지 않는다
    expect(directory.filter((u) => u.avatarUrl).length).toBe(1);
  });

  it("멤버 목록도 같은 사진을 싣는다 — 멤버 표가 이니셜로 남지 않게", async () => {
    const url = await uploadMyAvatar(pngFile());
    const me = await getCurrentUser();
    const members = await listProjectMembers("p1");
    expect(members.find((m) => m.user.id === me.id)?.user.avatarUrl).toBe(url);
  });

  it("제거하면 다시 이니셜로 떨어진다", async () => {
    await uploadMyAvatar(pngFile());
    await removeMyAvatar();
    expect((await getCurrentUser()).avatarUrl).toBeNull();
    expect((await getMyPreferences()).avatarUrl).toBeNull();
  });

  // 문구는 서버(alm-backend V20)와 글자까지 같아야 한다 — 같은 파일이 모드에 따라 다르게 거부되면 안 된다
  it("빈 파일·이미지 아님·상한 초과를 서버와 같은 문구로 거부한다 — 저장 상태도 그대로다", async () => {
    await expect(uploadMyAvatar(pngFile(0))).rejects.toThrow("빈 파일은 올릴 수 없습니다");
    await expect(uploadMyAvatar(pngFile(10, "application/pdf", "a.pdf"))).rejects.toThrow(
      "아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다",
    );
    await expect(uploadMyAvatar(pngFile(AVATAR_MAX_BYTES + 1))).rejects.toThrow(
      "아바타는 200KB 이하 이미지여야 합니다",
    );
    // 경계(정확히 상한)는 통과한다
    await expect(uploadMyAvatar(pngFile(AVATAR_MAX_BYTES))).resolves.toContain("data:image/png");
    await removeMyAvatar();
    expect((await getCurrentUser()).avatarUrl).toBeNull();
  });

  it("REST 상한(2MB)에는 서버와 같은 MB 문구를 만든다", () => {
    expect(formatAvatarLimit(2 * 1024 * 1024)).toBe("2MB");
    expect(formatAvatarLimit(200 * 1024)).toBe("200KB");
  });

  it("사진을 바꾸면 마지막 것만 남는다", async () => {
    const first = await uploadMyAvatar(pngFile(16));
    const second = await uploadMyAvatar(pngFile(64, "image/webp", "me.webp"));
    expect(second).not.toBe(first);
    expect((await getCurrentUser()).avatarUrl).toBe(second);
  });
});
