import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router";
import { Button, Dropdown, EmptyState, Lozenge, Modal, PageHeader, Switch, Table, TextField, useToast } from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type { Project } from "../store/types";
import { deleteProject, listIssues } from "../store/jiraStore";
import { listStarredProjectIds, pruneProject, toggleProjectStar } from "../store/uiStore";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { useTablePrefs } from "../components/useTablePrefs";

export interface ProjectListPageProps {
  projects: Project[];
  /** 생성/수정/삭제 후 App이 프로젝트 목록을 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/**
 * 프로젝트 디렉터리 — 지라의 프로젝트 페이지 모방: 검색 + 테이블(기본).
 * 카드 뷰는 ALM 편의로 토글 제공.
 */
export function ProjectListPage({ projects, onProjectsChanged }: ProjectListPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void listStarredProjectIds().then(setStarredIds);
  }, []);

  const handleStarToggle = async (project: Project) => {
    await toggleProjectStar(project.id); // uiStore 이벤트로 사이드바 별표 섹션도 갱신된다
    setStarredIds(await listStarredProjectIds());
  };

  // 프로젝트별 이슈 개수 — 목록 메타와 삭제 경고에 쓴다
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (p) => [p.id, (await listIssues(p.id)).length] as const),
      );
      if (!cancelled) setIssueCounts(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<string | undefined>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const tablePrefs = useTablePrefs("projects");
  const handleSort = (key: string) => {
    if (sortKey === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };
  const visible = useMemo(() => {
    const text = filter.trim().toLowerCase();
    if (!text) return projects;
    return projects.filter((p) => showArchived || !p.archivedAt).filter(
      (p) => p.name.toLowerCase().includes(text) || p.key.toLowerCase().includes(text),
    );
  }, [projects, filter, showArchived]);
  const sortedVisible = useMemo(() => {
    if (!sortKey) return visible;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...visible].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "key":
          cmp = a.key.localeCompare(b.key);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "issues":
          cmp = (issueCounts[a.id] ?? 0) - (issueCounts[b.id] ?? 0);
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        default:
          cmp = a.name.localeCompare(b.name);
      }
      return cmp * dir;
    });
  }, [visible, sortKey, sortDirection, issueCounts]);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteProject(deleting.id);
      await pruneProject(deleting.id); // 최근/별표에서도 제거
      toast({ title: `프로젝트 ${deleting.key}를 삭제했습니다`, appearance: "success" });
      setDeleting(null);
      await onProjectsChanged();
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const starButton = (project: Project) => (
    <Button
      variant="ghost"
      size="small"
      className={starredIds.includes(project.id) ? "project-star is-starred" : "project-star"}
      aria-label={`${project.name} 별표`}
      aria-pressed={starredIds.includes(project.id)}
      onClick={(e) => {
        e.stopPropagation(); // 행 클릭(보드 이동)과 분리
        void handleStarToggle(project);
      }}
    >
      {starredIds.includes(project.id) ? "★" : "☆"}
    </Button>
  );

  const manageDropdown = (project: Project) => (
    <span onClick={(e) => e.stopPropagation()}>
      <Dropdown
        trigger={
          <Button variant="ghost" size="small" aria-label={`${project.name} 관리`}>
            <MoreHorizontal size={16} />
          </Button>
        }
        items={[
          { label: "설정", onSelect: () => navigate(`/projects/${project.id}/settings`) },
          { label: "삭제", danger: true, onSelect: () => setDeleting(project) },
        ]}
      />
    </span>
  );

  // 지라 프로젝트 테이블 컬럼: ★ · 이름 · 키 · 이슈 · 생성일 · 관리
  const columns: TableColumn<Project>[] = [
    {
      key: "star",
      adjustable: false,
      header: "",
      width: "48px",
      render: (project) => starButton(project),
    },
    {
      key: "name",
      sortable: true,
      header: "이름",
      render: (project) => (
        <span className="project-name-cell">
          <ProjectAvatar project={project} size="sm" />
          <span className="project-name-cell-text">{project.name}</span>
          {project.archivedAt ? <Lozenge appearance="neutral">보관됨</Lozenge> : null}
        </span>
      ),
    },
    {
      key: "key",
      sortable: true,
      header: "키",
      width: "88px",
      render: (project) => <span className="issue-key-cell">{project.key}</span>,
    },
    {
      key: "category",
      sortable: true,
      header: "범주",
      width: "120px",
      render: (project) => project.category || "—",
    },
    {
      key: "issues",
      sortable: true,
      header: "이슈",
      width: "88px",
      align: "right",
      render: (project) => `${issueCounts[project.id] ?? 0}개`,
    },
    {
      key: "createdAt",
      sortable: true,
      header: "생성일",
      width: "112px",
      align: "right",
      render: (project) => new Date(project.createdAt).toLocaleDateString("ko-KR"),
    },
    {
      key: "manage",
      adjustable: false,
      header: "",
      width: "72px",
      align: "right",
      render: (project) => manageDropdown(project),
    },
  ];

  return (
    <>
      <main className="project-list-content project-directory">
        <PageHeader
          title="프로젝트"
          actions={
            projects.length > 0 ? (
              <Button onClick={() => navigate("/projects/new")}>새 프로젝트</Button>
            ) : undefined
          }
        />
        {projects.length === 0 ? (
          <EmptyState
            title="아직 프로젝트가 없습니다"
            description="첫 프로젝트를 만들어 보드를 시작하세요."
            primaryAction={{
              label: "첫 프로젝트 만들기",
              onClick: () => navigate("/projects/new"),
            }}
          />
        ) : (
          <>
            <div className="project-list-toolbar">
              <div className="project-list-search">
                <TextField
                  label="프로젝트 검색"
                  placeholder="이름·키로 검색"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="project-list-side-actions">
                <Switch label="보관된 프로젝트 보기" checked={showArchived} onCheckedChange={setShowArchived} />
                <Button variant="ghost" size="small" onClick={() => navigate("/projects/trash")}>
                  휴지통
                </Button>
              </div>
              <div className="project-view-toggle" role="group" aria-label="보기 방식">
                <Button
                  size="small"
                  variant={view === "table" ? "secondary" : "ghost"}
                  aria-pressed={view === "table"}
                  onClick={() => setView("table")}
                >
                  테이블
                </Button>
                <Button
                  size="small"
                  variant={view === "cards" ? "secondary" : "ghost"}
                  aria-pressed={view === "cards"}
                  onClick={() => setView("cards")}
                >
                  카드
                </Button>
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState title="검색과 일치하는 프로젝트가 없습니다" description="다른 이름이나 키로 검색해 보세요." />
            ) : view === "table" ? (
              <Table
                aria-label="프로젝트 목록"
                columns={columns}
                rows={sortedVisible}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onRowClick={(project) => navigate(`/projects/${project.id}/board`)}
                resizable
                reorderable
                columnOrder={tablePrefs.order}
                columnWidths={tablePrefs.widths}
                onColumnOrderChange={tablePrefs.setOrder}
                onColumnWidthsChange={tablePrefs.setWidths}
              />
            ) : (
              <div className="project-grid">
                {visible.map((project) => (
                  <div key={project.id} className="project-card">
                    <div className="project-card-head">
                      <ProjectAvatar project={project} size="md" />
                      <div className="project-card-title">
                        <h3>{project.name}</h3>
                        <span className="issue-key-cell">{project.key}</span>
                      </div>
                      {starButton(project)}
                      {manageDropdown(project)}
                    </div>
                    <p className="project-card-desc">{project.description || "설명이 없습니다"}</p>
                    <div className="project-card-meta">
                      <span>이슈 {issueCounts[project.id] ?? 0}개</span>
                      <span aria-hidden>·</span>
                      <span>{new Date(project.createdAt).toLocaleDateString("ko-KR")} 생성</span>
                    </div>
                    <div className="project-card-actions">
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => navigate(`/projects/${project.id}/board`)}
                      >
                        보드
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => navigate(`/projects/${project.id}/backlog`)}
                      >
                        백로그
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => navigate(`/projects/${project.id}/dashboard`)}
                      >
                        대시보드
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {deleting ? (
        <Modal
          trigger={<span hidden />}
          title="프로젝트 삭제"
          open
          onOpenChange={(next) => {
            if (!next) setDeleting(null);
          }}
        >
          <div className="project-delete-confirm">
            <p>
              <strong>{deleting.name}</strong> ({deleting.key}) 프로젝트를 삭제하면 이슈{" "}
              {issueCounts[deleting.id] ?? 0}개가 함께 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="project-delete-actions">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()}>
                삭제
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
