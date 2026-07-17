import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Button,
  Card,
  Dropdown,
  EmptyState,
  Modal,
  PageHeader,
  useToast,
} from "@chanho/react";
import type { Project } from "../store/types";
import { deleteProject, listIssues } from "../store/jiraStore";
import { listStarredProjectIds, pruneProject, toggleProjectStar } from "../store/uiStore";
import { ProjectAvatar } from "../components/ProjectAvatar";

export interface ProjectListPageProps {
  projects: Project[];
  /** 생성/수정/삭제 후 App이 프로젝트 목록을 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/** 앱의 홈 — 프로젝트 디렉터리. 빈 상태(0개)와 삭제까지 여기서 처리한다 (스펙 §2) */
export function ProjectListPage({ projects, onProjectsChanged }: ProjectListPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Project | null>(null);

  useEffect(() => {
    void listStarredProjectIds().then(setStarredIds);
  }, []);

  const handleStarToggle = async (project: Project) => {
    await toggleProjectStar(project.id); // uiStore 이벤트로 사이드바 별표 섹션도 갱신된다
    setStarredIds(await listStarredProjectIds());
  };

  // 프로젝트별 이슈 개수 — 카드 메타와 삭제 경고에 쓴다
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

  return (
    <>
      <main className="project-list-content">
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
          <div className="project-grid">
            {projects.map((project) => (
              <Card key={project.id} padding="md" className="project-card">
                <div className="project-card-head">
                  <ProjectAvatar project={project} size="md" />
                  <div className="project-card-title">
                    <h3>{project.name}</h3>
                    <span className="issue-key-cell">{project.key}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="small"
                    className={
                      starredIds.includes(project.id)
                        ? "project-star is-starred"
                        : "project-star"
                    }
                    aria-label={`${project.name} 별표`}
                    aria-pressed={starredIds.includes(project.id)}
                    onClick={() => void handleStarToggle(project)}
                  >
                    {starredIds.includes(project.id) ? "★" : "☆"}
                  </Button>
                  <Dropdown
                    trigger={
                      <Button variant="ghost" size="small" aria-label={`${project.name} 관리`}>
                        ⋯
                      </Button>
                    }
                    items={[
                      {
                        label: "설정",
                        onSelect: () => navigate(`/projects/${project.id}/settings`),
                      },
                      { label: "삭제", danger: true, onSelect: () => setDeleting(project) },
                    ]}
                  />
                </div>
                <p className="project-card-desc">
                  {project.description || "설명이 없습니다"}
                </p>
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
              </Card>
            ))}
          </div>
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
