import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  Checkbox,
  EmptyState,
  Lozenge,
  Spinner,
  Button,
  Modal,
  Table,
  TextField,
  useToast,
} from "@chanho/react";
import type { SortDirection, TableColumn } from "@chanho/react";
import { Tag } from "@chanho/react";
import type { Component, Issue, IssuePriority, IssueType, Sprint, User, WorkflowStatus } from "../store/types";
import {
  listComponents,
  bulkDeleteIssues,
  listIssuesPage,
  listProjectLabels,
  listProjectStatuses,
  listSprints,
  listUsers,
  resolveSettings,
} from "../store/jiraStore";
import type { IssueSortField } from "../store/jiraStore";
import { BulkEditModal } from "../components/BulkEditModal";
import { CsvImportModal } from "../components/CsvImportModal";
import { issuesToCsv } from "../store/csv";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { PriorityGlyph } from "../components/PriorityGlyph";
import { StatusGlyph } from "../components/StatusGlyph";
import { useIssueTypes } from "../components/useIssueTypes";
import { FilterDropdown } from "../components/FilterDropdown";
import { formatDate } from "../components/time";
import {
  priorityName,
  statusAppearance,
  statusKind,
  statusName,
} from "../components/labels";
import { resolveFields } from "../components/fieldConfig";
import { usePriorities } from "../components/usePriorities";
import { useTablePrefs } from "../components/useTablePrefs";
import { UserAvatar } from "../components/UserAvatar";
import "./issue-list.css";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → "전체"는 센티널
const ALL = "all";
/** 한 페이지 — 서버 검색과 같은 기본값 */
const PAGE_SIZE = 50;
const INITIAL_QUERY = {
  text: "",
  status: ALL,
  priority: ALL,
  assigneeId: ALL,
  label: ALL,
  componentId: ALL,
  type: ALL,
  page: 0,
  /** 정렬 열 — 없으면 서버 기본(키 오름차순) */
  sortKey: undefined as string | undefined,
  sortDirection: "asc" as SortDirection,
};

/**
 * 열 → 서버 정렬 기준. 정렬은 서버가 조건 전체에 대해 하고 화면은 받은 페이지를 그대로 그린다
 * (한 페이지 안에서만 다시 정렬하면 2쪽의 앞선 이슈가 1쪽에 안 나온다).
 * 담당자는 서버가 정렬하지 못한다(이름이 org-service에 있다) — 그래서 정렬 가능한 열로 내지 않는다.
 */
const SORT_FIELDS: Record<string, IssueSortField> = {
  key: "key",
  title: "title",
  status: "status",
  priority: "priority",
  dueDate: "due",
  createdAt: "created",
  updatedAt: "updated",
};

export function IssueListPage() {
  const { projectId } = useParams();
  // 프로젝트가 바뀌면 이전 프로젝트의 필터·선택·응답을 함께 버린다.
  return <ProjectIssueList key={projectId} projectId={projectId} />;
}

