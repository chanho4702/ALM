import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  Lozenge,
  Modal,
  Select,
  SkeletonListItem,
  SkeletonText,
  Tabs,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import { AlarmClock, Ban, Check, Copy, ExternalLink, Inbox, RotateCw } from "lucide-react";
import type { Issue, ProjectRole, TriageQueueState, TriageSettings, User, WorkflowStatus } from "../store/types";
import {
  acceptTriage,
  declineTriage,
  duplicateTriage,
  getMyProjectRole,
  getTriageSettings,
  listProjectMembers,
  listProjectStatuses,
  listTriage,
  listUsers,
  searchIssues,
  snoozeTriage,
} from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { BUILTIN_PRIORITY_IDS, priorityName, statusKind } from "../components/labels";
import { formatDateTime, relTime } from "../components/time";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { StatusGlyph } from "../components/StatusGlyph";
import { PriorityGlyph } from "../components/PriorityGlyph";
import { ValueWithIcon } from "../components/ValueWithIcon";
import { UserAvatar } from "../components/UserAvatar";
import { RichTextView } from "../components/editor/RichTextView";
import { usePriorities } from "../components/usePriorities";
import { useIssueModal } from "../components/useIssueModal";
import { useKeyboardShortcuts } from "../components/useKeyboardShortcuts";
import { notifyTriageChanged } from "../components/useTriageEnabled";
import "./triage.css";

/** Select 센티널 — 담당자를 바꾸지 않는다(Radix Select는 빈 문자열 value 금지) */
const KEEP_ASSIGNEE = "__keep__";

const TAB_LABELS: Record<TriageQueueState, string> = { pending: "대기", snoozed: "보류", all: "전체" };
const TABS: TriageQueueState[] = ["pending", "snoozed", "all"];

type Dialog = "accept" | "duplicate" | "decline" | "snooze" | null;

/** 실패 사유 — 503은 권한 문제처럼 보이지 않게 따로 말한다 */
function describeError(error: unknown): string {
  if (errorStatus(error) === 503) return "ALM 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
  return error instanceof Error ? error.message : String(error);
}

/** 보류 프리셋 — 지금 기준 미래 시각(로컬 시간) */
function snoozePresets(now = new Date()): { id: string; label: string; at: Date }[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  monday.setDate(now.getDate() + daysToMonday);
  monday.setHours(9, 0, 0, 0);
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return [
    { id: "tomorrow", label: "내일 아침 9시", at: tomorrow },
    { id: "monday", label: "다음 주 월요일", at: monday },
    { id: "week", label: "1주 뒤", at: week },
  ];
}

/**
 * 트리아지 인박스(V35) — 리니어 Triage 대응. 들어온 이슈(열람자가 만든 것·편집자가 보낸 것)를
 * 오래된 것부터 하나씩 수락·중복·거절·보류한다. 단축키 j/k·↑↓ 이동, 1 수락, 2 중복, 3 거절, H 보류.
 */
