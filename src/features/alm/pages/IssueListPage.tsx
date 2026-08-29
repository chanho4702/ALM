import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  Avatar,
  EmptyState,
  Lozenge,
  Select,
  Spinner,
  Table,
  TextField,
} from "@chanho/react";
import type { SortDirection, TableColumn } from "@chanho/react";
import { Tag } from "@chanho/react";
import type { Issue, IssuePriority, IssueType, User, WorkflowStatus } from "../store/types";
import { listIssues, listProjectStatuses, listUsers } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import {
  CATEGORY_ORDER,
  ISSUE_TYPES,
  PRIORITY_APPEARANCE,
  PRIORITY_LABELS,
  statusAppearance,
  statusCategory,
  statusName,
  TYPE_LABELS,
} from "../components/labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → "전체"는 센티널
const ALL = "all";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

// 정렬용 위계: 우선순위 높음→낮음 (상태는 카테고리 위계 CATEGORY_ORDER 사용)
const PRIORITY_ORDER: Record<IssuePriority, number> = { high: 0, medium: 1, low: 2 };

export function IssueListPage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [assigneeId, setAssigneeId] = useState(ALL);
  const [label, setLabel] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [labelOptions, setLabelOptions] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [sortKey, setSortKey] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const reload = useCallback(async () => {
    if (!projectId) return;
    const list = await listIssues(projectId, {
      text: text.trim() || undefined,
      status: status === ALL ? undefined : status,
      priority: priority === ALL ? undefined : (priority as IssuePriority),
      assigneeId: assigneeId === ALL ? undefined : assigneeId,
      label: label === ALL ? undefined : label,
      type: type === ALL ? undefined : (type as IssueType),
    });
    setIssues(list);
    // 라벨 선택지는 필터와 무관한 프로젝트 전체 라벨 합집합
    const all = await listIssues(projectId);
    setLabelOptions([...new Set(all.flatMap((i) => i.labels))].sort());
    setStatuses(await listProjectStatuses(projectId));
  }, [projectId, text, status, priority, assigneeId, label, type]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 필터가 바뀔 때마다 스토어 재조회 — 화면에서 직접 거르지 않는다 (스펙 §4)
  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueKey, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

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
            CATEGORY_ORDER[statusCategory(statuses, a.status)] -
            CATEGORY_ORDER[statusCategory(statuses, b.status)];
          break;
        case "priority":
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
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
    statusCategory(statuses, issue.status) !== "done";

  const columns: TableColumn<Issue>[] = [
    {
      key: "type",
      header: "타입",
      width: "48px",
      render: (issue) => <IssueTypeGlyph type={issue.type} />,
    },
    {
      key: "key",
      header: "키",
      width: "88px",
      render: (issue) => <span className="issue-key-cell">{issue.key}</span>,
    },
    { key: "title", header: "제목", sortable: true },
    {
      key: "labels",
      header: "라벨",
      width: "130px",
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
      width: "96px",
      render: (issue) => (
        <Lozenge appearance={statusAppearance(statuses, issue.status)}>
          {statusName(statuses, issue.status)}
        </Lozenge>
      ),
    },
    {
      key: "priority",
      header: "우선순위",
      sortable: true,
      width: "96px",
      render: (issue) => (
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
      ),
    },
    {
      key: "assignee",
      header: "담당자",
      sortable: true,
      width: "140px",
      render: (issue) =>
        issue.assigneeId ? (
          <span className="issue-assignee-cell">
            <Avatar name={userNames[issue.assigneeId] ?? ""} size="small" />
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
      width: "96px",
      align: "right",
      render: (issue) =>
        issue.dueDate ? (
          <span className={isOverdue(issue) ? "due-cell is-overdue" : "due-cell"}>
            {new Date(issue.dueDate).toLocaleDateString("ko-KR")}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "createdAt",
      header: "생성일",
      sortable: true,
      width: "96px",
      align: "right",
      render: (issue) => new Date(issue.createdAt).toLocaleDateString("ko-KR"),
    },
    {
      key: "updatedAt",
      header: "수정일",
      sortable: true,
      width: "96px",
      align: "right",
      render: (issue) => new Date(issue.updatedAt).toLocaleDateString("ko-KR"),
    },
  ];

  return (
    <>
      <section>
        <div className="issue-filter-bar">
          <TextField
            label="검색"
            placeholder="제목·설명·키 검색"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Select
            label="상태"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: ALL, label: "전체" },
              ...statuses.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="우선순위"
            value={priority}
            onValueChange={setPriority}
            options={[
              { value: ALL, label: "전체" },
              ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
            ]}
          />
          <Select
            label="담당자"
            value={assigneeId}
            onValueChange={setAssigneeId}
            options={[
              { value: ALL, label: "전체" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
          <Select
            label="라벨"
            value={label}
            onValueChange={setLabel}
            options={[
              { value: ALL, label: "전체" },
              ...labelOptions.map((l) => ({ value: l, label: l })),
            ]}
          />
          <Select
            label="타입"
            value={type}
            onValueChange={setType}
            options={[
              { value: ALL, label: "전체" },
              ...ISSUE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
            ]}
          />
        </div>
        {issues === null ? (
          <div className="board-loading">
            <Spinner size="large" label="이슈 불러오는 중" />
          </div>
        ) : issues.length === 0 ? (
          <EmptyState
            title="조건에 맞는 이슈가 없습니다"
            description="검색어나 필터를 조정해 보세요."
          />
        ) : (
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
            />
          </div>
        )}
      </section>
      {issueModal}
    </>
  );
}
