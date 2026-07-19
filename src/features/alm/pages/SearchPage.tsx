import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
  Avatar,
  Button,
  EmptyState,
  Lozenge,
  Modal,
  PageHeader,
  Select,
  Table,
  Tag,
  TextField,
  useToast,
} from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type { Issue, Project, User, WorkflowStatus } from "../store/types";
import {
  listAllStatuses,
  listProjects,
  listUsers,
  queryIssues,
  statusMetaByProject,
} from "../store/jiraStore";
import { parseSmartQuery, queryTokens } from "../store/searchQuery";
import { saveFilter } from "../store/uiStore";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import {
  ISSUE_TYPES,
  PRIORITY_APPEARANCE,
  PRIORITY_LABELS,
  statusAppearance,
  statusName,
  TYPE_LABELS,
} from "../components/labels";

// 조건 추가 Select용 센티널
const PICK = "pick";

/**
 * ALM 상세 검색 — 진실은 URL의 스마트 문자열(q) 하나.
 * 입력창·조건 칩·조건 추가 Select는 전부 그 문자열의 편집기다.
 */
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
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

  const appendToken = (token: string) => setQ(q.trim() ? `${q.trim()} ${token}` : token);

  /** 조건 칩 제거 — 문자열에서 해당 토큰만 뺀다 */
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

      {/* 지라 이슈 검색처럼 검색 입력과 조건 Select를 한 줄 툴바로 묶는다 */}
      <div className="search-toolbar">
        <div className="search-toolbar-input">
          <TextField
            label="스마트 검색"
            placeholder="예: 상태:진행중 담당:김찬호 타입:버그 로그인 — 토큰과 검색어를 섞어 쓰세요"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          label="상태 추가"
          value={PICK}
          options={[
            { value: PICK, label: "선택" },
            // 전 스킴·커스텀 상태 합집합 — 기본 3상태 이름은 카테고리 토큰으로 파싱된다
            ...allStatuses.map((s) => ({
              value: `상태:${s.name.replace(/\s+/g, "")}`,
              label: s.name,
            })),
          ]}
          onValueChange={(v) => v !== PICK && appendToken(v)}
        />
        <Select
          label="담당 추가"
          value={PICK}
          options={[
            { value: PICK, label: "선택" },
            ...users.map((u) => ({ value: `담당:${u.name}`, label: u.name })),
            { value: "담당:미지정", label: "미지정" },
          ]}
          onValueChange={(v) => v !== PICK && appendToken(v)}
        />
        <Select
          label="타입 추가"
          value={PICK}
          options={[
            { value: PICK, label: "선택" },
            ...ISSUE_TYPES.map((t) => ({ value: `타입:${TYPE_LABELS[t].replace(" ", "")}`, label: TYPE_LABELS[t] })),
          ]}
          onValueChange={(v) => v !== PICK && appendToken(v)}
        />
        <Select
          label="프로젝트 추가"
          value={PICK}
          options={[
            { value: PICK, label: "선택" },
            ...projects.map((p) => ({ value: `프로젝트:${p.key}`, label: p.name })),
          ]}
          onValueChange={(v) => v !== PICK && appendToken(v)}
        />
        <Select
          label="정렬"
          value={PICK}
          options={[
            { value: PICK, label: "선택" },
            { value: "정렬:수정", label: "수정일" },
            { value: "정렬:생성", label: "생성일" },
            { value: "정렬:마감", label: "마감일" },
            { value: "정렬:우선순위", label: "우선순위" },
          ]}
          onValueChange={(v) => v !== PICK && appendToken(v)}
        />
      </div>

      {tokens.length > 0 ? (
        <div className="search-chips" data-testid="search-chips">
          {tokens.map((token) => (
            <Tag key={token} label={token} onRemove={() => removeToken(token)} />
          ))}
        </div>
      ) : null}

      {issues === null ? null : issues.length === 0 ? (
        <EmptyState
          title="결과가 없습니다"
          description="조건을 바꾸거나 칩을 제거해 보세요."
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
