import { useState } from "react";
import { EmptyState } from "@chanho/react";
import type { Project } from "../store/types";
import { ProjectCreateModal } from "./ProjectCreateModal";

export interface EmptyProjectsProps {
  onCreated: (project: Project) => void | Promise<void>;
}

export function EmptyProjects({ onCreated }: EmptyProjectsProps) {
  // EmptyState의 primaryAction은 클릭 콜백만 받으므로, 실제 모달은 별도로 두고 열림 상태를 공유한다
  const [open, setOpen] = useState(false);

  return (
    <div className="app-centered">
      <EmptyState
        title="아직 프로젝트가 없습니다"
        description="첫 프로젝트를 만들어 보드를 시작하세요."
        primaryAction={{ label: "첫 프로젝트 만들기", onClick: () => setOpen(true) }}
      />
      <ProjectCreateModal
        triggerLabel="첫 프로젝트 만들기"
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreated}
      />
    </div>
  );
}
