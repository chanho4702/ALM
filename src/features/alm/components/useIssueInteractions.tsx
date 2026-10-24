import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from "react";
import { ContextMenu } from "@chanho/react";
import type { Issue, Sprint } from "../store/types";
import type { IssueFieldOptions } from "./commandScope";
import { openCommandPalette, useIssueCommandScope } from "./commandScope";
import type { IssueActionRunner } from "./useIssueActions";
import { issueContextMenuItems } from "./issueCommands";
import { IssuePeek } from "./IssuePeek";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { ShortcutBindings } from "./useKeyboardShortcuts";
import { useStatusAvailability } from "./statusAvailability";
import { favoriteOfIssue, useFavorites } from "./useFavorites";

/**
 * 목록·보드·백로그 공통 조작감(웨이브 B) — 다중 선택, 미리보기(Space), 우클릭 메뉴, 속성 단축키(s/p/a/l/i),
 * 명령 팔레트 범위 등록을 한 훅이 맡는다. 화면은 이슈를 **보이는 순서대로** 넘기고, 이슈 요소에
 * `data-issue-key`를 달고, 돌려받은 `containerProps`를 감싸는 요소에 펼치기만 하면 된다.
 *
 * - 클릭: ⌘/Ctrl+클릭 = 하나 토글, Shift+클릭 = 기준점부터 범위 선택. 수식 키 없는 클릭은 화면 몫(상세 열기).
 * - 키: `x` 선택 토글, `Space` 미리보기 토글, 미리보기 중 `j`/`k`·↑↓ 이웃 이동·`Enter` 상세, `Esc` 미리보기 닫기 → 선택 해제.
 * - 대상: 선택이 있으면 선택 전부, 없으면 미리보기·커서·포커스·마우스가 가리키는 이슈 하나.
 */