export function TriageInboxPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const priorities = usePriorities();

  const [tab, setTab] = useState<TriageQueueState>("pending");
  const [settings, setSettings] = useState<TriageSettings | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignable, setAssignable] = useState<User[] | null>(null);
  const [role, setRole] = useState<ProjectRole | null | undefined>(undefined);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    try {
      const [nextSettings, list] = await Promise.all([getTriageSettings(projectId), listTriage(projectId, tab)]);
      if (mine !== generation.current) return;
      setSettings(nextSettings);
      setIssues(list);
      setLoadError(null);
      setSelectedId((current) => {
        if (current && list.some((i) => i.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } catch (error) {
      if (mine !== generation.current) return;
      setLoadError(describeError(error));
    }
  }, [projectId, tab]);

  useEffect(() => {
    setIssues(null);
    setLoadError(null);
    void reload();
  }, [reload]);

  // 표시용 메타 — 실패해도 대기열은 그대로 보인다(이름 폴백)
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void listProjectStatuses(projectId)
      .then((list) => !cancelled && setStatuses(list))
      .catch(() => undefined);
    void listUsers()
      .then((list) => !cancelled && setUsers(list))
      .catch(() => undefined);
    void listProjectMembers(projectId)
      .then((rows) => !cancelled && setAssignable(rows.filter((r) => r.role !== "viewer").map((r) => r.user)))
      .catch(() => !cancelled && setAssignable(null));
    void getMyProjectRole(projectId)
      .then((value) => !cancelled && setRole(value))
      .catch(() => !cancelled && setRole(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const selectedIndex = issues ? issues.findIndex((i) => i.id === selectedId) : -1;
  const selected = selectedIndex >= 0 && issues ? issues[selectedIndex] : null;
  // 역할을 못 읽었으면(undefined/null) 버튼을 막지 않는다 — 판정은 서버가 하고 거부 사유를 토스트로 보인다
  const canEdit = role !== "viewer";
  const canAct = Boolean(selected) && canEdit && !busy;

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  /** 처리 뒤 — 같은 자리의 다음 이슈를 고른다(리니어처럼 연달아 처리) */
  const runAction = async (successTitle: string, action: () => Promise<unknown>) => {
    if (!projectId || !issues) return false;
    const index = selectedIndex;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast({ title: "처리하지 못했습니다", description: describeError(error), appearance: "danger" });
      setBusy(false);
      return false;
    }
    toast({ title: successTitle, appearance: "success" });
    notifyTriageChanged(projectId);
    const remaining = issues.filter((_, i) => i !== index);
    setSelectedId(remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.id ?? null);
    setDialog(null);
    setBusy(false);
    await reload();
    return true;
  };

  const move = (delta: number) => {
    if (!issues || issues.length === 0) return;
    const next = selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), issues.length - 1);
    setSelectedId(issues[next].id);
  };

  const open = (which: Exclude<Dialog, null>) => {
    if (canAct) setDialog(which);
  };

  useKeyboardShortcuts({
    j: () => move(1),
    k: () => move(-1),
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    "1": () => open("accept"),
    "2": () => open("duplicate"),
    "3": () => open("decline"),
    h: () => open("snooze"),
    H: () => open("snooze"),
    o: () => selected && openIssue(selected.key),
  });

  if (!projectId) return null;

  const counts: Record<TriageQueueState, number | null> = settings
    ? { pending: settings.pending, snoozed: settings.snoozed, all: settings.pending + settings.snoozed }
    : { pending: null, snoozed: null, all: null };

  const body = (() => {
    if (loadError) {
      return (
        <div className="triage-error" role="alert">
          <p>트리아지 대기열을 불러오지 못했습니다 — {loadError}</p>
          <Button variant="secondary" iconBefore={<RotateCw size={14} />} onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      );
    }
    if (issues === null) {
      return (
        <div className="triage-layout">
          <div className="triage-list" aria-busy="true">
            <SkeletonListItem media="icon" lines={2} label="트리아지 대기열 불러오는 중" />
            <SkeletonListItem media="icon" lines={2} />
            <SkeletonListItem media="icon" lines={2} />
          </div>
          <div className="triage-detail">
            <SkeletonText lines={4} />
          </div>
        </div>
      );
    }
    if (issues.length === 0) {
      return (
        <EmptyState
          className="triage-empty"
          media={<Inbox size={40} aria-hidden />}
          title={tab === "snoozed" ? "보류한 이슈가 없습니다" : "트리아지할 이슈가 없습니다"}
          description={
            tab === "snoozed"
              ? "보류한 이슈는 정한 시각이 지나면 다시 대기로 돌아옵니다."
              : "새로 들어온 이슈가 여기 쌓입니다. 수락하면 백로그로, 거절·중복이면 닫힙니다."
          }
        />
      );
    }
    return (
      <div className="triage-layout">
        <ul className="triage-list" aria-label="트리아지 대기열">
          {issues.map((issue) => {
            const reporter = userById.get(issue.reporterId);
            const isSelected = issue.id === selectedId;
            return (
              <li key={issue.id}>
                <button
                  type="button"
                  className={isSelected ? "triage-item is-selected" : "triage-item"}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => setSelectedId(issue.id)}
                  onDoubleClick={() => openIssue(issue.key)}
                >
                  <span className="triage-item-head">
                    <IssueTypeGlyph type={issue.type} />
                    <span className="triage-item-key">{issue.key}</span>
                    {issue.triageState === "snoozed" ? <Lozenge appearance="neutral">보류</Lozenge> : null}
                    <span className="triage-item-time" title={formatDateTime(issue.createdAt)}>
                      {relTime(issue.createdAt)}
                    </span>
                  </span>
                  <span className="triage-item-title">{issue.title}</span>
                  <span className="triage-item-reporter">
                    <UserAvatar user={reporter} name={reporter ? undefined : "알 수 없음"} size="small" />
                    {reporter?.name ?? "알 수 없는 사용자"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {selected ? (
          <TriageDetail
            issue={selected}
            reporter={userById.get(selected.reporterId)}
            priorities={priorities}
            canEdit={canEdit}
            busy={busy}
            onOpenIssue={() => openIssue(selected.key)}
            onAction={open}
          />
        ) : (
          <div className="triage-detail triage-detail-empty">왼쪽에서 이슈를 고르세요.</div>
        )}
      </div>
    );
  })();

  return (
    <>
      <div className="triage-page">
        <header className="triage-header">
          <div className="triage-header-text">
            <h2 className="triage-title">트리아지</h2>
            <span className="triage-count" aria-live="polite">
              {counts.pending === null ? "" : `대기 ${counts.pending}건 · 보류 ${counts.snoozed}건`}
            </span>
          </div>
          <span className="triage-hint">j/k 이동 · 1 수락 · 2 중복 · 3 거절 · H 보류 · o 열기</span>
        </header>

        {settings && !settings.enabled ? (
          <Banner
            variant="warning"
            action={{ label: "트리아지 설정", onClick: () => navigate(`/projects/${projectId}/settings/triage`) }}
          >
            이 프로젝트는 트리아지를 사용하지 않습니다 — 새 이슈는 더 들어오지 않고, 남은 이슈는 여기서 처리할 수 있습니다.
          </Banner>
        ) : null}
        {role === "viewer" ? (
          <Banner variant="info">열람자는 대기열을 볼 수만 있습니다. 처리는 편집자 이상이 합니다.</Banner>
        ) : null}

        <Tabs
          label="트리아지 보기"
          value={tab}
          onValueChange={(value) => {
            setSelectedId(null);
            setTab(value as TriageQueueState);
          }}
          items={TABS.map((value) => ({
            value,
            ariaLabel: TAB_LABELS[value],
            label: (
              <>
                {TAB_LABELS[value]}
                {counts[value] !== null ? <Badge className="triage-tab-badge">{counts[value]}</Badge> : null}
              </>
            ),
            content: value === tab ? body : null,
          }))}
        />
      </div>

      {selected && dialog === "accept" ? (
        <AcceptDialog
          issue={selected}
          statuses={statuses}
          users={assignable ?? users}
          priorities={priorities}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input) => runAction(`${selected.key}을(를) 수락했습니다`, () => acceptTriage(selected.id, input))}
        />
      ) : null}
      {selected && dialog === "duplicate" ? (
        <DuplicateDialog
          issue={selected}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(original, comment) =>
            runAction(`${selected.key}을(를) ${original.key}의 중복으로 닫았습니다`, () =>
              duplicateTriage(selected.id, { duplicateOfIssueId: original.id, comment: comment || undefined }),
            )
          }
        />
      ) : null}
      {selected && dialog === "decline" ? (
        <DeclineDialog
          issue={selected}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(comment) =>
            runAction(`${selected.key}을(를) 거절했습니다`, () =>
              declineTriage(selected.id, { comment: comment || undefined }),
            )
          }
        />
      ) : null}
      {selected && dialog === "snooze" ? (
        <SnoozeDialog
          issue={selected}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(at) =>
            runAction(`${selected.key}을(를) ${formatDateTime(at.toISOString())}까지 보류했습니다`, () =>
              snoozeTriage(selected.id, at.toISOString()),
            )
          }
        />
      ) : null}
      {issueModal}
    </>
  );
}

