import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addIssueLink,
  createIssue,
  deleteIssue,
  getIssueByKey,
  listActivity,
  listChildren,
  listIssueLinks,
  removeIssueLink,
  setIssueParent,
  updateIssue,
} from "./jiraStore";

const PROJECT = "p1"; // 시드: i4=에픽(ALM-4), i2=스토리(parent=i4), 링크 l1: i3 blocks i2

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("parentId 계층 규칙", () => {
  it("일반 이슈 ← 에픽, 하위 작업 ← 일반 이슈는 허용된다", async () => {
    const epic = await getIssueByKey("ALM-4");
    const task = await createIssue({ projectId: PROJECT, title: "에픽 자식" });
    const withEpic = await setIssueParent(task.id, epic!.id);
    expect(withEpic.parentId).toBe(epic!.id);

    const sub = await createIssue({
      projectId: PROJECT,
      title: "하위",
      type: "subtask",
      parentId: task.id,
    });
    expect(sub.parentId).toBe(task.id);
    expect((await listChildren(task.id)).map((i) => i.id)).toEqual([sub.id]);
  });

  it("에픽은 부모 불가, 일반 이슈 부모는 에픽만, 하위 작업 부모는 일반 이슈만", async () => {
    const epic = await getIssueByKey("ALM-4");
    const task = await getIssueByKey("ALM-1"); // task
    const story = await getIssueByKey("ALM-2"); // story(parent=epic)

    await expect(setIssueParent(epic!.id, task!.id)).rejects.toThrow(
      "에픽은 부모를 가질 수 없습니다",
    );
    await expect(setIssueParent(task!.id, story!.id)).rejects.toThrow(
      "일반 이슈의 부모는 에픽이어야 합니다",
    );
    const sub = await createIssue({ projectId: PROJECT, title: "하위", type: "subtask" });
    await expect(setIssueParent(sub.id, epic!.id)).rejects.toThrow(
      "하위 작업의 부모는 일반 이슈여야 합니다",
    );
    await expect(setIssueParent(task!.id, task!.id)).rejects.toThrow(
      "자기 자신을 부모로 지정할 수 없습니다",
    );
  });

  it("부모 변경은 활동로그(parent)에 남는다", async () => {
    const story = await getIssueByKey("ALM-2"); // parent = ALM-4
    await setIssueParent(story!.id, null);
    const acts = await listActivity(story!.id);
    expect(acts.at(-1)).toMatchObject({ type: "parent", detail: "ALM-4 → 없음" });
  });

  it("타입 전환: 부모와 양립 불가하면 자동 해제, 자식 규칙 위반이면 거부", async () => {
    // ALM-2(story, parent=에픽 ALM-4) → subtask로 바꾸면 에픽 부모와 양립 불가 → 해제
    const story = await getIssueByKey("ALM-2");
    const changed = await updateIssue(story!.id, { type: "subtask" });
    expect(changed.parentId).toBeNull();

    // 에픽 ALM-4가 자식을 가진 상태에서... 자식이 이미 해제됐으니 다시 구성
    const epic = await getIssueByKey("ALM-4");
    const child = await createIssue({ projectId: PROJECT, title: "자식", parentId: epic!.id });
    await expect(updateIssue(epic!.id, { type: "subtask" })).rejects.toThrow(
      "하위 이슈가 있어 타입을 변경할 수 없습니다",
    );
    // 일반 이슈(자식이 subtask가 아님)를 부모로 가진 에픽 → task 전환도 거부
    await expect(updateIssue(epic!.id, { type: "task" })).rejects.toThrow(
      "하위 이슈가 있어 타입을 변경할 수 없습니다",
    );
    await setIssueParent(child.id, null); // 자식 해제 후에는 전환 허용
    const asTask = await updateIssue(epic!.id, { type: "task" });
    expect(asTask.type).toBe("task");
  });

  it("이슈 삭제 시 자식의 부모는 해제된다", async () => {
    const epic = await getIssueByKey("ALM-4");
    const story = await getIssueByKey("ALM-2");
    await deleteIssue(epic!.id);
    const after = await getIssueByKey("ALM-2");
    expect(story!.parentId).toBe(epic!.id);
    expect(after!.parentId).toBeNull();
  });
});

describe("이슈 링크", () => {
  it("시드 링크: ALM-3이 ALM-2를 차단 — 방향이 구분된다", async () => {
    const blocker = await getIssueByKey("ALM-3");
    const blocked = await getIssueByKey("ALM-2");
    const fromBlocker = await listIssueLinks(blocker!.id);
    expect(fromBlocker).toHaveLength(1);
    expect(fromBlocker[0]).toMatchObject({ direction: "outward" }); // 차단함
    expect(fromBlocker[0].other.key).toBe("ALM-2");

    const fromBlocked = await listIssueLinks(blocked!.id);
    expect(fromBlocked[0]).toMatchObject({ direction: "inward" }); // 차단됨
  });

  it("관련 링크는 무순서 중복을 거부하고, 자기 자신 연결도 거부한다", async () => {
    const a = await getIssueByKey("ALM-1");
    const b = await getIssueByKey("ALM-5");
    await addIssueLink({ sourceId: a!.id, targetId: b!.id, type: "relates" });
    await expect(
      addIssueLink({ sourceId: b!.id, targetId: a!.id, type: "relates" }),
    ).rejects.toThrow("이미 연결돼 있습니다");
    await expect(
      addIssueLink({ sourceId: a!.id, targetId: a!.id, type: "relates" }),
    ).rejects.toThrow("자기 자신과는 연결할 수 없습니다");
  });

  it("링크 추가는 양쪽 활동로그에 남고, 제거하면 조회에서 사라진다", async () => {
    const a = await getIssueByKey("ALM-1");
    const b = await getIssueByKey("ALM-5");
    const link = await addIssueLink({ sourceId: a!.id, targetId: b!.id, type: "blocks" });
    expect((await listActivity(a!.id)).at(-1)).toMatchObject({
      type: "link",
      detail: "차단 링크: ALM-5",
    });
    expect((await listActivity(b!.id)).at(-1)).toMatchObject({
      type: "link",
      detail: "차단 링크: ALM-1",
    });
    await removeIssueLink(link.id);
    expect(await listIssueLinks(a!.id)).toHaveLength(0);
  });

  it("이슈를 삭제하면 그 이슈의 링크도 사라진다", async () => {
    const blocked = await getIssueByKey("ALM-2");
    const blocker = await getIssueByKey("ALM-3");
    await deleteIssue(blocker!.id);
    expect(await listIssueLinks(blocked!.id)).toHaveLength(0);
  });
});
