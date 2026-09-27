import { describe, expect, it } from "vitest";
import type { AgentOffice, AgentOfficePersona, AgentRunSummary } from "../store/types";
import {
  bubbleText,
  isRedactedSummary,
  finishedRuns,
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
