import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { Button, Checkbox, Comment as CommentBlock, InlineEdit, Lozenge, Modal, ProgressBar, Select, Tabs, Tag, TextField, useToast } from "@chanho/react";
import type {
  Activity,
  Comment,
  Issue,
  IssuePriority,
  Component,
  IssueResolution,
  IssueType,
  ProjectVersion,
  SettingsBody,
  Sprint,
  User,
  WorkflowStatus,
  Worklog,
} from "../store/types";
import {
  listComponents,
  addComment,
  addIssueLink,
  addWorklog,
  createIssue,
  deleteComment,
  deleteIssue,
  archiveIssue,
  deleteWorklog,
  getCurrentUser,
  getIssueByKey,
  getMyProjectRole,
  listActivity,
  listChildren,
  listComments,
  listIssueLinks,
  listIssues,
  listSprints,
  listUsers,
  listVersions,
  listWorklogs,
  removeIssueLink,
  resolveSettings,
  setIssueParent,
  updateComment,
  updateIssue,
} from "../store/jiraStore";
import type { IssueLinkView } from "../store/jiraStore";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { useIssueTypes } from "./useIssueTypes";
import { Plus, UserRound } from "lucide-react";
import { useLinkTypes } from "./useLinkTypes";
import { LINK_KIND_DEFAULT, linkKindOptions, parseLinkKind, type LinkKind } from "./linkKinds";
import { IssueAttachments } from "./IssueAttachments";
import { WatchButton } from "./WatchButton";
import { UserAvatar } from "./UserAvatar";
import { RichTextEditor } from "./editor/RichTextEditor";
import { RichTextView } from "./editor/RichTextView";
import {
  priorityName,
  ISSUE_TYPES,
  RESOLUTIONS,
  RESOLUTION_LABELS,
  statusAppearance,
  statusKind,
  statusName,
  typeLevel,
  typeName,
} from "./labels";
import { usePriorities } from "./usePriorities";
import { resolveFields } from "./fieldConfig";
import { FieldLabel } from "./FieldLabel";
import { formatDateTime } from "./time";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → null은 센티널로 표현
const NO_VERSION = "__no_version__";
const UNASSIGNED = "unassigned";
const BACKLOG = "backlog";
const NO_PARENT = "none";

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
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [canEdit, setCanEdit] = useState(true);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  const [componentOptions, setComponentOptions] = useState<Component[]>([]);
  const [children, setChildren] = useState<Issue[]>([]);
  const [links, setLinks] = useState<IssueLinkView[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<IssueType[]>([...ISSUE_TYPES]);
  const issueTypes = useIssueTypes();
  const linkTypes = useLinkTypes();
  const priorities = usePriorities();
  const PRIORITIES = priorities.map((d) => d.id);
  const levelOf = (typeId: string) => typeLevel(issueTypes, typeId);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  /** 프로젝트 설정 본문 — 필드 구성은 **이 이슈의 타입**으로 해석한다(타입별 덮어쓰기가 이긴다) */
  const [settingsBody, setSettingsBody] = useState<SettingsBody | null>(null);
  /** 숨긴 필드는 속성 패널·첨부·링크·하위 이슈에서 뺀다 */
  const fields = useMemo(() => resolveFields(settingsBody, issue?.type), [settingsBody, issue?.type]);
  const [worklogHours, setWorklogHours] = useState("");
  const [worklogDate, setWorklogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [worklogComment, setWorklogComment] = useState("");
  const [estimateDraft, setEstimateDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [childType, setChildType] = useState<IssueType>("subtask");
  const [linkKind, setLinkKind] = useState<LinkKind>(LINK_KIND_DEFAULT);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  // 하위 이슈·링크 추가 폼은 기본 접힘 — 지라처럼 섹션 헤더의 + 버튼으로 편다
  const [subtaskFormOpen, setSubtaskFormOpen] = useState(false);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const linkFormRef = useRef<HTMLDivElement>(null);
  const [, setSearchParams] = useSearchParams();
  /** 수정 중인 코멘트 id — null이면 보기 모드 */
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!linkFormOpen) return;
    // Select는 ref/autoFocus를 받지 않아 열릴 때만 첫 combobox로 포커스를 옮긴다
    linkFormRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
  }, [linkFormOpen]);

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
    setComponentOptions(await listComponents(projectId).catch(() => []));
    setWorklogs(worklogList);
  };

  // 수정 버전 후보와 내 역할 — 프로젝트가 바뀔 때만 다시 읽는다
  useEffect(() => {
    if (!issue) return;
    let cancelled = false;
    void Promise.all([listVersions(issue.projectId), getMyProjectRole(issue.projectId)]).then(
      ([list, role]) => {
        if (cancelled) return;
        setVersions(list);
        setCanEdit(role !== null && role !== "viewer");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [issue?.projectId]);

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
        setSettingsBody(settings.body);
      }
      await refreshRelations(found.id, found.projectId);
    })();
    return () => {
      cancelled = true;
    };
    // issueKey가 바뀔 때만 재조회 (toast/onClose는 재조회 트리거가 아니다)
  }, [issueKey]);

  const userOf = (id: string) => users.find((u) => u.id === id);
  const userName = (id: string) => userOf(id)?.name ?? "알 수 없음";

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
        | "componentIds"
        | "estimateHours"
      | "resolution"
      | "fixVersionId"
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
      toast({ title: "상위 항목을 변경했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "상위 항목 변경 실패",
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
        type: childType,
        parentId: issue.id,
        sprintId: issue.sprintId,
      });
      setSubtaskDraft("");
      await refreshRelations(issue.id, issue.projectId);
      await onIssueChanged();
      toast({ title: "하위 이슈를 추가했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "하위 이슈 추가 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleLinkAdd = async () => {
    if (!issue || !linkTargetId) return;
    try {
      const { type, inbound } = parseLinkKind(linkKind);
      await addIssueLink(
        inbound
          ? { sourceId: linkTargetId, targetId: issue.id, type }
          : { sourceId: issue.id, targetId: linkTargetId, type },
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
    statusKind(statuses, issue.status) !== "complete" &&
    links.some(
      (l) =>
        l.link.type === "blocks" &&
        l.direction === "inward" &&
        statusKind(statuses, l.other.status) !== "complete",
    );

  /** 계층 깊이 제한 없음 — 상위 항목 후보는 자기 자신과 자손을 뺀 프로젝트의 모든 이슈 */
  const descendantIds = new Set<string>();
  {
    const queue = [issue.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const i of projectIssues) {
        if (i.parentId === cur && !descendantIds.has(i.id)) {
          descendantIds.add(i.id);
          queue.push(i.id);
        }
      }
    }
  }
  const parentCandidates = projectIssues.filter((i) => i.id !== issue.id && !descendantIds.has(i.id));
  /** 상위 항목 경로(루트 먼저) — 순환은 없지만 목록이 덜 실렸을 때를 대비해 방문 가드 */
  const ancestors: Issue[] = [];
  {
    const seen = new Set<string>([issue.id]);
    let cursor = issue.parentId ? projectIssues.find((i) => i.id === issue.parentId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      ancestors.unshift(cursor);
      cursor = cursor.parentId ? projectIssues.find((i) => i.id === cursor!.parentId) : undefined;
    }
  }
  const grandChildrenOf = (id: string) => projectIssues.filter((i) => i.parentId === id);
  const childTypeOptions = [
    ...enabledTypes.filter((t) => levelOf(t) !== "subtask"),
    ...issueTypes.filter((t) => t.level === "subtask").map((t) => t.id),
  ]
    .filter((t, index, arr) => arr.indexOf(t) === index)
    .map((t) => ({ value: t, label: typeName(issueTypes, t) }));

  // 레지스트리 순서대로 타입마다 나가는/들어오는 그룹(대칭이면 하나). 모르는 타입은 id로 뒤에
  const knownTypeIds = new Set(linkTypes.map((t) => t.id));
  const linkGroups: { title: string; items: IssueLinkView[] }[] = [];
  for (const t of linkTypes) {
    const symmetric = t.outward === t.inward;
    linkGroups.push({
      title: t.outward,
      items: links.filter((l) => l.link.type === t.id && (symmetric || l.direction === "outward")),
    });
    if (!symmetric) {
      linkGroups.push({ title: t.inward, items: links.filter((l) => l.link.type === t.id && l.direction === "inward") });
    }
  }
  for (const l of links) {
    if (knownTypeIds.has(l.link.type)) continue;
    const group = linkGroups.find((g) => g.title === l.link.type);
    if (group) group.items.push(l);
    else linkGroups.push({ title: l.link.type, items: [l] });
  }

  const doneChildren = children.filter((c) => statusKind(statuses, c.status) === "complete").length;

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
      {/* 모달 헤더 줄 — 왼쪽 상위 경로·키, 오른쪽 관심 등록(닫기 버튼 옆) */}
      <div className="issue-detail-header">
        <nav className="issue-ancestors" aria-label="상위 항목 경로">
          {(fields.parent.visible ? ancestors : []).map((a) => (
            <span key={a.id} className="issue-ancestor">
              <button type="button" className="issue-ancestor-link" onClick={() => switchIssue(a.key)}>
                <IssueTypeGlyph type={a.type} />
                {a.key}
              </button>
              <span aria-hidden="true" className="issue-ancestor-sep">
                /
              </span>
            </span>
          ))}
          <span className="issue-ancestor-current">{issue.key}</span>
        </nav>
        <div className="issue-detail-toolbar">
          <WatchButton issueId={issue.id} users={users} />
        </div>
      </div>
      <div className="issue-detail-body">
        <div className="issue-detail-main">
          <InlineEdit
            label="제목"
            value={issue.title}
            viewClassName="issue-title-view"
            onSave={(next) => void applyPatch({ title: next }, "제목을 저장했습니다")}
          />
          {fields.description.visible ? (
          <form className="issue-description-form" onSubmit={handleDescriptionSubmit}>
            <RichTextEditor
              label="설명"
              value={descriptionDraft}
              onChange={setDescriptionDraft}
              users={users}
              placeholder="이슈 설명을 입력하세요 — @로 멘션"
              minHeight={140}
            />
            <Button type="submit" size="small" disabled={descriptionDraft === issue.description}>
              설명 저장
            </Button>
          </form>
          ) : null}
          {fields.attachments.visible ? (
          <IssueAttachments
            issueId={issue.id}
            userNames={Object.fromEntries(users.map((u) => [u.id, u.name]))}
            canEdit={canEdit}
            onChanged={() => void onIssueChanged()}
          />
          ) : null}

          {/* 하위 이슈 — 계층 깊이 제한 없음: 모든 이슈가 자식을 가질 수 있다.
              상위 항목 필드를 끄면 계층 UI 전체(브레드크럼·상위 Select·하위 이슈)를 숨긴다 */}
          {issue && fields.parent.visible ? (
            <section className="issue-relations" data-testid="issue-children">
              <div className="issue-relations-head">
                <h4>
                  하위 이슈{" "}
                  {children.length > 0 ? (
                    <span className="issue-relations-count">
                      (완료 {doneChildren}/{children.length})
                    </span>
                  ) : null}
                </h4>
                <Button
                  variant="ghost"
                  size="small"
                  aria-expanded={subtaskFormOpen}
                  iconBefore={<Plus size={14} />}
                  onClick={() => setSubtaskFormOpen((open) => !open)}
                >
                  하위 이슈
                </Button>
              </div>
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
                      <span className="status-cell">
                        <StatusGlyph status={child.status} statuses={statuses} />
                        <Lozenge appearance={statusAppearance(statuses, child.status)}>
                          {statusName(statuses, child.status)}
                        </Lozenge>
                      </span>
                    </button>
                    {grandChildrenOf(child.id).length > 0 ? (
                      <ul className="issue-relation-list issue-relation-nested" aria-label={`${child.key}의 하위 이슈`}>
                        {grandChildrenOf(child.id).map((grand) => (
                          <li key={grand.id}>
                            <button
                              type="button"
                              className="issue-relation-row"
                              onClick={() => switchIssue(grand.key)}
                            >
                              <IssueTypeGlyph type={grand.type} />
                              <span className="issue-key-cell">{grand.key}</span>
                              <span className="issue-relation-title">{grand.title}</span>
                              <span className="status-cell">
                                <StatusGlyph status={grand.status} statuses={statuses} />
                                <Lozenge appearance={statusAppearance(statuses, grand.status)}>
                                  {statusName(statuses, grand.status)}
                                </Lozenge>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
              {subtaskFormOpen ? (
                <form
                  className="issue-relation-add"
                  onSubmit={handleSubtaskSubmit}
                  // Esc는 모달까지 올라가면 모달이 닫힌다 — 폼만 닫고 멈춘다
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.stopPropagation();
                    setSubtaskFormOpen(false);
                  }}
                >
                  <Select
                    label="하위 타입"
                    value={childType}
                    options={childTypeOptions}
                    onValueChange={setChildType}
                  />
                  <TextField
                    label="하위 이슈 추가"
                    placeholder="하위 작업 제목"
                    value={subtaskDraft}
                    autoFocus
                    onChange={(e) => setSubtaskDraft(e.target.value)}
                  />
                  <Button type="submit" size="small" disabled={!subtaskDraft.trim()}>
                    추가
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => setSubtaskFormOpen(false)}
                  >
                    취소
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}

          {/* 이슈 링크 — 차단함/차단됨/관련 */}
          {fields.links.visible ? (
          <section className="issue-relations" data-testid="issue-links">
            <div className="issue-relations-head">
              <h4>링크</h4>
              <Button
                variant="ghost"
                size="small"
                aria-expanded={linkFormOpen}
                iconBefore={<Plus size={14} />}
                onClick={() => setLinkFormOpen((open) => !open)}
              >
                링크
              </Button>
            </div>
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
                          <span className="status-cell">
                            <StatusGlyph status={other.status} statuses={statuses} />
                            <Lozenge appearance={statusAppearance(statuses, other.status)}>
                              {statusName(statuses, other.status)}
                            </Lozenge>
                          </span>
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
            {linkFormOpen ? (
            <div
              className="issue-link-add"
              ref={linkFormRef}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                setLinkFormOpen(false);
              }}
            >
              <Select
                label="종류"
                value={linkKind}
                options={linkKindOptions(linkTypes)}
                onValueChange={(v) => setLinkKind(v)}
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
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={() => setLinkFormOpen(false)}
              >
                취소
              </Button>
            </div>
            ) : null}
          </section>
          ) : null}
        </div>
        <aside className="issue-props">
          {isBlocked ? (
            <Lozenge appearance="danger" data-testid="issue-blocked-lozenge">
              차단됨
            </Lozenge>
          ) : null}
          {/* 속성 패널의 시각 라벨은 아이콘 + 텍스트다 — DS 라벨은 접근 이름으로만 남긴다 */}
          <div className="alm-field">
            <FieldLabel field="type">타입</FieldLabel>
            <Select
              label="타입"
              className="visually-hidden-label"
              value={issue.type}
              // 프로젝트 설정의 활성 타입만 — 현재 값이 비활성이어도 표시를 위해 포함
              options={issueTypes
                .filter((t) => enabledTypes.includes(t.id) || t.id === issue.type)
                .map((t) => ({ value: t.id, label: t.name }))}
              onValueChange={(v) => void applyPatch({ type: v }, "타입을 변경했습니다")}
            />
          </div>
          {/* DS Select의 옵션 렌더는 문자열만 받는다 — 글리프는 트리거 왼쪽에 둔다 */}
          <div className="alm-field">
            <FieldLabel field="status">상태</FieldLabel>
            <div className="issue-status-field">
              <StatusGlyph status={issue.status} statuses={statuses} size={16} />
              <Select
                label="상태"
                className="visually-hidden-label"
                value={issue.status}
                options={statuses.map((s) => ({ value: s.id, label: s.name }))}
                onValueChange={(v) => void applyPatch({ status: v }, "상태를 변경했습니다")}
              />
            </div>
          </div>
          {/* 해결은 완료 카테고리에서만 의미가 있다 — 지라도 완료 전이 화면에서만 묻는다 */}
          {fields.resolution.visible && statusKind(statuses, issue.status) === "complete" ? (
            <div className="alm-field">
              <FieldLabel field="resolution">해결</FieldLabel>
              <Select
                label="해결"
                className="visually-hidden-label"
                value={issue.resolution ?? "done"}
                options={RESOLUTIONS.map((r) => ({ value: r, label: RESOLUTION_LABELS[r] }))}
                onValueChange={(v) =>
                  void applyPatch({ resolution: v as IssueResolution }, "해결을 변경했습니다")
                }
              />
            </div>
          ) : null}
          {issue && fields.parent.visible ? (
            <div className="alm-field">
              <FieldLabel field="parent">상위 항목</FieldLabel>
              <Select
                label="상위 항목"
                className="visually-hidden-label"
                value={issue.parentId ?? NO_PARENT}
                options={[
                  { value: NO_PARENT, label: "없음" },
                  ...parentCandidates.map((p) => ({ value: p.id, label: `${p.key} ${p.title}` })),
                ]}
                onValueChange={(v) => void handleParentChange(v)}
              />
            </div>
          ) : null}
          {fields.assignee.visible ? (
          /* 담당자는 이름만으로는 누군지 잘 안 붙는다 — 지라처럼 얼굴을 트리거 왼쪽에 세운다
             (DS Select 옵션은 문자열만 받으므로 상태 필드와 같은 방식) */
          <div className="alm-field">
            <FieldLabel field="assignee">담당자</FieldLabel>
            <div className="issue-assignee-field">
            {issue.assigneeId ? (
              <UserAvatar
                className="issue-assignee-face"
                user={userOf(issue.assigneeId)}
                name={userName(issue.assigneeId)}
                size="small"
              />
            ) : (
              <span className="issue-assignee-face issue-assignee-empty" aria-hidden="true">
                <UserRound size={14} />
              </span>
            )}
            <Select
              label="담당자"
              className="visually-hidden-label"
              value={issue.assigneeId ?? UNASSIGNED}
              options={[
                { value: UNASSIGNED, label: "미지정" },
                ...users.map((u) => ({ value: u.id, label: u.name })),
              ]}
              onValueChange={(v) =>
                void applyPatch({ assigneeId: v === UNASSIGNED ? null : v }, "담당자를 변경했습니다")
              }
            />
            </div>
          </div>
          ) : null}
          {fields.priority.visible ? (
          <div className="alm-field">
            <FieldLabel field="priority">우선순위</FieldLabel>
            <Select
              label="우선순위"
              className="visually-hidden-label"
              value={issue.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: priorityName(priorities, p) }))}
              onValueChange={(v) =>
                void applyPatch({ priority: v as IssuePriority }, "우선순위를 변경했습니다")
              }
            />
          </div>
          ) : null}
          {fields.sprint.visible ? (
          <div className="alm-field">
            <FieldLabel field="sprint">스프린트</FieldLabel>
            <Select
              label="스프린트"
              className="visually-hidden-label"
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
          </div>
          ) : null}
          {fields.fixVersion.visible ? (
          <div className="alm-field">
            <FieldLabel field="fixVersion">수정 버전</FieldLabel>
            <Select
              label="수정 버전"
              className="visually-hidden-label"
              value={issue.fixVersionId ?? NO_VERSION}
              options={[
                { value: NO_VERSION, label: "없음" },
                // 보관된 버전은 선택지에서 제외하되, 현재 값이면 표시를 위해 포함
                ...versions
                  .filter((v) => v.status !== "archived" || v.id === issue.fixVersionId)
                  .map((v) => ({ value: v.id, label: v.name })),
              ]}
              onValueChange={(v) =>
                void applyPatch({ fixVersionId: v === NO_VERSION ? null : v }, "수정 버전을 변경했습니다")
              }
            />
          </div>
          ) : null}
          {fields.dueDate.visible ? (
          <div className="alm-field">
            <FieldLabel field="dueDate">마감일</FieldLabel>
            <TextField
              label="마감일"
              className="visually-hidden-label"
              type="date"
              value={issue.dueDate ?? ""}
              onChange={(e) =>
                void applyPatch({ dueDate: e.target.value || null }, "마감일을 저장했습니다")
              }
            />
          </div>
          ) : null}
          {fields.components.visible && componentOptions.length > 0 ? (
            <div className="alm-field">
              <FieldLabel field="components">컴포넌트</FieldLabel>
              <div className="board-settings-checks issue-components-field" role="group" aria-label="컴포넌트">
              {componentOptions.map((c) => {
                const current = issue.componentIds ?? [];
                const checked = current.includes(c.id);
                return (
                  <Checkbox
                    key={c.id}
                    label={c.name}
                    checked={checked}
                    onCheckedChange={() =>
                      void applyPatch(
                        { componentIds: checked ? current.filter((id) => id !== c.id) : [...current, c.id] },
                        checked ? "컴포넌트를 뺐습니다" : "컴포넌트를 붙였습니다",
                      )
                    }
                  />
                );
              })}
              </div>
            </div>
          ) : null}
          {fields.labels.visible ? (
          <div className="alm-field issue-labels-field">
            <FieldLabel field="labels">라벨 추가</FieldLabel>
            <TextField
              label="라벨 추가"
              className="visually-hidden-label"
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
          ) : null}
          {fields.estimate.visible ? (
          <div className="alm-field">
            <FieldLabel field="estimate">예상 시간 (h)</FieldLabel>
            <TextField
              label="예상 시간 (h)"
              className="visually-hidden-label"
              type="number"
              min={0.5}
              step={0.5}
              placeholder="미지정"
              value={estimateDraft}
              onChange={(e) => setEstimateDraft(e.target.value)}
              onBlur={() => void handleEstimateBlur()}
            />
          </div>
          ) : null}
          {fields.estimate.visible && (loggedHours > 0 || issue.estimateHours !== null) ? (
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
          <div className="issue-danger-actions">
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                void (async () => {
                  try {
                    await archiveIssue(issue.id);
                    toast({ title: `${issue.key}을(를) 보관했습니다`, appearance: "success" });
                    onClose();
                    await onIssueChanged();
                  } catch (error) {
                    toast({
                      title: "보관 실패",
                      description: error instanceof Error ? error.message : String(error),
                      appearance: "danger",
                    });
                  }
                })()
              }
            >
              보관
            </Button>
            <Button variant="danger" size="small" onClick={() => setConfirmingDelete(true)}>
              이슈 삭제
            </Button>
          </div>
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
                      avatar={
                        <UserAvatar
                          user={userOf(comment.authorId)}
                          name={userName(comment.authorId)}
                          size="small"
                        />
                      }
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
                          <RichTextEditor
                            label="코멘트 수정"
                            value={commentEditDraft}
                            onChange={setCommentEditDraft}
                            users={users}
                            minHeight={72}
                            autoFocus
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
                        <RichTextView html={comment.body} />
                      )}
                    </CommentBlock>
                  );
                })}
                {comments.length === 0 ? (
                  <p className="issue-comment-empty">아직 코멘트가 없습니다</p>
                ) : null}
                <form className="issue-comment-form" onSubmit={handleCommentSubmit}>
                  <RichTextEditor
                    label="코멘트"
                    value={commentDraft}
                    onChange={setCommentDraft}
                    users={users}
                    placeholder="코멘트를 입력하세요 — @로 멘션"
                    minHeight={72}
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
                        <UserAvatar
                          user={userOf(worklog.authorId)}
                          name={userName(worklog.authorId)}
                          size="small"
                        />
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
