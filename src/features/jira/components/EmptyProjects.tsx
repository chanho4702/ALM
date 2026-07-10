import type { Project } from "../store/types";
import { ProjectCreateModal } from "./ProjectCreateModal";

export interface EmptyProjectsProps {
  onCreated: (project: Project) => void | Promise<void>;
}

export function EmptyProjects({ onCreated }: EmptyProjectsProps) {
  return (
    <div className="empty-projects">
      <h1>아직 프로젝트가 없습니다</h1>
      <p>첫 프로젝트를 만들어 보드를 시작하세요.</p>
      <ProjectCreateModal triggerLabel="첫 프로젝트 만들기" onCreated={onCreated} />
    </div>
  );
}
