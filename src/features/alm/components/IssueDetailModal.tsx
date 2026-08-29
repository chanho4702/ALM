import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import {
  Avatar,
  Button,
  Comment as CommentBlock,
  InlineEdit,
  Lozenge,
  Modal,
  ProgressBar,
  Select,
  Tabs,
  Tag,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import type {
  Activity,
  Comment,
  Issue,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  IssueType,
  Sprint,
  User,
  WorkflowStatus,
  Worklog,
} from "../store/types";
import {
  addComment,
  addIssueLink,
  addWorklog,
  createIssue,
  deleteComment,
  deleteIssue,
  deleteWorklog,
  getCurrentUser,
  getIssueByKey,
  listActivity,
  listChildren,
  listComments,
  listIssueLinks,
  listIssues,
  listSprints,
  listUsers,
  listWorklogs,
  removeIssueLink,
  resolveSettings,
  setIssueParent,
  updateComment,
  updateIssue,
} from "../store/jiraStore";
import type { IssueLinkView } from "../store/jiraStore";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import {
  ISSUE_TYPES,
  PRIORITY_LABELS,
  RESOLUTIONS,
  RESOLUTION_LABELS,
  TYPE_LABELS,
  statusAppearance,
  statusCategory,
  statusName,
} from "./labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → null은 센티널로 표현
const UNASSIGNED = "unassigned";
const BACKLOG = "backlog";
const NO_PARENT = "none";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

/** 링크 추가 폼의 종류 — 차단은 방향까지 구분 */
type LinkKind = "blocks-out" | "blocks-in" | "relates";
const LINK_KIND_OPTIONS: { value: LinkKind; label: string }[] = [
  { value: "blocks-out", label: "차단함" },
  { value: "blocks-in", label: "차단됨" },
  { value: "relates", label: "관련" },
];

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
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  const [children, setChildren] = useState<Issue[]>([]);
  const [links, setLinks] = useState<IssueLinkView[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<IssueType[]>([...ISSUE_TYPES]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [worklogHours, setWorklogHours] = useState("");
  const [worklogDate, setWorklogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [worklogComment, setWorklogComment] = useState("");
  const [estimateDraft, setEstimateDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("blocks-out");
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [, setSearchParams] = useSearchParams();
  /** 수정 중인 코멘트 id — null이면 보기 모드 */
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
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

  /** 관계(하위 이슈·링크)·워크로그 재조회 */
  const refreshRelations = async (issueId: string, projectId: string) => {
    const [childList, linkList, allIssues, worklogList] = await Promise.all([
      listChildren(issueId),
      listIssueLinks(issueId),
      listIssues(projectId),
      listWorklogs(issueId),
    ]);
    setChildren(childList);
    setLinks(linkList);
    setProjectIssues(allIssues);
    setWorklogs(worklogList);
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
      const [userList, sprintList, commentList, activityList, currentUser] = await Promise.all([
        listUsers(),
        listSprints(found.projectId),
        listComments(found.id),
        listActivity(found.id),
        getCurrentUser(),
      ]);
      if (cancelled) return;
      setIssue(found);
      setDescriptionDraft(found.description);
      setEstimateDraft(found.estimateHours === null ? "" : String(found.estimateHours));
      setUsers(userList);
      setSprints(sprintList);
      setComments(commentList);
      setActivities(activityList);
      setMe(currentUser);
      const settings = await resolveSettings(found.projectId);
      if (!cancelled) {
        setEnabledTypes(settings.body.enabledTypes);
        setStatuses([...settings.body.statuses].sort((a, b) => a.order - b.order));
      }
      await refreshRelations(found.id, found.projectId);
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
      Pick<
        Issue,
        | "title"
        | "description"
        | "type"
        | "status"
        | "priority"
        | "assigneeId"
        | "sprintId"
        | "dueDate"
        | "labels"
        | "estimateHours"
      | "resolution"
      >
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

  /** Enter로 라벨 추가 — 중복은 무시하고 입력만 비운다 */
  const handleLabelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !issue) return;
    event.preventDefault();
    const label = labelDraft.trim();
    setLabelDraft("");
    if (!label || issue.labels.includes(label)) return;
    void applyPatch({ labels: [...issue.labels, label] }, "라벨을 추가했습니다");
  };

  const handleLabelRemove = (label: string) => {
    if (!issue) return;
    void applyPatch({ labels: issue.labels.filter((l) => l !== label) }, "라벨을 제거했습니다");
  };

  const handleIssueDelete = async () => {
    if (!issue) return;
    try {
      await deleteIssue(issue.id);
      toast({ title: `${issue.key}를 삭제했습니다`, appearance: "success" });
      setConfirmingDelete(false);
      await onIssueChanged();
      onClose();
    } catch (error) {
      toast({
        title: "이슈 삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const startCommentEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setCommentEditDraft(comment.body);
  };

  const handleCommentEditSave = async () => {
    if (!issue || !editingCommentId) return;
    try {
      await updateComment(editingCommentId, commentEditDraft);
      setEditingCommentId(null);
      await refreshLogs(issue.id);
      toast({ title: "코멘트를 수정했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "코멘트 수정 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (!issue) return;
    try {
      await deleteComment(commentId);
      await refreshLogs(issue.id);
      toast({ title: "코멘트를 삭제했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "코멘트 삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  /** 다른 이슈로 모달 전환 — ?issue= 교체 (useIssueModal이 새 키로 다시 연다) */
  const switchIssue = (key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("issue", key);
      return next;
    });
  };

  const handleParentChange = async (value: string) => {
    if (!issue) return;
    try {
      const updated = await setIssueParent(issue.id, value === NO_PARENT ? null : value);
      setIssue(updated);
      await refreshLogs(updated.id);
      await onIssueChanged();
      toast({ title: "부모를 변경했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "부모 변경 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleSubtaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issue) return;
    try {
      // 부모와 같은 스프린트에 하위 작업 생성
      await createIssue({
        projectId: issue.projectId,
        title: subtaskDraft,
        type: "subtask",
        parentId: issue.id,
        sprintId: issue.sprintId,
      });
      setSubtaskDraft("");
      await refreshRelations(issue.id, issue.projectId);
      await onIssueChanged();
      toast({ title: "하위 작업을 추가했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "하위 작업 추가 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleLinkAdd = async () => {
    if (!issue || !linkTargetId) return;
    try {
      await addIssueLink(
        linkKind === "blocks-in"
          ? { sourceId: linkTargetId, targetId: issue.id, type: "blocks" }
          : { sourceId: issue.id, targetId: linkTargetId, type: linkKind === "relates" ? "relates" : "blocks" },
      );
      setLinkTargetId(null);
      await refreshRelations(issue.id, issue.projectId);
      await refreshLogs(issue.id);
      toast({ title: "링크를 추가했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "링크 추가 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleLinkRemove = async (linkId: string) => {
    if (!issue) return;
    try {
      await removeIssueLink(linkId);
      await refreshRelations(issue.id, issue.projectId);
      toast({ title: "링크를 제거했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "링크 제거 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleEstimateBlur = async () => {
    if (!issue) return;
    const next = estimateDraft.trim() === "" ? null : Number(estimateDraft);
    if (next === issue.estimateHours) return;
    await applyPatch({ estimateHours: next }, "예상 시간을 저장했습니다");
  };

  const handleWorklogSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issue) return;
    try {
      await addWorklog(issue.id, {
        hours: Number(worklogHours),
        comment: worklogComment,
        workedOn: worklogDate,
      });
      setWorklogHours("");
      setWorklogComment("");
      await refreshRelations(issue.id, issue.projectId);
      await refreshLogs(issue.id);
      toast({ title: "작업 시간을 기록했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "워크로그 기록 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleWorklogDelete = async (worklogId: string) => {
    if (!issue) return;
    try {
      await deleteWorklog(worklogId);
      await refreshRelations(issue.id, issue.projectId);
      toast({ title: "워크로그를 삭제했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "워크로그 삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
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

  /** 미완료 차단자가 있고 이 이슈도 미완료면 "차단됨" */
  const isBlocked =
    issue.status !== "done" &&
    links.some(
      (l) => l.link.type === "blocks" && l.direction === "inward" && l.other.status !== "done",
    );

  /** 부모 후보 — 하위 작업은 일반 이슈, 일반 이슈는 에픽 (자기 제외) */
  const parentCandidates =
    issue.type === "subtask"
      ? projectIssues.filter((i) => i.id !== issue.id && i.type !== "epic" && i.type !== "subtask")
      : projectIssues.filter((i) => i.type === "epic");

  const linkGroups: { title: string; items: IssueLinkView[] }[] = [
    {
      title: "차단함",
      items: links.filter((l) => l.link.type === "blocks" && l.direction === "outward"),
    },
    {
      title: "차단됨",
      items: links.filter((l) => l.link.type === "blocks" && l.direction === "inward"),
    },
    { title: "관련", items: links.filter((l) => l.link.type === "relates") },
  ];

  const doneChildren = children.filter((c) => c.status === "done").length;

  /** 워크로그 합계 — 예상 시간과 함께 진행률을 만든다 */
  const loggedHours = worklogs.reduce((sum, w) => sum + w.hours, 0);
  const overEstimate = issue.estimateHours !== null && loggedHours > issue.estimateHours;

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

          {/* 하위 이슈 — 에픽/일반 이슈에 표시 (하위 작업은 자식을 가질 수 없다) */}
          {issue.type !== "subtask" ? (
            <section className="issue-relations" data-testid="issue-children">
              <h4>
                하위 이슈{" "}
                {children.length > 0 ? (
                  <span className="issue-relations-count">
                    (완료 {doneChildren}/{children.length})
                  </span>
                ) : null}
              </h4>
              <ul className="issue-relation-list">
                {children.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      className="issue-relation-row"
                      onClick={() => switchIssue(child.key)}
                    >
                      <IssueTypeGlyph type={child.type} />
                      <span className="issue-key-cell">{child.key}</span>
                      <span className="issue-relation-title">{child.title}</span>
                      <Lozenge appearance={statusAppearance(statuses, child.status)}>
                        {statusName(statuses, child.status)}
                      </Lozenge>
                    </button>
                  </li>
                ))}
              </ul>
              {issue.type !== "epic" ? (
                <form className="issue-relation-add" onSubmit={handleSubtaskSubmit}>
                  <TextField
                    label="하위 작업 추가"
                    placeholder="하위 작업 제목"
                    value={subtaskDraft}
                    onChange={(e) => setSubtaskDraft(e.target.value)}
                  />
                  <Button type="submit" size="small" disabled={!subtaskDraft.trim()}>
                    추가
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}

          {/* 이슈 링크 — 차단함/차단됨/관련 */}
          <section className="issue-relations" data-testid="issue-links">
            <h4>링크</h4>
            {linkGroups.map((group) =>
              group.items.length > 0 ? (
                <div key={group.title} className="issue-link-group">
                  <span className="issue-link-group-title">{group.title}</span>
                  <ul className="issue-relation-list">
                    {group.items.map(({ link, other }) => (
                      <li key={link.id} className="issue-link-item">
                        <button
                          type="button"
                          className="issue-relation-row"
                          onClick={() => switchIssue(other.key)}
                        >
                          <IssueTypeGlyph type={other.type} />
                          <span className="issue-key-cell">{other.key}</span>
                          <span className="issue-relation-title">{other.title}</span>
                          <Lozenge appearance={statusAppearance(statuses, other.status)}>
                            {statusName(statuses, other.status)}
                          </Lozenge>
                        </button>
                        <Button
                          variant="ghost"
                          size="small"
                          aria-label={`${other.key} 링크 제거`}
                          onClick={() => void handleLinkRemove(link.id)}
                        >
                          ×
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            <div className="issue-link-add">
              <Select
                label="종류"
                value={linkKind}
                options={LINK_KIND_OPTIONS}
                onValueChange={(v) => setLinkKind(v as LinkKind)}
              />
              <Select
                label="대상 이슈"
                value={linkTargetId ?? NO_PARENT}
                options={[
                  { value: NO_PARENT, label: "선택하세요" },
                  ...projectIssues
                    .filter((i) => i.id !== issue.id)
                    .map((i) => ({ value: i.id, label: `${i.key} ${i.title}` })),
                ]}
                onValueChange={(v) => setLinkTargetId(v === NO_PARENT ? null : v)}
              />
              <Button size="small" disabled={!linkTargetId} onClick={() => void handleLinkAdd()}>
                링크 추가
              </Button>
            </div>
          </section>
        </div>
        <aside className="issue-props">
          <Lozenge
            appearance={statusAppearance(statuses, issue.status)}
            data-testid="issue-status-lozenge"
          >
            {statusName(statuses, issue.status)}
          </Lozenge>
          {isBlocked ? (
            <Lozenge appearance="danger" data-testid="issue-blocked-lozenge">
              차단됨
            </Lozenge>
          ) : null}
          <Select
            label="타입"
            value={issue.type}
            // 프로젝트 설정의 활성 타입만 — 현재 값이 비활성이어도 표시를 위해 포함
            options={ISSUE_TYPES.filter(
              (t) => enabledTypes.includes(t) || t === issue.type,
            ).map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
            onValueChange={(v) => void applyPatch({ type: v as IssueType }, "타입을 변경했습니다")}
          />
          <Select
            label="상태"
            value={issue.status}
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            onValueChange={(v) => void applyPatch({ status: v as IssueStatus }, "상태를 변경했습니다")}
          />
          {/* 해결은 완료 카테고리에서만 의미가 있다 — 지라도 완료 전이 화면에서만 묻는다 */}
          {statusCategory(statuses, issue.status) === "done" ? (
            <Select
              label="해결"
              value={issue.resolution ?? "done"}
              options={RESOLUTIONS.map((r) => ({ value: r, label: RESOLUTION_LABELS[r] }))}
              onValueChange={(v) =>
                void applyPatch({ resolution: v as IssueResolution }, "해결을 변경했습니다")
              }
            />
          ) : null}
          {issue.type !== "epic" ? (
            <Select
              label="부모"
              value={issue.parentId ?? NO_PARENT}
              options={[
                { value: NO_PARENT, label: "없음" },
                ...parentCandidates.map((p) => ({ value: p.id, label: `${p.key} ${p.title}` })),
              ]}
              onValueChange={(v) => void handleParentChange(v)}
            />
          ) : null}
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
          <TextField
            label="마감일"
            type="date"
            value={issue.dueDate ?? ""}
            onChange={(e) =>
              void applyPatch({ dueDate: e.target.value || null }, "마감일을 저장했습니다")
            }
          />
          <div className="issue-labels-field">
            <TextField
              label="라벨 추가"
              placeholder="입력 후 Enter"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={handleLabelKeyDown}
            />
            {issue.labels.length > 0 ? (
              <div className="issue-labels-list">
                {issue.labels.map((label) => (
                  <Tag key={label} label={label} onRemove={() => handleLabelRemove(label)} />
                ))}
              </div>
            ) : null}
          </div>
          <TextField
            label="예상 시간 (h)"
            type="number"
            min={0.5}
            step={0.5}
            placeholder="미지정"
            value={estimateDraft}
            onChange={(e) => setEstimateDraft(e.target.value)}
            onBlur={() => void handleEstimateBlur()}
          />
          {loggedHours > 0 || issue.estimateHours !== null ? (
            <div className="issue-time-tracking" data-testid="issue-time-tracking">
              <span className={overEstimate ? "issue-time-label is-over" : "issue-time-label"}>
                기록 {loggedHours}h
                {issue.estimateHours !== null ? ` / 예상 ${issue.estimateHours}h` : ""}
              </span>
              {issue.estimateHours !== null ? (
                <ProgressBar
                  label="시간 진행률"
                  value={Math.min(100, Math.round((loggedHours / issue.estimateHours) * 100))}
                  variant={overEstimate ? "danger" : "default"}
                />
              ) : null}
            </div>
          ) : null}
          <dl className="issue-dates">
            <dt>생성일</dt>
            <dd>{formatDateTime(issue.createdAt)}</dd>
            <dt>수정일</dt>
            <dd>{formatDateTime(issue.updatedAt)}</dd>
          </dl>
          <Button variant="danger" size="small" onClick={() => setConfirmingDelete(true)}>
            이슈 삭제
          </Button>
        </aside>
      </div>
      {confirmingDelete ? (
        <Modal
          trigger={<span hidden />}
          title="이슈 삭제"
          open
          onOpenChange={(next) => {
            if (!next) setConfirmingDelete(false);
          }}
        >
          <div className="project-delete-confirm">
            <p>
              <strong>{issue.key}</strong> 이슈를 삭제하면 코멘트와 활동 기록도 함께 사라집니다.
              되돌릴 수 없습니다.
            </p>
            <div className="project-delete-actions">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => void handleIssueDelete()}>
                삭제
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <Tabs
        label="이슈 기록"
        className="issue-tabs"
        items={[
          {
            value: "comments",
            label: `코멘트 (${comments.length})`,
            content: (
              <div className="issue-comments" data-testid="issue-comments">
                {comments.map((comment) => {
                  const mine = me !== null && comment.authorId === me.id;
                  const editing = editingCommentId === comment.id;
                  return (
                    <CommentBlock
                      key={comment.id}
                      author={userName(comment.authorId)}
                      avatar={<Avatar name={userName(comment.authorId)} size="small" />}
                      time={
                        comment.updatedAt
                          ? `${formatDateTime(comment.createdAt)} (수정됨)`
                          : formatDateTime(comment.createdAt)
                      }
                      // 본인 댓글에만 수정/삭제 노출. 수정 중엔 편집 폼의 저장/취소가 대신한다
                      actions={
                        mine && !editing
                          ? [
                              { label: "수정", onClick: () => startCommentEdit(comment) },
                              {
                                label: "삭제",
                                danger: true,
                                onClick: () => void handleCommentDelete(comment.id),
                              },
                            ]
                          : undefined
                      }
                    >
                      {editing ? (
                        <div className="issue-comment-edit">
                          <TextArea
                            label="코멘트 수정"
                            rows={3}
                            value={commentEditDraft}
                            onChange={(e) => setCommentEditDraft(e.target.value)}
                          />
                          <div className="issue-comment-edit-actions">
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={() => setEditingCommentId(null)}
                            >
                              취소
                            </Button>
                            <Button size="small" onClick={() => void handleCommentEditSave()}>
                              저장
                            </Button>
                          </div>
                        </div>
                      ) : (
                        comment.body
                      )}
                    </CommentBlock>
                  );
                })}
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
            value: "worklog",
            label: `워크로그 (${worklogs.length})`,
            content: (
              <div className="issue-worklogs" data-testid="issue-worklogs">
                <form className="issue-worklog-form" onSubmit={handleWorklogSubmit}>
                  <TextField
                    label="시간 (h)"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={worklogHours}
                    onChange={(e) => setWorklogHours(e.target.value)}
                  />
                  <TextField
                    label="작업일"
                    type="date"
                    value={worklogDate}
                    onChange={(e) => setWorklogDate(e.target.value)}
                  />
                  <TextField
                    label="메모"
                    placeholder="무슨 작업이었나요? (선택)"
                    value={worklogComment}
                    onChange={(e) => setWorklogComment(e.target.value)}
                  />
                  <Button type="submit" size="small" disabled={!(Number(worklogHours) > 0)}>
                    기록
                  </Button>
                </form>
                {worklogs.length === 0 ? (
                  <p className="issue-comment-empty">아직 기록된 작업 시간이 없습니다</p>
                ) : (
                  <ul className="issue-worklog-list">
                    {worklogs.map((worklog) => (
                      <li key={worklog.id} className="issue-worklog-row">
                        <Avatar name={userName(worklog.authorId)} size="small" />
                        <span className="issue-worklog-author">{userName(worklog.authorId)}</span>
                        <span className="issue-worklog-date">{worklog.workedOn}</span>
                        <strong className="issue-worklog-hours">{worklog.hours}h</strong>
                        <span className="issue-worklog-comment">{worklog.comment}</span>
                        {me !== null && worklog.authorId === me.id ? (
                          <Button
                            variant="ghost"
                            size="small"
                            aria-label="워크로그 삭제"
                            onClick={() => void handleWorklogDelete(worklog.id)}
                          >
                            ×
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
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
