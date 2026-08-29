import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  deleteAttachment,
  deleteIssue,
  downloadAttachment,
  getIssueByKey,
  listActivity,
  listAttachments,
  uploadAttachment,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

function file(name: string, bytes: string, type = "text/plain"): File {
  return new File([bytes], name, { type });
}

describe("첨부(목업)", () => {
  it("올리면 목록에 메타가 남고 활동로그에 기록된다", async () => {
    const issue = await getIssueByKey("ALM-1");

    const uploaded = await uploadAttachment(issue!.id, file("메모.txt", "hello"));

    expect(uploaded).toMatchObject({
      issueId: issue!.id,
      filename: "메모.txt",
      sizeBytes: 5,
      uploadedBy: "u1",
    });
    expect(await listAttachments(issue!.id)).toEqual([uploaded]);
    expect((await listActivity(issue!.id)).at(-1)).toMatchObject({
      type: "attachment",
      detail: "메모.txt 첨부",
    });
  });

  it("내려받으면 올린 내용 그대로다", async () => {
    const issue = await getIssueByKey("ALM-1");
    const uploaded = await uploadAttachment(issue!.id, file("a.txt", "payload"));

    const blob = await downloadAttachment(uploaded.id);

    // jsdom의 Blob에는 text()가 없다 — FileReader로 읽는다
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toBe("payload");
  });

  it("빈 파일은 거부한다", async () => {
    const issue = await getIssueByKey("ALM-1");

    await expect(uploadAttachment(issue!.id, file("empty.txt", ""))).rejects.toThrow(
      "빈 파일은 올릴 수 없습니다",
    );
  });

  it("지우면 목록에서 사라지고 이슈를 지우면 첨부도 사라진다", async () => {
    const issue = await getIssueByKey("ALM-7");
    const a = await uploadAttachment(issue!.id, file("a.txt", "1"));
    const b = await uploadAttachment(issue!.id, file("b.txt", "2"));

    await deleteAttachment(a.id);
    expect((await listAttachments(issue!.id)).map((x) => x.id)).toEqual([b.id]);
    await expect(downloadAttachment(a.id)).rejects.toThrow("첨부를 찾을 수 없습니다");

    await deleteIssue(issue!.id);
    expect(await listAttachments(issue!.id)).toEqual([]);
  });

  it("뷰어는 올릴 수 없다", async () => {
    const { updateProjectMemberRole } = await import("./jiraStore");
    // 시드에서 팀 전원이 이미 멤버다 — u2를 관리자로 올린 뒤 u1을 뷰어로 낮춘다
    await updateProjectMemberRole("p1", "u2", "admin");
    await updateProjectMemberRole("p1", "u1", "viewer");
    const issue = await getIssueByKey("ALM-1");

    await expect(uploadAttachment(issue!.id, file("a.txt", "1"))).rejects.toThrow(
      "이 프로젝트를 편집할 권한이 없습니다",
    );
  });
});
