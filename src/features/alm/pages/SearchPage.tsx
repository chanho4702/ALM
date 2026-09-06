import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
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
import { aqlFields, listStatusCategories, queryIssuesAql } from "../store/jiraStore";
import type { IssueQuery } from "../store/searchQuery";
import { EMPTY_QUERY, parseSmartQuery, queryTokens, serializeQuery } from "../store/searchQuery";
import { parseAql } from "../store/aql/parser";
import { AqlError } from "../store/aql/types";
import { fromAql, toAql } from "../store/aql/toAql";
import { EMPTY_FIELDS_INFO, type AqlFieldsInfo } from "../store/aql/fields";
import { AqlEditor, type AqlEditorError } from "../components/AqlEditor";
import { saveFilter } from "../store/uiStore";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { PriorityGlyph } from "../components/PriorityGlyph";
import { StatusGlyph } from "../components/StatusGlyph";
import { useIssueTypes } from "../components/useIssueTypes";
import { FilterDropdown } from "../components/FilterDropdown";
import {
  priorityName,
  statusAppearance,
  statusName,
} from "../components/labels";
import { usePriorities } from "../components/usePriorities";
import { formatDate } from "../components/time";
import { UserAvatar } from "../components/UserAvatar";

type SearchMode = "basic" | "smart" | "aql";

/** AQL 결과 한 페이지 크기 — 이슈 목록과 같은 값을 쓴다 */
const AQL_PAGE_SIZE = 50;

/**
 * 모드 전환 버튼 — 보이는 글자는 짧게, 접근 이름은 하던 말 그대로 둔다.
 * 보이는 글자가 접근 이름의 앞부분이라 WCAG 2.5.3(Label in Name)을 지키고, 기존 테스트 셀렉터도 산다.
 */
