import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { CommandPalette } from "@chanho/react";
import type { CommandItem } from "@chanho/react";
import {
  ArrowRight,
  Bell,
  FolderKanban,
  FolderPlus,
  Home,
  Keyboard,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  Settings,
  SquareKanban,
  UserCog,
} from "lucide-react";
import type { Issue, Project } from "../store/types";
import { getCurrentUser, getIssueByKey, searchIssues } from "../store/jiraStore";
import { listViewedIssues } from "../store/uiStore";
import { settleWithConcurrency } from "../store/concurrency";
import type { IssueCommandScope, IssueFieldOptions, PaletteField } from "./commandScope";
import { activeIssueScope, closeCommandPalette, usePaletteRequest } from "./commandScope";
import { fieldPageItems, issuePaletteCommands } from "./issueCommands";
import { isCommandPaletteKey } from "./keyboardShortcuts";
import { IssueTypeGlyph } from "./IssueTypeGlyph";
import { PROJECT_VIEW_TABS } from "./projectViews";

/** 최근 본 이슈 — 팔레트를 열 때 몇 개만 */
const RECENT_LIMIT = 5;
/** 이슈 검색 결과 수 */
const SEARCH_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 200;

const VIEW_ICONS: Record<string, ReactNode> = {
  board: <SquareKanban size={16} />,
  backlog: <ListTodo size={16} />,
  issues: <ListTodo size={16} />,
  dashboard: <LayoutDashboard size={16} />,
};
/** 보기 이동 단축키 — AppShell 전역 바인딩(g b·g i)과 같은 키만 적는다 */
const VIEW_SHORTCUTS: Record<string, string[]> = { board: ["G", "B"], issues: ["G", "I"] };

const SEARCH_GROUP = "이슈 검색 결과";

export interface CommandPaletteHostProps {
  projects: Project[];
  currentProject: Project | undefined;
  onCreateIssue: () => void;
  onShowShortcuts: () => void;
  onOpenNotifications: () => void;
}

/** 열린 동안의 대상 — 팔레트를 연 순간의 범위를 고정한다(열려 있는 동안 포커스·마우스가 바뀌어도 대상은 그대로) */
interface Snapshot {
  scope: IssueCommandScope | null;
  targets: Issue[];
  options: IssueFieldOptions | undefined;
  field: PaletteField | undefined;
}

/**
 * 명령 팔레트(리니어 ⌘K) — 전역 셸에 하나. ⌘K/Ctrl+K로 열고, 속성 단축키(s/p/a/l)는 그 필드 페이지로 바로 연다.
 * 이동·만들기·최근 이슈·이슈 검색과 "현재 이슈" 명령(상태·담당자·우선순위·라벨·나에게 할당·키/링크 복사·복제·삭제)을 한 곳에서.
 * 현재 이슈는 화면이 올린 범위(commandScope) — 선택이 있으면 선택 전부다.
 */