function ProjectIssueList({ projectId }: { projectId: string | undefined }) {
  const issueTypes = useIssueTypes();
  const tablePrefs = useTablePrefs("issues");
  const priorities = usePriorities();
  const PRIORITIES = priorities.map((d) => d.id);
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [loadedQuery, setLoadedQuery] = useState<typeof INITIAL_QUERY | null>(null);
  const { status, priority, assigneeId, label, type, componentId, page, sortKey, sortDirection } = query;
  const [labelOptions, setLabelOptions] = useState<string[]>([]);
  const [componentOptions, setComponentOptions] = useState<Component[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  /** 프로젝트 필드 구성 — 대량 변경에서 숨긴 필드를 뺀다 */
  const [fields, setFields] = useState(() => resolveFields(null));

  // 대량 변경 — 선택은 화면 상태, 적용은 스토어(bulkUpdateIssues)
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [displayPage, setDisplayPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [issueRetry, setIssueRetry] = useState(0);
  const [metadataRetry, setMetadataRetry] = useState(0);
  const toast = useToast();

  // 입력은 즉시 표시하고 서버 검색만 묶는다. 필터와 페이지를 한 번에 바꿔 중복 조회를 막는다.
  useEffect(() => {
    const search = text.trim();
    if (search === query.text) return;
    const timer = setTimeout(() => setQuery((prev) => ({ ...prev, text: search, page: 0 })), 250);
    return () => clearTimeout(timer);
  }, [text, query.text]);

  const changeFilter = (
    key: Exclude<keyof typeof INITIAL_QUERY, "text" | "page" | "sortKey" | "sortDirection">,
    value: string,
  ) => {
    setQuery((prev) => ({ ...prev, [key]: value, page: 0 }));
  };

  // 필터만 지운다 — 사용자가 고른 정렬은 유지한다
  const resetFilters = () => {
    setText("");
    setQuery((prev) => ({ ...INITIAL_QUERY, sortKey: prev.sortKey, sortDirection: prev.sortDirection }));
  };

  const reload = useCallback(() => setRefreshVersion((version) => version + 1), []);

  // 필터 변경 시에는 현재 페이지 하나만 조회한다. 취소된 응답은 최신 결과를 덮지 못한다.
  useEffect(() => {
    if (!projectId) return;
    const { status, priority, assigneeId, label, componentId, type, page, sortKey, sortDirection } = query;
    const sortField = sortKey ? SORT_FIELDS[sortKey] : undefined;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void listIssuesPage(
      projectId,
      {
        text: query.text || undefined,
        status: status === ALL ? undefined : status,
        priority: priority === ALL ? undefined : (priority as IssuePriority),
        assigneeId: assigneeId === ALL ? undefined : assigneeId,
        label: label === ALL ? undefined : label,
        componentId: componentId === ALL ? undefined : componentId,
        type: type === ALL ? undefined : (type as IssueType),
      },
      { page, size: PAGE_SIZE },
      sortField ? { field: sortField, dir: sortDirection } : undefined,
    ).then((result) => {
      if (!active) return;
      // 마지막 페이지의 이슈를 삭제했으면 남은 마지막 페이지로 이동한다.
      const lastPage = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1);
      if (page > lastPage) {
        setQuery((prev) => ({ ...prev, page: lastPage }));
        return;
      }
      setIssues(result.items);
      setTotal(result.total);
      setDisplayPage(page);
      setLoadedQuery(query);
      const visibleIds = new Set(result.items.map((issue) => issue.id));
      setSelected((prev) => new Set([...prev].filter((id) => visibleIds.has(id))));
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, query, refreshVersion, issueRetry]);

  // 필터와 무관한 정보는 진입·저장 후에만 병렬 조회한다. 특히 전체 이슈(라벨용)를 반복하지 않는다.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setMetadataLoading(true);
    setMetadataError(null);
    const projectMetadata = Promise.all([
      listUsers(), listSprints(projectId),
      listProjectStatuses(projectId), listComponents(projectId), resolveSettings(projectId),
    ]).then(([nextUsers, nextSprints, nextStatuses, components, settings]) => {
      if (!active) return;
      setUsers(nextUsers);
      setSprints(nextSprints);
      setStatuses(nextStatuses);
      setComponentOptions(components);
      // 대량 변경은 여러 타입이 섞이므로 기본 구성으로 해석한다.
      setFields(resolveFields(settings.body));
    });
    // 라벨 선택지는 서버가 DISTINCT로 준다 — 프로젝트 이슈 전량을 읽어 모으지 않는다.
    const labelMetadata = listProjectLabels(projectId).then((labels) => {
      if (active) setLabelOptions(labels);
    });
    void Promise.all([projectMetadata, labelMetadata]).then(() => {
      if (active) setMetadataLoaded(true);
    }).catch((error: unknown) => {
      if (active) setMetadataError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setMetadataLoading(false);
    });
    return () => { active = false; };
  }, [projectId, refreshVersion, metadataRetry]);

  const pendingSearch = text.trim() !== query.text;
  const updating = loading || pendingSearch || (loadedQuery !== query && loadError === null);
  const resultsDisabled = updating || loadError !== null;
  const actionsDisabled = resultsDisabled || metadataLoading || metadataError !== null;
  const activeFilters = [status, priority, assigneeId, label, type, componentId].filter((value) => value !== ALL).length
    + (text.trim() ? 1 : 0);

  const { openIssue, issueKey, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  /** 담당자 셀의 프로필 사진 조회용 — 이름만 필요한 자리는 userNames를 계속 쓴다 */
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  /** 정렬 변경은 서버 재조회 — 다른 정렬의 3쪽은 의미가 없으니 첫 페이지로 돌아간다 */
  const handleSort = (key: string) => {
    if (!SORT_FIELDS[key]) return;
    setQuery((prev) => ({
      ...prev,
      sortKey: key,
      sortDirection: prev.sortKey === key && prev.sortDirection === "asc" ? "desc" : "asc",
      page: 0,
    }));
  };

  // 서버가 정렬한 순서 그대로 — 화면에서 다시 정렬하지 않는다
  const sortedIssues = issues ?? [];

  const selectedId = useMemo(
    () => (issueKey ? (issues?.find((i) => i.key === issueKey)?.id ?? undefined) : undefined),
    [issueKey, issues],
  );

  // 지연: 마감일이 오늘 이전인데 완료가 아니다
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (issue: Issue) =>
    issue.dueDate !== null &&
    issue.dueDate < today &&
    statusKind(statuses, issue.status) !== "complete";

  // 표 머리글의 "모두 선택" — 현재 페이지 전체가 선택되어 있는가
  const allSelected = sortedIssues.length > 0 && sortedIssues.every((i) => selected.has(i.id));

  const toggleSelected = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleBulkDelete = async () => {
    try {
      const result = await bulkDeleteIssues([...selected]);
      toast({
        title: `${result.deleted}개 이슈를 삭제했습니다`,
        appearance: result.failed.length > 0 ? "info" : "success",
      });
      if (result.failed.length > 0) {
        toast({
          title: `${result.failed.length}개는 지우지 못했습니다`,
          description: result.failed.map((f) => `${f.key}: ${f.reason}`).join(" · "),
          appearance: "danger",
        });
      }
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    setConfirmingDelete(false);
    setSelected(new Set());
    await reload();
  };

  /**
   * CSV 내보내기 범위는 **지금 보이는 페이지**(선택이 있으면 선택한 이슈)다 — 필터 결과 전체가 아니다.
   * 버튼과 완료 알림이 그 범위를 그대로 말한다.
   */
  const exportScope = selected.size > 0 ? `선택 ${selected.size}건` : `현재 페이지 ${sortedIssues.length}건`;
  const exportCsv = () => {
    const rows = selected.size > 0 ? sortedIssues.filter((i) => selected.has(i.id)) : sortedIssues;
    const csv = issuesToCsv(rows, { statuses, users, types: issueTypes });
    if (typeof URL.createObjectURL !== "function") {
      toast({ title: "이 환경에서는 파일 내려받기를 지원하지 않습니다", appearance: "info" });
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `issues-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({
      title: `${selected.size > 0 ? "선택한" : "현재 페이지의"} ${rows.length}개 이슈를 CSV로 내보냈습니다`,
      description: total > rows.length ? `조건에 맞는 전체 ${total}건 중 ${rows.length}건입니다.` : undefined,
      appearance: "success",
    });
  };

  const columns: TableColumn<Issue>[] = [
    {
      key: "select",
      adjustable: false,
      // "모두 선택"은 표 머리글 자리가 제자리다(지라·깃허브와 같다). 툴바에 놔두면 어느 열을
      // 고르는지 눈으로 이어지지 않는다. 라벨은 시각만 숨기고 접근 이름은 남긴다(react 0.9.0).
      header: (
        <span className="issue-select">
          <Checkbox
            label="모두 선택"
            labelHidden
            disabled={actionsDisabled}
            checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
            onCheckedChange={(checked) =>
              setSelected(checked === true ? new Set(sortedIssues.map((i) => i.id)) : new Set())
            }
          />
        </span>
      ),
      // 헤더가 노드라 정렬 버튼·너비 조절 핸들이 쓸 이름을 따로 준다
      ariaLabel: "선택",
      width: "44px",
      render: (issue) => (
        // 행 클릭(상세 열기)과 분리 — 체크박스 클릭은 행으로 올라가지 않는다.
        // 행은 DS Checkbox로 바꾸지 않았다: `labelHidden`도 라벨 텍스트("ALM-2 선택")를 DOM에
        // 남겨, 이슈 행을 `/ALM-\d+/`로 찾는 질의가 전부 두 개를 물게 된다(정렬 테스트에서 실증).
        // 텍스트를 남기지 않는 체크박스가 DS에 생기면 그때 함께 옮긴다.
        <span className="issue-select" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`${issue.key} 선택`}
            checked={selected.has(issue.id)}
            disabled={actionsDisabled}
            onChange={(e) => toggleSelected(issue.id, e.target.checked)}
          />
        </span>
      ),
    },
    {
      key: "type",
      header: "타입",
      width: "44px",
      render: (issue) => <IssueTypeGlyph type={issue.type} />,
    },
    {
      key: "key",
      header: "키",
      sortable: true,
      width: "80px",
      render: (issue) => <span className="issue-key-cell">{issue.key}</span>,
    },
    { key: "title", header: "제목", sortable: true },
    {
      key: "labels",
      header: "라벨",
      width: "120px",
      render: (issue) =>
        issue.labels.length > 0 ? (
          <span className="issue-card-labels">
            {issue.labels.map((l) => (
              <Tag key={l} label={l} />
            ))}
          </span>
        ) : null,
    },
    {
      key: "status",
      header: "상태",
      sortable: true,
      width: "112px",
      render: (issue) => (
        <span className="status-cell">
          <StatusGlyph status={issue.status} statuses={statuses} variant="icon" />
          <Lozenge appearance={statusAppearance(statuses, issue.status)}>
            {statusName(statuses, issue.status)}
          </Lozenge>
        </span>
      ),
    },
    {
      key: "priority",
      header: "우선순위",
      sortable: true,
      width: "104px",
      render: (issue) => (
        <span className="status-cell">
          {/* 이름은 옆 텍스트가 갖는다 — 아이콘은 색·모양만 거든다(중복 낭독 방지) */}
          <PriorityGlyph defs={priorities} priority={issue.priority} variant="icon" />
          <span>{priorityName(priorities, issue.priority)}</span>
        </span>
      ),
    },
    {
      // 서버 정렬 미지원(이름이 org-service에 있다) — 정렬 버튼을 내지 않는다
      key: "assignee",
      header: "담당자",
      width: "136px",
      render: (issue) =>
        issue.assigneeId ? (
          <span className="issue-assignee-cell">
            <UserAvatar user={usersById[issue.assigneeId]} name={userNames[issue.assigneeId] ?? ""} size="small" />
            {userNames[issue.assigneeId]}
          </span>
        ) : (
          "미지정"
        ),
    },
    {
      key: "dueDate",
      header: "마감일",
      sortable: true,
      width: "100px",
      align: "right",
      render: (issue) =>
        issue.dueDate ? (
          <span className={isOverdue(issue) ? "due-cell is-overdue" : "due-cell"}>
            {formatDate(issue.dueDate)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "createdAt",
      header: "생성일",
      sortable: true,
      width: "100px",
      align: "right",
      render: (issue) => formatDate(issue.createdAt),
    },
    {
      key: "updatedAt",
      header: "수정일",
      sortable: true,
      width: "100px",
      align: "right",
      render: (issue) => formatDate(issue.updatedAt),
    },
  ];

  return (
    <>
      <section className="issue-list-page" aria-label="프로젝트 이슈">
        {/* 지라 이슈 검색과 같은 칩 드롭다운 한 줄 — 스토어 필터 계약이 단일 값이라 단일 선택 모드 */}
        <div className="issue-filter-bar" data-testid="issue-filter-bar">
          <div className="issue-filter-search visually-hidden-label">
            <TextField
              label="검색"
              placeholder="제목·설명·키 검색"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <FilterDropdown
            label="상태"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...statuses.map((s) => ({
                value: s.id,
                label: s.name,
                // 라디오 항목의 접근 이름은 자손 텍스트로 조립된다 — 글리프가 이름을 가지면
                // "상태: 할 일 할 일"이 된다. 이름은 옆 라벨이 갖고 글리프는 숨긴다.
                icon: <StatusGlyph status={s.id} statuses={statuses} variant="icon" />,
              })),
            ]}
            selected={[status]}
            onToggle={(value) => changeFilter("status", value)}
          />
          <FilterDropdown
            label="우선순위"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...PRIORITIES.map((p) => ({
                value: p,
                label: priorityName(priorities, p),
                icon: <PriorityGlyph defs={priorities} priority={p} size={14} variant="icon" />,
              })),
            ]}
            selected={[priority]}
            onToggle={(value) => changeFilter("priority", value)}
          />
          <FilterDropdown
            label="담당자"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
            selected={[assigneeId]}
            onToggle={(value) => changeFilter("assigneeId", value)}
          />
          <FilterDropdown
            label="라벨"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...labelOptions.map((l) => ({ value: l, label: l })),
            ]}
            selected={[label]}
            onToggle={(value) => changeFilter("label", value)}
          />
          {componentOptions.length > 0 ? (
            <FilterDropdown
              label="컴포넌트"
              multiple={false}
              clearValue={ALL}
              options={[
                { value: ALL, label: "전체" },
                ...componentOptions.map((c) => ({ value: c.id, label: c.name })),
              ]}
              selected={[componentId]}
              onToggle={(value) => changeFilter("componentId", value)}
            />
          ) : null}
          <FilterDropdown
            label="타입"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...issueTypes.map((t) => ({
                value: t.id,
                label: t.name,
                icon: <IssueTypeGlyph type={t.id} types={issueTypes} variant="icon" />,
              })),
            ]}
            selected={[type]}
            onToggle={(value) => changeFilter("type", value)}
          />
          {activeFilters > 0 ? (
            <div className="issue-list-filter-reset">
              <span>{activeFilters}개 조건 적용</span>
              <Button size="small" variant="ghost" onClick={resetFilters}>
                필터 초기화
              </Button>
            </div>
          ) : null}
        </div>
        {metadataError !== null ? (
          <div className="issue-list-error" role="alert">
            <div>
              <strong>필터 정보를 불러오지 못했습니다</strong>
              <p>{metadataError}</p>
            </div>
            <Button size="small" variant="secondary" onClick={() => setMetadataRetry((value) => value + 1)}>
              필터 다시 불러오기
            </Button>
          </div>
        ) : null}
        {loadError !== null ? (
          <div className="issue-list-error" role="alert">
            <div>
              <strong>이슈를 불러오지 못했습니다</strong>
              <p>{loadError}</p>
            </div>
            <Button size="small" variant="secondary" onClick={() => setIssueRetry((value) => value + 1)}>
              다시 시도
            </Button>
          </div>
        ) : null}
        {/* 지라처럼 고른 게 있을 때만 나타난다 — 0건이면 표 위 툴바가 자리를 지킨다 */}
        {selected.size > 0 ? (
          <div className="bulk-bar" role="toolbar" aria-label="대량 작업">
            <span className="bulk-bar-count">{`${selected.size}개 선택`}</span>
            <Button size="small" variant="ghost" onClick={() => setSelected(new Set())}>
              선택 해제
            </Button>
            <Button size="small" disabled={actionsDisabled} onClick={() => setBulkOpen(true)}>
              대량 변경
            </Button>
            <Button size="small" variant="danger" disabled={actionsDisabled} onClick={() => setConfirmingDelete(true)}>
              삭제
            </Button>
          </div>
        ) : null}
        {issues === null && loading ? (
          <div className="board-loading">
            <Spinner size="large" label="이슈 불러오는 중" />
          </div>
        ) : (
          <>
            <div className="issue-toolbar" role="toolbar" aria-label="이슈 목록 도구">
              <div className="issue-list-result-summary" role="status" aria-live="polite">
                <span className="issue-toolbar-range">
                  {issues === null ? "결과를 불러오지 못했습니다" : total === 0 ? "0건" : `${displayPage * PAGE_SIZE + 1}–${Math.min((displayPage + 1) * PAGE_SIZE, total)} / ${total}건`}
                </span>
                {updating ? (
                  <span className="issue-list-refreshing">
                    <Spinner size="small" label="이슈 목록 업데이트 중" />
                    결과 업데이트 중 · 이전 결과 표시
                  </span>
                ) : loadError !== null && issues !== null ? (
                  <span className="issue-list-refreshing">이전 조회 결과 · 다시 시도해 주세요</span>
                ) : metadataLoading ? (
                  <span className="issue-list-refreshing">
                    <Spinner size="small" label="필터 정보 불러오는 중" />
                    필터 정보 불러오는 중
                  </span>
                ) : null}
              </div>
              <div className="issue-toolbar-actions">
                <Button size="small" variant="secondary" disabled={actionsDisabled || !issues?.length} onClick={exportCsv}>
                  {`CSV 내보내기 (${exportScope})`}
                </Button>
                <Button size="small" variant="secondary" disabled={!metadataLoaded || metadataLoading || metadataError !== null} onClick={() => setImportOpen(true)}>
                  CSV 가져오기
                </Button>
                <span className="bulk-bar-divider" aria-hidden />
                <div className="issue-pager" role="navigation" aria-label="페이지">
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={resultsDisabled || page === 0}
                    onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}
                  >
                    이전
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={resultsDisabled || (page + 1) * PAGE_SIZE >= total}
                    onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
                  >
                    다음
                  </Button>
                </div>
              </div>
            </div>
            {issues?.length === 0 && !updating && loadError === null ? (
              <div className="issue-empty">
                <EmptyState
                  title={activeFilters > 0 ? "조건에 맞는 이슈가 없습니다" : "아직 이슈가 없습니다"}
                  description={activeFilters > 0 ? "검색어나 필터를 조정하거나, 필터를 초기화해 보세요." : "이슈를 만들거나 CSV 파일로 기존 이슈를 가져와 보세요."}
                />
              </div>
            ) : issues && issues.length > 0 ? (
              <div className="issue-table-scroll" aria-busy={updating}>
                <Table
                  aria-label="이슈 목록"
                  columns={columns}
                  rows={sortedIssues}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onRowClick={resultsDisabled ? undefined : (issue) => openIssue(issue.key)}
                  selectedId={selectedId}
                  resizable
                  reorderable
                  columnOrder={tablePrefs.order}
                  columnWidths={tablePrefs.widths}
                  onColumnOrderChange={tablePrefs.setOrder}
                  onColumnWidthsChange={tablePrefs.setWidths}
                />
              </div>
            ) : null}
          </>
        )}
      </section>
      <BulkEditModal
        open={bulkOpen}
        targets={(issues ?? []).filter((i) => selected.has(i.id)).map((i) => ({ id: i.id, version: i.version }))}
        statuses={statuses}
        users={users}
        sprints={sprints}
        fields={fields}
        onOpenChange={setBulkOpen}
        onDone={() => {
          setSelected(new Set());
          void reload();
        }}
      />
      {projectId ? (
        <CsvImportModal
          open={importOpen}
          projectId={projectId}
          ctx={{ statuses, users, types: issueTypes }}
          onOpenChange={setImportOpen}
          onDone={() => void reload()}
        />
      ) : null}
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
              선택한 이슈 {selected.size}개를 삭제합니다. 하위 작업·코멘트·첨부가 함께 지워지며 되돌릴
              수 없습니다.
            </p>
            <div className="project-delete-actions">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => void handleBulkDelete()}>
                삭제
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {issueModal}
    </>
  );
}