// ── 상세 패널 ────────────────────────────────────────────────

function TriageDetail({
  issue,
  reporter,
  priorities,
  canEdit,
  busy,
  onOpenIssue,
  onAction,
}: {
  issue: Issue;
  reporter: User | undefined;
  priorities: ReturnType<typeof usePriorities>;
  canEdit: boolean;
  busy: boolean;
  onOpenIssue: () => void;
  onAction: (which: Exclude<Dialog, null>) => void;
}) {
  const disabled = !canEdit || busy;
  return (
    <section className="triage-detail" aria-label={`${issue.key} 상세`}>
      <div className="triage-actions" role="toolbar" aria-label="트리아지 처리">
        <Button
          variant="primary"
          size="medium"
          iconBefore={<Check size={14} />}
          disabled={disabled}
          aria-keyshortcuts="1"
          onClick={() => onAction("accept")}
        >
          수락 <kbd className="triage-kbd">1</kbd>
        </Button>
        <Button
          variant="secondary"
          iconBefore={<Copy size={14} />}
          disabled={disabled}
          aria-keyshortcuts="2"
          onClick={() => onAction("duplicate")}
        >
          중복 <kbd className="triage-kbd">2</kbd>
        </Button>
        <Button
          variant="secondary"
          iconBefore={<Ban size={14} />}
          disabled={disabled}
          aria-keyshortcuts="3"
          onClick={() => onAction("decline")}
        >
          거절 <kbd className="triage-kbd">3</kbd>
        </Button>
        <Button
          variant="secondary"
          iconBefore={<AlarmClock size={14} />}
          disabled={disabled}
          aria-keyshortcuts="H"
          onClick={() => onAction("snooze")}
        >
          보류 <kbd className="triage-kbd">H</kbd>
        </Button>
        <span className="triage-actions-spacer" />
        <Button variant="ghost" iconBefore={<ExternalLink size={14} />} onClick={onOpenIssue}>
          이슈 열기
        </Button>
      </div>

      <div className="triage-detail-head">
        <ValueWithIcon icon={<IssueTypeGlyph type={issue.type} />}>
          <span className="triage-item-key">{issue.key}</span>
        </ValueWithIcon>
        <h3 className="triage-detail-title">{issue.title}</h3>
      </div>

      <dl className="triage-meta">
        <div>
          <dt>보고자</dt>
          <dd>
            <span className="triage-item-reporter">
              <UserAvatar user={reporter} name={reporter ? undefined : "알 수 없음"} size="small" />
              {reporter?.name ?? "알 수 없는 사용자"}
            </span>
          </dd>
        </div>
        <div>
          <dt>우선순위</dt>
          <dd>
            <ValueWithIcon icon={<PriorityGlyph defs={priorities} priority={issue.priority} variant="icon" />}>
              {priorityName(priorities, issue.priority)}
            </ValueWithIcon>
          </dd>
        </div>
        <div>
          <dt>들어온 시각</dt>
          <dd title={formatDateTime(issue.createdAt)}>
            {formatDateTime(issue.createdAt)} ({relTime(issue.createdAt)})
          </dd>
        </div>
      </dl>

      <div className="triage-description">
        <RichTextView html={issue.description ?? ""} emptyText="설명이 없습니다." />
      </div>
    </section>
  );
}

