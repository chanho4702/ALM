import { describe, expect, it } from "vitest";
import type { AgentCurrentRun, AgentOfficePersona, AgentPersonaActivity } from "../store/types";
import {
  copulaJosa,
  directiveCommentHtml,
  farewellLine,
  greetingLine,
  objectJosa,
  roleHabit,
  statusAnswer,
} from "./officeDialogCopy";
import { paginate } from "./TypewriterText";
import { ambienceSnapshot } from "./OfficeCanvas";
import type { MeetingSeat } from "./officeModel";

const NOW = Date.parse("2026-09-27T05:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

function persona(over: Partial<AgentOfficePersona> = {}): AgentOfficePersona {
  return {
    id: "104",
    slug: "backend-bot",
    name: "백엔드봇",
    emoji: null,
    role: "BACKEND",
    active: true,
    currentRun: null,
    lastActivity: null,
    todayCostUsd: 0,
    ...over,
  };
}

function run(over: Partial<AgentCurrentRun> = {}): AgentCurrentRun {
  return { id: "9004", status: "RUNNING", issueKey: "ALM-5", type: "TASK", trigger: "SCHEDULER", attempt: 1, model: null, startedAt: ago(14), ...over };
}

/** 말버릇이 붙지 않는 발화 번호 — 해시라 결정적이다 */
function plainNo(p: AgentOfficePersona): number {
  for (let n = 1; n < 50; n += 1) if (!roleHabit(p, n, NOW)) return n;
  throw new Error("no plain utterance");
}

describe("조사", () => {
  it("받침 — 한글 음절·숫자 소리", () => {
    expect(objectJosa("진행 보고")).toBe("를");
    expect(objectJosa("이슈 검색")).toBe("을");
    expect(copulaJosa("ALM-4")).toBe("예요");
    expect(copulaJosa("ALM-3")).toBe("이에요");
    expect(copulaJosa("프로젝트 전반")).toBe("이에요");
  });
});

describe("인사(§5.8)", () => {
  it("상태별 대사·표정, 회의 중(문 앞), 오늘 이미 만났으면 '또 오셨네요!'", () => {
    expect(greetingLine(persona(), { inMeeting: false, metToday: false })).toEqual({ text: "안녕하세요! 뭐 도와드릴까요?", mood: "HAPPY" });
    expect(greetingLine(persona({ currentRun: run() }), { inMeeting: false, metToday: false }).text).toBe("아, 네! 작업하면서 들을게요.");
    expect(greetingLine(persona({ currentRun: run({ status: "WAITING_APPROVAL" }) }), { inMeeting: false, metToday: false })).toEqual({
      text: "마침 잘 오셨어요, 승인 기다리던 참이에요.",
      mood: "TROUBLED",
    });
    expect(greetingLine(persona({ currentRun: run() }), { inMeeting: true, metToday: false }).text).toBe("회의 중이라 잠깐만요! 무슨 일이세요?");
    expect(greetingLine(persona(), { inMeeting: false, metToday: true }).text).toBe("또 오셨네요! 안녕하세요! 뭐 도와드릴까요?");
  });
});

describe("'지금 뭐 해?' 즉답(§5.2)", () => {
  it("RUNNING TASK — 키·시작 시각·시도 횟수 + 최신 감사 도구 라벨", () => {
    const p = persona({ currentRun: run({ attempt: 3 }) });
    const activity: AgentPersonaActivity = {
      personaId: "104",
      runs: [],
      todayAudits: [{ id: "1", tool: "report_progress", status: "OK", summary: "run=1 (본문 생략)", createdAt: ago(1), origin: "WORKER", runId: "9" }],
      todayCostUsd: 0,
    };
    const a = statusAnswer(p, activity, [], plainNo(p), NOW);
    expect(a.text).toBe("지금은 ALM-5 작업 중이에요. 14분 전부터 하고 있어요. 이번이 3번째 시도예요. 방금 전엔 진행 보고를 했어요.");
    expect(a.mood).toBe("NORMAL");
    expect(a.context).toBeNull();
  });

  it("승인 대기 → 곤란 + 상황 선택지 승인 인박스, 차단 → 실행 상세", () => {
    const waiting = persona({ currentRun: run({ status: "WAITING_APPROVAL", issueKey: "ALM-3" }) });
    const w = statusAnswer(waiting, null, [], plainNo(waiting), NOW);
    expect(w.text).toBe("ALM-3에서 승인을 기다리고 있어요. 봐 주실 수 있나요?");
    expect(w).toMatchObject({ mood: "TROUBLED", context: "GATES" });
    const blocked = persona({ currentRun: run({ status: "BLOCKED" }) });
    expect(statusAnswer(blocked, null, [], plainNo(blocked), NOW)).toMatchObject({
      text: "ALM-5에서 막혔어요… 사람이 확인해 줘야 해요.",
      context: "RUN_DETAIL",
    });
  });

  it("회의 계열은 회의 이름 + 안건(합성 키는 '프로젝트 전반')", () => {
    const p = persona({ currentRun: run({ type: "RETRO", issueKey: "PROJECT-1" }) });
    expect(statusAnswer(p, null, [], plainNo(p), NOW).text).toBe("회고 회의 중이에요. 안건은 프로젝트 전반이에요.");
  });

  it("휴식 — 오늘 종결 run 수, 기쁨. 5분 넘은 감사는 '{전}에는'", () => {
    const p = persona();
    const activity: AgentPersonaActivity = {
      personaId: "104",
      runs: [
        { id: "1", issueKey: "ALM-6", status: "DONE", personaId: "104", attempt: 1, model: null, startedAt: ago(90), endedAt: ago(60), type: "TASK", trigger: "USER", parentRunId: null },
        { id: "2", issueKey: "ALM-7", status: "FAILED", personaId: "104", attempt: 1, model: null, startedAt: ago(50), endedAt: ago(40), type: "TASK", trigger: "USER", parentRunId: null },
      ],
      todayAudits: [{ id: "1", tool: "search_issues", status: "OK", summary: null, createdAt: ago(20), origin: null, runId: null }],
      todayCostUsd: 0,
    };
    const a = statusAnswer(p, activity, [], plainNo(p), NOW);
    expect(a.text).toBe("지금은 쉬는 중이에요. 오늘은 2건 끝냈어요. 20분 전에는 이슈 검색을 했어요.");
    expect(a.mood).toBe("HAPPY");
  });

  it("롤 말버릇은 해시로 가끔 — 같은 입력이면 같은 결과", () => {
    const p = persona();
    const n = [...Array(30).keys()].find((i) => roleHabit(p, i, NOW) !== null)!;
    expect(statusAnswer(p, null, [], n, NOW).text.startsWith("서버 쪽은, 지금은 쉬는 중이에요.")).toBe(true);
    expect(statusAnswer(p, null, [], n, NOW).text).toBe(statusAnswer(p, null, [], n, NOW).text);
  });
});

describe("잘 가·지시 코멘트", () => {
  it("잘 가 — 상태별 한 줄", () => {
    expect(farewellLine(persona({ currentRun: run() }), false).text).toBe("그럼 하던 거 마저 할게요!");
    expect(farewellLine(persona(), false).text).toBe("또 불러 주세요!");
    expect(farewellLine(persona({ currentRun: run({ status: "BLOCKED" }) }), false).text).toBe("승인 기다리고 있을게요.");
    expect(farewellLine(persona({ currentRun: run() }), true).text).toBe("회의 마저 하고 올게요!");
  });

  it("지시 코멘트 본문 — 머리말 + 이스케이프 + 줄바꿈 <br>", () => {
    expect(directiveCommentHtml("백엔드봇", "<b>굵게</b>\n둘째 줄")).toBe(
      "<p><strong>[AI 사무실 지시 → 백엔드봇]</strong></p><p>&lt;b&gt;굵게&lt;/b&gt;<br>둘째 줄</p>",
    );
  });
});

describe("쪽 나누기(§4.4)", () => {
  const measure = (t: string) => [...t].length * 10;
  it("공백 우선 줄바꿈 → 줄 수 단위 쪽, 긴 단어는 글자 단위", () => {
    expect(paginate("가나 다라 마바", 50, 2, measure)).toEqual(["가나 다라\n마바"]);
    expect(paginate("가나 다라 마바 사아 자차", 50, 2, measure)).toEqual(["가나 다라\n마바 사아", "자차"]);
    expect(paginate("가나다라마바사아자차", 40, 3, measure)).toEqual(["가나다라\n마바사아\n자차"]);
  });
});

describe("원격 접속(AGP-63)", () => {
  const remote = (over: Partial<AgentOfficePersona> = {}) =>
    persona({
      presence: "EXTERNAL",
      lastActivity: { id: "1", tool: "search_issues", status: "OK", summary: null, createdAt: ago(2), origin: "EXTERNAL", runId: null },
      ...over,
    });

  it("'지금 뭐 해?' — 원격 분기 + 최신 감사 꼬리, 활동 조회 전이면 사무실 스냅샷의 최근 활동으로", () => {
    const p = remote();
    const activity: AgentPersonaActivity = {
      personaId: "104",
      runs: [],
      todayAudits: [{ id: "9", tool: "get_issue", status: "OK", summary: "ALM-6", createdAt: ago(1), origin: "EXTERNAL", runId: null }],
      todayCostUsd: 0,
    };
    const a = statusAnswer(p, activity, [], plainNo(p), NOW);
    expect(a.text).toBe("지금 밖에서 원격으로 작업 중이에요 — 외부 MCP로 연결돼 있어요. 방금 전엔 이슈 조회를 했어요.");
    expect(a).toMatchObject({ mood: "NORMAL", context: null });
    expect(statusAnswer(p, null, [], plainNo(p), NOW).text).toBe(
      "지금 밖에서 원격으로 작업 중이에요 — 외부 MCP로 연결돼 있어요. 방금 전엔 이슈 검색을 했어요.",
    );
    // 유휴는 스냅샷 최근 활동으로 꼬리를 달지 않는다(기존 규칙 유지)
    const idle = persona({ lastActivity: p.lastActivity });
    expect(statusAnswer(idle, null, [], plainNo(idle), NOW).text).toBe("지금은 쉬는 중이에요.");
  });

  it("run이 있으면 run 대사가 이긴다", () => {
    const p = remote({ currentRun: run() });
    expect(statusAnswer(p, null, [], plainNo(p), NOW).text).toMatch(/^지금은 ALM-5 작업 중이에요\./);
  });

  it("디렉터 — 원격 접속은 산책 후보·유휴·작업 이펙트 대상이 아니다", () => {
    const snap = ambienceSnapshot({
      personas: [remote({ id: "1", slug: "bot-1" }), persona({ id: "2", slug: "bot-2" })],
      seats: new Map(),
      activeMeeting: null,
      meetingPaused: false,
      excludeStrollIds: [],
      talkTargetId: null,
      killSwitch: false,
    });
    expect(snap.idleIds).toEqual(["2"]);
    expect(snap.strollCandidates.map((c) => c.id)).toEqual(["2"]);
    expect(snap.effectTargets).toEqual([]);
  });
});

describe("디렉터 스냅샷 — 말 걸기 대상 제외(§7.2)", () => {
  const idle = (id: string): AgentOfficePersona => persona({ id, slug: `bot-${id}` });
  const seatsOf = (entries: [string, MeetingSeat][]) => new Map(entries);

  it("대상은 산책 후보·유휴(진행 중 산책 취소)·작업 이펙트·미니 말풍선에서 빠진다", () => {
    const personas = [idle("1"), idle("2"), persona({ id: "3", currentRun: run() }), persona({ id: "4", currentRun: run() })];
    const meeting = { runId: "9", type: "MEETING" as const, status: "RUNNING" as const, issueKey: "ALM-1", projectId: "p1", hostPersonaId: "4", attendeePersonaIds: ["4"], startedAt: null };
    const base = { personas, seats: seatsOf([["4", { side: "far", x: 402, y: 84, host: true }]]), activeMeeting: meeting, meetingPaused: false, excludeStrollIds: [], killSwitch: false };
    const before = ambienceSnapshot({ ...base, talkTargetId: null });
    expect(before.idleIds).toEqual(["1", "2"]);
    expect(before.effectTargets.map((e) => e.id)).toEqual(["3"]);
    expect(before.meeting?.seatedIds).toEqual(["4"]);

    expect(ambienceSnapshot({ ...base, talkTargetId: "1" }).idleIds).toEqual(["2"]);
    expect(ambienceSnapshot({ ...base, talkTargetId: "1" }).strollCandidates.map((c) => c.id)).toEqual(["2"]);
    expect(ambienceSnapshot({ ...base, talkTargetId: "3" }).effectTargets).toEqual([]);
    expect(ambienceSnapshot({ ...base, talkTargetId: "4" }).meeting).toBeNull();
  });
});
