import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router";
import { Badge, Button, EmptyState, Modal, Popover, SkeletonListItem, Tabs, TextField, useToast } from "@chanho/react";
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  AtSign,
  Bell,
  CircleDot,
  Inbox,
  Mail,
  MailOpen,
  MessageSquare,
  UserRound,
  Zap,
} from "lucide-react";
import type { InboxBulkAction, InboxFilter, Notification, NotificationType } from "../store/types";
import {
  archiveNotification,
  bulkNotifications,
  getIssueByKey,
  listNotificationInbox,
  snoozeNotification,
  unarchiveNotification,
  unsnoozeNotification,
} from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { formatDateTime, relTime } from "../components/time";
import { formatSnoozeUntil, fromLocalInput, snoozePresets, toLocalInput } from "../components/inboxTime";
import { notifyInboxChanged } from "../components/inboxEvents";
import { useKeyboardShortcuts } from "../components/useKeyboardShortcuts";
import { selectionRange } from "../components/useIssueInteractions";
import { LoadingRegion } from "../components/Skeletons";
import "./inbox.css";

const FILTERS: { value: InboxFilter; label: string; empty: string }[] = [
  { value: "all", label: "전체", empty: "새 알림이 없습니다. 담당 이슈의 변경·멘션·자동화 알림이 여기에 모입니다." },
  { value: "unread", label: "읽지 않음", empty: "읽지 않은 알림이 없습니다." },
  { value: "mentions", label: "멘션", empty: "나를 멘션한 알림이 없습니다." },
  { value: "assigned", label: "할당", empty: "나에게 할당된 알림이 없습니다." },
  { value: "automation", label: "자동화", empty: "자동화 규칙이 보낸 알림이 없습니다." },
  { value: "snoozed", label: "미뤄 둠", empty: "미뤄 둔 알림이 없습니다. H로 알림을 나중으로 미룰 수 있습니다." },
  { value: "archived", label: "보관함", empty: "보관한 알림이 없습니다. E 또는 Backspace로 알림을 보관합니다." },
];

const PAGE_SIZE = 50;

/** 알림 종류 — 아이콘 + 텍스트(값 표기 규칙) */
const TYPE_META: Record<NotificationType, { label: string; icon: ReactNode }> = {
  mentioned: { label: "멘션", icon: <AtSign size={14} aria-hidden /> },
  assigned: { label: "할당", icon: <UserRound size={14} aria-hidden /> },
  automation: { label: "자동화", icon: <Zap size={14} aria-hidden /> },
  commented: { label: "코멘트", icon: <MessageSquare size={14} aria-hidden /> },
  status_changed: { label: "상태", icon: <CircleDot size={14} aria-hidden /> },
};
const typeMeta = (type: NotificationType | undefined) => (type ? TYPE_META[type] : null) ?? { label: "알림", icon: <Bell size={14} aria-hidden /> };

function describeError(error: unknown): string {
  if (errorStatus(error) === 503) return "ALM 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
  return error instanceof Error ? error.message : String(error);
}

/**
 * 알림 인박스(Linear Inbox, V40) — 상단 벨이 여는 전체 화면.
 *
 * 키: j/k 이동 · Enter 이슈 열기 · U 읽음 토글 · H 미루기 · E/Backspace 보관(보관함에서는 해제) · x 선택 ·
 * Shift+클릭 범위 · Ctrl/⌘+클릭 하나씩 · Esc 선택 해제. 선택이 있으면 U·E는 선택 전부에 적용된다.
 */
