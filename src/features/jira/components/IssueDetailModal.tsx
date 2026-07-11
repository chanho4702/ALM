import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Avatar,
  Button,
  Comment as CommentBlock,
  InlineEdit,
  Lozenge,
  Modal,
  Select,
  Tabs,
  TextArea,
  useToast,
} from "@chanho/react";
import type {
  Activity,
  Comment,
  Issue,
  IssuePriority,
  IssueStatus,
  Sprint,
  User,
} from "../store/types";
import {
  addComment,
  getIssueByKey,
  listActivity,
  listComments,
  listSprints,
  listUsers,
  updateIssue,
} from "../store/jiraStore";
import { BOARD_STATUSES, PRIORITY_LABELS, STATUS_APPEARANCE, STATUS_LABELS } from "./labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → null은 센티널로 표현
const UNASSIGNED = "unassigned";
const BACKLOG = "backlog";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

export interface IssueDetailModalProps {
  /** "ALM-1" 형식 이슈 키 (?issue= 쿼리 값) */
  issueKey: string;
  /** 모달 닫기 = URL 쿼리 제거 */
  onClose: () => void;
  /** 저장 성공 후 페이지 재조회 (모달을 연 채 목록 반영) */
  onIssueChanged: () => void | Promise<void>;
}

export function IssueDetailModal({ issueKey, onClose, onIssueChanged }: IssueDetailModalProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const toast = useToast();

  /** 코멘트·활동 재조회 — 속성 저장/코멘트 작성 후 호출 (활동로그는 스토어 부수효과) */
  const refreshLogs = async (issueId: string) => {
    const [commentList, activityList] = await Promise.all([
      listComments(issueId),
      listActivity(issueId),
    ]);
    setComments(commentList);
    setActivities(activityList);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getIssueByKey(issueKey);
      if (cancelled) return;
      if (!found) {
        toast({ title: `이슈를 찾을 수 없습니다: ${issueKey}`, appearance: "danger" });
        onClose();
        return;
      }
      const [userList, sprintList, commentList, activityList] = await Promise.all([
        listUsers(),
        listSprints(found.projectId),
        listComments(found.id),
        listActivity(found.id),
      ]);
      if (cancelled) return;
      setIssue(found);
      setDescriptionDraft(found.description);
      setUsers(userList);
      setSprints(sprintList);
      setComments(commentList);
      setActivities(activityList);
    })();
    return () => {
      cancelled = true;
    };
    // issueKey가 바뀔 때만 재조회 (toast/onClose는 재조회 트리거가 아니다)
  }, [issueKey]);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";
  const formatDateTime = (iso: string) => new Date(iso).toLocaleString("ko-KR");

  const applyPatch = async (
    patch: Partial<
      Pick<Issue, "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">
    >,
    successTitle: string,
  ) => {
    if (!issue) return;
    try {
      const updated = await updateIssue(issue.id, patch);
      setIssue(updated);
      await refreshLogs(updated.id); // 상태 등 변경 → 활동 탭 즉시 반영
      await onIssueChanged();
      toast({ title: successTitle, appearance: "success" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleDescriptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await applyPatch({ description: descriptionDraft }, "설명을 저장했습니다");
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issue) return;
    try {
      await addComment(issue.id, commentDraft); // 빈 본문은 스토어가 throw
      setCommentDraft("");
      await refreshLogs(issue.id);
      toast({ title: "코멘트를 남겼습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "코멘트 작성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  if (!issue) return null;

  return (
    <Modal
      trigger={<span hidden />} // URL 쿼리로 여는 모달 — 트리거는 사용하지 않는다 (Modal.trigger가 필수 prop)
      title={issue.key}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="issue-detail-modal"
    >
      <div className="issue-detail-body">
        <div className="issue-detail-main">
          <InlineEdit
            label="제목"
            value={issue.title}
            viewClassName="issue-title-view"
            onSave={(next) => void applyPatch({ title: next }, "제목을 저장했습니다")}
          />
          <form className="issue-description-form" onSubmit={handleDescriptionSubmit}>
            <TextArea
              label="설명"
              rows={5}
              placeholder="이슈 설명을 입력하세요"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
            />
            <Button type="submit" size="small" disabled={descriptionDraft === issue.description}>
              설명 저장
            </Button>
          </form>
        </div>
        <aside className="issue-props">
          <Lozenge appearance={STATUS_APPEARANCE[issue.status]} data-testid="issue-status-lozenge">
            {STATUS_LABELS[issue.status]}
          </Lozenge>
          <Select
            label="상태"
            value={issue.status}
            options={BOARD_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            onValueChange={(v) => void applyPatch({ status: v as IssueStatus }, "상태를 변경했습니다")}
          />
          <Select
            label="담당자"
            value={issue.assigneeId ?? UNASSIGNED}
            options={[
              { value: UNASSIGNED, label: "미지정" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
            onValueChange={(v) =>
              void applyPatch({ assigneeId: v === UNASSIGNED ? null : v }, "담당자를 변경했습니다")
            }
          />
          <Select
            label="우선순위"
            value={issue.priority}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            onValueChange={(v) =>
              void applyPatch({ priority: v as IssuePriority }, "우선순위를 변경했습니다")
            }
          />
          <Select
            label="스프린트"
            value={issue.sprintId ?? BACKLOG}
            options={[
              { value: BACKLOG, label: "백로그" },
              // 완료된 스프린트는 선택지에서 제외하되, 현재 값이면 표시를 위해 포함
              ...sprints
                .filter((s) => s.state !== "done" || s.id === issue.sprintId)
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
            onValueChange={(v) =>
              void applyPatch({ sprintId: v === BACKLOG ? null : v }, "스프린트를 변경했습니다")
            }
          />
        </aside>
      </div>
      <Tabs
        label="이슈 기록"
        className="issue-tabs"
        items={[
          {
            value: "comments",
            label: `코멘트 (${comments.length})`,
            content: (
              <div className="issue-comments" data-testid="issue-comments">
                {comments.map((comment) => (
                  <CommentBlock
                    key={comment.id}
                    author={userName(comment.authorId)}
                    avatar={<Avatar name={userName(comment.authorId)} size="small" />}
                    time={formatDateTime(comment.createdAt)}
                  >
                    {comment.body}
                  </CommentBlock>
                ))}
                {comments.length === 0 ? (
                  <p className="issue-comment-empty">아직 코멘트가 없습니다</p>
                ) : null}
                <form className="issue-comment-form" onSubmit={handleCommentSubmit}>
                  <TextArea
                    label="코멘트"
                    rows={3}
                    placeholder="코멘트를 입력하세요"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                  <Button type="submit" size="small">
                    코멘트 남기기
                  </Button>
                </form>
              </div>
            ),
          },
          {
            value: "activity",
            label: "활동",
            content: (
              <ul className="issue-activity" data-testid="issue-activity">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <strong>{userName(activity.actorId)}</strong> —{" "}
                    <span className="issue-activity-detail">{activity.detail}</span>
                    <span className="issue-activity-time">{formatDateTime(activity.at)}</span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </Modal>
  );
}
