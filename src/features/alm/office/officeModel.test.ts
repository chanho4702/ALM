import { describe, expect, it } from "vitest";
import type { AgentActiveMeeting, AgentOffice, AgentOfficePersona, AgentRunSummary, Issue } from "../store/types";
import {
  bubbleText,
  coffeeCopy,
  epicGoals,
  isRedactedSummary,
  finishedRuns,
  meetingRoomAccessibleName,
  meetingSeats,
  meetingSignText,
  pickWeighted,
  progressCells,
  officeSummaryText,
  personaAccessibleName,
  personaState,
  sortPersonas,
  subjectJosa,
  todayReportCount,
  transitionAnnouncements,
} from "./officeModel";

function persona(over: Partial<AgentOfficePersona> = {}): AgentOfficePersona {
  return {
    id: "1",
    slug: "bot",
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

const run = (status: "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "BLOCKED", over = {}) => ({
  id: "9",
  status,
  issueKey: "ALM-123",
  type: "TASK" as const,
  trigger: "SCHEDULER" as const,
  attempt: 1,
  model: null,
  startedAt: null,
  ...over,
});

const activity = (summary: string | null, tool = "update_issue") => ({
  id: "a",
  tool,
  status: "OK" as const,
  summary,
  createdAt: "2026-09-26T00:00:00Z",
});

function summary(over: Partial<AgentRunSummary>): AgentRunSummary {
  return {
    id: "1",
    issueKey: "ALM-1",
    status: "DONE",
    personaId: "1",
    attempt: 1,
    model: null,
    startedAt: "2026-09-26T00:00:00Z",
    endedAt: "2026-09-26T01:00:00Z",
    type: "TASK",
    trigger: "SCHEDULER",
    parentRunId: null,
    ...over,
  };
}

describe("상태 파생(스펙 §4.1)", () => {
  it("비활성 > 활성 run 상태 > 유휴", () => {
    expect(personaState(persona())).toBe("IDLE");
    expect(personaState(persona({ currentRun: run("BLOCKED") }))).toBe("BLOCKED");
    expect(personaState(persona({ active: false, currentRun: run("RUNNING") }))).toBe("INACTIVE");
  });

  it("말풍선 — 상태별 1행, 최근 활동은 작업 중·승인 대기에만 2행", () => {
    const act = activity("설명 보완");
    expect(bubbleText(persona({ currentRun: run("RUNNING"), lastActivity: act }))).toEqual({
      line1: "ALM-123",
      prefix: null,
      issueKey: "ALM-123",
      line2: "설명 보완",
    });
    expect(bubbleText(persona({ currentRun: run("RUNNING", { type: "REVIEW" }) }))?.line1).toBe("리뷰 · ALM-123");
    // 안건 이슈 없는 회의 — 합성 키 대신 회의 라벨(상태 접두는 유지), 이슈키 칸은 비운다
    expect(bubbleText(persona({ currentRun: run("RUNNING", { type: "MEETING", issueKey: "PROJECT-1" }) }))).toEqual({
      line1: "착수/계획 회의",
      prefix: null,
      issueKey: null,
      line2: null,
    });
    expect(bubbleText(persona({ currentRun: run("QUEUED", { type: "RETRO", issueKey: "PROJECT-1" }) }))?.line1).toBe(
      "대기열 · 회고 회의",
    );
    expect(bubbleText(persona({ currentRun: run("QUEUED"), lastActivity: act }))).toEqual({
      line1: "대기열 · ALM-123",
      prefix: "대기열",
      issueKey: "ALM-123",
      line2: null,
    });
    expect(bubbleText(persona({ currentRun: run("WAITING_APPROVAL"), lastActivity: act }))?.line2).toBe("설명 보완");
    expect(bubbleText(persona({ currentRun: run("BLOCKED"), lastActivity: act }))).toEqual({
      line1: "차단됨 · ALM-123",
      prefix: "차단됨",
      issueKey: "ALM-123",
      line2: null,
    });
    expect(bubbleText(persona())).toBeNull();
    expect(bubbleText(persona({ active: false, currentRun: run("RUNNING") }))).toBeNull();
  });

  it("이슈키 없는 run은 상태 문구만, 5분 컷(lastActivity null)이면 2행 생략", () => {
    expect(bubbleText(persona({ currentRun: run("RUNNING", { issueKey: null }) }))).toEqual({
      line1: "작업 중",
      prefix: "작업 중",
      issueKey: null,
      line2: null,
    });
    expect(bubbleText(persona({ currentRun: run("RUNNING", { issueKey: null, type: "REVIEW" }) }))?.line1).toBe("리뷰 중");
    expect(bubbleText(persona({ currentRun: run("QUEUED", { issueKey: null }) }))?.line1).toBe("대기열");
  });

  it("요약이 없으면 도구명을 쓴다", () => {
    expect(bubbleText(persona({ currentRun: run("RUNNING"), lastActivity: activity(null) }))?.line2).toBe(
      "update_issue",
    );
  });

  it("2행은 원문 그대로 — 말줄임은 CSS 한 번만(데이터에 … 를 붙이지 않는다)", () => {
    const long = "가나다라마바사아자차카타파하";
    expect(bubbleText(persona({ currentRun: run("RUNNING"), lastActivity: activity(long) }))?.line2).toBe(long);
  });

  it("서버 가림 표지(…생략))는 말풍선에서 도구 한글 라벨로, 접근 이름은 원문 유지", () => {
    const cases: [string, string, string][] = [
      ["report_progress", "run=12 (본문 생략)", "진행 보고"],
      ["add_comment", "ALM-123 (본문 생략)", "코멘트 작성"],
      ["create_issue", "projectId=3 (제목 생략)", "이슈 생성"],
      ["create_page", "spaceId=2 (제목 생략)", "문서 작성"],
      ["update_page", "pageId=41 (제목 생략)", "문서 수정"],
      ["search_issues", "projectId=3 (검색어 생략)", "이슈 검색"],
      ["find_pages", "spaceId=2 (검색어 생략)", "문서 검색"],
      ["link_pr", "ALM-123 (링크 생략)", "PR 연결"],
      ["some_new_tool", "x=1 (본문 생략)", "some_new_tool"],
    ];
    for (const [tool, text, label] of cases) {
      const p = persona({ currentRun: run("RUNNING"), lastActivity: activity(text, tool) });
      expect(bubbleText(p)?.line2).toBe(label);
      expect(personaAccessibleName(p)).toContain(`최근 활동: ${text}`);
    }
    // 가리지 않은 요약·괄호가 있지만 표지가 아닌 요약은 그대로
    expect(isRedactedSummary("ALM-4 인수 조건 보완")).toBe(false);
    expect(isRedactedSummary("ALM-4 상태 변경 (진행 중)")).toBe(false);
    expect(isRedactedSummary("run=12 (본문 생략)")).toBe(true);
  });

  it("접근 이름은 이름·롤·상태·이슈·요약 원문을 담는다", () => {
    const p = persona({ currentRun: run("RUNNING"), lastActivity: activity("가나다라마바사아자차카타파하") });
    expect(personaAccessibleName(p)).toBe(
      "백엔드봇, 백엔드, 작업 중, 이슈 ALM-123, 최근 활동: 가나다라마바사아자차카타파하 — 개인 오피스 열기",
    );
    expect(personaAccessibleName(persona())).toBe("백엔드봇, 백엔드, 휴식 중 — 개인 오피스 열기");
  });

  it("매니저 보고 run — 롤 라벨 '매니저', 말풍선·접근 이름은 '매니저 보고'(뒤에 '회의'를 붙이지 않는다)", () => {
    const p = persona({
      name: "매니저봇",
      role: "MANAGER",
      currentRun: run("RUNNING", { type: "MANAGER", issueKey: "PROJECT-1" }),
    });
    expect(bubbleText(p)?.line1).toBe("매니저 보고");
    expect(personaAccessibleName(p)).toBe("매니저봇, 매니저, 작업 중, 매니저 보고 프로젝트 전반 — 개인 오피스 열기");
    const retro = persona({ currentRun: run("RUNNING", { type: "RETRO", issueKey: "PROJECT-1" }) });
    expect(bubbleText(retro)?.line1).toBe("회고 회의");
  });
});

describe("정렬(스펙 §1.5)", () => {
  it("롤 순서, 같은 롤은 id 숫자 오름차순", () => {
    const sorted = sortPersonas([
      persona({ id: "10", role: "REVIEWER" }),
      persona({ id: "9", role: "BACKEND" }),
      persona({ id: "3", role: "PLANNER" }),
      persona({ id: "11", role: "BACKEND" }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["3", "9", "11", "10"]);
  });

  it("매니저는 맨 끝 — 기존 6롤 자리를 밀지 않는다", () => {
    const sorted = sortPersonas([
      persona({ id: "1", role: "MANAGER" }),
      persona({ id: "10", role: "REVIEWER" }),
      persona({ id: "3", role: "PLANNER" }),
    ]);
    expect(sorted.map((p) => p.role)).toEqual(["PLANNER", "REVIEWER", "MANAGER"]);
  });
});

describe("종결 run — BLOCKED 중복 방지", () => {
  it("currentRun과 recentRuns 양쪽에 오는 BLOCKED run(endedAt null)은 게시판에서 뺀다", () => {
    const rows = finishedRuns([
      summary({ id: "4", status: "BLOCKED", endedAt: null }),
      summary({ id: "5", status: "DONE" }),
      summary({ id: "5", status: "DONE" }),
      summary({ id: "6", status: "FAILED" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["5", "6"]);
  });

  it("오늘 종결된 것만 배지로 센다", () => {
    const now = Date.parse("2026-09-26T12:00:00");
    expect(
      todayReportCount(
        [
          summary({ id: "1", endedAt: new Date(now - 3600_000).toISOString() }),
          summary({ id: "2", endedAt: new Date(now - 3 * 24 * 3600_000).toISOString() }),
        ],
        now,
      ),
    ).toBe(1);
  });
});

describe("요약·라이브 알림", () => {
  it("시각 숨김 요약은 0인 상태를 뺀다", () => {
    expect(
      officeSummaryText([persona({ currentRun: run("RUNNING") }), persona({ id: "2" }), persona({ id: "3" })]),
    ).toBe("AI 팀원 3명 — 작업 중 1, 휴식 중 2");
  });

  it("새로 승인 대기·차단이 된 경우만 알린다(첫 로드는 알리지 않음)", () => {
    const office = (personas: AgentOfficePersona[]): AgentOffice => ({
      personas,
      recentRuns: [],
      pendingGateCount: 0,
      pendingGates: [],
      budget: { monthlyCapUsd: null, platformMonthToDateUsd: 0, killSwitch: false },
      generatedAt: "",
      boardPosts: [],
      activeMeeting: null,
    });
    const before = office([persona({ id: "1", currentRun: run("RUNNING") }), persona({ id: "2", name: "운영봇" })]);
    const after = office([
      persona({ id: "1", currentRun: run("WAITING_APPROVAL") }),
      persona({ id: "2", name: "운영봇", currentRun: run("BLOCKED", { issueKey: "ALM-98" }) }),
    ]);
    expect(transitionAnnouncements(null, after)).toEqual([]);
    expect(transitionAnnouncements(before, after)).toEqual([
      "백엔드봇이 승인을 기다립니다 (ALM-123)",
      "운영봇이 차단됐습니다 (ALM-98)",
    ]);
    expect(transitionAnnouncements(after, after)).toEqual([]);
  });

  it("주격 조사", () => {
    expect(subjectJosa("백엔드봇")).toBe("이");
    expect(subjectJosa("리뷰어")).toBe("가");
    expect(subjectJosa("bot")).toBe("가");
  });
});

// ── P3e ─────────────────────────────────────────────────────────

function meeting(over: Partial<AgentActiveMeeting> = {}): AgentActiveMeeting {
  return {
    runId: "700",
    type: "MEETING",
    status: "RUNNING",
    issueKey: "ALM-4",
    projectId: "1",
    hostPersonaId: "7",
    attendeePersonaIds: ["7", "1", "2", "3"],
    startedAt: "2026-09-27T03:00:00Z",
    ...over,
  };
}

/** 정렬된 팀 — 1 기획 · 2 디자인 · 3 프론트 · … 7 매니저 */
const team = (n: number) =>
  Array.from({ length: n }, (_, i) => persona({ id: String(i + 1), slug: `bot-${i + 1}`, name: `봇${i + 1}` }));

describe("회의실 좌석(P3e §2.2·§2.3)", () => {
  it("진행자가 상석(먼 쪽 가운데), 나머지는 정렬 순으로 먼 1 → 먼 3 → 가까운 1", () => {
    const seats = meetingSeats(meeting(), team(7));
    expect(seats.get("7")).toEqual({ side: "far", x: 402, y: 84, host: true });
    expect(seats.get("1")).toEqual({ side: "far", x: 382, y: 84, host: false });
    expect(seats.get("2")).toEqual({ side: "far", x: 422, y: 84, host: false });
    expect(seats.get("3")).toEqual({ side: "near", x: 402, y: 112, host: false });
    expect(seats.has("4")).toBe(false);
  });

  it("회의가 아닌 자기 run이 승인 대기·차단이면 책상에 남는다 — 회의 run 자체의 상태는 해당 없음", () => {
    const people = team(4).map((p) =>
      p.id === "2"
        ? { ...p, currentRun: run("WAITING_APPROVAL") }
        : p.id === "3"
          ? { ...p, currentRun: run("BLOCKED") }
          : p.id === "1"
            ? { ...p, currentRun: run("WAITING_APPROVAL", { id: "700", type: "MEETING" }) }
            : p,
    );
    const seats = meetingSeats(meeting({ hostPersonaId: "1", attendeePersonaIds: ["1", "2", "3", "4"] }), people);
    expect([...seats.keys()]).toEqual(["1", "4"]);
  });

  it("비활성·명단 밖 id는 좌석이 없고, 진행자가 못 앉으면 금테 상석은 비워 둔다", () => {
    const people = team(3).map((p) => (p.id === "1" ? { ...p, active: false } : p));
    const seats = meetingSeats(meeting({ hostPersonaId: "1", attendeePersonaIds: ["1", "2", "3", "99"] }), people);
    expect(seats.has("1")).toBe(false);
    expect(seats.get("2")).toMatchObject({ side: "far", x: 382, host: false });
    expect(seats.get("3")).toMatchObject({ side: "far", x: 422 });
  });

  it("8석이 차면 9번째부터 입석(테이블 아래 5열)", () => {
    const people = team(11);
    const seats = meetingSeats(
      meeting({ hostPersonaId: "1", attendeePersonaIds: people.map((p) => p.id) }),
      people,
    );
    expect([...seats.values()].filter((s) => s.side !== "stand")).toHaveLength(8);
    expect(seats.get("9")).toEqual({ side: "stand", x: 362, y: 140, host: false });
    expect(seats.get("11")).toEqual({ side: "stand", x: 402, y: 140, host: false });
  });

  it("회의가 없으면 좌석도 없다", () => {
    expect(meetingSeats(null, team(3)).size).toBe(0);
  });
});

describe("회의실 문구(P3e §2.4·§2.7)", () => {
  const now = Date.parse("2026-09-27T03:12:30Z");

  it("표찰 — 회의 중 '{이름} · n분째', 1분 미만 '방금', 없으면 '회의실'", () => {
    expect(meetingSignText(meeting(), now)).toBe("착수/계획 회의 · 12분째");
    expect(meetingSignText(meeting({ startedAt: "2026-09-27T03:12:00Z" }), now)).toBe("착수/계획 회의 · 방금");
    expect(meetingSignText(meeting({ type: "MANAGER" }), now)).toBe("매니저 보고 · 12분째");
    expect(meetingSignText(null, now)).toBe("회의실");
  });

  it("회의실 버튼 접근 이름 — 안건 합성 키는 '프로젝트 전반'", () => {
    expect(meetingRoomAccessibleName(meeting(), now)).toBe(
      "회의실 — 착수/계획 회의 진행 중, 안건 ALM-4, 참석 4명, 12분째",
    );
    expect(meetingRoomAccessibleName(meeting({ type: "RETRO", issueKey: "PROJECT-1" }), now)).toBe(
      "회의실 — 회고 회의 진행 중, 안건 프로젝트 전반, 참석 4명, 12분째",
    );
    expect(meetingRoomAccessibleName(null, now)).toBe("회의실 — 진행 중인 회의 없음");
  });

  it("좌석 버튼 접근 이름 끝에 '회의 중 — {회의 이름}', 캔버스 요약 끝에 '회의 중 n'", () => {
    expect(personaAccessibleName(persona(), "착수/계획 회의")).toBe(
      "백엔드봇, 백엔드, 휴식 중, 회의 중 — 착수/계획 회의 — 개인 오피스 열기",
    );
    expect(officeSummaryText([persona(), persona({ id: "2" })], 2)).toBe("AI 팀원 2명 — 휴식 중 2, 회의 중 2");
  });

  it("회의 시작·종료를 한 번씩 알린다(받침 판정 조사)", () => {
    const office = (activeMeeting: AgentActiveMeeting | null): AgentOffice => ({
      personas: [],
      recentRuns: [],
      pendingGateCount: 0,
      pendingGates: [],
      budget: { monthlyCapUsd: null, platformMonthToDateUsd: 0, killSwitch: false },
      generatedAt: "",
      boardPosts: [],
      activeMeeting,
    });
    expect(transitionAnnouncements(office(null), office(meeting()))).toEqual([
      "착수/계획 회의가 시작됐습니다 — 참석 4명",
    ]);
    expect(transitionAnnouncements(office(meeting()), office(meeting()))).toEqual([]);
    expect(transitionAnnouncements(office(meeting({ type: "RETRO" })), office(null))).toEqual(["회고 회의가 끝났습니다"]);
  });
});

describe("가중치 뽑기·커피 카피", () => {
  it("rng 구간에 따라 가중치대로 고른다", () => {
    const items = [
      { value: "a", weight: 1 },
      { value: "b", weight: 3 },
    ];
    expect(pickWeighted(items, () => 0)).toBe("a");
    expect(pickWeighted(items, () => 0.24)).toBe("a");
    expect(pickWeighted(items, () => 0.26)).toBe("b");
    expect(pickWeighted([], () => 0.5)).toBeNull();
  });

  it("킬 스위치 > 이달 상한 90% > 오늘 비용 구간", () => {
    const budget = { monthlyCapUsd: 50, platformMonthToDateUsd: 10, killSwitch: false };
    expect(coffeeCopy(0, budget)).toBe("아직 한 잔도 안 마셨어요");
    expect(coffeeCopy(0.5, budget)).toBe("가볍게 한 잔");
    expect(coffeeCopy(2.73, budget)).toBe("적당히 마시는 중");
    expect(coffeeCopy(5, budget)).toBe("오늘은 카페인 과다!");
    expect(coffeeCopy(2, { ...budget, platformMonthToDateUsd: 45 })).toBe("이달 원두가 거의 떨어졌어요");
    expect(coffeeCopy(2, { ...budget, killSwitch: true })).toBe("커피 머신 전원이 꺼져 있어요 (킬 스위치)");
  });
});

describe("게시판 목표(P3e §3)", () => {
  const issue = (over: Partial<Issue>): Issue =>
    ({ id: over.key, projectId: "p1", title: over.key, type: "task", status: "todo", parentId: null, ...over }) as Issue;

  it("에픽별 모든 자손 기준 n/m, 지금 붙은 AI 수, 진행 중 → 할 일 → 완료 정렬", () => {
    const issues = [
      issue({ key: "ALM-10", type: "epic", status: "todo" }),
      issue({ key: "ALM-11", type: "epic", status: "inprogress" }),
      issue({ key: "ALM-12", type: "epic", status: "done" }),
      issue({ key: "ALM-20", parentId: "ALM-11", status: "done" }),
      issue({ key: "ALM-21", parentId: "ALM-11", status: "inprogress" }),
      issue({ key: "ALM-22", parentId: "ALM-21", type: "subtask", status: "done" }),
      issue({ key: "ALM-30", parentId: "ALM-12", status: "done" }),
    ];
    const workers = [
      persona({ id: "1", currentRun: run("RUNNING", { issueKey: "ALM-22" }) }),
      persona({ id: "2", currentRun: run("RUNNING", { issueKey: "ALM-11" }) }),
      persona({ id: "3", active: false, currentRun: run("RUNNING", { issueKey: "ALM-20" }) }),
    ];
    const goals = epicGoals(issues, undefined, undefined, workers);
    expect(goals.map((g) => g.issue.key)).toEqual(["ALM-11", "ALM-10", "ALM-12"]);
    expect(goals[0]).toMatchObject({ kind: "active", done: 2, total: 3 });
    expect(goals[0].workers.map((p) => p.id)).toEqual(["1", "2"]);
    expect(goals[1]).toMatchObject({ kind: "new", done: 0, total: 0 });
    expect(goals[2]).toMatchObject({ kind: "complete", done: 1, total: 1 });
  });

  it("에픽 타입이 없으면 하위가 있는 최상위 이슈가 목표 — 순환 부모에도 멈춘다", () => {
    const issues = [
      issue({ key: "ALM-1", status: "todo" }),
      issue({ key: "ALM-2", parentId: "ALM-1", status: "done" }),
      issue({ key: "ALM-3", parentId: "ALM-4" }),
      issue({ key: "ALM-4", parentId: "ALM-3" }),
      issue({ key: "ALM-5" }),
    ];
    const goals = epicGoals(issues, [], undefined, []);
    expect(goals.map((g) => [g.issue.key, g.done, g.total])).toEqual([["ALM-1", 1, 1]]);
  });

  it("도트 진행바 — 10칸, 시작했으면 최소 1칸·덜 끝났으면 최대 9칸", () => {
    expect(progressCells(0, 4)).toBe(0);
    expect(progressCells(7, 12)).toBe(6);
    expect(progressCells(1, 100)).toBe(1);
    expect(progressCells(99, 100)).toBe(9);
    expect(progressCells(5, 5)).toBe(10);
    expect(progressCells(0, 0)).toBe(0);
  });
});