export function InboxPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [items, setItems] = useState<Notification[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchorRef = useRef<string | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<string | null>(null);
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(
    async (target: InboxFilter, keep = 0) => {
      const mine = ++seq.current;
      try {
        const page = await listNotificationInbox({ filter: target, limit: Math.min(100, Math.max(PAGE_SIZE, keep)) });
        if (mine !== seq.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setUnreadCount(page.unreadCount);
        setError(null);
      } catch (failure) {
        if (mine !== seq.current) return;
        setError(describeError(failure));
      }
    },
    [],
  );

  useEffect(() => {
    setItems(null);
    setSelected(new Set());
    setCursorId(null);
    void load(filter);
  }, [filter, load]);

  const list = useMemo(() => items ?? [], [items]);
  const order = useMemo(() => list.map((n) => n.id), [list]);
  const byId = useMemo(() => new Map(list.map((n) => [n.id, n])), [list]);

  // 사라진 알림(보관·미루기로 이 필터에서 빠짐)은 선택에서도 뺀다. 커서는 같은 자리의 이웃으로
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => byId.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [byId]);

  /** 바뀐 뒤 — 같은 만큼 다시 읽고 벨 배지를 맞춘다 */
  const refresh = async () => {
    await load(filter, list.length);
    notifyInboxChanged();
  };

  const focusRow = (id: string | null) => {
    if (!id) return;
    setTimeout(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-notification-id="${CSS.escape(id)}"] .inbox-item-main`)?.focus();
    }, 0);
  };

  /** 처리 뒤 커서 — 그 자리의 다음(없으면 이전) 항목 */
  const neighbourAfter = (ids: Set<string>) => {
    if (!cursorId || !ids.has(cursorId)) return cursorId;
    const index = order.indexOf(cursorId);
    const rest = order.filter((id) => !ids.has(id));
    return rest[Math.min(index, rest.length - 1)] ?? null;
  };

  const targets = (): Notification[] => {
    if (selected.size > 0) return list.filter((n) => selected.has(n.id));
    const current = cursorId ? byId.get(cursorId) : undefined;
    return current ? [current] : [];
  };

  const run = async (work: () => Promise<unknown>, failureTitle: string, removed?: Set<string>) => {
    try {
      await work();
      if (removed) {
        const next = neighbourAfter(removed);
        setCursorId(next);
        focusRow(next);
      }
    } catch (failure) {
      toast({ title: failureTitle, description: describeError(failure), appearance: "danger" });
    }
    await refresh();
  };

  const bulk = (ids: string[], action: InboxBulkAction) => bulkNotifications(ids, action);

  /** U — 하나라도 안 읽었으면 모두 읽음, 모두 읽었으면 모두 안 읽음(Linear 토글) */
  const toggleRead = (list: Notification[]) => {
    if (list.length === 0) return;
    const action: InboxBulkAction = list.some((n) => !n.read) ? "read" : "unread";
    void run(() => bulk(list.map((n) => n.id), action), "읽음 상태를 바꾸지 못했습니다");
  };

  /** E·Backspace — 보관(보관함에서는 해제). 이 필터에서 빠지므로 커서는 이웃으로 */
  const archive = (list: Notification[]) => {
    if (list.length === 0) return;
    const ids = list.map((n) => n.id);
    const restoring = filter === "archived";
    void run(
      () => (ids.length === 1 ? (restoring ? unarchiveNotification(ids[0]) : archiveNotification(ids[0])) : bulk(ids, restoring ? "unarchive" : "archive")),
      restoring ? "보관을 해제하지 못했습니다" : "보관하지 못했습니다",
      new Set(ids),
    ).then(() => {
      setSelected(new Set());
      toast({
        title: restoring ? `${ids.length}개 알림의 보관을 해제했습니다` : `${ids.length}개 알림을 보관했습니다`,
        appearance: "success",
      });
    });
  };

  const snooze = (id: string, at: Date) => {
    setSnoozeFor(null);
    setCustomFor(null);
    void run(() => snoozeNotification(id, at.toISOString()), "미루지 못했습니다", filter === "snoozed" ? undefined : new Set([id])).then(() =>
      toast({ title: `${formatSnoozeUntil(at.toISOString())}까지 미뤘습니다`, appearance: "success" }),
    );
  };

  const unsnooze = (id: string) => {
    setSnoozeFor(null);
    void run(() => unsnoozeNotification(id), "미루기를 취소하지 못했습니다", filter === "snoozed" ? new Set([id]) : undefined);
  };

  const open = async (notification: Notification) => {
    try {
      if (!notification.read) await bulk([notification.id], "read");
      notifyInboxChanged();
      const issue = await getIssueByKey(notification.issueKey);
      if (issue) navigate(`/projects/${issue.projectId}/issues?issue=${encodeURIComponent(issue.key)}`);
      else toast({ title: `${notification.issueKey}를 열 수 없습니다`, description: "지워졌거나 볼 권한이 없는 이슈입니다", appearance: "info" });
    } catch (failure) {
      toast({ title: "이슈를 열지 못했습니다", description: describeError(failure), appearance: "danger" });
    }
  };

  const move = (delta: number) => {
    if (order.length === 0) return;
    const index = cursorId ? order.indexOf(cursorId) : -1;
    const next = order[Math.min(order.length - 1, Math.max(0, index === -1 ? (delta > 0 ? 0 : order.length - 1) : index + delta))];
    setCursorId(next);
    focusRow(next);
  };

  const toggleSelect = (id: string) => {
    anchorRef.current = id;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRowClick = (event: ReactMouseEvent, notification: Notification) => {
    if (event.shiftKey) {
      event.preventDefault();
      const range = selectionRange(order, anchorRef.current ?? cursorId, notification.id);
      setSelected((prev) => new Set([...prev, ...range]));
      if (anchorRef.current === null) anchorRef.current = notification.id;
      setCursorId(notification.id);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleSelect(notification.id);
      setCursorId(notification.id);
      return;
    }
    setCursorId(notification.id);
    void open(notification);
  };

  const cursorItem = cursorId ? byId.get(cursorId) : undefined;
  const bindings: Record<string, () => void> = {
    j: () => move(1),
    k: () => move(-1),
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    u: () => toggleRead(targets()),
    U: () => toggleRead(targets()),
    e: () => archive(targets()),
    E: () => archive(targets()),
    Backspace: () => archive(targets()),
    h: () => cursorItem && filter !== "archived" && setSnoozeFor(cursorItem.id),
    H: () => cursorItem && filter !== "archived" && setSnoozeFor(cursorItem.id),
    x: () => cursorItem && toggleSelect(cursorItem.id),
    Enter: () => cursorItem && void open(cursorItem),
  };
  if (selected.size > 0) bindings.Escape = () => setSelected(new Set());
  useKeyboardShortcuts(bindings);

  const filterMeta = FILTERS.find((f) => f.value === filter)!;
  const customTarget = customFor ? byId.get(customFor) : undefined;

  const row = (notification: Notification) => {
    const meta = typeMeta(notification.type);
    const isCursor = notification.id === cursorId;
    const isSelected = selected.has(notification.id);
    const snoozedNow = Boolean(notification.snoozedUntil && Date.parse(notification.snoozedUntil) > Date.now());
    const returned = Boolean(notification.snoozedUntil && !snoozedNow);
    const classes = ["inbox-item"];
    if (!notification.read) classes.push("is-unread");
    if (isCursor) classes.push("is-cursor");
    if (isSelected) classes.push("is-selected");
    const snoozeTrigger = (
      <Button
        variant="ghost"
        size="small"
        iconOnly
        className="inbox-item-action"
        aria-label="미루기"
        aria-keyshortcuts="H"
        title="미루기 (H)"
        onClick={() => setSnoozeFor(notification.id)}
      >
        <AlarmClock size={14} aria-hidden />
      </Button>
    );
    return (
      <li key={notification.id} className={classes.join(" ")} data-notification-id={notification.id}>
        <input
          type="checkbox"
          className="inbox-item-select"
          aria-label={`선택: ${notification.issueKey} ${notification.message}`}
          checked={isSelected}
          onChange={() => toggleSelect(notification.id)}
          onClick={(event) => {
            if (event.shiftKey) {
              event.preventDefault();
              const range = selectionRange(order, anchorRef.current ?? cursorId, notification.id);
              setSelected((prev) => new Set([...prev, ...range]));
            }
          }}
        />
        <button
          type="button"
          className="inbox-item-main"
          aria-current={isCursor ? "true" : undefined}
          onClick={(event) => onRowClick(event, notification)}
          onMouseDown={(event) => {
            if (event.shiftKey) event.preventDefault();
          }}
          onFocus={() => setCursorId(notification.id)}
        >
          <span className="inbox-item-dot" aria-hidden />
          <span className="inbox-item-type">
            {meta.icon}
            <span>{meta.label}</span>
          </span>
          <span className="inbox-item-text">
            <span className="inbox-item-message">{notification.message}</span>
            <span className="inbox-item-meta">
              <span className="issue-key-cell">{notification.issueKey}</span>
              <span title={formatDateTime(notification.at)}>{relTime(notification.at)}</span>
              {snoozedNow ? (
                <Badge appearance="neutral">{`${formatSnoozeUntil(notification.snoozedUntil!)}까지 미룸`}</Badge>
              ) : returned ? (
                <Badge appearance="brand">미루기에서 돌아옴</Badge>
              ) : null}
            </span>
          </span>
          {!notification.read ? <span className="visually-hidden">읽지 않음</span> : null}
        </button>
        <span className="inbox-item-actions">
          <Button
            variant="ghost"
            size="small"
            iconOnly
            className="inbox-item-action"
            aria-label={notification.read ? "읽지 않음으로 표시" : "읽음으로 표시"}
            aria-keyshortcuts="U"
            title={notification.read ? "읽지 않음으로 (U)" : "읽음으로 (U)"}
            onClick={() => toggleRead([notification])}
          >
            {notification.read ? <Mail size={14} aria-hidden /> : <MailOpen size={14} aria-hidden />}
          </Button>
          {filter === "archived" ? null : snoozeFor === notification.id ? (
            <Popover
              open
              onOpenChange={(next) => {
                if (!next) setSnoozeFor(null);
              }}
              label="미루기"
              align="end"
              padding="none"
              className="inbox-snooze-popover"
              trigger={snoozeTrigger}
            >
              <ul className="inbox-snooze-menu" aria-label="미루기 시각">
                {snoozePresets().map((preset) => (
                  <li key={preset.id}>
                    <button type="button" className="inbox-snooze-option" onClick={() => snooze(notification.id, preset.at)}>
                      <span>{preset.label}</span>
                      <span className="inbox-snooze-when">{formatSnoozeUntil(preset.at.toISOString())}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="inbox-snooze-option"
                    onClick={() => {
                      setSnoozeFor(null);
                      setCustomFor(notification.id);
                    }}
                  >
                    직접 고르기…
                  </button>
                </li>
                {snoozedNow ? (
                  <li>
                    <button type="button" className="inbox-snooze-option" onClick={() => unsnooze(notification.id)}>
                      미루기 취소
                    </button>
                  </li>
                ) : null}
              </ul>
            </Popover>
          ) : (
            snoozeTrigger
          )}
          <Button
            variant="ghost"
            size="small"
            iconOnly
            className="inbox-item-action"
            aria-label={filter === "archived" ? "보관 해제" : "보관"}
            aria-keyshortcuts="E Backspace"
            title={filter === "archived" ? "보관 해제 (E)" : "보관 (E · Backspace)"}
            onClick={() => archive([notification])}
          >
            {filter === "archived" ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
          </Button>
        </span>
      </li>
    );
  };

  const selectedList = list.filter((n) => selected.has(n.id));
  const body = (
    <section className="inbox-body" aria-label={`${filterMeta.label} 알림`}>
      {selected.size > 0 ? (
        <div className="inbox-bulkbar" role="toolbar" aria-label="인박스 일괄 작업">
          <span className="inbox-bulk-count">{`${selected.size}개 선택`}</span>
          <Button size="small" variant="secondary" onClick={() => void run(() => bulk([...selected], "read"), "읽음으로 바꾸지 못했습니다")}>
            읽음으로
          </Button>
          <Button size="small" variant="secondary" onClick={() => void run(() => bulk([...selected], "unread"), "읽지 않음으로 바꾸지 못했습니다")}>
            읽지 않음으로
          </Button>
          <Button size="small" variant="secondary" onClick={() => archive(selectedList)}>
            {filter === "archived" ? "보관 해제" : "보관"}
          </Button>
          <Button size="small" variant="ghost" onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      ) : null}
      {error !== null ? (
        <div className="inbox-error" role="alert">
          <p>{`알림을 불러오지 못했습니다: ${error}`}</p>
          <Button size="small" variant="secondary" onClick={() => void load(filter)}>
            다시 시도
          </Button>
        </div>
      ) : items === null ? (
        <LoadingRegion label="알림 불러오는 중" className="skeleton-list">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonListItem key={index} media="icon" width={index % 2 ? "60%" : "80%"} />
          ))}
        </LoadingRegion>
      ) : list.length === 0 ? (
        <EmptyState title="비어 있습니다" description={filterMeta.empty} />
      ) : (
        <>
          <ul ref={listRef} className="inbox-list" aria-label="알림 목록">
            {list.map(row)}
          </ul>
          {nextCursor ? (
            <Button
              variant="secondary"
              className="inbox-more"
              loading={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void listNotificationInbox({ filter, cursor: nextCursor, limit: PAGE_SIZE })
                  .then((page) => {
                    setItems((prev) => [...(prev ?? []), ...page.items.filter((n) => !(prev ?? []).some((p) => p.id === n.id))]);
                    setNextCursor(page.nextCursor);
                    setUnreadCount(page.unreadCount);
                  })
                  .catch((failure: unknown) => toast({ title: "더 불러오지 못했습니다", description: describeError(failure), appearance: "danger" }))
                  .finally(() => setLoadingMore(false));
              }}
            >
              더 보기
            </Button>
          ) : null}
        </>
      )}
    </section>
  );

  return (
    <main className="project-list-content inbox-page">
      <header className="inbox-header">
        <div className="inbox-header-text">
          <h1 className="inbox-title">
            <Inbox size={20} aria-hidden /> 인박스
          </h1>
          <span className="inbox-count" aria-live="polite">{unreadCount > 0 ? `읽지 않음 ${unreadCount}개` : "모두 읽었습니다"}</span>
        </div>
        <div className="inbox-header-actions">
          <span className="inbox-hint">j/k 이동 · Enter 열기 · U 읽음 · H 미루기 · E 보관 · x 선택</span>
          <Button
            size="small"
            variant="secondary"
            disabled={list.every((n) => n.read)}
            onClick={() => void run(() => bulk(list.filter((n) => !n.read).map((n) => n.id), "read"), "모두 읽음으로 바꾸지 못했습니다")}
          >
            보이는 알림 모두 읽음
          </Button>
        </div>
      </header>
      <Tabs
        label="인박스 필터"
        value={filter}
        onValueChange={(value) => setFilter(value as InboxFilter)}
        className="inbox-tabs"
        items={FILTERS.map((f) => ({
          value: f.value,
          label:
            f.value === "unread" && unreadCount > 0 ? (
              <>
                {f.label} <Badge appearance="danger">{unreadCount}</Badge>
              </>
            ) : (
              f.label
            ),
          ariaLabel: f.value === "unread" && unreadCount > 0 ? `${f.label} (${unreadCount})` : f.label,
          content: f.value === filter ? body : null,
        }))}
      />
      {customFor ? (
        <CustomSnoozeModal
          title={customTarget ? `${customTarget.issueKey} 알림 미루기` : "알림 미루기"}
          onClose={() => setCustomFor(null)}
          onSave={(at) => snooze(customFor, at)}
        />
      ) : null}
    </main>
  );
}

function CustomSnoozeModal({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (at: Date) => void }) {
  const [value, setValue] = useState(() => toLocalInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [error, setError] = useState<string | undefined>(undefined);
  const submit = () => {
    const at = fromLocalInput(value);
    if (!at) return setError("날짜와 시각을 고르세요");
    if (at.getTime() <= Date.now()) return setError("미루기 시각은 미래여야 합니다");
    if (at.getTime() - Date.now() > 366 * 24 * 60 * 60 * 1000) return setError("미루기는 1년 뒤까지만 할 수 있습니다");
    onSave(at);
  };
  return (
    <Modal
      open
      title={title}
      description="고른 시각이 되면 읽지 않은 알림으로 인박스 맨 위에 돌아옵니다."
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form
        className="inbox-custom-snooze"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label="미룰 시각"
          type="datetime-local"
          value={value}
          error={error}
          onChange={(event) => {
            setValue(event.target.value);
            setError(undefined);
          }}
        />
        <div className="inbox-custom-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit">미루기</Button>
        </div>
      </form>
    </Modal>
  );
}

export default InboxPage;
