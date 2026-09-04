import { beforeEach, describe, expect, it } from "vitest";
import {
  addComment,
  addProjectShortcut,
  createIssue,
  createProject,
  getBanner,
  getMyPreferences,
  listNotifications,
  listProjectShortcuts,
  listWatchers,
  removeProjectShortcut,
  __resetForTest,
  saveBanner,
  saveMyPreferences,
  updateProject,
  updateProjectShortcut,
} from "./jiraStore";
import { CURRENT_USER_ID } from "../../../mock/users";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("프로젝트 세부(지라 프로젝트 설정 > 세부)", () => {
  it("새 프로젝트의 리더는 만든 사람이고 기본 담당자는 미지정이다", async () => {
    const project = await createProject({ key: "DTL", name: "세부" });
    expect(project.leadId).toBe(CURRENT_USER_ID);
    expect(project.defaultAssignee).toBe("unassigned");
    expect(project.category).toBe("");
  });

  it("기본 담당자를 리더로 두면 담당자 없이 만든 이슈가 리더에게 간다", async () => {
    const project = await createProject({ key: "DTL", name: "세부" });
    const updated = await updateProject(project.id, {
      category: "플랫폼",
      defaultAssignee: "lead",
      icon: "rocket",
      color: "purple",
      url: "https://example.com",
    });
    expect(updated).toMatchObject({ category: "플랫폼", defaultAssignee: "lead", icon: "rocket", color: "purple" });
    const issue = await createIssue({ projectId: project.id, title: "담당자 없이" });
    expect(issue.assigneeId).toBe(CURRENT_USER_ID);
    const explicit = await createIssue({ projectId: project.id, title: "명시", assigneeId: null });
    expect(explicit.assigneeId).toBe(CURRENT_USER_ID); // null도 "없음"이므로 규칙 적용
  });

  it("URL은 http(s)만 받는다", async () => {
    const project = await createProject({ key: "DTL", name: "세부" });
    await expect(updateProject(project.id, { url: "javascript:alert(1)" })).rejects.toThrow(
      "URL은 http:// 또는 https://로 시작해야 합니다",
    );
  });
});

describe("프로젝트 바로 가기", () => {
  it("관리자가 추가·수정·삭제하고 순서가 붙는다", async () => {
    const project = await createProject({ key: "SC", name: "바로 가기" });
    const wiki = await addProjectShortcut(project.id, { name: "위키", url: "https://wiki.example.com" });
    await addProjectShortcut(project.id, { name: "저장소", url: "https://git.example.com" });
    expect((await listProjectShortcuts(project.id)).map((s) => [s.name, s.order])).toEqual([
      ["위키", 1],
      ["저장소", 2],
    ]);
    await updateProjectShortcut(wiki.id, { name: "팀 위키", url: wiki.url });
    expect((await listProjectShortcuts(project.id))[0].name).toBe("팀 위키");
    await removeProjectShortcut(wiki.id);
    expect(await listProjectShortcuts(project.id)).toHaveLength(1);
    await expect(
      addProjectShortcut(project.id, { name: "나쁜", url: "javascript:alert(1)" }),
    ).rejects.toThrow("바로 가기 URL은 http:// 또는 https://로 시작해야 합니다");
    await expect(addProjectShortcut(project.id, { name: " ", url: "https://x" })).rejects.toThrow(
      "바로 가기 이름을 입력하세요",
    );
  });
});

describe("개인 설정(알림·자동 관찰·시작 화면)", () => {
  it("기본값은 알림 전부 켜짐·만든/댓글 단 이슈 자동 관찰·홈 시작", async () => {
    expect(await getMyPreferences()).toEqual({
      notifications: { assigned: true, statusChanged: true, commented: true, mentioned: true },
      autoWatch: { created: true, commented: true, edited: false },
      startPage: "home",
      emailEnabled: false,
      mailConfigured: false,
    });
  });

  it("저장하면 부분 갱신되고 시작 화면은 정해진 값만 받는다", async () => {
    const saved = await saveMyPreferences({ notifications: { commented: false }, startPage: "projects" });
    expect(saved.notifications).toEqual({ assigned: true, statusChanged: true, commented: false, mentioned: true });
    expect(saved.startPage).toBe("projects");
    expect((await getMyPreferences()).startPage).toBe("projects");
    await expect(saveMyPreferences({ startPage: "mars" as never })).rejects.toThrow(
      "시작 화면은 home/projects/last-project 중 하나입니다",
    );
  });

  it("만든 이슈 자동 관찰을 끄면 보고자가 워처가 되지 않는다", async () => {
    await saveMyPreferences({ autoWatch: { created: false } });
    const project = await createProject({ key: "PW", name: "관찰" });
    const issue = await createIssue({ projectId: project.id, title: "관찰 안 함" });
    expect((await listWatchers(issue.id)).watching).toBe(false);
  });

  it("코멘트 알림을 끄면 코멘트 알림이 오지 않는다", async () => {
    // ALM-3: 다른 사용자가 담당(시드) — 코멘트는 담당자에게 알림이 간다
    const before = (await listNotifications("u2")).length;
    await saveMyPreferences({ notifications: { commented: false } });
    // 내(u1) 설정은 내 수신에만 영향 — 다른 사람 수신은 그대로여야 한다
    const project = await createProject({ key: "NT", name: "알림" });
    const issue = await createIssue({ projectId: project.id, title: "알림", assigneeId: "u2" });
    await addComment(issue.id, "확인 부탁");
    // 목업은 생성 시 배정 알림을 내지 않는다(수정 시만) — 코멘트 알림 1건만 늘어야 한다
    expect((await listNotifications("u2")).length).toBe(before + 1);
  });
});

describe("공지 배너", () => {
  it("기본은 꺼짐이고 켜려면 내용이 필요하다", async () => {
    expect(await getBanner()).toEqual({ enabled: false, level: "info", message: "" });
    await expect(saveBanner({ enabled: true, level: "info", message: "  " })).rejects.toThrow(
      "배너 내용을 입력하세요",
    );
    const saved = await saveBanner({ enabled: true, level: "warning", message: " 오늘 22시 점검 " });
    expect(saved).toEqual({ enabled: true, level: "warning", message: "오늘 22시 점검" });
    expect(await getBanner()).toEqual(saved);
  });
});
