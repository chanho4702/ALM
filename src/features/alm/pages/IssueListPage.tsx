import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
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
  listIssues,
  listIssuesPage,
  listProjectStatuses,
  listSprints,
  listUsers,
  resolveSettings,
} from "../store/jiraStore";
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
  priorityRank,
  KIND_ORDER,
  statusAppearance,
  statusKind,
  statusName,
} from "../components/labels";
import { resolveFields } from "../components/fieldConfig";
import { usePriorities } from "../components/usePriorities";
import { useTablePrefs } from "../components/useTablePrefs";
import { UserAvatar } from "../components/UserAvatar";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → "전체"는 센티널
const ALL = "all";
/** 한 페이지 — 서버 검색과 같은 기본값 */
const PAGE_SIZE = 50;


export function IssueListPage() {
  const { projectId } = useParams();
  const issueTypes = useIssueTypes();
  const tablePrefs = useTablePrefs("issues");
  const priorities = usePriorities();
  const PRIORITIES = priorities.map((d) => d.id);
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [assigneeId, setAssigneeId] = useState(ALL);
  const [label, setLabel] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [labelOptions, setLabelOptions] = useState<string[]>([]);
  const [componentId, setComponentId] = useState(ALL);
  const [componentOptions, setComponentOptions] = useState<Component[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  /** 프로젝트 필드 구성 — 대량 변경에서 숨긴 필드를 뺀다 */
  const [fields, setFields] = useState(() => resolveFields(null));
  const [sortKey, setSortKey] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  // 대량 변경 — 선택은 화면 상태, 적용은 스토어(bulkUpdateIssues)
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const toast = useToast();

  const reload = useCallback(async () => {
    if (!projectId) return;
    const result = await listIssuesPage(
      projectId,
      {
        text: text.trim() || undefined,
        status: status === ALL ? undefined : status,
        priority: priority === ALL ? undefined : (priority as IssuePriority),
        assigneeId: assigneeId === ALL ? undefined : assigneeId,
        label: label === ALL ? undefined : label,
        componentId: componentId === ALL ? undefined : componentId,
        type: type === ALL ? undefined : (type as IssueType),
      },
      { page, size: PAGE_SIZE },
    );
    const list = result.items;
    setIssues(list);
    setTotal(result.total);
    // 사라진 이슈는 선택에서도 빠진다
    setSelected((prev) => new Set([...prev].filter((id) => list.some((i) => i.id === id))));
    setSprints(await listSprints(projectId));
    // 라벨 선택지는 필터와 무관한 프로젝트 전체 라벨 합집합
    const all = await listIssues(projectId);
    setLabelOptions([...new Set(all.flatMap((i) => i.labels))].sort());
    setStatuses(await listProjectStatuses(projectId));
    setComponentOptions(await listComponents(projectId));
    // 대량 변경은 여러 타입이 섞이므로 타입별 덮어쓰기가 아니라 **기본 구성**으로 해석한다
    setFields(resolveFields((await resolveSettings(projectId)).body));
  }, [projectId, text, status, priority, assigneeId, label, componentId, type, page]);

  // 필터가 바뀌면 첫 페이지로
  useEffect(() => {
    setPage(0);
  }, [text, status, priority, assigneeId, label, type]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 필터가 바뀔 때마다 스토어 재조회 — 화면에서 직접 거르지 않는다 (스펙 §4)
  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueKey, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  /** 담당자 셀의 프로필 사진 조회용 — 이름만 필요한 자리는 userNames를 계속 쓴다 */
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  // 정렬은 스토어 반환 목록 위에서 클라이언트가 수행한다 (필터는 스토어, 정렬은 화면)
  const sortedIssues = useMemo(() => {
    if (!issues || !sortKey) return issues ?? [];
    const dir = sortDirection === "asc" ? 1 : -1;
    const assigneeName = (i: Issue) =>
      i.assigneeId ? (userNames[i.assigneeId] ?? "") : "￿"; // 미지정은 항상 뒤로
    return [...issues].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title, "ko");
          break;
        case "status":
          cmp =
            KIND_ORDER[statusKind(statuses, a.status)] - KIND_ORDER[statusKind(statuses, b.status)];
          break;
        case "priority":
          cmp = priorityRank(priorities, a.priority) - priorityRank(priorities, b.priority);
          break;
        case "assignee":
          cmp = assigneeName(a).localeCompare(assigneeName(b), "ko");
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case "updatedAt":
          cmp = a.updatedAt.localeCompare(b.updatedAt);
          break;
        case "dueDate":
          // 미지정 마감일은 정렬 방향과 무관하게 항상 뒤로 (dir 미적용 early return)
          if (a.dueDate === null && b.dueDate === null) return 0;
          if (a.dueDate === null) return 1;
          if (b.dueDate === null) return -1;
          cmp = a.dueDate.localeCompare(b.dueDate);
          break;
      }
      return cmp * dir;
    });
  }, [issues, sortKey, sortDirection, userNames, statuses]);

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

  // 표 위 툴바의 "모두 선택" — 현재 페이지 전체가 선택되어 있는가
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

  /** 현재 보이는(필터·정렬 적용) 목록을 CSV로 — 선택이 있으면 선택만 */
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
    toast({ title: `${rows.length}개 이슈를 CSV로 내보냈습니다`, appearance: "success" });
  };

  const columns: TableColumn<Issue>[] = [
    {
      key: "select",
      adjustable: false,
      header: "",
      width: "44px",
      render: (issue) => (
        // 행 클릭(상세 열기)과 분리 — 체크박스 클릭은 행으로 올라가지 않는다
        <span className="issue-select" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`${issue.key} 선택`}
            checked={selected.has(issue.id)}
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
          <StatusGlyph status={issue.status} statuses={statuses} />
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
      key: "assignee",
      header: "담당자",
      sortable: true,
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
      <section>
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
              ...statuses.map((s) => ({ value: s.id, label: s.name })),
            ]}
            selected={[status]}
            onToggle={setStatus}
          />
          <FilterDropdown
            label="우선순위"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...PRIORITIES.map((p) => ({ value: p, label: priorityName(priorities, p) })),
            ]}
            selected={[priority]}
            onToggle={setPriority}
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
            onToggle={setAssigneeId}
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
            onToggle={setLabel}
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
              onToggle={setComponentId}
            />
          ) : null}
          <FilterDropdown
            label="타입"
            multiple={false}
            clearValue={ALL}
            options={[
              { value: ALL, label: "전체" },
              ...issueTypes.map((t) => ({ value: t.id, label: t.name })),
            ]}
            selected={[type]}
            onToggle={setType}
          />
        </div>
        {/* 지라처럼 고른 게 있을 때만 나타난다 — 0건이면 표 위 툴바가 자리를 지킨다 */}
        {selected.size > 0 ? (
          <div className="bulk-bar" role="toolbar" aria-label="대량 작업">
            <span className="bulk-bar-count">{`${selected.size}개 선택`}</span>
            <Button size="small" variant="ghost" onClick={() => setSelected(new Set())}>
              선택 해제
            </Button>
            <Button size="small" onClick={() => setBulkOpen(true)}>
              대량 변경
            </Button>
            <Button size="small" variant="danger" onClick={() => setConfirmingDelete(true)}>
              삭제
            </Button>
          </div>
        ) : null}
        {issues === null ? (
          <div className="board-loading">
            <Spinner size="large" label="이슈 불러오는 중" />
          </div>
        ) : issues.length === 0 ? (
          <div className="issue-empty">
            <EmptyState
              title="조건에 맞는 이슈가 없습니다"
              description="검색어나 필터를 조정해 보세요."
            />
            <Button size="small" variant="secondary" onClick={() => setImportOpen(true)}>
              CSV 가져오기
            </Button>
          </div>
        ) : (
          <>
            <div className="issue-toolbar" role="toolbar" aria-label="이슈 목록 도구">
              <span className="issue-toolbar-check">
                <input
                  type="checkbox"
                  aria-label="모두 선택"
                  checked={allSelected}
                  ref={(el) => {
                    // 일부만 고른 상태는 중간(indeterminate)으로 — DOM 속성이라 ref로만 세운다
                    if (el) el.indeterminate = selected.size > 0 && !allSelected;
                  }}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(sortedIssues.map((i) => i.id)) : new Set())
                  }
                />
              </span>
              <span className="issue-toolbar-range">
                {`${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} / ${total}건`}
              </span>
              <div className="issue-toolbar-actions">
                <Button size="small" variant="secondary" onClick={exportCsv}>
                  CSV 내보내기
                </Button>
                <Button size="small" variant="secondary" onClick={() => setImportOpen(true)}>
                  CSV 가져오기
                </Button>
                <span className="bulk-bar-divider" aria-hidden />
                <div className="issue-pager" role="navigation" aria-label="페이지">
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    이전
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={(page + 1) * PAGE_SIZE >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </Button>
                </div>
              </div>
            </div>
            <div className="issue-table-scroll">
              <Table
                aria-label="이슈 목록"
                columns={columns}
                rows={sortedIssues}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onRowClick={(issue) => openIssue(issue.key)}
                selectedId={selectedId}
                resizable
                reorderable
                columnOrder={tablePrefs.order}
                columnWidths={tablePrefs.widths}
                onColumnOrderChange={tablePrefs.setOrder}
                onColumnWidthsChange={tablePrefs.setWidths}
              />
            </div>
          </>
        )}
      </section>
      <BulkEditModal
        open={bulkOpen}
        issueIds={[...selected]}
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
