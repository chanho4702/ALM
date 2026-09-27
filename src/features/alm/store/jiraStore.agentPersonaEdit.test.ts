import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  __setAgentMockScenario,
  fetchAgentPersonaDetail,
  fetchOffice,
  listAgentTeamPersonas,
  updateAgentPersona,
} from "./jiraStore";
import { ApiError } from "./mapping";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ApiError ? error.status : -1;
  }
}

describe("직원 편집 목업(AGP-62) — agent-service 검증 규칙 미러", () => {
  it("상세는 목록 필드 + 편집 필드, 목록에는 편집 필드가 없다(누구나 보는 표면)", async () => {
    const detail = await fetchAgentPersonaDetail("103");
    expect(detail).toMatchObject({ id: "103", slug: "frontend-bot", defaultModel: "claude-sonnet-5", voicePrompt: "짧고 단정하게" });
    const listed = (await listAgentTeamPersonas()).find((p) => p.id === "103")!;
    expect(listed).not.toHaveProperty("voicePrompt");
    expect(listed).not.toHaveProperty("skills");
    expect(listed).toHaveProperty("avatarConfig");
  });

  it("생략은 그대로, 빈 문자열은 지움, 앞뒤 공백은 걷는다 — 응답은 상세 shape", async () => {
    const saved = await updateAgentPersona("103", { emoji: "", voicePrompt: "  차분하게  ", skills: "" });
    expect(saved).toMatchObject({ name: "프론트봇", emoji: null, voicePrompt: "차분하게", skills: null, defaultModel: "claude-sonnet-5" });
  });

  it("avatarConfig — 공백 없는 JSON으로 정규화해 저장, 빈 문자열은 기본 외형(null)으로, 사무실에도 반영된다", async () => {
    await updateAgentPersona("101", { avatarConfig: '{ "v": 1, "hairStyle": "bob", "showEmoji": 1 }' });
    expect((await fetchAgentPersonaDetail("101")).avatarConfig).toBe('{"v":1,"hairStyle":"bob","showEmoji":1}');
    const office = await fetchOffice("p1");
    expect(office.personas.find((p) => p.id === "101")?.avatarConfig).toBe('{"v":1,"hairStyle":"bob","showEmoji":1}');
    await updateAgentPersona("101", { avatarConfig: "" });
    expect((await fetchAgentPersonaDetail("101")).avatarConfig).toBeNull();
  });

  it("거부(400) — 이름 비움·길이·모델 문자·avatarConfig 형태(깨진 JSON·배열·모르는 키·중첩·showEmoji 값·1KB)", async () => {
    const cases: [Parameters<typeof updateAgentPersona>[1], string][] = [
      [{ name: "   " }, "name은 비울 수 없습니다"],
      [{ name: "가".repeat(81) }, "name은 80자 이하여야 합니다"],
      [{ emoji: "😀".repeat(9) }, "emoji는 16자 이하여야 합니다"],
      [{ defaultModel: "claude sonnet" }, "defaultModel은 영문·숫자와 . _ : @ / [ ] - 만 쓸 수 있습니다(60자 이하)"],
      [{ skills: "x".repeat(8001) }, "skills는 8000자 이하여야 합니다"],
      [{ avatarConfig: "{" }, "avatarConfig는 JSON 객체 문자열이어야 합니다"],
      [{ avatarConfig: "[1]" }, "avatarConfig는 JSON 객체여야 합니다"],
      [{ avatarConfig: '{"wings":"x"}' }, "avatarConfig에 허용되지 않은 키가 있습니다"],
      [{ avatarConfig: '{"hairStyle":{"a":1}}' }, "avatarConfig 값은 문자열 또는 숫자여야 합니다: hairStyle"],
      [{ avatarConfig: '{"showEmoji":true}' }, "avatarConfig showEmoji는 숫자 0 또는 1이어야 합니다"],
      [{ avatarConfig: `{"hairStyle":"${"a".repeat(1100)}"}` }, "avatarConfig는 1024바이트 이하여야 합니다"],
    ];
    for (const [patch, message] of cases) {
      await expect(updateAgentPersona("101", patch), JSON.stringify(patch).slice(0, 40)).rejects.toThrow(message);
      expect(await statusOf(updateAgentPersona("101", patch))).toBe(400);
    }
    // 한 필드라도 거부되면 아무것도 바뀌지 않는다
    await expect(updateAgentPersona("101", { emoji: "🙂", defaultModel: "bad model" })).rejects.toThrow();
    expect((await fetchAgentPersonaDetail("101")).emoji).toBe("📝");
  });

  it("권한(403) — 공용 직원은 전역 관리자만, 관리 권한이 없으면 프로젝트 직원도 불가, 없는 id는 404", async () => {
    expect(await statusOf(fetchAgentPersonaDetail("105"))).toBe(403);
    expect(await statusOf(updateAgentPersona("105", { name: "운영왕" }))).toBe(403);
    __setAgentMockScenario({ isGlobalAdmin: true });
    expect(await statusOf(fetchAgentPersonaDetail("105"))).toBeNull();
    __setAgentMockScenario({ isGlobalAdmin: false, canManage: false });
    expect(await statusOf(fetchAgentPersonaDetail("101"))).toBe(403);
    expect(await statusOf(fetchAgentPersonaDetail("999"))).toBe(404);
  });
});
