import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  Button,
  Dropdown,
  Modal,
  PageHeader,
  Table,
  TextArea,
  TextField,
  TopBar,
  useToast,
} from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type { Project } from "../store/types";
import { deleteProject, listIssues, updateProject } from "../store/jiraStore";
import { ProjectCreateModal } from "../components/ProjectCreateModal";
import { ThemeToggle } from "../components/ThemeToggle";

export interface ProjectListPageProps {
  projects: Project[];
  /** 생성/수정/삭제 후 App이 프로젝트 목록을 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/** JiraLayout 밖의 단독 페이지 — 프로젝트 조회/생성/수정/삭제 (스펙 §2) */
export function ProjectListPage({ projects, onProjectsChanged }: ProjectListPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Project | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);

  // 프로젝트별 이슈 개수 — 삭제 경고와 목록 표시에 쓴다
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

  const openEdit = (project: Project) => {
    setEditing(project);
    setNameDraft(project.name);
    setDescriptionDraft(project.description);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await updateProject(editing.id, { name: nameDraft, description: descriptionDraft });
      toast({ title: "프로젝트를 수정했습니다", appearance: "success" });
      setEditing(null);
      await onProjectsChanged();
    } catch (error) {
      toast({
        title: "수정 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteProject(deleting.id);
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

  const columns: TableColumn<Project>[] = [
    {
      key: "name",
      header: "이름",
      render: (p) => <span className="project-name-cell">{p.name}</span>,
    },
    {
      key: "key",
      header: "키",
      width: "88px",
      render: (p) => <span className="issue-key-cell">{p.key}</span>,
    },
    {
      key: "description",
      header: "설명",
      render: (p) =>
        p.description ? (
          <span className="project-desc-cell">{p.description}</span>
        ) : (
          <span className="project-desc-empty">설명 없음</span>
        ),
    },
    {
      key: "issues",
      header: "이슈",
      width: "72px",
      align: "right",
      render: (p) => issueCounts[p.id] ?? "–",
    },
    {
      key: "createdAt",
      header: "생성일",
      width: "112px",
      align: "right",
      render: (p) => new Date(p.createdAt).toLocaleDateString("ko-KR"),
    },
    {
      key: "actions",
      header: "",
      width: "56px",
      render: (p) => (
        // Dropdown 클릭이 행 클릭(보드 이동)으로 번지지 않게 막는다
        <span onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={
              <Button variant="ghost" size="small" aria-label={`${p.name} 관리`}>
                ⋯
              </Button>
            }
            items={[
              { label: "수정", onSelect: () => openEdit(p) },
              { label: "삭제", danger: true, onSelect: () => setDeleting(p) },
            ]}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="project-list-layout">
      <TopBar
        brand={<span className="jira-brand">ALM</span>}
        actions={<ThemeToggle />}
      />
      <main className="project-list-content">
        <PageHeader
          title="프로젝트"
          actions={<ProjectCreateModal onCreated={() => void onProjectsChanged()} />}
        />
        <Table
          aria-label="프로젝트 목록"
          columns={columns}
          rows={projects}
          onRowClick={(p) => navigate(`/projects/${p.id}/board`)}
        />
      </main>

      {editing ? (
        <Modal
          trigger={<span hidden />}
          title="프로젝트 수정"
          description="키는 이슈 번호의 접두어라 변경할 수 없습니다."
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        >
          <form className="project-create-form" onSubmit={handleEditSubmit}>
            <div className="project-key-readonly">
              <span className="project-key-readonly-label">키</span>
              <span className="issue-key-cell">{editing.key}</span>
            </div>
            <TextField label="이름" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <TextArea
              label="설명"
              rows={3}
              placeholder="프로젝트 설명을 입력하세요"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
            />
            <Button type="submit" disabled={!nameDraft.trim()}>
              저장
            </Button>
          </form>
        </Modal>
      ) : null}

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
    </div>
  );
}