export function CommandPaletteHost({
  projects,
  currentProject,
  onCreateIssue,
  onShowShortcuts,
  onOpenNotifications,
}: CommandPaletteHostProps) {
  const navigate = useNavigate();
  const request = usePaletteRequest();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({ scope: null, targets: [], options: undefined, field: undefined });
  const openRef = useRef(false);
  openRef.current = open;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Issue[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<Issue[]>([]);
  const searchSeq = useRef(0);

  const show = (field: PaletteField | undefined) => {
    const scope = activeIssueScope();
    const targets = scope?.getTargets() ?? [];
    // 대상 없는 필드 페이지는 열 게 없다 — 루트로 연다
    setSnapshot({ scope, targets, options: scope?.getOptions(), field: targets.length > 0 ? field : undefined });
    setQuery("");
    setResults([]);
    setOpen(true);
  };

  // ⌘K / Ctrl+K — 열려 있으면 닫는다(토글)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteKey(event)) return;
      event.preventDefault(); // 브라우저 주소창 검색(Ctrl+K)으로 새지 않게
      if (openRef.current) close(false);
      else show(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 속성 단축키·화면 버튼이 보낸 열기 요청
  useEffect(() => {
    if (request) show(request.field);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새 요청(seq)마다 한 번
  }, [request?.seq]);

  // 최근 본 이슈 — 열 때마다 다시 읽는다(상세를 연 순서가 바뀐다)
  useEffect(() => {
    if (!open || snapshot.field) return;
    let cancelled = false;
    void (async () => {
      const me = await getCurrentUser();
      const entries = (await listViewedIssues(me.id)).slice(0, RECENT_LIMIT);
      const found = await settleWithConcurrency(entries, (entry) => getIssueByKey(entry.key));
      if (cancelled) return;
      setRecent(found.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : [])));
    })().catch(() => {
      if (!cancelled) setRecent([]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, snapshot.field]);

  // 이슈 검색 — 루트 페이지에서만, 입력이 멈추면 서버에 묻는다. 늦게 온 이전 응답은 버린다
  useEffect(() => {
    const text = query.trim();
    if (!open || snapshot.field || !text) {
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchIssues(text, SEARCH_LIMIT)
        .then((found) => {
          if (seq === searchSeq.current) setResults(found);
        })
        .catch(() => {
          if (seq === searchSeq.current) setResults([]);
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, snapshot.field]);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) closeCommandPalette();
  };

  const goIssue = (issue: Issue) => navigate(`/projects/${issue.projectId}/issues?issue=${encodeURIComponent(issue.key)}`);
  const issueItem = (issue: Issue, group: string, prefix: string): CommandItem => ({
    id: `${prefix}:${issue.id}`,
    group,
    label: issue.title,
    description: issue.key,
    icon: <IssueTypeGlyph type={issue.type} variant="icon" />,
    keywords: [issue.key],
    onSelect: () => goIssue(issue),
  });

  const { scope, targets, options, field } = snapshot;

  const items = useMemo<CommandItem[]>(() => {
    if (field && scope && options) return fieldPageItems(field, targets, options, scope.actions, query);

    const list: CommandItem[] = [];
    if (scope && options && targets.length > 0) {
      list.push(
        ...issuePaletteCommands(targets, options, scope.actions, {
          onOpen: scope.source === "detail" ? undefined : (issue) => (scope.openIssue ? scope.openIssue(issue.key) : goIssue(issue)),
        }),
      );
    }
    if (query.trim()) list.push(...results.map((issue) => issueItem(issue, SEARCH_GROUP, "search")));
    else list.push(...recent.map((issue) => issueItem(issue, "최근 본 이슈", "recent")));

    list.push(
      {
        id: "create:issue",
        group: "만들기",
        label: "이슈 만들기",
        icon: <Plus size={16} />,
        shortcut: "C",
        keywords: ["create", "new", "새"],
        disabled: projects.length === 0,
        onSelect: onCreateIssue,
      },
      {
        id: "create:project",
        group: "만들기",
        label: "프로젝트 만들기",
        icon: <FolderPlus size={16} />,
        keywords: ["create", "project", "새"],
        onSelect: () => navigate("/projects/new"),
      },
    );

    if (currentProject) {
      for (const view of PROJECT_VIEW_TABS) {
        list.push({
          id: `view:${view.id}`,
          group: `이동 · ${currentProject.name}`,
          label: view.label,
          icon: VIEW_ICONS[view.id] ?? <ArrowRight size={16} />,
          shortcut: VIEW_SHORTCUTS[view.id],
          keywords: [view.id, currentProject.key],
          onSelect: () => navigate(`/projects/${currentProject.id}/${view.id}`),
        });
      }
      list.push({
        id: "view:settings",
        group: `이동 · ${currentProject.name}`,
        label: "프로젝트 설정",
        icon: <Settings size={16} />,
        keywords: ["settings", currentProject.key],
        onSelect: () => navigate(`/projects/${currentProject.id}/settings`),
      });
    }

    list.push(
      { id: "go:home", group: "이동", label: "홈", icon: <Home size={16} />, keywords: ["home", "for you"], onSelect: () => navigate("/home") },
      { id: "go:projects", group: "이동", label: "프로젝트 목록", icon: <FolderKanban size={16} />, shortcut: ["G", "P"], keywords: ["projects"], onSelect: () => navigate("/projects") },
      { id: "go:dashboards", group: "이동", label: "대시보드", icon: <LayoutDashboard size={16} />, shortcut: ["G", "D"], keywords: ["dashboards"], onSelect: () => navigate("/dashboards") },
      {
        id: "go:search",
        group: "이동",
        label: query.trim() ? `"${query.trim()}" 고급 검색` : "고급 검색",
        icon: <Search size={16} />,
        keywords: ["search", "aql", "검색", query],
        onSelect: () => navigate(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search"),
      },
      { id: "go:notifications", group: "이동", label: "알림", icon: <Bell size={16} />, keywords: ["notifications"], onSelect: onOpenNotifications },
      ...projects
        .filter((project) => project.id !== currentProject?.id)
        .map((project) => ({
          id: `project:${project.id}`,
          group: "프로젝트",
          label: project.name,
          description: project.key,
          icon: <FolderKanban size={16} />,
          keywords: [project.key],
          onSelect: () => navigate(`/projects/${project.id}/board`),
        })),
      { id: "settings:global", group: "설정", label: "전역 설정", icon: <Settings size={16} />, keywords: ["settings", "admin"], onSelect: () => navigate("/settings") },
      { id: "settings:personal", group: "설정", label: "개인 설정", icon: <UserCog size={16} />, keywords: ["personal", "preferences"], onSelect: () => navigate("/settings/personal") },
      { id: "help:shortcuts", group: "도움말", label: "키보드 단축키", icon: <Keyboard size={16} />, shortcut: "?", keywords: ["shortcuts", "help"], onSelect: onShowShortcuts },
    );
    return list;
    // goIssue·issueItem은 navigate만 닫아 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, scope, options, targets, query, results, recent, projects, currentProject, onCreateIssue, onShowShortcuts, onOpenNotifications, navigate]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={close}
      items={items}
      label={field ? `명령 팔레트 — ${fieldTitle(field)}` : "명령 팔레트"}
      placeholder={field ? `${fieldTitle(field)} — ${targets.length === 1 ? targets[0].key : `${targets.length}개 이슈`}` : "명령·이슈 검색…"}
      onQueryChange={setQuery}
      // 서버 검색 결과는 서버가 이미 걸렀다(설명·키 일치 포함) — 다시 거르지 않는다
      filter={(item, text) => item.group === SEARCH_GROUP || matches(item, text)}
      loading={false}
      emptyMessage={searching ? "검색 중…" : "결과가 없습니다"}
    />
  );
}

function fieldTitle(field: PaletteField): string {
  return { status: "상태 변경", priority: "우선순위 변경", assignee: "담당자 변경", labels: "라벨" }[field];
}

function matches(item: CommandItem, text: string): boolean {
  const needle = text.toLocaleLowerCase();
  return [item.label, item.description ?? "", ...(item.keywords ?? [])].some((value) => value.toLocaleLowerCase().includes(needle));
}
