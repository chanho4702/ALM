import { describe, expect, it } from "vitest";
import type { AgentGate, AgentRunSummary } from "../store/types";
import {
  canCancel,
  canResume,
  filterRuns,
  gatesForPersona,
  issueProjectKey,
  personaDisplay,
  runLineage,
  sortRunsNewestFirst,
} from "./runModel";

function run(id: string, extra: Partial<AgentRunSummary> = {}): AgentRunSummary {
  return {
    id,
    issueKey: "ALM-1",
    status: "DONE",
    personaId: "101",
    attempt: 1,
    model: null,
    startedAt: "2026-09-26T01:00:00Z",
    endedAt: null,
    type: "TASK",
    trigger: "SCHEDULER",
    parentRunId: null,
    ...extra,
  };
}

describe("runModel — 액션 노출(서버 CANCELLABLE·RESUMABLE과 같음)", () => {
  it("취소는 QUEUED·RUNNING·WAITING_APPROVAL·BLOCKED·FAILED, 재개는 BLOCKED·FAILED만", () => {
    expect(["QUEUED", "RUNNING", "WAITING_APPROVAL", "BLOCKED", "FAILED"].every((s) => canCancel(s as never))).toBe(true);
    expect(canCancel("DONE")).toBe(false);
    expect(canCancel("CANCELLED")).toBe(false);
    expect(canResume("BLOCKED")).toBe(true);
    expect(canResume("FAILED")).toBe(true);
    expect(canResume("RUNNING")).toBe(false);
    expect(canResume("WAITING_APPROVAL")).toBe(false);
  });
});

describe("runModel — 필터", () => {
  const runs = [
    run("1", { issueKey: "ALM-4", status: "RUNNING" }),
    run("2", { issueKey: "ALM-12", status: "BLOCKED" }),
    run("3", { issueKey: "WEB-2", status: "DONE" }),
    run("4", { issueKey: null, status: "CANCELLED" }),
    run("5", { issueKey: "ALM-7", status: "FAILED" }),
  ];

  it("이슈키 접두어로 프로젝트 키를 뽑는다", () => {
    expect(issueProjectKey("ALM-12")).toBe("ALM");
    expect(issueProjectKey("MY-APP-3")).toBe("MY-APP");
    expect(issueProjectKey("nokey")).toBeNull();
    expect(issueProjectKey(null)).toBeNull();
  });

  it("프로젝트 범위는 접두어가 맞는 run만(이슈 없는 run 제외), 전체면 모두", () => {
    expect(filterRuns(runs, { group: "all", projectKey: "ALM" }).map((r) => r.id)).toEqual(["1", "2", "5"]);
    expect(filterRuns(runs, { group: "all", projectKey: null })).toHaveLength(5);
    // 안건 이슈 없는 회의(합성 키)는 라우트 projectId와 정확히 같을 때만 이 프로젝트 run
    const wide = [
      { ...runs[0], id: "w1", type: "RETRO" as const, issueKey: "PROJECT-3" },
      { ...runs[0], id: "w2", type: "RETRO" as const, issueKey: "PROJECT-4" },
    ];
    expect(filterRuns(wide, { group: "all", projectKey: "ALM", projectId: "3" }).map((r) => r.id)).toEqual(["w1"]);
    expect(filterRuns(wide, { group: "all", projectKey: "ALM" })).toHaveLength(0);
  });

  it("활성 = 끝나지 않은 run(BLOCKED 포함), 종결 = DONE·FAILED·CANCELLED", () => {
    expect(filterRuns(runs, { group: "active", projectKey: null }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterRuns(runs, { group: "finished", projectKey: null }).map((r) => r.id)).toEqual(["3", "4", "5"]);
  });

  it("최신 먼저 — 시작 전(대기열) run이 맨 위, 같으면 id 큰 것", () => {
    const sorted = sortRunsNewestFirst([
      run("10", { startedAt: "2026-09-26T01:00:00Z" }),
      run("11", { startedAt: null }),
      run("12", { startedAt: "2026-09-26T02:00:00Z" }),
      run("13", { startedAt: "2026-09-26T01:00:00Z" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["11", "12", "13", "10"]);
  });
});

describe("runModel — 계보", () => {
  const runs = [
    run("8982", { issueKey: "ALM-5", attempt: 1, status: "FAILED" }),
    run("9004", { issueKey: "ALM-5", attempt: 3, status: "BLOCKED" }),
    run("8983", { issueKey: "ALM-5", attempt: 2, status: "FAILED" }),
    run("8985", { issueKey: "ALM-1" }),
    run("9006", { issueKey: "ALM-1", type: "REVIEW", parentRunId: "8985" }),
  ];

  it("같은 이슈키의 run을 시도 순으로 잇는다", () => {
    const lineage = runLineage(runs, runs[1]);
    expect(lineage.sameIssue.map((r) => r.id)).toEqual(["8982", "8983", "9004"]);
    expect(lineage.parent).toBeNull();
  });

  it("부모(parentRunId)와 파생(자신을 부모로 가리키는 run)", () => {
    expect(runLineage(runs, runs[4]).parent?.id).toBe("8985");
    expect(runLineage(runs, runs[3]).children.map((r) => r.id)).toEqual(["9006"]);
  });

  it("목록에 없는 부모는 null(링크만 남긴다), 이슈 없는 run은 자기 혼자", () => {
    const orphan = run("1", { parentRunId: "777", issueKey: null });
    const lineage = runLineage([orphan], orphan);
    expect(lineage.parent).toBeNull();
    expect(lineage.sameIssue).toEqual([orphan]);
  });
});

describe("runModel — 페르소나·게이트", () => {
  it("이름을 모르면 `페르소나 #id` 폴백", () => {
    const map = new Map([["101", { id: "101", name: "기획봇", emoji: "📝" }]]);
    expect(personaDisplay(map, "101")).toEqual({ name: "기획봇", emoji: "📝" });
    expect(personaDisplay(map, "999")).toEqual({ name: "페르소나 #999", emoji: null });
  });

  it("?persona= 필터는 게이트의 run → personaId로 맞춘다", () => {
    const gates: AgentGate[] = [
      { id: "1", runId: "9003", issueKey: "ALM-3", kind: "MERGE", request: "", decision: null, requestedAt: "" },
      { id: "2", runId: "9001", issueKey: "ALM-4", kind: "PLAN", request: "", decision: null, requestedAt: "" },
      { id: "3", runId: "404", issueKey: null, kind: "PLAN", request: "", decision: null, requestedAt: "" },
    ];
    const runs = [run("9003", { personaId: "103" }), run("9001", { personaId: "101" })];
    expect(gatesForPersona(gates, runs, "103").map((g) => g.id)).toEqual(["1"]);
    expect(gatesForPersona(gates, runs, null)).toHaveLength(3);
  });
});
