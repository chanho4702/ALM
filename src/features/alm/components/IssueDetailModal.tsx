import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { Banner, Button, Checkbox, Comment as CommentBlock, InlineEdit, Lozenge, Modal, ProgressBar, Select, Tabs, Tag, TextField, useToast } from "@chanho/react";
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
  cloneIssue,
  deleteWorklog,
  getCurrentUser,
  getIssueByKey,
  findIssues,
  getMyProjectRole,
  listActivity,
  aggregateIssues,
  listChildren,
  listChildrenPage,
  listComments,
  listIssueAncestors,
  listIssueLinks,
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
import { errorStatus } from "../store/mapping";
import { settleWithConcurrency } from "../store/concurrency";
import { recordIssueView } from "../store/uiStore";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PriorityGlyph } from "./PriorityGlyph";
import { ResolutionGlyph } from "./ResolutionGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { useIssueTypes } from "./useIssueTypes";
import { Copy, Lock, Plus, UserRound } from "lucide-react";
import { useLinkTypes } from "./useLinkTypes";
import { LINK_KIND_DEFAULT, linkKindOptions, parseLinkKind, type LinkKind } from "./linkKinds";
import { IssueAttachments } from "./IssueAttachments";
import { IssueWebLinks } from "./IssueWebLinks";
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

/**
 * 상위 항목·링크 대상 후보를 한 번에 보여 줄 수 — 프로젝트 전체를 읽지 않고 최근 수정 순으로 이만큼만 받는다.
 * 후보가 더 있으면 검색 칸이 나타나 서버 검색(키·제목·설명)으로 좁힌다.
 */
export const CANDIDATE_LIMIT = 50;
const CANDIDATE_SEARCH_DELAY_MS = 250;

interface CandidatePool {
  items: Issue[];
  total: number;
}

/**
 * 후보 목록 — 프로젝트 안에서 검색어(비면 최근 수정 순)로 서버 검색 한 페이지만 읽는다. 늦게 온 응답은 버린다.
 * `enabled`가 거짓이면 묻지 않는다(링크 폼이 접혀 있을 때).
 */