const MODE_OPTIONS: { value: SearchMode; label: string; action: string }[] = [
  { value: "basic", label: "기본", action: "기본 검색으로 전환" },
  { value: "smart", label: "스마트", action: "스마트 구문으로 전환" },
  { value: "aql", label: "AQL", action: "AQL로 전환" },
];

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
  const priorities = usePriorities();
  const PRIORITIES = priorities.map((d) => d.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  /** AQL 모드의 진실은 URL의 `aql` 파라미터다 — 있으면 AQL 모드, 없으면 기본/스마트 중 하나 */
  const aql = searchParams.get("aql");
  const [textMode, setTextMode] = useState<"basic" | "smart">("basic");
  const mode: SearchMode = aql !== null ? "aql" : textMode;
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [total, setTotal] = useState<number | null>(null); // AQL은 서버/실행기가 준 총건수
  const [page, setPage] = useState(0);
  const [allStatuses, setAllStatuses] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [statusMeta, setStatusMeta] = useState<Record<string, Record<string, WorkflowStatus>>>({});
  const [fieldsInfo, setFieldsInfo] = useState<AqlFieldsInfo>(EMPTY_FIELDS_INFO);
  const [aqlError, setAqlError] = useState<AqlEditorError | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const toast = useToast();

  useEffect(() => {
    void listUsers().then(setUsers);
    void listProjects().then(setProjects);
    void listAllStatuses().then(setAllStatuses); // 상태:이름 토큰이 커스텀 상태도 알아듣게
    void listStatusCategories().then(setCategories); // 기본 필터 ↔ statusCategory 번역용
    void statusMetaByProject().then(setStatusMeta);
  }, []);

  // 자동완성 카탈로그는 AQL 모드에 들어올 때만 받는다(값 후보가 레지스트리 전체를 훑는다)
  useEffect(() => {
    if (mode !== "aql" || fieldsInfo.fields.length > 0) return;
    void aqlFields().then(setFieldsInfo);
  }, [mode, fieldsInfo.fields.length]);

  /**
   * 스마트 구문 파싱/직렬화의 문맥 — **기본·스마트 모드가 매 렌더 쓰는 값**이라 좁게 유지한다.
   * 여기에 늦게 도착하는 값을 더하면 그때마다 q가 다시 파싱되고 결과를 다시 불러, 필터 칩·트리거
   * 요약이 한 박자 늦게 갱신된다(기본 모드 테스트가 그 레이스를 잡는다).
   */
  const ctx = useMemo(
    () => ({ users, projects, statuses: allStatuses, priorities }),
    [users, projects, allStatuses, priorities],
  );
  /**
   * 상태 id → 해석된 상태. `allStatuses`는 이름만 있어 글리프가 색·아이콘을 못 고른다 —
   * 프로젝트별 메타에서 같은 id를 찾아 쓴다(먼저 만난 프로젝트 것을 취한다: 상태 레지스트리가
   * 하나라 프로젝트가 달라도 색·아이콘은 같다).
   */
  const statusById = useMemo(() => {
    const out: Record<string, WorkflowStatus> = {};
    for (const byStatus of Object.values(statusMeta)) {
      for (const [id, ws] of Object.entries(byStatus)) out[id] ??= ws;
    }
    return out;
  }, [statusMeta]);
  /** AQL 번역 전용 문맥 — 모드 전환 때만 쓰이므로 타입·카테고리를 더 얹어도 기본 모드에 영향이 없다 */
  const aqlCtx = useMemo(
    () => ({ ...ctx, types: issueTypes, categories }),
    [ctx, issueTypes, categories],
  );
  const query = useMemo(() => parseSmartQuery(q, ctx), [q, ctx]);

  const reload = useCallback(async () => {
    if (aql !== null) {
      try {
        const result = await queryIssuesAql(aql, { page, size: AQL_PAGE_SIZE });
        setIssues(result.items);
        setTotal(result.total);
        setAqlError(null);
      } catch (error) {
        // 문법 오류는 밑줄로, 그 밖(로드 실패)은 토스트로 — 결과는 비운다
        setIssues([]);
        setTotal(0);
        if (error instanceof AqlError) {
          setAqlError({ message: error.message, position: error.position });
        } else {
          setAqlError(null);
          toast({
            title: "검색을 실행하지 못했습니다",
            description: error instanceof Error ? error.message : String(error),
            appearance: "danger",
          });
        }
      }
      return;
    }
    setTotal(null);
    setAqlError(null);
    setIssues(await queryIssues(query));
  }, [aql, page, query, toast]);

  // 질의가 바뀌면 첫 페이지로 — 3쪽을 보다 조건을 바꾸면 빈 화면이 나오면 안 된다
  useEffect(() => {
    setPage(0);
  }, [aql]);

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

  /** AQL 실행 — `?aql=`만 남긴다(스마트 `q`는 지운다) */
  const setAqlParam = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("q");
        params.set("aql", next);
        return params;
      },
      { replace: true },
    );
  };

  /** AQL 모드로 — 지금 필터를 AQL로 채워 넣는다(지라 Basic→JQL과 같다) */
  const switchToAql = () => setAqlParam(toAql(query, aqlCtx));

  /** AQL 모드에서 나가기 — 단순 조건만 역변환된다. 아니면 AQL을 그대로 둔다 */
  const switchFromAql = (next: "basic" | "smart") => {
    let restored: IssueQuery | null = null;
    try {
      restored = fromAql(parseAql(aql ?? ""), aqlCtx);
    } catch {
      restored = null;
    }
    if (!restored) {
      toast({
        title: "이 AQL은 기본 검색으로 옮길 수 없습니다",
        description: "AND로 이은 = · IN 조건만 되돌릴 수 있습니다. AQL을 그대로 유지합니다.",
        appearance: "info",
      });
      return;
    }
    const smart = serializeQuery(restored, aqlCtx);
    setTextMode(next);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("aql");
        if (smart.trim()) params.set("q", smart);
        else params.delete("q");
        return params;
      },
      { replace: true },
    );
  };

  const switchMode = (next: SearchMode) => {
    if (next === mode) return;
    if (next === "aql") switchToAql();
    else if (mode === "aql") switchFromAql(next);
    else setTextMode(next);
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
  /** 담당자 셀의 프로필 사진 조회용 — 이름만 필요한 자리는 userNames를 계속 쓴다 */
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
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
      await saveFilter(saveName, mode === "aql" ? (aql ?? "") : q, mode === "aql" ? "aql" : "smart");
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

  const modeSwitch = (
    <span className="search-mode-toggle" role="group" aria-label="검색 모드">
      {MODE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={mode === option.value ? "primary" : "ghost"}
          size="small"
          aria-pressed={mode === option.value}
          aria-label={option.action}
          onClick={() => switchMode(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </span>
  );

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
          <span className="status-cell">
            <StatusGlyph status={issue.status} statuses={statusList} variant="icon" />
            <Lozenge appearance={statusAppearance(statusList, issue.status)}>
              {statusName(statusList, issue.status)}
            </Lozenge>
          </span>
        );
      },
    },
    {
      key: "priority",
      header: "우선순위",
      width: "104px",
      render: (issue) => (
        <span className="status-cell">
          {/* 이름은 옆 텍스트가 갖는다 — 아이콘은 색·모양만 거든다 */}
          <PriorityGlyph defs={priorities} priority={issue.priority} variant="icon" />
          <span>{priorityName(priorities, issue.priority)}</span>
        </span>
      ),
    },
    {
      key: "assignee",
      header: "담당자",
      width: "144px",
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
      width: "112px",
      align: "right",
      render: (issue) => (issue.dueDate ? formatDate(issue.dueDate) : "—"),
    },
  ];

  return (
    <main className="project-list-content search-page">
      <PageHeader
        title="검색"
        actions={
          q.trim() || (aql ?? "").trim() ? (
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
            // 멀티 선택 항목은 DS Checkbox — 라벨 텍스트가 접근 이름을 만드니 글리프는 숨긴다
            options={allStatuses.map((s) => ({
              value: s.id,
              label: s.name,
              icon: (
                <StatusGlyph
                  status={s.id}
                  statuses={statusById[s.id] ? [statusById[s.id]] : undefined}
                  variant="icon"
                />
              ),
            }))}
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
            options={issueTypes.map((t) => ({
              value: t.id,
              label: t.name,
              icon: <IssueTypeGlyph type={t.id} types={issueTypes} variant="icon" />,
            }))}
            selected={query.types}
            onToggle={(v) =>
              setQuery({ ...query, types: toggled(query.types, v) as IssueType[] })
            }
          />
          <FilterDropdown
            label="우선순위"
            options={PRIORITIES.map((p) => ({
              value: p,
              label: priorityName(priorities, p),
              icon: <PriorityGlyph defs={priorities} priority={p} size={14} variant="icon" />,
            }))}
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
          {modeSwitch}
        </div>
      ) : mode === "smart" ? (
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
          {modeSwitch}
        </div>
      ) : (
        // AQL 모드 — 지라 JQL 자리. 한 줄 에디터 + 자동완성 + 실시간 검증
        <div className="search-aql-bar" data-testid="search-aql-bar">
          <AqlEditor
            value={aql ?? ""}
            fields={fieldsInfo}
            runError={aqlError}
            onRun={setAqlParam}
          />
          {modeSwitch}
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
          <div className="search-result-bar">
            {/* 건수 문구는 세 모드가 같다 — 페이징은 범위 표시와 페이저를 옆에 덧붙일 뿐이다 */}
            <p className="search-count" data-testid="search-count">
              {mode === "aql" && total !== null ? total : issues.length}개 이슈
            </p>
            {/* 범위·페이저는 AQL 모드에서만 — 전환 직후 stale total이 남아도 그리지 않는다 */}
            {mode === "aql" && total !== null && total > 0 ? (
              <span className="search-range" data-testid="search-range">
                {`${page * AQL_PAGE_SIZE + 1}–${Math.min((page + 1) * AQL_PAGE_SIZE, total)} / ${total}건`}
              </span>
            ) : null}
            {mode === "aql" && total !== null && total > AQL_PAGE_SIZE ? (
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
                  disabled={(page + 1) * AQL_PAGE_SIZE >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </Button>
              </div>
            ) : null}
          </div>
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