export interface SelectionState {
  selected: Set<string>;
  setSelected: (update: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export interface UseIssueInteractionsOptions {
  source: "list" | "board" | "backlog";
  projectId: string | undefined;
  /** 보이는 순서의 이슈 — 범위 선택·이웃 이동의 기준 */
  issues: Issue[];
  options: IssueFieldOptions;
  actions: IssueActionRunner;
  openIssue: (key: string) => void;
  sprints?: Sprint[];
  /** 화면이 이미 가진 선택 상태(이슈 목록의 체크박스) — 없으면 훅이 갖는다 */
  selection?: SelectionState;
  /** 단축키 커서(이슈 목록 j/k) — 있으면 그 이슈가 기본 대상이고 미리보기가 커서를 따라간다 */
  cursorId?: string | null;
  setCursorId?: (id: string | null) => void;
  /** 결과 갱신 중 등 조작을 잠글 때 */
  disabled?: boolean;
}

/** 이벤트 대상에서 이슈 키 — 이슈 요소의 `data-issue-key`, 표 행이면 그 행 안의 키 칸 */
export function issueKeyFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const own = target.closest<HTMLElement>("[data-issue-key]");
  if (own) return own.dataset.issueKey ?? null;
  const row = target.closest("tr");
  return row?.querySelector<HTMLElement>("[data-issue-key]")?.dataset.issueKey ?? null;
}

/** Shift+클릭 범위 — 기준점과 지금 고른 이슈 사이(양끝 포함)를 보이는 순서로 */
export function selectionRange(order: string[], anchor: string | null, id: string): string[] {
  const end = order.indexOf(id);
  const start = anchor === null ? -1 : order.indexOf(anchor);
  if (end === -1) return [];
  if (start === -1) return [id];
  const [from, to] = start <= end ? [start, end] : [end, start];
  return order.slice(from, to + 1);
}

export function useIssueInteractions({
  source,
  projectId,
  issues,
  options,
  actions,
  openIssue,
  sprints,
  selection,
  cursorId = null,
  setCursorId,
  disabled = false,
}: UseIssueInteractionsOptions) {
  const [ownSelected, setOwnSelected] = useState<Set<string>>(() => new Set());
  const selected = selection?.selected ?? ownSelected;
  const setSelected = selection?.setSelected ?? setOwnSelected;
  const anchorRef = useRef<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  /** 마우스·포커스가 마지막으로 가리킨 이슈 */
  const pointedKey = useRef<string | null>(null);
  const [menuTargets, setMenuTargets] = useState<Issue[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  // 상태 하위 메뉴는 가용 전환만 — 메뉴가 열린 동안만 읽는다
  const statusAvailability = useStatusAvailability(menuTargets, menuOpen && menuTargets.length > 0);
  const { isPinned, toggle: toggleFavorite } = useFavorites();

  const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
  const byKey = useMemo(() => new Map(issues.map((issue) => [issue.key, issue])), [issues]);
  const order = useMemo(() => issues.map((issue) => issue.id), [issues]);

  // 화면에서 사라진 이슈(삭제·필터·다른 스프린트로 이동)는 선택·미리보기에서도 뺀다
  const externalSelection = selection !== undefined;
  useEffect(() => {
    if (!externalSelection) {
      setOwnSelected((prev) => {
        const next = new Set([...prev].filter((id) => byId.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }
    setPeekId((prev) => (prev !== null && !byId.has(prev) ? null : prev));
  }, [byId, externalSelection]);

  const peekIssue = peekId ? (byId.get(peekId) ?? null) : null;

  /** 대상 하나 — 미리보기 > 커서 > 포커스·마우스 */
  const activeIssue = useCallback((): Issue | null => {
    if (peekId && byId.has(peekId)) return byId.get(peekId)!;
    if (cursorId && byId.has(cursorId)) return byId.get(cursorId)!;
    const focused = issueKeyFromTarget(document.activeElement);
    if (focused && byKey.has(focused)) return byKey.get(focused)!;
    const pointed = pointedKey.current;
    return pointed ? (byKey.get(pointed) ?? null) : null;
  }, [peekId, cursorId, byId, byKey]);

  const targets = useCallback((): Issue[] => {
    if (selected.size > 0) return issues.filter((issue) => selected.has(issue.id));
    const active = activeIssue();
    return active ? [active] : [];
  }, [selected, issues, activeIssue]);

  const toggle = useCallback(
    (id: string) => {
      anchorRef.current = id;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelected],
  );

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    setSelected(new Set());
  }, [setSelected]);

  const togglePeek = useCallback(() => {
    if (peekId !== null) {
      setPeekId(null);
      return;
    }
    const active = activeIssue();
    if (active) setPeekId(active.id);
  }, [activeIssue, peekId]);

  /** 미리보기 이웃 이동 — 커서가 있는 화면(목록)은 커서를 옮기면 미리보기가 따라온다 */
  const movePeek = useCallback(
    (delta: number) => {
      if (peekId === null) return;
      const index = order.indexOf(peekId);
      const next = order[Math.min(order.length - 1, Math.max(0, index + delta))];
      if (!next) return;
      setPeekId(next);
      setCursorId?.(next);
      const key = byId.get(next)?.key;
      if (key) {
        pointedKey.current = key;
        setTimeout(() => document.querySelector(`[data-issue-key="${CSS.escape(key)}"]`)?.scrollIntoView?.({ block: "nearest" }), 0);
      }
    },
    [peekId, order, byId, setCursorId],
  );

  // 목록: j/k로 커서를 옮기면 열린 미리보기가 따라간다
  useEffect(() => {
    if (cursorId !== null) setPeekId((prev) => (prev !== null && prev !== cursorId && byId.has(cursorId) ? cursorId : prev));
  }, [cursorId, byId]);

  const bindings: ShortcutBindings = {
    Space: () => {
      if (!disabled) togglePeek();
    },
    x: () => {
      const active = activeIssue();
      if (active && !disabled) toggle(active.id);
    },
    s: () => !disabled && targets().length > 0 && openCommandPalette("status"),
    p: () => !disabled && targets().length > 0 && openCommandPalette("priority"),
    a: () => !disabled && targets().length > 0 && openCommandPalette("assignee"),
    l: () => !disabled && targets().length > 0 && openCommandPalette("labels"),
    i: () => {
      const list = targets();
      if (!disabled && list.length > 0) void actions.assignToMe(list);
    },
  };
  if (peekId !== null || selected.size > 0) {
    bindings.Escape = () => {
      if (peekId !== null) setPeekId(null);
      else clearSelection();
    };
  }
  if (peekId !== null) {
    bindings.Enter = () => peekIssue && openIssue(peekIssue.key);
    bindings.ArrowDown = () => movePeek(1);
    bindings.ArrowUp = () => movePeek(-1);
    // 목록은 j/k가 이미 커서를 옮긴다(미리보기가 따라온다) — 보드·백로그만 여기서 바인딩
    if (source !== "list") {
      bindings.j = () => movePeek(1);
      bindings.k = () => movePeek(-1);
    }
  }
  if (source !== "list") {
    // 보드·백로그의 o — 포커스·마우스가 가리킨 이슈를 연다(목록의 o는 커서 기준으로 이미 있다)
    bindings.o = () => {
      const active = activeIssue();
      if (active) openIssue(active.key);
    };
  }
  useKeyboardShortcuts(bindings);

  useIssueCommandScope(
    projectId
      ? {
          source,
          projectId,
          getTargets: targets,
          getOptions: () => options,
          actions,
          openIssue,
        }
      : null,
  );

  const onClickCapture = (event: ReactMouseEvent) => {
    const modifier = event.metaKey || event.ctrlKey || event.shiftKey;
    if (!modifier || disabled) return;
    const key = issueKeyFromTarget(event.target);
    const issue = key ? byKey.get(key) : undefined;
    if (!issue) return;
    // 이슈 안의 다른 컨트롤(⋯ 메뉴 버튼·링크)은 그대로 둔다 — 이슈 자체(카드·행·행 체크박스)를 누른 경우만
    const control = (event.target as Element).closest("button, a, input, [role='button']");
    if (control && !control.matches("[data-issue-key], .issue-card, .issue-select > input")) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      const range = selectionRange(order, anchorRef.current, issue.id);
      setSelected((prev) => new Set([...prev, ...range]));
      if (anchorRef.current === null) anchorRef.current = issue.id;
    } else {
      toggle(issue.id);
    }
  };

  // Shift+클릭이 글자를 긁어 선택하지 않게
  const onMouseDownCapture = (event: ReactMouseEvent) => {
    if (event.shiftKey && issueKeyFromTarget(event.target)) event.preventDefault();
  };

  const onPointerOver = (event: { target: EventTarget | null }) => {
    const key = issueKeyFromTarget(event.target);
    if (key) pointedKey.current = key;
  };

  const containerProps = {
    onClickCapture,
    onMouseDownCapture,
    onMouseOver: onPointerOver,
    onFocus: onPointerOver,
  };

  /** 우클릭 메뉴로 감싼다 — 대상은 우클릭한 이슈(선택에 들어 있으면 선택 전체) */
  const withContextMenu = (child: ReactElement<{ onContextMenuCapture?: (event: ReactMouseEvent) => void }>): ReactNode => (
    <ContextMenu
      onOpenChange={setMenuOpen}
      items={issueContextMenuItems(menuTargets, options, actions, {
        onOpen: (issue) => openIssue(issue.key),
        onPeek: (issue) => setPeekId(issue.id),
        statusAvailability,
        favorite: {
          pinned: menuTargets.length === 1 && isPinned("issue", menuTargets[0].key),
          toggle: (issue) => void toggleFavorite(favoriteOfIssue(issue)),
        },
      })}
    >
      {cloneElement(child, {
        onContextMenuCapture: (event: ReactMouseEvent) => {
          child.props.onContextMenuCapture?.(event);
          const key = issueKeyFromTarget(event.target);
          const issue = key ? byKey.get(key) : undefined;
          if (!issue || disabled) {
            // 이슈 밖(빈 칸·머리글)은 브라우저 기본 메뉴 — Radix 트리거까지 가지 않게 여기서 멈춘다
            event.stopPropagation();
            return;
          }
          pointedKey.current = issue.key;
          setMenuTargets(selected.has(issue.id) && selected.size > 1 ? issues.filter((i) => selected.has(i.id)) : [issue]);
        },
      })}
    </ContextMenu>
  );

  const peek = peekIssue ? (
    <IssuePeek
      issue={peekIssue}
      statuses={options.statuses}
      users={options.users}
      priorities={options.priorities}
      sprints={sprints}
      onClose={() => setPeekId(null)}
      onOpen={openIssue}
    />
  ) : null;

  return {
    selected,
    setSelected,
    toggle,
    clearSelection,
    peekIssue,
    setPeekId,
    peek,
    containerProps,
    withContextMenu,
    targets,
  };
}
