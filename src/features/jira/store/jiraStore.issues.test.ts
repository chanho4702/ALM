import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  completeSprint,
  createIssue,
  createSprint,
  deleteComment,
  deleteIssue,
  getIssueByKey,
  listActivity,
  listComments,
  listIssues,
  listSprints,
  moveIssue,
  startSprint,
  updateComment,
  updateIssue,
} from "./jiraStore";

const PROJECT = "p1"; // 시드 프로젝트
const SPRINT = "s1"; // 시드 활성 스프린트

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("이슈 키 시퀀스", () => {
  it("프로젝트별 시퀀스로 발급하고 삭제 후에도 번호를 재사용하지 않는다", async () => {
    const nine = await createIssue({ projectId: PROJECT, title: "아홉 번째" });
    expect(nine.key).toBe("ALM-9");
    await deleteIssue(nine.id);
    const ten = await createIssue({ projectId: PROJECT, title: "열 번째" });
    expect(ten.key).toBe("ALM-10");
  });
});

describe("createIssue / getIssueByKey / listIssues", () => {
  it("createIssue는 기본값(todo/medium/백로그/현재 유저)과 created 활동을 기록한다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "새 이슈" });
    expect(issue).toMatchObject({
      key: "ALM-9",
      status: "todo",
      priority: "medium",
      assigneeId: null,
      sprintId: null,
      reporterId: "u1",
      description: "",
    });
    const acts = await listActivity(issue.id);
    expect(acts).toEqual([
      expect.objectContaining({ type: "created", actorId: "u1", detail: "이슈 생성" }),
    ]);
  });

  it("없는 프로젝트/빈 제목은 거부한다", async () => {
    await expect(createIssue({ projectId: "없음", title: "x" })).rejects.toThrow(
      "프로젝트를 찾을 수 없습니다",
    );
    await expect(createIssue({ projectId: PROJECT, title: "  " })).rejects.toThrow(
      "이슈 제목을 입력하세요",
    );
  });

  it("getIssueByKey는 키로 찾고 없으면 null을 반환한다", async () => {
    const issue = await getIssueByKey("ALM-1");
    expect(issue?.title).toBe("프로젝트 스캐폴드 구성");
    await expect(getIssueByKey("ALM-999")).resolves.toBeNull();
  });

  it("listIssues는 텍스트(제목·키)·상태·우선순위·담당자 필터를 지원한다", async () => {
    const byText = await listIssues(PROJECT, { text: "칸반" });
    expect(byText.map((i) => i.key)).toEqual(["ALM-2"]);
    const byKeyText = await listIssues(PROJECT, { text: "alm-7" });
    expect(byKeyText.map((i) => i.key)).toEqual(["ALM-7"]);
    const byStatus = await listIssues(PROJECT, { status: "inprogress" });
    expect(byStatus.map((i) => i.key).sort()).toEqual(["ALM-2", "ALM-3"]);
    const byPriority = await listIssues(PROJECT, { priority: "high" });
    expect(byPriority).toHaveLength(2);
    const byAssignee = await listIssues(PROJECT, { assigneeId: "u1" });
    expect(byAssignee.map((i) => i.key).sort()).toEqual(["ALM-1", "ALM-3"]);
  });
});

describe("moveIssue", () => {
  it("beforeId 앞에 끼워 넣고 대상 컬럼 order를 1부터 재계산한다", async () => {
    // 시드 s1 todo 컬럼: ALM-4(1), ALM-5(2)
    const two = await getIssueByKey("ALM-2"); // inprogress → todo로 이동
    const four = await getIssueByKey("ALM-4");
    await moveIssue(two!.id, { status: "todo", beforeId: four!.id });
    const todos = (await listIssues(PROJECT, { status: "todo" })).filter(
      (i) => i.sprintId === SPRINT,
    );
    expect(todos.map((i) => [i.key, i.order])).toEqual([
      ["ALM-2", 1],
      ["ALM-4", 2],
      ["ALM-5", 3],
    ]);
    // 상태 변경은 활동로그로 자동 기록된다
    const acts = await listActivity(two!.id);
    expect(acts.at(-1)).toMatchObject({ type: "status", detail: "진행 중 → 할 일" });
  });

  it("beforeId가 없으면 컬럼 맨 뒤로 이동한다", async () => {
    const four = await getIssueByKey("ALM-4");
    await moveIssue(four!.id, { status: "inprogress" });
    const col = (await listIssues(PROJECT, { status: "inprogress" })).filter(
      (i) => i.sprintId === SPRINT,
    );
    expect(col.map((i) => [i.key, i.order])).toEqual([
      ["ALM-2", 1],
      ["ALM-3", 2],
      ["ALM-4", 3],
    ]);
  });
});

