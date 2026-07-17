import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { Button, Card, Modal, PageHeader, TextArea, TextField, useToast } from "@chanho/react";
import type { JiraOutletContext } from "../components/JiraLayout";
import { deleteProject, listIssues, updateProject } from "../store/jiraStore";

/** 프로젝트 이름/설명 수정과 삭제(위험 구역) — 키는 이슈 접두어라 불변 */
export function ProjectSettingsPage() {
  const { projectId } = useParams();
  const { projects, onProjectsChanged } = useOutletContext<JiraOutletContext>();
  const navigate = useNavigate();
  const toast = useToast();

  const project = projects.find((p) => p.id === projectId);
  const [nameDraft, setNameDraft] = useState(project?.name ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState(project?.description ?? "");
  const [issueCount, setIssueCount] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!project) return;
    setNameDraft(project.name);
    setDescriptionDraft(project.description);
    let cancelled = false;
    void listIssues(project.id).then((issues) => {
      if (!cancelled) setIssueCount(issues.length);
    });
    return () => {
      cancelled = true;
    };
    // 프로젝트 전환 시에만 초안 리셋 (projects 재로드로 초안이 날아가면 안 된다)
  }, [project?.id]);

  if (!project) return null; // JiraLayout이 이미 /projects로 보냈다

  const dirty = nameDraft !== project.name || descriptionDraft !== project.description;

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateProject(project.id, { name: nameDraft, description: descriptionDraft });
      await onProjectsChanged();
      toast({ title: "프로젝트를 수정했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "수정 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      toast({ title: `프로젝트 ${project.key}를 삭제했습니다`, appearance: "success" });
      await onProjectsChanged();
      navigate("/projects");
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
      <PageHeader title="프로젝트 설정" />
      <div className="project-settings">
        <Card padding="lg" title="일반">
          <form className="project-create-form" onSubmit={handleSave}>
            <div className="project-key-readonly">
              <span className="project-key-readonly-label">키</span>
              <span className="issue-key-cell">{project.key}</span>
            </div>
            <TextField
              label="이름"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <TextArea
              label="설명"
              rows={3}
              placeholder="프로젝트 설명을 입력하세요"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
            />
            <div className="project-form-actions">
              <Button type="submit" disabled={!dirty || !nameDraft.trim()}>
                저장
              </Button>
            </div>
          </form>
        </Card>
        <Card padding="lg" title="위험 구역" className="project-danger-zone">
          <p className="project-danger-desc">
            프로젝트를 삭제하면 이슈 {issueCount}개와 스프린트·코멘트·활동 기록이 함께 삭제됩니다.
            되돌릴 수 없습니다.
          </p>
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
            프로젝트 삭제
          </Button>
        </Card>
      </div>

      {confirmingDelete ? (
        <Modal
          trigger={<span hidden />}
          title="프로젝트 삭제"
          open
          onOpenChange={(next) => {
            if (!next) setConfirmingDelete(false);
          }}
        >
          <div className="project-delete-confirm">
            <p>
              <strong>{project.name}</strong> ({project.key}) 프로젝트를 삭제하면 이슈 {issueCount}
              개가 함께 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="project-delete-actions">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
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
