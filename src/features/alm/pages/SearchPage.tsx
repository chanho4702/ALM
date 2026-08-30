import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
  Avatar,
  Button,
  Dropdown,
  EmptyState,
  Lozenge,
  Modal,
  PageHeader,
  Table,
  Tag,
  TextField,
  useToast,
} from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  IssueType,
  Project,
  User,
  WorkflowStatus,
} from "../store/types";
import {
  listAllStatuses,
  listProjects,
  listUsers,
  queryIssues,
  statusMetaByProject,
} from "../store/jiraStore";
import type { IssueQuery } from "../store/searchQuery";
import { EMPTY_QUERY, parseSmartQuery, queryTokens, serializeQuery } from "../store/searchQuery";
import { saveFilter } from "../store/uiStore";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { useIssueTypes } from "../components/useIssueTypes";
import { FilterDropdown } from "../components/FilterDropdown";
import {
  PRIORITY_APPEARANCE,
  PRIORITY_LABELS,
  statusAppearance,
  statusName,
} from "../components/labels";

const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];
const CATEGORY_IDS = new Set(["todo", "inprogress", "done"]);

const SORT_OPTIONS: { value: IssueQuery["sort"]; label: string }[] = [
  { value: "updated", label: "수정일" },
  { value: "created", label: "생성일" },
  { value: "due", label: "마감일" },
  { value: "priority", label: "우선순위" },
];

/**
 * ALM 상세 검색 — 지라 이슈 검색 모방.
 * 기본 모드: 검색어 입력 + 필터 드롭다운 버튼 줄 (지라 Basic).
 * 스마트 모드: 한국어 스마트 문자열 직접 편집 (지라 JQL 대응, ALM 특색).
 * 진실은 어느 모드든 URL의 q 문자열 하나다.
 */
