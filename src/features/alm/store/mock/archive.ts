// localStorage 목업 스토어 — archive (jiraMock.ts에서 분할, 동작 불변)
import type { Issue, Project } from "../types";
import { load, persist, clone } from "./db";
import { assertCanEdit, assertAdminIgnoringArchive } from "./members";

// ── 보관 (지라 "보관된 업무 항목") ──────────────────────────────

export async function archiveIssue(id: string): Promise<Issue> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, data.issues[index].projectId);
  const [issue] = data.issues.splice(index, 1);
  issue.archivedAt = new Date().toISOString();
  data.archivedIssues.push(issue);
  persist();
  return clone(issue);
}

export async function restoreIssue(id: string): Promise<Issue> {
  const data = load();
  const index = data.archivedIssues.findIndex((i) => i.id === id && i.archivedAt);
  if (index === -1) throw new Error("보관함에 없는 이슈입니다");
  assertCanEdit(data, data.archivedIssues[index].projectId);
  const [issue] = data.archivedIssues.splice(index, 1);
  issue.archivedAt = null;
  data.issues.push(issue);
  persist();
  return clone(issue);
}

/** 프로젝트 보관함 — 최근 보관 순 */
export async function listArchivedIssues(projectId: string): Promise<Issue[]> {
  return clone(
    load()
      .archivedIssues.filter((i) => i.projectId === projectId && i.archivedAt)
      .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
  );
}

export async function archiveProject(id: string): Promise<Project> {
  const data = load();
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  assertAdminIgnoringArchive(data, id);
  project.archivedAt = new Date().toISOString();
  persist();
  return clone(project);
}

export async function unarchiveProject(id: string): Promise<Project> {
  const data = load();
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  assertAdminIgnoringArchive(data, id);
  project.archivedAt = null;
  persist();
  return clone(project);
}
