// localStorage 목업 스토어 — collab (jiraMock.ts에서 분할, 동작 불변)
import type { Comment, Activity, Issue, JiraData } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { extractMentionIds, newMentionIds } from "../richText";
import { clone, load, nextId, persist } from "./db";
import { userLabel, addWatcher, notificationRecipients, pushNotification, notifyMentions } from "./rules";
import { preferencesOf } from "./personal";
import { canDeleteOwnedEntry } from "./members";

// ── comments / activity ──────────────────────────────────────

export async function listComments(issueId: string): Promise<Comment[]> {
  return clone(
    load()
      .comments.filter((c) => c.issueId === issueId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function addComment(issueId: string, body: string): Promise<Comment> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  const comment = addCommentInternal(data, issue, body);
  persist();
  return clone(comment);
}

/**
 * 코멘트 한 건을 데이터에 넣는다(저장은 호출자) — 전환 코멘트·플래그 이유·트리아지·자동화가 같은 알림 규칙을 탄다.
 * `authorId`를 주면 그 사람 이름으로 남긴다(자동화 실행 주체).
 */
export function addCommentInternal(data: JiraData, issue: Issue, body: string, authorId: string = CURRENT_USER_ID): Comment {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  const comment: Comment = {
    id: nextId(),
    issueId: issue.id,
    authorId,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.comments.push(comment);
  // 워처 ∪ 담당자에게 코멘트 알림 (본인 코멘트는 제외)
  const message = `${userLabel(data, authorId)} 님이 ${issue.key}에 코멘트를 남겼습니다`;
  if (preferencesOf(data, authorId).autoWatch.commented) {
    addWatcher(data, issue.id, authorId, comment.createdAt);
  }
  for (const userId of notificationRecipients(data, issue, authorId)) {
    pushNotification(data, userId, issue, message, comment.createdAt, "commented");
  }
  notifyMentions(data, issue, extractMentionIds(trimmed), `${issue.key} 코멘트`, comment.createdAt);
  return comment;
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) throw new Error("본인 댓글만 수정할 수 있습니다");
  const trimmed = body.trim();
  const previousBody = comment?.body ?? "";
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  comment.body = trimmed;
  comment.updatedAt = new Date().toISOString();
  {
    const issueOfComment = data.issues.find((i) => i.id === comment!.issueId);
    if (issueOfComment) notifyMentions(data, issueOfComment, newMentionIds(previousBody, comment!.body), `${issueOfComment.key} 코멘트`, new Date().toISOString());
  }
  persist();
  return clone(comment);
}

export async function deleteComment(id: string): Promise<void> {
  const data = load();
  const index = data.comments.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("코멘트를 찾을 수 없습니다");
  if (!canDeleteOwnedEntry(data, data.comments[index].authorId, data.comments[index].issueId)) {
    throw new Error("본인 댓글만 삭제할 수 있습니다");
  }
  data.comments.splice(index, 1);
  persist();
}

export async function listActivity(issueId: string): Promise<Activity[]> {
  return clone(
    load()
      .activities.filter((a) => a.issueId === issueId)
      .sort((a, b) => a.at.localeCompare(b.at)),
  );
}