export function SearchPage() {
  const issueTypes = useIssueTypes();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [mode, setMode] = useState<"basic" | "smart">("basic");
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [allStatuses, setAllStatuses] = useState<{ id: string; name: string }[]>([]);
  const [statusMeta, setStatusMeta] = useState<Record<string, Record<string, WorkflowStatus>>>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const toast = useToast();

  useEffect(() => {
    void listUsers().then(setUsers);
    void listProjects().then(setProjects);
    void listAllStatuses().then(setAllStatuses); // 상태:이름 토큰이 커스텀 상태도 알아듣게
    void statusMetaByProject().then(setStatusMeta);
  }, []);

  const ctx = useMemo(
    () => ({ users, projects, statuses: allStatuses }),
    [users, projects, allStatuses],
  );
  const query = useMemo(() => parseSmartQuery(q, ctx), [q, ctx]);

  const reload = useCallback(async () => {
    setIssues(await queryIssues(query));
  }, [query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  /** q 문자열 갱신 — 검색 히스토리를 오염시키지 않게 replace */
  const setQ = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next.trim()) params.set("q", next);
        else params.delete("q");
        return params;
      },
      { replace: true },
    );
  };

  /** 기본 모드 필터 조작 — 쿼리 객체를 고쳐 스마트 문자열로 되쓴다 */
  const setQuery = (next: IssueQuery) => setQ(serializeQuery(next, ctx));
  const toggled = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  // 기본 모드 검색어 입력 초안 — 포커스 중이 아닐 때만 q에서 동기화 (타이핑 클로버 방지)
  const [textDraft, setTextDraft] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== textRef.current) setTextDraft(query.text);
  }, [query.text]);

  /** 조건 칩 제거 — 문자열에서 해당 토큰만 뺀다 (스마트 모드) */
  const removeToken = (token: string) =>
    setQ(
      q
        .split(/\s+/)
        .filter((part) => part !== token)
        .join(" "),
    );

  const tokens = useMemo(() => queryTokens(query, ctx), [query, ctx]);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  // 상태 필터: 카테고리 id는 statuses, 커스텀 id는 statusIds — 선택 목록은 합쳐 보여준다
  const selectedStatusIds = useMemo(
    () => [...query.statuses, ...query.statusIds],
    [query.statuses, query.statusIds],
  );
  const toggleStatus = (id: string) => {
    if (CATEGORY_IDS.has(id)) {
      setQuery({ ...query, statuses: toggled(query.statuses, id) as IssueStatus[] });
    } else {
      setQuery({ ...query, statusIds: toggled(query.statusIds, id) });
    }
  };

  const hasFilters =
    query.projectIds.length > 0 ||
    selectedStatusIds.length > 0 ||
    query.assigneeIds.length > 0 ||
    query.types.length > 0 ||
    query.priorities.length > 0;

  const clearFilters = () => setQuery({ ...EMPTY_QUERY, text: query.text, sort: query.sort });

  const sortLabel = SORT_OPTIONS.find((o) => o.value === query.sort)?.label ?? "수정일";

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await saveFilter(saveName, q);
      toast({ title: `필터 "${saveName.trim()}"를 저장했습니다`, appearance: "success" });
      setSaveName("");
      setSaveOpen(false);
    } catch (error) {
      toast({
        title: "필터 저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

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
    {
      key: "project",
      header: "프로젝트",
      width: "128px",
      render: (issue) => projectNames[issue.projectId] ?? "—",
    },
    { key: "title", header: "제목" },
    {
      key: "status",
      header: "상태",
      width: "104px",
      render: (issue) => {
        const ws = statusMeta[issue.projectId]?.[issue.status];
        const statusList = ws ? [ws] : undefined;
        return (
          <Lozenge appearance={statusAppearance(statusList, issue.status)}>
            {statusName(statusList, issue.status)}
          </Lozenge>
        );
      },
    },
    {
      key: "priority",
      header: "우선순위",
      width: "104px",
      render: (issue) => (
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
      ),
    },
    {
      key: "assignee",
      header: "담당자",
      width: "144px",
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
      width: "112px",
      align: "right",
      render: (issue) =>
        issue.dueDate ? new Date(issue.dueDate).toLocaleDateString("ko-KR") : "—",
    },
  ];

  return (
    <main className="project-list-content search-page">
      <PageHeader
        title="검색"
        actions={
          q.trim() ? (
            <Button variant="secondary" onClick={() => setSaveOpen(true)}>
              필터로 저장
            </Button>
          ) : undefined
        }
      />

      {mode === "basic" ? (
        // 지라 Basic 검색 — 검색어 입력 + 필터 드롭다운 버튼 줄
        <div className="search-basic-bar" data-testid="search-basic-bar">
          <div className="search-basic-input">
            <TextField
              ref={textRef}
              label="검색어"
              placeholder="이슈 검색"
              value={textDraft}
              onChange={(e) => {
                setTextDraft(e.target.value);
                setQuery({ ...query, text: e.target.value });
              }}
            />
          </div>
          <FilterDropdown
            label="프로젝트"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            selected={query.projectIds}
            onToggle={(v) => setQuery({ ...query, projectIds: toggled(query.projectIds, v) })}
          />
          <FilterDropdown
            label="상태"
            options={allStatuses.map((s) => ({ value: s.id, label: s.name }))}
            selected={selectedStatusIds}
            onToggle={toggleStatus}
          />
          <FilterDropdown
            label="담당자"
            options={[
              ...users.map((u) => ({ value: u.id, label: u.name })),
              { value: "unassigned", label: "미지정" },
            ]}
            selected={query.assigneeIds}
            onToggle={(v) => setQuery({ ...query, assigneeIds: toggled(query.assigneeIds, v) })}
          />
          <FilterDropdown
            label="타입"
            options={issueTypes.map((t) => ({ value: t.id, label: t.name }))}
            selected={query.types}
            onToggle={(v) =>
              setQuery({ ...query, types: toggled(query.types, v) as IssueType[] })
            }
          />
          <FilterDropdown
            label="우선순위"
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            selected={query.priorities}
            onToggle={(v) =>
              setQuery({ ...query, priorities: toggled(query.priorities, v) as IssuePriority[] })
            }
          />
          <Dropdown
            trigger={
              <button type="button" className="filter-dropdown-trigger">
                정렬: {sortLabel}
                <span className="filter-dropdown-caret" aria-hidden>
                  ▾
                </span>
              </button>
            }
            items={SORT_OPTIONS.map((option) => ({
              label: option.label,
              onSelect: () => setQuery({ ...query, sort: option.value }),
            }))}
          />
          {hasFilters ? (
            <Button variant="ghost" size="small" onClick={clearFilters}>
              필터 초기화
            </Button>
          ) : null}
          <span className="search-mode-toggle">
            <Button variant="ghost" size="small" onClick={() => setMode("smart")}>
              스마트 구문으로 전환
            </Button>
          </span>
        </div>
      ) : (
        // 지라 JQL 모드 대응 — 한국어 스마트 문자열 직접 편집 (ALM 특색)
        <div className="search-smart-bar">
          <div className="search-smart-input">
            <TextField
              label="스마트 검색"
              placeholder="예: 상태:진행중 담당:김찬호 타입:버그 로그인 — 토큰과 검색어를 섞어 쓰세요"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <span className="search-mode-toggle">
            <Button variant="ghost" size="small" onClick={() => setMode("basic")}>
              기본 검색으로 전환
            </Button>
          </span>
        </div>
      )}

      {mode === "smart" && tokens.length > 0 ? (
        <div className="search-chips" data-testid="search-chips">
          {tokens.map((token) => (
            <Tag key={token} label={token} onRemove={() => removeToken(token)} />
          ))}
        </div>
      ) : null}

      {issues === null ? null : issues.length === 0 ? (
        <EmptyState
          title="결과가 없습니다"
          description="조건을 바꾸거나 필터를 초기화해 보세요."
        />
      ) : (
        <>
          <p className="search-count" data-testid="search-count">
            {issues.length}개 이슈
          </p>
          <Table
            aria-label="검색 결과"
            columns={columns}
            rows={issues}
            onRowClick={(issue) => openIssue(issue.key)}
          />
        </>
      )}

      {saveOpen ? (
        <Modal
          trigger={<span hidden />}
          title="필터로 저장"
          description="저장한 필터는 사이드바 필터 섹션에서 원클릭으로 적용됩니다."
          open
          onOpenChange={(next) => {
            if (!next) setSaveOpen(false);
          }}
        >
          <form className="project-create-form" onSubmit={handleSave}>
            <TextField
              label="필터 이름"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="예: 내 진행 중 버그"
            />
            <Button type="submit" disabled={!saveName.trim()}>
              저장
            </Button>
          </form>
        </Modal>
      ) : null}
      {issueModal}
    </main>
  );
}
