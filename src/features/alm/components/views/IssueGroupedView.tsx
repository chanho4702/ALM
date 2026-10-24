import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge, Button, EmptyState, Lozenge, SkeletonListItem, Tag } from "@chanho/react";
import type { Component, Issue, Project, ProjectVersion, Sprint, User, ViewProperty, WorkflowStatus } from "../../store/types";
import {
  listComponents,
  listProjectLabels,
  listProjectStatuses,
  listProjects,
  listSprints,
  listUsers,
  listVersions,
  queryIssuesAql,
} from "../../store/jiraStore";
import { fromSmart } from "../../store/aql/fromSmart";
import { IssueCard, IssueFlagMark } from "../IssueCard";
import { IssueTypeGlyph } from "../IssueTypeGlyph";
import { PriorityGlyph } from "../PriorityGlyph";
import { StatusGlyph } from "../StatusGlyph";
import { UserAvatar } from "../UserAvatar";
import { ValueWithIcon } from "../ValueWithIcon";
import { formatDate } from "../time";
import { statusAppearance, statusKind, statusName, typeLevel } from "../labels";
import { useIssueTypes } from "../useIssueTypes";
import { usePriorities } from "../usePriorities";
import { buildViewAql, epicOf, groupIssues } from "./viewGrouping";
import type { GroupingContext, IssueGroup } from "./viewGrouping";
import type { ViewState } from "./useViewDisplay";
import "./views.css";

/** 한 번에 읽는 상한 — 넘으면 처음 것만 그리고 그렇다고 말한다 */
const VIEW_FETCH_SIZE = 500;
const ALL = "all";

/** 이슈 목록 상단 칩 필터(단일 값, "all" = 전체) — 그룹 보기에서도 같은 조건으로 좁힌다 */
export interface ListChipFilters {
  text: string;
  status: string;
  priority: string;
  assigneeId: string;
  label: string;
  componentId: string;
  type: string;
}

function matchesChips(issue: Issue, chips: ListChipFilters | undefined): boolean {
  if (!chips) return true;
  const text = chips.text.trim().toLowerCase();
  if (text && ![issue.title, issue.description, issue.key].some((value) => value?.toLowerCase().includes(text))) return false;
  if (chips.status !== ALL && issue.status !== chips.status) return false;
  if (chips.priority !== ALL && issue.priority !== chips.priority) return false;
  if (chips.assigneeId !== ALL && issue.assigneeId !== chips.assigneeId) return false;
  if (chips.label !== ALL && !issue.labels.includes(chips.label)) return false;
  if (chips.componentId !== ALL && !(issue.componentIds ?? []).includes(chips.componentId)) return false;
  if (chips.type !== ALL && issue.type !== chips.type) return false;
  return true;
}

interface Directory {
  project: Project | undefined;
  users: User[];
  statuses: WorkflowStatus[];
  sprints: Sprint[];
  versions: ProjectVersion[];
  components: Component[];
  labels: string[];
}

interface Loaded {
  issues: Issue[];
  /** 부모·에픽 조회용 — 필터가 있으면 프로젝트 전체, 없으면 결과 그대로 */
  lookup: Issue[];
  total: number;
}

export interface IssueGroupedViewProps {
  projectId: string;
  state: ViewState;
  chips?: ListChipFilters;
  /** 바뀌면 다시 읽는다(이슈 저장·대량 변경 뒤) */
  refreshKey?: number;
  selectedKey?: string | null;
  onOpenIssue: (key: string) => void;
}

/**
 * 표시 옵션이 적용된 이슈 보기 — 목록(접히는 그룹 + 고른 속성의 행) 또는 보드(그룹 = 열, 카드 = IssueCard).
 * 데이터는 `queryIssuesAql`(project = KEY AND 보기 조건) 한 번, 정렬·그룹은 `viewGrouping`이 한다.
 */