function useCandidatePool(projectId: string | undefined, query: string, enabled: boolean): CandidatePool {
  const [pool, setPool] = useState<CandidatePool>({ items: [], total: 0 });
  useEffect(() => {
    if (!projectId || !enabled) return;
    let cancelled = false;
    const text = query.trim();
    const timer = setTimeout(
      () => {
        void findIssues(
          { projectIds: [projectId], text: text || undefined },
          { page: 0, size: CANDIDATE_LIMIT },
          { field: "updated", dir: "desc" },
        )
          .then((page) => {
            if (!cancelled) setPool({ items: page.items, total: page.total });
          })
          .catch(() => {
            if (!cancelled) setPool({ items: [], total: 0 });
          });
      },
      text ? CANDIDATE_SEARCH_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, query, enabled]);
  return pool;
}

/** 모달이 들고 있는 입력 초안 — 충돌 해소 때 누른 순간의 값으로 저장 본문을 다시 만든다 */
interface EditDrafts {
  description: string;
  estimate: string;
}

export interface IssueDetailModalProps {
  /** "ALM-1" 형식 이슈 키 (?issue= 쿼리 값) */
  issueKey: string;
  /** 모달 닫기 = URL 쿼리 제거 */
  onClose: () => void;
  /** 저장 성공 후 페이지 재조회 (모달을 연 채 목록 반영) */
  onIssueChanged: () => void | Promise<void>;
}

/** 담당자 Select 트리거 id — 단축키 `a`가 찾는다 */
const ASSIGNEE_TRIGGER_ID = "issue-detail-assignee";

export function IssueDetailModal({ issueKey, onClose, onIssueChanged }: IssueDetailModalProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [canEdit, setCanEdit] = useState(true);
  /** 프로젝트 관리자 — 남의 댓글·워크로그도 지울 수 있다(서버 규칙: 작성자 또는 프로젝트 ADMIN) */
  const [isProjectAdmin, setIsProjectAdmin] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** 하단 기록 탭 — 단축키 `m`이 코멘트 탭으로 옮긴다 */
  const [historyTab, setHistoryTab] = useState("comments");
  /** 단축키가 "이 모달이 맨 위인가"를 판정할 모달 안 기준 요소 */
  const shortcutAnchor = useRef<HTMLDivElement | null>(null);
  /** 상위 항목 경로(루트 먼저) — 부모를 한 단계씩 읽는다(프로젝트 전체를 읽지 않는다) */
  const [ancestors, setAncestors] = useState<Issue[]>([]);
  /** 하위의 하위 — 하위 이슈마다 그 자식만 읽는다 */
  const [grandChildren, setGrandChildren] = useState<Record<string, Issue[]>>({});
  /** 하위 이슈가 한 페이지(200건)를 넘을 때만 — 전체 건수·완료 수는 서버 집계로 센다 */
  const [childSummary, setChildSummary] = useState<{ total: number; done: number } | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
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
  /**
   * 저장 충돌(409) — 편집을 시작한 뒤 다른 사람이 먼저 저장했다. 내 변경은 버리지 않고 여기 들고 있다가
   * 사용자가 "최신 내용 불러오기"(버림) 또는 "내 변경 다시 적용"(최신 버전 기준 재저장)을 직접 고른다.
   */
  const [conflict, setConflict] = useState<{
    save: (version: number, drafts: EditDrafts) => Promise<Issue>;
    successTitle: string;
  } | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
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

  /**
   * 관계(하위 이슈·하위의 하위·링크)·워크로그 재조회 — 이 이슈에 딸린 것만 읽는다.
   * 하위의 하위는 하위 이슈마다 자식 검색 1번(동시성 상한)이다. 하나가 실패해도 나머지는 그린다.
   */
  const refreshRelations = async (issueId: string) => {
    const [childPage, linkList, worklogList] = await Promise.all([
      listChildrenPage(issueId),
      listIssueLinks(issueId),
      listWorklogs(issueId),
    ]);
    const childList = childPage.items;
    setChildren(childList);
    if (childPage.truncated) {
      const [all, open] = await Promise.all([
        aggregateIssues({ parentId: issueId }, "statusCategory"),
        aggregateIssues({ parentId: issueId, openOnly: true }, "statusCategory"),
      ]).catch(() => [null, null] as const);
      setChildSummary(all && open ? { total: all.total, done: all.total - open.total } : { total: childPage.total, done: 0 });
    } else {
      setChildSummary(null);
    }
    setLinks(linkList);
    setWorklogs(worklogList);
    const nested = await settleWithConcurrency(childList, (child) => listChildren(child.id));
    setGrandChildren(
      Object.fromEntries(
        childList.map((child, index) => {
          const result = nested[index];
          return [child.id, result.status === "fulfilled" ? result.value : []];
        }),
      ),
    );
  };

  // 수정 버전·컴포넌트 후보와 내 역할 — 프로젝트가 바뀔 때만 다시 읽는다(모달 수명 동안 한 번)
  useEffect(() => {
    if (!issue) return;
    let cancelled = false;
    void Promise.all([
      listVersions(issue.projectId),
      getMyProjectRole(issue.projectId),
      listComponents(issue.projectId).catch(() => []),
    ]).then(([list, role, componentList]) => {
      if (cancelled) return;
      setVersions(list);
      setCanEdit(role !== null && role !== "viewer");
      setIsProjectAdmin(role === "admin");
      setComponentOptions(componentList);
    });
    return () => {
      cancelled = true;
    };
  }, [issue?.projectId]);

  // 상위 항목 경로 — 이슈나 그 부모가 바뀔 때만 다시 따라간다
  useEffect(() => {
    if (!issue) return;
    if (!issue.parentId) {
      setAncestors([]);
      return;
    }
    let cancelled = false;
    void listIssueAncestors(issue.id, issue.parentId)
      .then((list) => {
        if (!cancelled) setAncestors(list);
      })
      .catch(() => {
        if (!cancelled) setAncestors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [issue?.id, issue?.parentId]);

  const parentPool = useCandidatePool(issue?.projectId, parentQuery, Boolean(issue));
  const linkPool = useCandidatePool(issue?.projectId, linkQuery, linkFormOpen);

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
      // 홈 For you "최근 본" 탭의 기록 — 상세를 실제로 연 이슈만(찾지 못한 키는 위에서 빠진다)
      void recordIssueView(currentUser.id, found.key);
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
      await refreshRelations(found.id);
    })();
    return () => {
      cancelled = true;
    };
    // issueKey가 바뀔 때만 재조회 (toast/onClose는 재조회 트리거가 아니다)
  }, [issueKey]);

  const userOf = (id: string) => users.find((u) => u.id === id);
  const userName = (id: string) => userOf(id)?.name ?? "알 수 없음";

  /** 입력 중인 초안의 최신 값 — 충돌 해소("다시 적용")는 누른 순간의 초안을 저장해야 한다(실패 당시 값이 아니라) */
  const draftsRef = useRef<EditDrafts>({ description: descriptionDraft, estimate: estimateDraft });
  draftsRef.current = { description: descriptionDraft, estimate: estimateDraft };

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
    const id = issue.id;
    await saveEdit((version) => updateIssue(id, patch, version), successTitle, "저장 실패");
  };

  /**
   * 편집 저장 공통 — 이 모달이 이슈를 읽었을 때의 버전으로 보낸다. 409면 저장 함수를 들고 충돌 배너를 띄운다.
   * 저장 함수는 초안을 인자로 받는다 — 다시 적용할 때 그 순간의 초안(설명·예상 시간)으로 다시 만든다.
   */
  const saveEdit = async (
    save: (version: number, drafts: EditDrafts) => Promise<Issue>,
    successTitle: string,
    failureTitle: string,
  ) => {
    if (!issue) return;
    try {
      const updated = await save(issue.version, draftsRef.current);
      await afterSaved(updated, successTitle);
    } catch (error) {
      if (errorStatus(error) === 409) {
        setConflict({ save, successTitle });
        return;
      }
      toast({
        title: failureTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const afterSaved = async (updated: Issue, successTitle: string) => {
    setIssue(updated);
    await refreshLogs(updated.id); // 상태 등 변경 → 활동 탭 즉시 반영
    await onIssueChanged();
    toast({ title: successTitle, appearance: "success" });
  };

  /** 충돌 해소 ① — 최신 내용을 불러오고 내 변경(설명·예상 시간 입력 포함)은 버린다 */
  const handleConflictReload = async () => {
    if (!issue) return;
    setResolvingConflict(true);
    try {
      const latest = await getIssueByKey(issue.key);
      if (!latest) throw new Error(`이슈를 찾을 수 없습니다: ${issue.key}`);
      setIssue(latest);
      setDescriptionDraft(latest.description);
      setEstimateDraft(latest.estimateHours === null ? "" : String(latest.estimateHours));
      setConflict(null);
      await refreshLogs(latest.id);
      await onIssueChanged();
    } catch (error) {
      toast({
        title: "최신 내용을 불러오지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setResolvingConflict(false);
    }
  };

  /** 충돌 해소 ② — 최신 버전을 기준으로 내 변경만 다시 저장한다(내가 안 건드린 필드는 최신 값 유지) */
  const handleConflictReapply = async () => {
    if (!issue || !conflict) return;
    setResolvingConflict(true);
    try {
      const latest = await getIssueByKey(issue.key);
      if (!latest) throw new Error(`이슈를 찾을 수 없습니다: ${issue.key}`);
      const updated = await conflict.save(latest.version, draftsRef.current);
      setConflict(null);
      await afterSaved(updated, conflict.successTitle);
    } catch (error) {
      // 그 사이 또 다른 저장이 끼었으면 충돌 배너를 유지한다 — 내 변경은 계속 들고 있다
      if (errorStatus(error) !== 409) {
        toast({
          title: "다시 적용하지 못했습니다",
          description: error instanceof Error ? error.message : String(error),
          appearance: "danger",
        });
      }
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleDescriptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issue) return;
    const id = issue.id;
    await saveEdit(
      (version, drafts) => updateIssue(id, { description: drafts.description }, version),
      "설명을 저장했습니다",
      "저장 실패",
    );
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
    const id = issue.id;
    const parentId = value === NO_PARENT ? null : value;
    await saveEdit((version) => setIssueParent(id, parentId, version), "상위 항목을 변경했습니다", "상위 항목 변경 실패");
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
      await refreshRelations(issue.id);
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
      await refreshRelations(issue.id);
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
      await refreshRelations(issue.id);
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
    const id = issue.id;
    await saveEdit(
      (version, drafts) =>
        updateIssue(id, { estimateHours: drafts.estimate.trim() === "" ? null : Number(drafts.estimate) }, version),
      "예상 시간을 저장했습니다",
      "저장 실패",
    );
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
      await refreshRelations(issue.id);
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
      await refreshRelations(issue.id);
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

  // 지라 이슈 보기 단축키 — 이 모달이 유일하게 열린 모달이고 입력 중이 아닐 때만(useKeyboardShortcuts)
  const inDialog = (selector: string) =>
    shortcutAnchor.current?.closest("[role='dialog']")?.querySelector<HTMLElement>(selector) ?? null;
  useKeyboardShortcuts(
    {
      e: () => inDialog("button[aria-label='제목 편집']")?.click(),
      a: () => {
        const trigger = inDialog(`#${ASSIGNEE_TRIGGER_ID}`);
        if (!trigger) return;
        trigger.focus();
        // 지라처럼 담당자 선택지를 바로 펼친다 — Radix Select 트리거는 ArrowDown으로 열린다
        trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      },
      i: () => {
        if (!issue || !me || !fields.assignee.visible || issue.assigneeId === me.id) return;
        void applyPatch({ assigneeId: me.id }, "나에게 할당했습니다");
      },
      l: () => inDialog(".issue-labels-field input")?.focus(),
      m: () => {
        setHistoryTab("comments");
        // 탭이 바뀐 다음 그려진 에디터에 포커스한다
        setTimeout(() => inDialog(".issue-comment-form [contenteditable='true']")?.focus(), 0);
      },
    },
    { dialogRef: shortcutAnchor },
  );

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

  /**
   * 계층 깊이 제한 없음 — 상위 항목 후보는 서버 검색 한 페이지에서 자기 자신과 아는 자손(하위·하위의 하위)을 뺀 것.
   * 더 깊은 자손을 고르면 스토어가 순환으로 거절한다(토스트). 현재 부모는 검색 결과에 없어도 옵션에 남긴다.
   */
  const knownDescendants = new Set<string>([
    ...children.map((c) => c.id),
    ...Object.values(grandChildren).flatMap((list) => list.map((g) => g.id)),
  ]);
  const currentParent = ancestors.at(-1);
  const parentCandidates = [
    ...(currentParent && !parentPool.items.some((i) => i.id === currentParent.id) ? [currentParent] : []),
    ...parentPool.items,
  ].filter((i) => i.id !== issue.id && !knownDescendants.has(i.id));
  const parentSearchVisible = parentPool.total > parentPool.items.length || parentQuery !== "";
  const linkCandidates = linkPool.items.filter((i) => i.id !== issue.id);
  const linkSearchVisible = linkPool.total > linkPool.items.length || linkQuery !== "";
  const grandChildrenOf = (id: string) => grandChildren[id] ?? [];
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
      <div className="issue-detail-header" ref={shortcutAnchor}>
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
      {conflict ? (
        <Banner variant="warning" className="issue-conflict-banner">
          <div className="issue-conflict">
            <p className="issue-conflict-text">
              다른 사용자가 이 이슈를 먼저 수정해 내 변경을 저장하지 않았습니다. 입력한 내용은 그대로 남아 있습니다 —
              어떻게 할지 고르세요.
            </p>
            <div className="issue-conflict-actions">
              <Button size="small" variant="secondary" disabled={resolvingConflict} onClick={() => void handleConflictReload()}>
                최신 내용 불러오기
              </Button>
              <Button size="small" variant="primary" disabled={resolvingConflict} onClick={() => void handleConflictReapply()}>
                내 변경 다시 적용(최신 버전 기준)
              </Button>
            </div>
          </div>
        </Banner>
      ) : null}
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
                      (완료 {childSummary ? childSummary.done : doneChildren}/{childSummary ? childSummary.total : children.length})
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
                        <StatusGlyph status={child.status} statuses={statuses} variant="icon" />
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
                                <StatusGlyph status={grand.status} statuses={statuses} variant="icon" />
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
              {childSummary ? (
                <p className="issue-relations-more" role="note">
                  하위 이슈 {childSummary.total}건 중 {children.length}건만 보입니다 — 나머지는 검색에서 찾아 주세요.
                </p>
              ) : null}
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
                    {group.items.map(({ link, other, restricted }) => (
                      <li key={link.id} className="issue-link-item">
                        {restricted ? (
                          /* 반대편 프로젝트를 볼 수 없다 — 서버가 키·타입·상태만 남긴 축약본이라 열지 않고 잠금으로 표시한다 */
                          <span className="issue-relation-row is-restricted" data-testid="issue-link-restricted">
                            <Lock size={14} aria-hidden />
                            <span className="issue-key-cell">{other.key}</span>
                            <span className="issue-relation-title">볼 수 없는 이슈</span>
                          </span>
                        ) : (
                        <button
                          type="button"
                          className="issue-relation-row"
                          onClick={() => switchIssue(other.key)}
                        >
                          <IssueTypeGlyph type={other.type} />
                          <span className="issue-key-cell">{other.key}</span>
                          <span className="issue-relation-title">{other.title}</span>
                          <span className="status-cell">
                            <StatusGlyph status={other.status} statuses={statuses} variant="icon" />
                            <Lozenge appearance={statusAppearance(statuses, other.status)}>
                              {statusName(statuses, other.status)}
                            </Lozenge>
                          </span>
                        </button>
                        )}
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
                  ...linkCandidates.map((i) => ({ value: i.id, label: `${i.key} ${i.title}` })),
                ]}
                onValueChange={(v) => setLinkTargetId(v === NO_PARENT ? null : v)}
              />
              {linkSearchVisible ? (
                <TextField
                  type="search"
                  label="대상 이슈 검색"
                  placeholder="키·제목으로 찾기"
                  value={linkQuery}
                  onChange={(event) => setLinkQuery(event.target.value)}
                />
              ) : null}
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
          {fields.links.visible ? <IssueWebLinks issueId={issue.id} canEdit={canEdit} /> : null}
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
                .map((t) => ({
                  value: t.id,
                  label: t.name,
                  icon: <IssueTypeGlyph type={t.id} types={issueTypes} variant="icon" />,
                }))}
              onValueChange={(v) => void applyPatch({ type: v }, "타입을 변경했습니다")}
            />
          </div>
          {/* 글리프는 DS Select의 옵션 icon 슬롯이 목록·트리거 양쪽에 그린다(react 0.11.0) —
              전엔 트리거 왼쪽에 손으로 세웠다(.issue-status-field) */}
          <div className="alm-field">
            <FieldLabel field="status">상태</FieldLabel>
            <Select
              label="상태"
              className="visually-hidden-label"
              value={issue.status}
              options={statuses.map((s) => ({
                value: s.id,
                label: s.name,
                icon: <StatusGlyph status={s.id} statuses={statuses} variant="icon" />,
              }))}
              onValueChange={(v) => void applyPatch({ status: v }, "상태를 변경했습니다")}
            />
          </div>
          {/* 해결은 완료 카테고리에서만 의미가 있다 — 지라도 완료 전이 화면에서만 묻는다 */}
          {fields.resolution.visible && statusKind(statuses, issue.status) === "complete" ? (
            <div className="alm-field">
              <FieldLabel field="resolution">해결</FieldLabel>
              <Select
                label="해결"
                className="visually-hidden-label"
                value={issue.resolution ?? "done"}
                options={RESOLUTIONS.map((r) => ({
                  value: r,
                  label: RESOLUTION_LABELS[r],
                  icon: <ResolutionGlyph resolution={r} variant="icon" />,
                }))}
                onValueChange={(v) =>
                  void applyPatch({ resolution: v as IssueResolution }, "해결을 변경했습니다")
                }
              />
            </div>
          ) : null}
          {/* 해결일은 서버가 찍는 읽기 전용 값 — 해결된 이슈에만 줄이 선다(없으면 아예 감춘다) */}
          {issue.resolvedAt ? (
            <div className="alm-field">
              <FieldLabel field="resolved" ariaHidden={false}>
                해결일
              </FieldLabel>
              <span className="alm-field-readonly">{formatDateTime(issue.resolvedAt)}</span>
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
              {parentSearchVisible ? (
                <TextField
                  type="search"
                  label="상위 항목 검색"
                  placeholder="키·제목으로 찾기"
                  value={parentQuery}
                  onChange={(event) => setParentQuery(event.target.value)}
                />
              ) : null}
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
              id={ASSIGNEE_TRIGGER_ID}
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
              options={PRIORITIES.map((p) => ({
                value: p,
                label: priorityName(priorities, p),
                icon: <PriorityGlyph defs={priorities} priority={p} size={14} variant="icon" />,
              }))}
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
            {canEdit ? (
              <Button
                variant="secondary"
                size="small"
                iconBefore={<Copy size={14} />}
                onClick={() =>
                  void (async () => {
                    try {
                      const copy = await cloneIssue(issue.id);
                      toast({ title: `${issue.key}을(를) ${copy.key}(으)로 복제했습니다`, appearance: "success" });
                      await onIssueChanged();
                      switchIssue(copy.key);
                    } catch (error) {
                      toast({
                        title: "복제 실패",
                        description: error instanceof Error ? error.message : String(error),
                        appearance: "danger",
                      });
                    }
                  })()
                }
              >
                복제
              </Button>
            ) : null}
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
        value={historyTab}
        onValueChange={setHistoryTab}
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
                      // 수정은 본인만, 삭제는 본인 또는 프로젝트 관리자. 수정 중엔 편집 폼의 저장/취소가 대신한다
                      actions={
                        editing || !(mine || isProjectAdmin)
                          ? undefined
                          : [
                              ...(mine ? [{ label: "수정", onClick: () => startCommentEdit(comment) }] : []),
                              {
                                label: "삭제",
                                danger: true,
                                onClick: () => void handleCommentDelete(comment.id),
                              },
                            ]
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
                        {(me !== null && worklog.authorId === me.id) || isProjectAdmin ? (
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