// ── 처리 대화상자 ─────────────────────────────────────────────

function AcceptDialog({
  issue,
  statuses,
  users,
  priorities,
  busy,
  onClose,
  onSubmit,
}: {
  issue: Issue;
  statuses: WorkflowStatus[];
  users: User[];
  priorities: ReturnType<typeof usePriorities>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { status?: string; assigneeId?: string; priority?: string; comment?: string }) => void;
}) {
  // 완료 의미 상태로는 수락할 수 없다 — 끝내려면 거절·중복
  const open = statuses.filter((s) => statusKind(statuses, s.id) !== "complete");
  const firstNew = open.find((s) => statusKind(statuses, s.id) === "new") ?? open[0];
  const [status, setStatus] = useState(firstNew?.id ?? "");
  const [assignee, setAssignee] = useState(issue.assigneeId ?? KEEP_ASSIGNEE);
  const [priority, setPriority] = useState(issue.priority);
  const [comment, setComment] = useState("");

  // 상태 목록이 늦게 오면 기본값을 그때 채운다
  useEffect(() => {
    if (!status && firstNew) setStatus(firstNew.id);
  }, [status, firstNew]);

  const priorityIds = priorities.length > 0 ? priorities.map((p) => p.id) : BUILTIN_PRIORITY_IDS;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      status: status || undefined,
      assigneeId: assignee === KEEP_ASSIGNEE ? undefined : assignee,
      priority,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Modal
      open
      title={`${issue.key} 수락`}
      description="정한 상태로 백로그 끝에 놓입니다."
      onOpenChange={(next) => !next && onClose()}
    >
      <form className="triage-form" onSubmit={submit}>
        {open.length > 0 ? (
          <Select
            label="상태"
            value={status}
            onValueChange={setStatus}
            options={open.map((s) => ({
              value: s.id,
              label: s.name,
              icon: <StatusGlyph status={s.id} statuses={statuses} variant="icon" />,
            }))}
          />
        ) : null}
        <Select
          label="담당자"
          value={assignee}
          onValueChange={setAssignee}
          searchable={users.length > 8}
          options={[
            { value: KEEP_ASSIGNEE, label: issue.assigneeId ? "변경 안 함" : "미지정" },
            ...users.map((u) => ({ value: u.id, label: u.name, icon: <UserAvatar user={u} size="small" aria-hidden /> })),
          ]}
        />
        <Select
          label="우선순위"
          value={priority}
          onValueChange={setPriority}
          options={priorityIds.map((id) => ({
            value: id,
            label: priorityName(priorities, id),
            icon: <PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />,
          }))}
        />
        <TextArea label="코멘트 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        <div className="triage-form-actions">
          <Button type="button" variant="subtle" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={busy}>
            수락
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DuplicateDialog({
  issue,
  busy,
  onClose,
  onSubmit,
}: {
  issue: Issue;
  busy: boolean;
  onClose: () => void;
  onSubmit: (original: Issue, comment: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Issue[]>([]);
  const [searching, setSearching] = useState(false);
  const [original, setOriginal] = useState<Issue | null>(null);
  const [comment, setComment] = useState("");

  // 250ms 디바운스, 늦게 온 이전 응답은 버린다
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchIssues(text)
        .then((list) => {
          if (!cancelled) setResults(list.filter((i) => i.id !== issue.id));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, issue.id]);

  return (
    <Modal
      open
      title={`${issue.key} 중복으로 닫기`}
      description="원본 이슈에 '중복' 링크를 걸고 해결 '중복'으로 닫습니다."
      onOpenChange={(next) => !next && onClose()}
    >
      <form
        className="triage-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (original) onSubmit(original, comment.trim());
        }}
      >
        <TextField
          label="원본 이슈 검색"
          placeholder="키 또는 제목"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query.trim() ? (
          <ul className="triage-picker" aria-label="원본 이슈 후보" aria-busy={searching}>
            {results.length === 0 && !searching ? <li className="triage-picker-empty">일치하는 이슈가 없습니다</li> : null}
            {results.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className={original?.id === candidate.id ? "triage-picker-item is-selected" : "triage-picker-item"}
                  aria-pressed={original?.id === candidate.id}
                  onClick={() => setOriginal(candidate)}
                >
                  <IssueTypeGlyph type={candidate.type} variant="icon" />
                  <span className="triage-item-key">{candidate.key}</span>
                  <span className="triage-picker-title">{candidate.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="triage-picked" aria-live="polite">
          {original ? `원본: ${original.key} ${original.title}` : "원본 이슈를 고르세요."}
        </p>
        <TextArea label="코멘트 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        <div className="triage-form-actions">
          <Button type="button" variant="subtle" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={!original} loading={busy}>
            중복으로 닫기
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeclineDialog({
  issue,
  busy,
  onClose,
  onSubmit,
}: {
  issue: Issue;
  busy: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={`${issue.key} 거절`}
      description="해결 '하지 않음'으로 닫습니다. 사유를 적으면 코멘트로 남습니다."
      confirmLabel="거절"
      danger
      loading={busy}
      onConfirm={() => onSubmit(reason.trim())}
    >
      <TextArea label="거절 사유 (선택)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
    </ConfirmDialog>
  );
}

function SnoozeDialog({
  issue,
  busy,
  onClose,
  onSubmit,
}: {
  issue: Issue;
  busy: boolean;
  onClose: () => void;
  onSubmit: (at: Date) => void;
}) {
  const presets = useMemo(() => snoozePresets(), []);
  const [custom, setCustom] = useState("");
  const customAt = custom ? new Date(custom) : null;
  const customValid = customAt !== null && !Number.isNaN(customAt.getTime()) && customAt.getTime() > Date.now();

  return (
    <Modal
      open
      title={`${issue.key} 보류`}
      description="정한 시각까지 대기열에서 접어 둡니다(최대 1년). 시각이 지나면 다시 대기로 돌아옵니다."
      onOpenChange={(next) => !next && onClose()}
    >
      <div className="triage-form">
        <ul className="triage-snooze-presets" aria-label="보류 시각">
          {presets.map((preset) => (
            <li key={preset.id}>
              <Button variant="secondary" fullWidth disabled={busy} onClick={() => onSubmit(preset.at)}>
                <span className="triage-snooze-label">{preset.label}</span>
                <span className="triage-snooze-at">{formatDateTime(preset.at.toISOString())}</span>
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="triage-snooze-custom"
          onSubmit={(event) => {
            event.preventDefault();
            if (customAt && customValid) onSubmit(customAt);
          }}
        >
          <TextField
            label="직접 지정"
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            error={custom && !customValid ? "미래 시각을 고르세요" : undefined}
          />
          <Button type="submit" disabled={!customValid} loading={busy}>
            보류
          </Button>
        </form>
      </div>
    </Modal>
  );
}