describe("sprints", () => {
  it("createSprint는 'Sprint N'으로 자동 명명하고 planned로 만든다", async () => {
    const sprint = await createSprint(PROJECT);
    expect(sprint).toMatchObject({ name: "Sprint 2", state: "planned", projectId: PROJECT });
    expect(await listSprints(PROJECT)).toHaveLength(2);
  });

  it("활성 스프린트가 이미 있으면 startSprint를 거부한다", async () => {
    const sprint = await createSprint(PROJECT);
    await expect(startSprint(sprint.id)).rejects.toThrow("이미 진행 중인 스프린트가 있습니다");
  });

  it("활성 스프린트가 없으면 planned 스프린트를 시작할 수 있다", async () => {
    await completeSprint(SPRINT);
    const sprint = await createSprint(PROJECT);
    const started = await startSprint(sprint.id);
    expect(started.state).toBe("active");
    expect(started.startedAt).toBeDefined();
  });

  it("completeSprint는 미완료 이슈를 백로그로 옮기고 done 이슈는 스프린트에 남긴다", async () => {
    const done = await completeSprint(SPRINT);
    expect(done.state).toBe("done");
    expect(done.completedAt).toBeDefined();
    const first = await getIssueByKey("ALM-1"); // done → 유지
    expect(first!.sprintId).toBe(SPRINT);
    for (const key of ["ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      const issue = await getIssueByKey(key);
      expect(issue!.sprintId).toBeNull();
    }
  });
});

describe("updateIssue 활동로그", () => {
  it("상태/담당자/우선순위/스프린트 변경을 자동 기록한다", async () => {
    const issue = await getIssueByKey("ALM-4"); // todo / u3 / medium / s1
    await updateIssue(issue!.id, {
      status: "inprogress",
      assigneeId: "u1",
      priority: "high",
      sprintId: null,
    });
    const acts = await listActivity(issue!.id);
    const byType = Object.fromEntries(acts.map((a) => [a.type, a.detail]));
    expect(byType.status).toBe("할 일 → 진행 중");
    expect(byType.assignee).toBe("박준영 → 김찬호");
    expect(byType.priority).toBe("보통 → 높음");
    expect(byType.sprint).toBe("Sprint 1 → 백로그");
  });

  it("제목/설명만 바꾸면 활동로그를 남기지 않는다", async () => {
    const issue = await getIssueByKey("ALM-4");
    const before = (await listActivity(issue!.id)).length;
    const updated = await updateIssue(issue!.id, { title: "수정된 제목", description: "상세" });
    expect(updated.title).toBe("수정된 제목");
    expect(await listActivity(issue!.id)).toHaveLength(before);
  });

  it("없는 이슈는 거부한다", async () => {
    await expect(updateIssue("없음", { title: "x" })).rejects.toThrow("이슈를 찾을 수 없습니다");
  });
});

describe("updateIssue order 재계산 (W3)", () => {
  it("sprintId 변경 시 대상 그룹(프로젝트+스프린트+상태) 맨 뒤 order를 부여한다", async () => {
    const six = await getIssueByKey("ALM-6"); // 백로그 todo, order 1
    const moved = await updateIssue(six!.id, { sprintId: "s1" });
    // s1 todo 그룹: ALM-4(1), ALM-5(2) → 맨 뒤 3
    expect(moved.order).toBe(3);
  });

  it("status 변경 시 대상 그룹 맨 뒤 order를 부여한다", async () => {
    const four = await getIssueByKey("ALM-4"); // s1 todo, order 1
    const moved = await updateIssue(four!.id, { status: "done" });
    // s1 done 그룹: ALM-1(1) → 맨 뒤 2
    expect(moved.order).toBe(2);
  });

  it("제목/설명만 바꾸면 order를 유지한다", async () => {
    const four = await getIssueByKey("ALM-4");
    const updated = await updateIssue(four!.id, { title: "제목만 수정" });
    expect(updated.order).toBe(four!.order);
  });
});

describe("comments / deleteIssue", () => {
  it("addComment는 현재 유저 명의로 추가하고 listComments는 시간순으로 반환한다", async () => {
    const one = await getIssueByKey("ALM-1");
    const comment = await addComment(one!.id, "확인했습니다");
    expect(comment).toMatchObject({ issueId: one!.id, authorId: "u1", body: "확인했습니다" });
    const comments = await listComments(one!.id);
    expect(comments.at(-1)!.id).toBe(comment.id);
  });

  it("빈 코멘트/없는 이슈는 거부한다", async () => {
    const one = await getIssueByKey("ALM-1");
    await expect(addComment(one!.id, "   ")).rejects.toThrow("코멘트 내용을 입력하세요");
    await expect(addComment("없음", "본문")).rejects.toThrow("이슈를 찾을 수 없습니다");
  });

  it("deleteIssue는 코멘트·활동로그를 연쇄 삭제한다", async () => {
    const two = await getIssueByKey("ALM-2"); // 시드 코멘트 2개 보유
    expect(await listComments(two!.id)).toHaveLength(2);
    await deleteIssue(two!.id);
    await expect(getIssueByKey("ALM-2")).resolves.toBeNull();
    expect(await listComments(two!.id)).toHaveLength(0);
    expect(await listActivity(two!.id)).toHaveLength(0);
  });
});

describe("dueDate / labels (요구사항 갭)", () => {
  it("createIssue는 dueDate와 labels를 저장한다 (기본값 null/[])", async () => {
    const plain = await createIssue({ projectId: PROJECT, title: "기본값" });
    expect(plain.dueDate).toBeNull();
    expect(plain.labels).toEqual([]);
    const rich = await createIssue({
      projectId: PROJECT,
      title: "옵션",
      dueDate: "2026-08-01",
      labels: ["backend", "api"],
    });
    expect(rich.dueDate).toBe("2026-08-01");
    expect(rich.labels).toEqual(["backend", "api"]);
  });

  it("updateIssue로 dueDate/labels를 바꾸면 활동로그에 남는다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "변경 대상" });
    await updateIssue(issue.id, { dueDate: "2026-08-15", labels: ["design"] });
    const acts = await listActivity(issue.id);
    expect(acts).toContainEqual(
      expect.objectContaining({ type: "duedate", detail: "미지정 → 2026-08-15" }),
    );
    expect(acts).toContainEqual(expect.objectContaining({ type: "labels", detail: "design" }));
  });

  it("listIssues는 label 필터를 지원한다", async () => {
    await createIssue({ projectId: PROJECT, title: "백엔드 작업", labels: ["backend"] });
    const hits = await listIssues(PROJECT, { label: "backend" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((i) => i.labels.includes("backend"))).toBe(true);
  });
});

describe("설명 검색", () => {
  it("text 필터가 제목뿐 아니라 설명도 검색한다", async () => {
    await createIssue({
      projectId: PROJECT,
      title: "제목에는 없음",
      description: "결제 모듈 리팩터링",
    });
    const hits = await listIssues(PROJECT, { text: "결제 모듈" });
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("제목에는 없음");
  });
});

describe("updateComment / deleteComment", () => {
  it("본인 댓글을 수정하면 body와 updatedAt이 갱신된다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "댓글 이슈" });
    const comment = await addComment(issue.id, "원본");
    const updated = await updateComment(comment.id, "수정본");
    expect(updated.body).toBe("수정본");
    expect(updated.updatedAt).toBeDefined();
  });

  it("본인 댓글을 삭제할 수 있다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "댓글 이슈" });
    const comment = await addComment(issue.id, "삭제될 댓글");
    await deleteComment(comment.id);
    expect(await listComments(issue.id)).toHaveLength(0);
  });

  it("타인 댓글은 수정/삭제할 수 없다 (시드 c2는 u2 작성)", async () => {
    await expect(updateComment("c2", "해킹")).rejects.toThrow("본인 댓글만 수정할 수 있습니다");
    await expect(deleteComment("c2")).rejects.toThrow("본인 댓글만 삭제할 수 있습니다");
  });

  it("빈 본문 수정과 없는 댓글은 거부한다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "댓글 이슈" });
    const comment = await addComment(issue.id, "원본");
    await expect(updateComment(comment.id, "  ")).rejects.toThrow("코멘트 내용을 입력하세요");
    await expect(updateComment("nope", "x")).rejects.toThrow("코멘트를 찾을 수 없습니다");
    await expect(deleteComment("nope")).rejects.toThrow("코멘트를 찾을 수 없습니다");
  });
});