export function IssueGroupedView({ projectId, state, chips, refreshKey = 0, selectedKey, onOpenIssue }: IssueGroupedViewProps) {
  const types = useIssueTypes();
  const priorities = usePriorities();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const { layout, display, filter } = state;
  const needsLookup = display.groupBy === "epic" || display.subGroupBy === "epic" || display.properties.includes("parent");

  useEffect(() => {
    let active = true;
    setError(null);
    void Promise.all([
      listProjects(),
      listUsers(),
      listProjectStatuses(projectId),
      listSprints(projectId),
      listVersions(projectId),
      listComponents(projectId),
      listProjectLabels(projectId),
    ]).then(
      ([projects, users, statuses, sprints, versions, components, labels]) => {
        if (!active) return;
        setDirectory({ project: projects.find((p) => p.id === projectId), users, statuses, sprints, versions, components, labels });
      },
      (failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [projectId, refreshKey, retry]);

  const filterAql = useMemo(() => {
    if (!filter || !directory?.project) return null;
    if (filter.kind === "aql") return filter.query;
    // 스마트 검색 문자열은 검색 화면과 같은 번역기로 AQL이 된다
    return fromSmart(filter.query, {
      users: directory.users,
      projects: directory.project ? [directory.project] : [],
      statuses: directory.statuses,
      types,
      priorities,
    });
  }, [filter, directory, types, priorities]);

  useEffect(() => {
    if (!directory) return;
    if (!directory.project) {
      setError("프로젝트를 찾을 수 없습니다");
      return;
    }
    let active = true;
    setError(null);
    const key = directory.project.key;
    const main = queryIssuesAql(buildViewAql(key, filterAql), { page: 0, size: VIEW_FETCH_SIZE });
    const lookup = filterAql && needsLookup ? queryIssuesAql(buildViewAql(key, null), { page: 0, size: VIEW_FETCH_SIZE }) : null;
    void Promise.all([main, lookup]).then(
      ([result, all]) => {
        if (!active) return;
        setLoaded({ issues: result.items, lookup: all ? all.items : result.items, total: result.total });
      },
      (failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [directory, filterAql, needsLookup]);

  const ctx: GroupingContext | null = useMemo(() => {
    if (!directory || !loaded) return null;
    const issuesById = new Map<string, Issue>();
    for (const issue of loaded.lookup) issuesById.set(issue.id, issue);
    for (const issue of loaded.issues) issuesById.set(issue.id, issue);
    return {
      statuses: directory.statuses,
      priorities,
      types,
      users: directory.users,
      sprints: directory.sprints,
      versions: directory.versions,
      components: directory.components,
      labels: directory.labels,
      issuesById,
    };
  }, [directory, loaded, priorities, types]);

  const groups = useMemo(() => {
    if (!ctx || !loaded) return null;
    const rows = loaded.issues.filter((issue) => matchesChips(issue, chips));
    // 보드에는 하위 그룹이 없다(열 하나에 한 단계)
    return groupIssues(rows, layout === "board" ? { ...display, subGroupBy: "none" } : display, ctx);
  }, [ctx, loaded, chips, display, layout]);

  const toggle = useCallback(
    (key: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  if (error !== null) {
    return (
      <div className="issue-list-error" role="alert">
        <div>
          <strong>보기를 불러오지 못했습니다</strong>
          <p>{error}</p>
        </div>
        <Button size="small" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (!groups || !ctx || !loaded) {
    return (
      <div className="issue-view-loading" role="status" aria-label="보기 불러오는 중">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonListItem key={index} media="icon" />
        ))}
      </div>
    );
  }

  const shown = new Set(groups.flatMap((g) => g.issues.map((i) => i.id))).size;
  const summary = (
    <p className="issue-view-summary" role="status" aria-live="polite">
      {`${shown}건`}
      {loaded.total > loaded.issues.length ? ` · 조건에 맞는 ${loaded.total}건 중 처음 ${loaded.issues.length}건만 표시` : ""}
    </p>
  );

  if (shown === 0 && !display.showEmptyGroups) {
    return (
      <>
        {summary}
        <div className="issue-empty">
          <EmptyState title="조건에 맞는 이슈가 없습니다" description="보기 필터나 표시 옵션을 조정해 보세요." />
        </div>
      </>
    );
  }

  const usersById = new Map(ctx.users.map((u) => [u.id, u]));
  const rowProps: RowContext = { ctx, usersById, properties: display.properties, selectedKey, onOpenIssue };

  if (layout === "board") {
    return (
      <>
        {summary}
        <div className="issue-view-board" aria-label="이슈 보드 보기">
          {groups.map((group) => (
            <section key={group.key} className="issue-view-column" aria-label={`${group.label} ${group.count}건`}>
              <header className="issue-view-column-header">
                <GroupHeading group={group} ctx={ctx} usersById={usersById} />
              </header>
              <ul className="issue-view-cards">
                {group.issues.map((issue) => (
                  <li key={issue.id}>
                    <IssueCard
                      issue={issue}
                      assignee={issue.assigneeId ? usersById.get(issue.assigneeId) : undefined}
                      epicName={display.groupBy === "epic" ? undefined : epicOf(issue, ctx)?.title}
                      onOpen={() => onOpenIssue(issue.key)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </>
    );
  }

  const single = display.groupBy === "none";
  return (
    <>
      {summary}
      <div className="issue-view-list" aria-label="이슈 그룹 보기">
        {single ? (
          <IssueRows issues={groups[0]?.issues ?? []} {...rowProps} />
        ) : (
          groups.map((group) => (
            <GroupSection key={group.key} group={group} level={3} collapsed={collapsed} onToggle={toggle} rowProps={rowProps} />
          ))
        )}
      </div>
    </>
  );
}

interface RowContext {
  ctx: GroupingContext;
  usersById: Map<string, User>;
  properties: ViewProperty[];
  selectedKey?: string | null;
  onOpenIssue: (key: string) => void;
}

function GroupSection({
  group,
  level,
  collapsed,
  onToggle,
  rowProps,
  parentKey = "",
}: {
  group: IssueGroup;
  level: 3 | 4;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  rowProps: RowContext;
  parentKey?: string;
}) {
  const stateKey = `${parentKey}${group.key}`;
  const isCollapsed = collapsed.has(stateKey);
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <section className={`issue-group is-level-${level}`} aria-label={`${group.label} ${group.count}건`}>
      <Heading className="issue-group-header">
        <button type="button" className="issue-group-toggle" aria-expanded={!isCollapsed} onClick={() => onToggle(stateKey)}>
          {isCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          <GroupHeading group={group} ctx={rowProps.ctx} usersById={rowProps.usersById} />
        </button>
      </Heading>
      {isCollapsed ? null : group.subGroups && group.subGroups.length > 0 ? (
        group.subGroups.map((sub) => (
          <GroupSection
            key={sub.key}
            group={sub}
            level={4}
            collapsed={collapsed}
            onToggle={onToggle}
            rowProps={rowProps}
            parentKey={`${stateKey}/`}
          />
        ))
      ) : group.issues.length > 0 ? (
        <IssueRows issues={group.issues} {...rowProps} />
      ) : (
        <p className="issue-group-empty">이슈 없음</p>
      )}
    </section>
  );
}

/** 그룹 머리글 — 값 아이콘 + 이름 + 건수(+ 스토리 포인트 합) */
function GroupHeading({ group, ctx, usersById }: { group: IssueGroup; ctx: GroupingContext; usersById: Map<string, User> }) {
  return (
    <span className="issue-group-heading">
      <GroupIcon group={group} ctx={ctx} usersById={usersById} />
      <span className="issue-group-label">{group.label}</span>
      <Badge>{group.count}</Badge>
      {group.storyPoints > 0 ? <span className="issue-group-points">{`${group.storyPoints} 포인트`}</span> : null}
    </span>
  );
}

function GroupIcon({ group, ctx, usersById }: { group: IssueGroup; ctx: GroupingContext; usersById: Map<string, User> }) {
  if (group.value === null) return null;
  switch (group.kind) {
    case "status":
      return <StatusGlyph status={group.value} statuses={ctx.statuses} variant="icon" />;
    case "priority":
      return <PriorityGlyph defs={ctx.priorities} priority={group.value} size={14} variant="icon" />;
    case "type":
      return <IssueTypeGlyph type={group.value} types={ctx.types} variant="icon" />;
    case "epic":
      return <IssueTypeGlyph type={ctx.issuesById.get(group.value)?.type ?? "epic"} types={ctx.types} variant="icon" />;
    case "assignee":
      return (
        <span aria-hidden className="issue-group-avatar">
          <UserAvatar user={usersById.get(group.value)} name={group.label} size="small" />
        </span>
      );
    default:
      return null;
  }
}

function IssueRows({ issues, ctx, usersById, properties, selectedKey, onOpenIssue }: RowContext & { issues: Issue[] }) {
  const has = (p: ViewProperty) => properties.includes(p);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="issue-view-rows">
      {issues.map((issue) => {
        const overdue = issue.dueDate !== null && issue.dueDate < today && statusKind(ctx.statuses, issue.status) !== "complete";
        const assignee = issue.assigneeId ? usersById.get(issue.assigneeId) : undefined;
        const parent = issue.parentId ? ctx.issuesById.get(issue.parentId) : undefined;
        const trailing: ReactNode[] = [];
        if (has("flagged") && issue.flagged) trailing.push(<IssueFlagMark key="flagged" />);
        if (has("labels") && issue.labels.length > 0) {
          trailing.push(
            <span key="labels" className="issue-card-labels">
              {issue.labels.map((label) => <Tag key={label} label={label} />)}
            </span>,
          );
        }
        if (has("components") && (issue.componentIds ?? []).length > 0) {
          const names = (issue.componentIds ?? []).map((id) => ctx.components.find((c) => c.id === id)?.name ?? id);
          trailing.push(<span key="components" className="issue-view-meta">{names.join(", ")}</span>);
        }
        if (has("parent") && issue.parentId) {
          trailing.push(<span key="parent" className="issue-view-meta">{`상위 ${parent?.key ?? "—"}`}</span>);
        }
        if (has("sprint")) {
          const sprint = ctx.sprints.find((s) => s.id === issue.sprintId);
          trailing.push(<span key="sprint" className="issue-view-meta">{sprint?.name ?? "백로그"}</span>);
        }
        if (has("fixVersion") && issue.fixVersionId) {
          trailing.push(
            <span key="fixVersion" className="issue-view-meta">
              {ctx.versions.find((v) => v.id === issue.fixVersionId)?.name ?? "—"}
            </span>,
          );
        }
        if (has("startDate") && issue.startDate) {
          trailing.push(<span key="startDate" className="issue-view-meta">{`시작 ${formatDate(issue.startDate)}`}</span>);
        }
        if (has("due") && issue.dueDate) {
          trailing.push(
            <span key="due" className={overdue ? "issue-view-meta due-cell is-overdue" : "issue-view-meta"}>
              {`마감 ${formatDate(issue.dueDate)}`}
            </span>,
          );
        }
        if (has("storyPoints") && issue.storyPoints !== null && issue.storyPoints !== undefined) {
          trailing.push(
            <span key="storyPoints" className="issue-points" aria-label={`스토리 포인트 ${issue.storyPoints}`}>
              {issue.storyPoints}
            </span>,
          );
        }
        if (has("estimate") && issue.estimateHours !== null) {
          trailing.push(<span key="estimate" className="issue-view-meta">{`${issue.estimateHours}h`}</span>);
        }
        if (has("created")) trailing.push(<span key="created" className="issue-view-meta">{`생성 ${formatDate(issue.createdAt)}`}</span>);
        if (has("updated")) trailing.push(<span key="updated" className="issue-view-meta">{`수정 ${formatDate(issue.updatedAt)}`}</span>);
        if (has("reporter")) {
          trailing.push(
            <span key="reporter" className="issue-view-meta">{`보고자 ${usersById.get(issue.reporterId)?.name ?? "—"}`}</span>,
          );
        }
        if (has("assignee")) {
          trailing.push(
            assignee ? (
              <span key="assignee" className="issue-assignee-cell">
                <UserAvatar user={assignee} size="small" />
              </span>
            ) : (
              <span key="assignee" className="issue-view-meta">미지정</span>
            ),
          );
        }
        return (
          <li key={issue.id}>
            <button
              type="button"
              className={`issue-view-row${typeLevel(ctx.types, issue.type) === "subtask" ? " is-subtask" : ""}`}
              data-issue-key={issue.key}
              aria-current={selectedKey === issue.key ? "true" : undefined}
              onClick={() => onOpenIssue(issue.key)}
            >
              <span className="issue-view-row-lead">
                {has("priority") ? <PriorityGlyph defs={ctx.priorities} priority={issue.priority} size={14} /> : null}
                {has("key") ? <span className="issue-view-key">{issue.key}</span> : null}
                {has("type") ? <IssueTypeGlyph type={issue.type} types={ctx.types} /> : null}
                {has("status") ? (
                  <ValueWithIcon icon={<StatusGlyph status={issue.status} statuses={ctx.statuses} variant="icon" />}>
                    <Lozenge appearance={statusAppearance(ctx.statuses, issue.status)}>{statusName(ctx.statuses, issue.status)}</Lozenge>
                  </ValueWithIcon>
                ) : null}
              </span>
              <span className="issue-view-title">{issue.title}</span>
              <span className="issue-view-row-trail">{trailing}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
