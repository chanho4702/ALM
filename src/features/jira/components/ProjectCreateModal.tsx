import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, TextField, useToast } from "@chanho/react";
import type { Project } from "../store/types";
import { createProject } from "../store/jiraStore";

export interface ProjectCreateModalProps {
  /** 트리거 버튼 문구 */
  triggerLabel?: string;
  onCreated: (project: Project) => void | Promise<void>;
}

export function ProjectCreateModal({
  triggerLabel = "새 프로젝트",
  onCreated,
}: ProjectCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setKey("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const project = await createProject({ key, name });
      toast({ title: `프로젝트 ${project.key}를 만들었습니다`, appearance: "success" });
      handleOpenChange(false);
      await onCreated(project);
    } catch (error) {
      toast({
        title: "프로젝트 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={<Button variant="subtle">{triggerLabel}</Button>}
      title="새 프로젝트"
      description="이름과 키를 입력하세요. 키는 이슈 번호의 접두어가 됩니다."
      open={open}
      onOpenChange={handleOpenChange}
    >
      <form className="project-create-form" onSubmit={handleSubmit}>
        <TextField
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 결제 서비스"
        />
        <TextField
          label="키"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="예: PAY"
          description="대문자로 자동 변환됩니다"
        />
        <Button type="submit" disabled={!name.trim() || !key.trim()}>
          만들기
        </Button>
      </form>
    </Modal>
  );
}
