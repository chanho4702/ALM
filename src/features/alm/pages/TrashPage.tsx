import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, EmptyState, Modal, PageHeader, useToast } from "@chanho/react";
import type { Project } from "../store/types";
import { listTrashedProjects, purgeProject, restoreProject } from "../store/jiraStore";
import { ProjectAvatar } from "../components/ProjectAvatar";

export interface TrashPageProps {
  onProjectsChanged: () => void | Promise<void>;
}

/** 프로젝트 휴지통(지라) — 삭제한 프로젝트를 복원하거나 영구 삭제한다 */
const formatDateTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

export function TrashPage({ onProjectsChanged }: TrashPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [purging, setPurging] = useState<Project | null>(null);

  const reload = useCallback(async () => {
    setProjects(await listTrashedProjects());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (failTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
      await reload();
      await onProjectsChanged();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <main className="project-list-content">
      <PageHeader
        title="휴지통"
        actions={
          <Button variant="secondary" size="small" onClick={() => navigate("/projects")}>
            프로젝트 목록
          </Button>
        }
      />
      <p className="settings-help">삭제한 프로젝트는 여기서 복원할 수 있습니다. 영구 삭제하면 이슈·코멘트·첨부까지 모두 사라지고 되돌릴 수 없습니다.</p>
      {loaded && projects.length === 0 ? (
        <EmptyState title="휴지통이 비어 있습니다" description="프로젝트 설정 > 일반에서 삭제한 프로젝트가 여기에 모입니다." />
      ) : (
        <ul className="trash-list" aria-label="휴지통 프로젝트 목록">
          {projects.map((project) => (
            <li key={project.id} className="trash-row">
              <ProjectAvatar project={project} size="sm" />
              <span className="trash-name">{project.name}</span>
              <span className="issue-key-cell">{project.key}</span>
              <span className="trash-at">{project.deletedAt ? `삭제 ${formatDateTime(project.deletedAt)}` : ""}</span>
              <div className="trash-actions">
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() =>
                    void run("복원 실패", async () => {
                      await restoreProject(project.id);
                      toast({ title: `프로젝트 ${project.key}를 복원했습니다`, appearance: "success" });
                    })
                  }
                >
                  복원
                </Button>
                <Button size="small" variant="danger" onClick={() => setPurging(project)}>
                  영구 삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {purging ? (
        <Modal
          trigger={<span hidden />}
          title="영구 삭제"
          open
          onOpenChange={(next) => {
            if (!next) setPurging(null);
          }}
        >
          <div className="project-delete-confirm">
            <p>
              <strong>{purging.name}</strong> ({purging.key}) 프로젝트와 모든 이슈·코멘트·첨부를 영구 삭제합니다. 되돌릴 수 없습니다.
            </p>
            <div className="project-form-actions">
              <Button variant="ghost" onClick={() => setPurging(null)}>
                취소
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = purging;
                  setPurging(null);
                  void run("영구 삭제 실패", async () => {
                    await purgeProject(target.id);
                    toast({ title: `프로젝트 ${target.key}를 영구 삭제했습니다`, appearance: "success" });
                  });
                }}
              >
                영구 삭제
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
